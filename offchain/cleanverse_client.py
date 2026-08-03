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

    # ── A-Pass ────────────────────────────────────────────────────────────

    def query_apass(self, chain: str, wallet_address: str) -> Response:
        """
        Looks up the A-Pass registered to a wallet.

        Returns the credential's expiry, tier, status (1 active / 2 frozen) and ISO country tags — the
        fields CovenantRegistry projects on-chain as an attestation.
        """
        self._require_chain(chain)
        return self._post(Endpoints.QUERY_APASS, {"chain": chain, "walletAddress": wallet_address})

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

    def _request(self, method: str, path: str, body: dict[str, Any] | None) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None

        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json")
        # The gateway sits behind Cloudflare, which bans the default `Python-urllib/x.y` signature with
        # error 1010. A conventional user-agent is required for any request to reach the API at all.
        request.add_header("User-Agent", USER_AGENT)
        # `api-id` is the only credential sent. The api-key is a local AES key and must never leave
        # this process — transmitting it would hand an attacker the ability to forge encrypted bodies.
        request.add_header("api-id", self.api_id)

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


if __name__ == "__main__":
    client = CleanverseClient.from_env()
    print(f"Base URL : {client.base_url}")
    print(f"api-id   : {client.api_id}\n")
    print("Probe:", json.dumps(client.probe(), indent=2))

    pool = os.environ.get("CLEANVERSE_POOL_ADDRESS")
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
        print("\nSet CLEANVERSE_POOL_ADDRESS and CLEANVERSE_TEST_WALLET in .env to exercise /validator/verify.")
