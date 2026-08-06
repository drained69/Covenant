"""
Cleanverse Cooperate API client (v5.6).

Cleanverse operates on-chain **compliance pools**: a pool is a contract, deployed per chain, holding rules
that decide whether a wallet is eligible. Rules combine a country allow/deny list (`is_black_list`,
`countries`), tier and group constraints, and a pause switch. Wallets are identified by an **A-Pass**, a
registered credential carrying an expiry, a tier, and ISO-3166 country tags derived from the holder's
identity documents.

The endpoint that matters for Covenant is:

    POST /validator/verify  {chain, contract_address, user_address} -> data.valid: bool

That is exactly the question a gate hook asks. This client reads it; `CovenantRegistry` records the answer
on-chain; `CovenantGate` enforces it inside the settlement path. A Solidity `view` cannot make an HTTPS
request, which is why the attestation bridge exists.

Spec details this client implements:

  · Base path   {environment_url}/api/cooperate
  · Auth        `api-id` header only. The api-key is NEVER transmitted — it is a local AES key.
  · Encryption  AES/CBC/PKCS5Padding, IV = 16 zero bytes, key = base64-decoded api-key,
                request sent as {"data": "<base64 ciphertext>"} on mutating endpoints.
  · Success     code == "0000" (string). `valid: false` is a compliance verdict, not an error.

Usage:
    from cleanverse_client import CleanverseClient

    client = CleanverseClient.from_env()
    print(client.verify_user(chain="base", pool="0x...", user="0x..."))
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

SANDBOX_URL = "https://uatapi.cleanverse.com/api/cooperate"
PRODUCTION_URL = "https://api.cleanverse.com/api/cooperate"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) covenant-attester/0.1"
"""Cloudflare fronts the gateway and bans the default urllib signature; a browser-shaped UA is required."""

SUCCESS_CODE = "0000"
"""Cleanverse returns HTTP 200 for business failures too; this string is the real success signal."""

CODE_ONCHAIN_WRITE_FAILED = "12026"
CODE_ONCHAIN_READ_FAILED = "12027"
"""Returned when a pool read fails, typically because the pool is paused."""

SUPPORTED_CHAINS = frozenset(
    {"solana", "base", "avalanche", "arbitrum", "ethereum", "polygon", "bsc", "monad", "hashkey", "platon"}
)


class CleanverseError(RuntimeError):
    """Raised when the API is unreachable, misconfigured, or returns an undecodable response."""


class Endpoints:
    """Paths relative to the `/api/cooperate` base. Encrypted endpoints are marked."""

    GENERATE_APASS = "/generate_apass"           # encrypted
    UPDATE_STATUS = "/update_status"             # encrypted
    QUERY_APASS = "/query_apass"
    QUERY_APASS_LIST = "/query_apass_list"

    VALIDATOR_VERIFY = "/validator/verify"
    VALIDATOR_RULES = "/validator/rules"
    VALIDATOR_IS_PAUSED = "/validator/is_paused"
    VALIDATOR_IS_REGISTER = "/validator/is_register"
    VALIDATOR_REGISTER = "/validator/register"   # encrypted
    VALIDATOR_SET_RULE = "/validator/set_rule"   # encrypted
    VALIDATOR_ADD_RULE = "/validator/add_rule"   # encrypted
    VALIDATOR_SET_PAUSED = "/validator/set_paused"  # encrypted


ENCRYPTED_ENDPOINTS = frozenset(
    {
        Endpoints.GENERATE_APASS,
        Endpoints.UPDATE_STATUS,
        Endpoints.VALIDATOR_REGISTER,
        Endpoints.VALIDATOR_SET_RULE,
        Endpoints.VALIDATOR_ADD_RULE,
        Endpoints.VALIDATOR_SET_PAUSED,
    }
)


@dataclass(frozen=True)
class Response:
    """Normalised Cleanverse envelope: {"code": "...", "message": "...", "data": ...}."""

    code: str
    message: str
    data: Any

    @property
    def ok(self) -> bool:
        return self.code == SUCCESS_CODE

    @property
    def sub_code(self) -> str:
        """
        Bracketed sub-code carried in `message` when `code` is a generic business failure.

        The API signals specifics like `[RM_007]` or `[12026]` inside the message rather than in `code`,
        so callers that need to distinguish causes have to read it from there.
        """
        if "[" in self.message and "]" in self.message:
            return self.message[self.message.index("[") + 1 : self.message.index("]")]
        return ""

    @classmethod
    def parse(cls, payload: Any) -> "Response":
        if not isinstance(payload, dict):
            raise CleanverseError(f"Unexpected response shape: {payload!r}")
        return cls(
            code=str(payload.get("code", "")),
            message=str(payload.get("message") or ""),
            data=payload.get("data"),
        )


@dataclass(frozen=True)
class ComplianceVerdict:
    """Outcome of a pool eligibility check, reduced to what the attester needs."""

    chain: str
    pool: str
    user: str
    valid: bool
    available: bool
    detail: str = ""
    raw: Any = field(default=None, repr=False)

    @property
    def attestable(self) -> bool:
        """
        Whether this verdict is a sound basis for granting on-chain access.

        An unavailable check is not clearance. A paused pool, a transient read failure, and an ineligible
        wallet all resolve to "do not grant", mirroring CovenantGate's fail-closed rule so the off-chain
        and on-chain halves of the system cannot disagree.
        """
        return self.available and self.valid


class CleanverseClient:
    def __init__(self, base_url: str, api_id: str, api_key: str, timeout: float = 20.0) -> None:
        if not api_id:
            raise CleanverseError("Missing CLEANVERSE_API_ID (sent as the `api-id` header).")

        self.base_url = base_url.rstrip("/")
        self.api_id = api_id
        self._api_key = api_key  # Never transmitted; used only as a local AES key.
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "CleanverseClient":
        _load_dotenv()
        return cls(
            base_url=os.environ.get("CLEANVERSE_BASE_URL", SANDBOX_URL),
            api_id=os.environ.get("CLEANVERSE_API_ID", ""),
            api_key=os.environ.get("CLEANVERSE_API_KEY", ""),
        )

    # ── Validator compliance (the Covenant integration point) ─────────────

    def verify_user(self, chain: str, pool: str, user: str) -> ComplianceVerdict:
        """
        Checks whether `user` satisfies the rules of the compliance pool at `pool` on `chain`.

        This is the off-chain equivalent of a Covenant gate hook. Note that `valid: false` is a legitimate
        compliance answer delivered with code "0000" — it is not an error and must not be retried as one.
        A paused pool instead yields code 12027 with no `valid` field, which is treated as unavailable.
        """
        self._require_chain(chain)
        try:
            response = self._post(
                Endpoints.VALIDATOR_VERIFY,
                {"chain": chain, "contract_address": pool, "user_address": user},
            )
        except CleanverseError as exc:
            # Transport or infrastructure failure. Deny, but preserve the cause: an operator must be able
            # to tell a blocked request apart from a genuinely ineligible wallet.
            return ComplianceVerdict(chain, pool, user, False, False, f"unreachable: {exc}", None)

        data = response.data if isinstance(response.data, dict) else {}
        has_verdict = isinstance(data.get("valid"), bool)

        if not response.ok or not has_verdict:
            detail = response.message or f"code={response.code}"
            if response.code == CODE_ONCHAIN_READ_FAILED or response.sub_code == CODE_ONCHAIN_READ_FAILED:
                # Observed against UAT: 12027 is returned both when the pool is paused and when the wallet
                # simply has no A-Pass on this chain. Naming both keeps the operator from chasing the
                # wrong cause — check `pool_is_paused` to tell them apart.
                detail = (
                    f"pool read returned no verdict (pool paused, or wallet has no A-Pass on {chain}): "
                    f"{detail}"
                )
            return ComplianceVerdict(chain, pool, user, False, False, detail, response.data)

        return ComplianceVerdict(chain, pool, user, bool(data["valid"]), True, "", response.data)

    def pool_rules(self, chain: str, pool: str) -> Response:
        """Reads a pool's compliance rules, including any country allow/deny list."""
        self._require_chain(chain)
        return self._post(Endpoints.VALIDATOR_RULES, {"chain": chain, "contract_address": pool})

    def pool_is_paused(self, chain: str, pool: str) -> Response:
        """Reads a pool's pause state. A paused pool cannot answer verification requests."""
        self._require_chain(chain)
        return self._post(Endpoints.VALIDATOR_IS_PAUSED, {"chain": chain, "contract_address": pool})

    def pool_is_registered(self, chain: str, pool: str) -> Response:
        """Checks whether a pool address is registered with Cleanverse."""
        self._require_chain(chain)
        return self._post(Endpoints.VALIDATOR_IS_REGISTER, {"chain": chain, "contract_address": pool})

    def register_pool(
        self,
        chain: str,
        contract_address: str,
        private_key: str | None = None,
        *,
        rule: dict[str, Any] | None = None,
    ) -> Response:
        """
        Registers a business contract as a pool with the Cleanverse CCP V2 validator.

        The current `/validator/register` API requires:
          - `chain`, `contract_address`
          - `rule`  — an API-layer initial compliance rule (allowed_group, allowed_sub_group,
            min_tier, min_sub_tier, is_black_list, countries). Defaults to a permissive rule
            that accepts all tiers/groups with no country restrictions.
          - `owner_signature` — EIP-191 personal_sign by the contract deployer over the
            message `chain + contract_address_lowercase_hex`.

        After registration, on-chain policy is managed via `setRule` / `addRule` wrappers,
        not by the `rule` object sent here.

        `private_key` defaults to the `PRIVATE_KEY` env var (the same key that deployed the gate).
        On success, `isRegistered(contract_address)` on-chain flips from false to true.

        Encrypted endpoint — the body is AES-encrypted before transmission.
        """
        self._require_chain(chain)
        contract_address = contract_address.lower()
        pk = private_key or os.environ.get("PRIVATE_KEY")
        if not pk:
            raise CleanverseError("PRIVATE_KEY is required to sign the registration (or pass explicitly).")

        if rule is None:
            rule = {
                "allowed_group": "",
                "allowed_sub_group": "",
                "min_tier": 0,
                "min_sub_tier": 0,
                "is_black_list": False,
                "countries": [],
            }

        signature = self._sign_register(chain, contract_address, pk)
        body = {
            "chain": chain,
            "contract_address": contract_address,
            "rule": rule,
            "owner_signature": signature,
        }
        return self._post(Endpoints.VALIDATOR_REGISTER, body)

    @staticmethod
    def _register_digest(chain: str, contract_address: str) -> str:
        """
        The digest the contract owner signs: keccak256(chain + contract_address_lowercase_hex).
        Delegates to `cast keccak` (Foundry) — the same tool the deploy scripts use.
        """
        try:
            result = subprocess.run(
                ["cast", "keccak", chain + contract_address],
                capture_output=True, text=True, check=True, timeout=10,
            )
        except FileNotFoundError as exc:
            raise CleanverseError(
                "`cast` (Foundry) not found on PATH. Install foundry or compute the digest manually."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise CleanverseError(f"`cast keccak` failed: {exc.stderr.strip()}") from exc
        return result.stdout.strip()

    # Signing scheme for /validator/register.
    #
    # CCP V2 §5.4 only says "Signature Rule: keccak256(chain + contract_address), lowercase hex
    # concatenation" — it does not specify:
    #   1. Whether `chain` is signed as its UTF-8 ASCII bytes or as some other encoding.
    #   2. Whether `contract_address` is the 42-char `0x...` string or the raw 20 address bytes.
    #   3. Whether the signature is a raw ECDSA over the digest (ecrecover shape) or the standard
    #      EIP-191 personal_sign wrapping.
    #
    # As of 2026-08 the Cleanverse UAT rejects **all four** documented-guess combinations with
    # `code: 0001, "Invalid contract owner signature"`, so the exact scheme is a Cleanverse-side
    # spec gap. The current implementation ships EIP-191 over `chain + address_lc` as the most
    # conventional guess. If your registration keeps failing, ask Cleanverse for the reference
    # verifier source or a signed sample — see `todo.md` §Part 2 "Compliance" for the exact ask.
    @staticmethod
    def _sign_register(chain: str, contract_address: str, private_key: str) -> str:
        """
        EIP-191 (personal_sign) signature by the deployer over the message `chain + address_lc`.

        Cleanverse recovers this signature on their side and requires it to correspond to the
        deployer of the contract being registered.
        """
        message = chain + contract_address
        try:
            result = subprocess.run(
                ["cast", "wallet", "sign", message, "--private-key", private_key],
                capture_output=True, text=True, check=True, timeout=10,
            )
        except FileNotFoundError as exc:
            raise CleanverseError("`cast` (Foundry) not found on PATH.") from exc
        except subprocess.CalledProcessError as exc:
            raise CleanverseError(f"`cast wallet sign` failed: {exc.stderr.strip()}") from exc
        return result.stdout.strip()

    # ── A-Pass ────────────────────────────────────────────────────────────

    def generate_apass(
        self,
        chain: str,
        wallet_address: str,
        *,
        country: str = "",
        sub_tier: int = 0,
        sub_group: str = "",
        customer_id: str = "",
        expiration_time: int = 0,
        override: bool = False,
        full_name: str = "",
        id_type: str = "ID_CARD",
    ) -> Response:
        """
        Issues an A-Pass credential to a wallet address.  Encrypted endpoint.

        Per Cleanverse API v5.6 docs:
        - ``expirationTime`` is a Unix timestamp in seconds (long), NOT an ISO date.
        - ``customerId`` must be 12+ chars, A-Z/a-z/0-9 only (no special chars).
        - Country tags are derived from ``identityDataList[].issuingCountryISO2``.
        - There is no top-level ``tier`` or ``country`` field.

        ``country`` is the ISO-3166-1 alpha-2 code (e.g. ``"US"``, ``"NG"``).
        ``expiration_time`` is a Unix timestamp in seconds; defaults to 1 year from now.
        ``customer_id`` defaults to the wallet address stripped of the ``0x`` prefix.
        ``full_name`` defaults to ``"Covenant User"`` if not provided.
        """
        import re
        import time

        self._require_chain(chain)

        if not expiration_time:
            expiration_time = int(time.time()) + 365 * 24 * 3600

        if not customer_id:
            raw = wallet_address.lower().replace("0x", "")
            customer_id = re.sub(r"[^A-Za-z0-9]", "", raw)
            if len(customer_id) < 12:
                customer_id = customer_id.ljust(12, "0")

        if not full_name:
            full_name = "Covenant User"

        body: dict[str, Any] = {
            "customerId": customer_id,
            "expirationTime": expiration_time,
            "override": override,
            "wallet": {"address": wallet_address.lower(), "chain": chain},
        }
        if sub_tier:
            body["subTier"] = sub_tier
        if sub_group:
            body["subGroup"] = sub_group

        if country:
            body["identityDataList"] = [
                {
                    "idType": id_type,
                    "fullName": full_name,
                    "issuingCountryISO2": country.upper(),
                },
            ]

        return self._post(Endpoints.GENERATE_APASS, body)

    def query_apass(self, chain: str, wallet_address: str) -> Response:
        """
        Looks up the A-Pass registered to a wallet.

        Returns the credential's expiry, tier, status (1 active / 2 frozen) and ISO country tags — the
        fields CovenantRegistry projects on-chain as an attestation.
        """
        self._require_chain(chain)
        return self._post(Endpoints.QUERY_APASS, {"chain": chain, "address": wallet_address})

    def query_apass_list(self, **filters: Any) -> Response:
        """Lists this institution's A-Pass registrations. Useful for reconciliation and bulk attestation."""
        return self._post(Endpoints.QUERY_APASS_LIST, {k: v for k, v in filters.items() if v is not None})

    def set_apass_status(
        self, chain: str, wallet_address: str, active: bool, customer_id: str | None = None,
        reason: str | None = None,
    ) -> Response:
        """
        Freezes or unfreezes an A-Pass. Encrypted endpoint.

        A freeze here is what should drive an on-chain revocation, so that a wallet losing its credential
        loses the ability to increase a position in the same way it would lose it off-chain.
        """
        self._require_chain(chain)
        body: dict[str, Any] = {
            "status": "1" if active else "2",
            "wallet": {"chain": chain, "address": wallet_address},
        }
        if customer_id:
            body["customerId"] = customer_id
        if reason:
            body["blacklistReason"] = reason
        return self._post(Endpoints.UPDATE_STATUS, body)

    # ── Diagnostics ───────────────────────────────────────────────────────

    def probe(self) -> dict[str, Any]:
        """Confirms the base URL and api-id are accepted, without mutating anything."""
        try:
            response = self._post(Endpoints.QUERY_APASS_LIST, {"page": 1, "pageSize": 1})
            return {
                "reachable": True,
                "authenticated": response.code != "",
                "code": response.code,
                "message": response.message[:120],
            }
        except CleanverseError as exc:
            return {"reachable": False, "error": str(exc)}

    # ── Encryption ────────────────────────────────────────────────────────

    def _encrypt(self, plaintext: dict[str, Any]) -> dict[str, str]:
        """
        AES/CBC/PKCS5Padding with a fixed 16-zero-byte IV, keyed by the base64-decoded api-key.

        A fixed IV is not something to imitate elsewhere — it makes identical plaintexts produce identical
        ciphertexts — but it is what the API specifies, so the client must match it exactly.
        """
        if not self._api_key:
            raise CleanverseError("CLEANVERSE_API_KEY is required to call an encrypted endpoint.")

        try:
            key = base64.b64decode(self._api_key, validate=True)
        except Exception as exc:
            raise CleanverseError("CLEANVERSE_API_KEY must be base64-encoded.") from exc

        if len(key) not in (16, 24, 32):
            raise CleanverseError(f"Decoded api-key must be 16/24/32 bytes for AES, got {len(key)}.")

        raw = json.dumps(plaintext, separators=(",", ":")).encode()
        pad = 16 - (len(raw) % 16)  # PKCS#5/7: always pads, a full block when already aligned.
        raw += bytes([pad]) * pad

        encryptor = Cipher(algorithms.AES(key), modes.CBC(b"\x00" * 16)).encryptor()
        return {"data": base64.b64encode(encryptor.update(raw) + encryptor.finalize()).decode()}

    # ── Transport ─────────────────────────────────────────────────────────

    def _post(self, path: str, body: dict[str, Any]) -> Response:
        payload = self._encrypt(body) if path in ENCRYPTED_ENDPOINTS else body
        return Response.parse(self._request("POST", path, payload))

    # Populated on every `_request` so callers (the CLI, tests) can print the ID we sent for a given
    # response. Cleanverse uses this to trace failing requests in their server logs.
    last_request_id: str | None = None

    def _request(self, method: str, path: str, body: dict[str, Any] | None) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None

        # Generate a fresh X-Request-ID per call. Cleanverse supports this header as a correlation
        # id — sending it lets their support team locate this exact request in their logs, which is
        # essential when the API rejects a well-formed payload with a generic error.
        import uuid
        request_id = str(uuid.uuid4())
        self.last_request_id = request_id

        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json")
        # The gateway sits behind Cloudflare, which bans the default `Python-urllib/x.y` signature with
        # error 1010. A conventional user-agent is required for any request to reach the API at all.
        request.add_header("User-Agent", USER_AGENT)
        # `api-id` is the only credential sent. The api-key is a local AES key and must never leave
        # this process — transmitting it would hand an attacker the ability to forge encrypted bodies.
        request.add_header("api-id", self.api_id)
        request.add_header("X-Request-ID", request_id)

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
        except urllib.error.URLError as exc:
            raise CleanverseError(f"Could not reach {url}: {exc.reason}") from exc

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CleanverseError(f"Non-JSON response from {path}: {raw[:200]!r}") from exc

        # Infrastructure failures (WAF blocks, gateway errors) also arrive as JSON, and would otherwise
        # parse into an empty envelope that reads as "not compliant". Conflating "we were blocked" with
        # "the wallet is ineligible" is safe but undiagnosable, so reject anything lacking a `code`.
        if not isinstance(payload, dict) or "code" not in payload:
            raise CleanverseError(_describe_non_envelope(path, payload))

        return payload

    @staticmethod
    def _require_chain(chain: str) -> None:
        if chain.lower() not in SUPPORTED_CHAINS:
            raise CleanverseError(f"Unsupported chain {chain!r}. Expected one of {sorted(SUPPORTED_CHAINS)}.")


def _describe_non_envelope(path: str, payload: Any) -> str:
    """Turns an infrastructure error page into an actionable message."""
    if isinstance(payload, dict):
        if payload.get("cloudflare_error"):
            return (
                f"{path}: blocked by Cloudflare "
                f"({payload.get('error_code')} {payload.get('error_name')}) — {payload.get('detail', '')}"
            )
        summary = payload.get("title") or payload.get("message") or payload.get("error") or str(payload)[:200]
        return f"{path}: response carried no `code` field — {summary}"
    return f"{path}: unexpected response shape {str(payload)[:200]!r}"


def _load_dotenv(filename: str = ".env") -> None:
    """Minimal .env loader. Existing environment variables win, so shell overrides work."""
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (filename, os.path.join(os.path.dirname(here), filename)):
        if not os.path.isfile(candidate):
            continue
        with open(candidate, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        return


def _cli() -> int:
    import argparse
    parser = argparse.ArgumentParser(
        prog="cleanverse_client.py",
        description="Cleanverse Cooperate API client (CCP V2). Reads credentials from .env.",
    )
    sub = parser.add_subparsers(dest="cmd", metavar="{probe,register,verify,rules,is-paused}")

    sub.add_parser("probe", help="Health-check the gateway + verify api-id authentication")

    p_apass = sub.add_parser("generate-apass", help="Issue an A-Pass credential to a wallet")
    p_apass.add_argument("--chain", required=True, help="target chain (e.g. monad)")
    p_apass.add_argument("--wallet", required=True, help="0x-prefixed wallet address")
    p_apass.add_argument("--country", default="", help="ISO-3166-1 alpha-2 country code (e.g. US, NG)")
    p_apass.add_argument("--name", default="", help="full name for identity data (default: Covenant User)")
    p_apass.add_argument("--override", action="store_true", help="override existing A-Pass data")

    p_reg = sub.add_parser("register", help="Register a contract as a pool (CCP V2 §5.4)")
    p_reg.add_argument("--chain", required=True, help="one of: solana, base, avalanche, arbitrum, ethereum, polygon, bsc, monad, hashkey, platon")
    p_reg.add_argument("--address", required=True, help="0x-prefixed contract address to register")

    p_ver = sub.add_parser("verify", help="Verify a wallet against a registered pool")
    p_ver.add_argument("--chain", required=True)
    p_ver.add_argument("--pool", required=True, help="registered pool address")
    p_ver.add_argument("--wallet", required=True)

    p_rul = sub.add_parser("rules", help="Read a pool's currently configured RuleV2 list")
    p_rul.add_argument("--chain", required=True)
    p_rul.add_argument("--pool", required=True)

    p_pau = sub.add_parser("is-paused", help="Query a pool's pause state")
    p_pau.add_argument("--chain", required=True)
    p_pau.add_argument("--pool", required=True)

    args = parser.parse_args()
    client = CleanverseClient.from_env()
    print(f"Base URL : {client.base_url}")
    print(f"api-id   : {client.api_id}\n")

    def _dump(resp: Response) -> None:
        print(f"  code    : {resp.code}")
        print(f"  message : {resp.message}")
        if resp.sub_code:
            print(f"  sub-code: [{resp.sub_code}]")
        if resp.data is not None:
            print(f"  data    : {json.dumps(resp.data, indent=2)}")

    if args.cmd == "generate-apass":
        print(f"Issuing A-Pass to {args.wallet} on chain '{args.chain}' …")
        resp = client.generate_apass(
            chain=args.chain,
            wallet_address=args.wallet,
            country=args.country,
            full_name=args.name,
            override=args.override,
        )
        print(f"  X-Request-ID sent: {client.last_request_id}")
        print()
        _dump(resp)
        print()
        if resp.ok:
            print("  ✓ A-Pass issued. Verify with:")
            print(f"    python3 offchain/cleanverse_client.py verify --chain {args.chain} "
                  f"--pool $COVENANT_GATE_ADDRESS --wallet {args.wallet}")
            return 0
        else:
            print("  ✗ A-Pass generation failed.")
            return 1

    if args.cmd == "register":
        addr = args.address.lower()
        digest = CleanverseClient._register_digest(args.chain, addr)
        message = args.chain + addr
        pk = os.environ.get("PRIVATE_KEY")
        sig = CleanverseClient._sign_register(args.chain, addr, pk) if pk else "<PRIVATE_KEY unset>"
        print(f"Registering {addr} on chain '{args.chain}' …")
        print(f"  message  : \"{message}\"")
        print(f"  owner_signature: {sig}")
        print(f"  digest         : {digest}    (keccak256('{args.chain}' + address_lc))")
        resp = client.register_pool(args.chain, addr)
        print(f"  X-Request-ID sent: {client.last_request_id}    ← share this with Cleanverse")
        print()
        _dump(resp)
        print()
        if resp.ok:
            print("  ✓ Registration accepted. Verify with:")
            print(f"    cast call {os.environ.get('CLEANVERSE_VALIDATOR_ADDRESS', '<validator>')} "
                  f"\"isRegistered(address)(bool)\" {addr} --rpc-url $RPC_URL")
            return 0
        else:
            print("  ✗ Registration rejected. Common causes:")
            print("    - PRIVATE_KEY in .env is not the deployer of this contract")
            print("    - Signature scheme mismatch — Cleanverse may want EIP-191 (personal_sign)")
            print("      wrapping. Try re-running the client after switching _sign_register to use")
            print("      `cast wallet sign <digest>` (without --no-hash) as a fallback.")
            print("    - api-id lacks REGISTER_ROLE for this chain (contact Cleanverse)")
            print("    - Contract already registered")
            return 1

    if args.cmd == "verify":
        verdict = client.verify_user(chain=args.chain, pool=args.pool, user=args.wallet)
        print(f"Verify {args.wallet} against pool {args.pool} on '{args.chain}':")
        print(f"  valid      : {verdict.valid}")
        print(f"  available  : {verdict.available}")
        print(f"  attestable : {verdict.attestable}")
        print(f"  detail     : {verdict.detail}")
        return 0 if verdict.attestable else 1

    if args.cmd == "rules":
        _dump(client.pool_rules(args.chain, args.pool))
        return 0

    if args.cmd == "is-paused":
        _dump(client.pool_is_paused(args.chain, args.pool))
        return 0

    # No subcommand → probe + optional verify (preserves the old behavior).
    print("Probe:", json.dumps(client.probe(), indent=2))
    # The REST `pool` param is the *registered contract* — for Covenant that is the gate, not the
    # validator. CLEANVERSE_POOL_ADDRESS is a legacy alias for CLEANVERSE_VALIDATOR_ADDRESS (see
    # .env.example), so reading it here asked the validator to verify itself. Prefer the gate.
    pool = os.environ.get("COVENANT_GATE_ADDRESS")
    chain = os.environ.get("CLEANVERSE_CHAIN", "base")
    user = os.environ.get("CLEANVERSE_TEST_WALLET")
    if pool and user:
        verdict = client.verify_user(chain=chain, pool=pool, user=user)
        print("\nCompliance verdict:")
        print(f"  valid      : {verdict.valid}")
        print(f"  available  : {verdict.available}")
        print(f"  attestable : {verdict.attestable}")
        print(f"  detail     : {verdict.detail}")
    else:
        print("\nSet COVENANT_GATE_ADDRESS and CLEANVERSE_TEST_WALLET in .env to exercise /validator/verify.")
    print("\nTry a subcommand: register, verify, rules, is-paused, probe. Use --help for options.")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
