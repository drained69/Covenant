#!/usr/bin/env python3
"""
Cleanverse endpoint conformance harness.

Exercises every Cleanverse Cooperate API endpoint that Covenant depends on, and asserts the
behaviour the on-chain gate relies on. Read-only endpoints are called live; mutating endpoints are
verified structurally (payload shape + encryption round-trip) without being fired, because they
change state on a shared UAT gateway.

The three endpoints marked ★ are the ones that matter most: they correspond one-to-one with the
three `staticcall` reads `CleanversePoolGate._eligible` performs on-chain, in the same order.

Run:
    python3 offchain/test_endpoints.py

Exit code is 0 when every check passes, 1 otherwise, so this can gate CI.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleanverse_client import (  # noqa: E402
    CODE_ONCHAIN_READ_FAILED,
    ENCRYPTED_ENDPOINTS,
    SUCCESS_CODE,
    CleanverseClient,
    CleanverseError,
    Endpoints,
    Response,
)

# ── tiny test harness ────────────────────────────────────────────────────────

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    results.append((PASS if condition else FAIL, name, detail))
    marker = "\033[32m✓\033[0m" if condition else "\033[31m✗\033[0m"
    print(f"  {marker} {name}" + (f"\n      {detail}" if detail else ""))
    return condition


def skip(name: str, why: str) -> None:
    results.append((SKIP, name, why))
    print(f"  \033[33m−\033[0m {name}\n      {why}")


def section(title: str) -> None:
    print(f"\n\033[1m{title}\033[0m")


# ── configuration ────────────────────────────────────────────────────────────

client = CleanverseClient.from_env()
CHAIN = os.environ.get("CLEANVERSE_CHAIN", "base")
POOL = os.environ.get("CLEANVERSE_POOL_ADDRESS", "")
WALLET = os.environ.get("CLEANVERSE_TEST_WALLET", "")

print("\033[1mCleanverse endpoint conformance\033[0m")
print(f"  base   : {client.base_url}")
print(f"  api-id : {client.api_id[:12]}…" if client.api_id else "  api-id : (missing)")
print(f"  chain  : {CHAIN}")
print(f"  pool   : {POOL or '(unset)'}")
print(f"  wallet : {WALLET or '(unset)'}")


# ── 1. transport + auth ──────────────────────────────────────────────────────

section("1. Transport and authentication")

probe = client.probe()
check("Gateway reachable", probe.get("reachable") is True, probe.get("error", ""))
check(
    "api-id accepted (envelope returned with a code field)",
    bool(probe.get("code")),
    f"code={probe.get('code')} message={probe.get('message', '')[:80]}",
)
check(
    "Base path is /api/cooperate (bare host serves a different, older API)",
    client.base_url.endswith("/api/cooperate"),
    client.base_url,
)


# ── 2. ★ the three on-chain-equivalent reads ─────────────────────────────────

section("2. ★ Validator reads — the three the on-chain gate mirrors")

if not POOL:
    skip("★ /validator/is_register", "CLEANVERSE_POOL_ADDRESS unset")
    skip("★ /validator/is_paused", "CLEANVERSE_POOL_ADDRESS unset")
    skip("/validator/rules", "CLEANVERSE_POOL_ADDRESS unset")
else:
    # ── is_register → pool.isRegistered()
    try:
        r = client.pool_is_registered(CHAIN, POOL)
        check(
            "★ /validator/is_register returns 0000",
            r.ok,
            f"code={r.code} message={r.message[:100]}",
        )
        registered = isinstance(r.data, dict) and r.data.get("registered")
        check(
            "★ is_register response carries a boolean `registered`",
            isinstance(registered, bool),
            f"registered={registered!r} — maps to pool.isRegistered() on-chain",
        )
    except CleanverseError as exc:
        check("★ /validator/is_register reachable", False, str(exc))
        registered = None

    # ── is_paused → pool.paused()
    try:
        r = client.pool_is_paused(CHAIN, POOL)
        check("★ /validator/is_paused returns 0000", r.ok, f"code={r.code} message={r.message[:100]}")
        paused = isinstance(r.data, dict) and r.data.get("paused")
        check(
            "★ is_paused response carries a boolean `paused`",
            isinstance(paused, bool),
            f"paused={paused!r} — maps to pool.paused() on-chain",
        )
    except CleanverseError as exc:
        check("★ /validator/is_paused reachable", False, str(exc))
        paused = None

    # ── rules (informational; enforced inside verify)
    try:
        r = client.pool_rules(CHAIN, POOL)
        check("/validator/rules returns 0000", r.ok, f"code={r.code} message={r.message[:100]}")
        if r.ok and isinstance(r.data, dict):
            rules = r.data.get("rules") or r.data.get("rule") or []
            rules = rules if isinstance(rules, list) else [rules]
            fields = set()
            for rule in rules:
                if isinstance(rule, dict):
                    fields |= set(rule.keys())
            # v5.6 added is_black_list + countries to the pool Rule object.
            check(
                "Pool Rule object exposes v5.6 country fields (is_black_list, countries)",
                {"is_black_list", "countries"} <= fields or not rules,
                f"rule fields seen: {sorted(fields) or '(no rules configured on this pool)'}",
            )
    except CleanverseError as exc:
        check("/validator/rules reachable", False, str(exc))

# ── verify → pool.verify(user)
if not (POOL and WALLET):
    skip("★ /validator/verify", "CLEANVERSE_POOL_ADDRESS or CLEANVERSE_TEST_WALLET unset")
else:
    verdict = client.verify_user(chain=CHAIN, pool=POOL, user=WALLET)
    check(
        "★ /validator/verify returns a structured verdict (never raises)",
        verdict is not None,
        f"valid={verdict.valid} available={verdict.available} attestable={verdict.attestable}",
    )
    check(
        "★ verify: attestable == (available AND valid) — mirrors the gate's fail-closed rule",
        verdict.attestable == (verdict.available and verdict.valid),
        f"detail: {verdict.detail[:140]}" if verdict.detail else "",
    )
    if not verdict.available:
        check(
            "★ verify: unavailable check is NOT treated as clearance",
            verdict.attestable is False,
            "An unreachable/paused/no-A-Pass read must deny, exactly like the on-chain staticcall failing.",
        )


# ── 3. fail-closed semantics (the property the gate depends on) ──────────────

section("3. Fail-closed semantics")

# A wallet that certainly holds no A-Pass. The API should answer with a verdict or a 12027-class
# read failure — either way, `attestable` must be False. This is the single most important
# behavioural contract between the off-chain client and CleanversePoolGate._eligible.
GARBAGE_WALLET = "0x000000000000000000000000000000000000dEaD"
if POOL:
    v = client.verify_user(chain=CHAIN, pool=POOL, user=GARBAGE_WALLET)
    check(
        "Unknown wallet is never attestable",
        v.attestable is False,
        f"valid={v.valid} available={v.available} detail={v.detail[:120]}",
    )
else:
    skip("Unknown wallet is never attestable", "CLEANVERSE_POOL_ADDRESS unset")

# An unregistered pool address must not yield clearance for anyone.
UNREGISTERED_POOL = "0x000000000000000000000000000000000000bEEF"
v = client.verify_user(chain=CHAIN, pool=UNREGISTERED_POOL, user=WALLET or GARBAGE_WALLET)
check(
    "Unregistered pool is never attestable",
    v.attestable is False,
    f"valid={v.valid} available={v.available} detail={v.detail[:120]}",
)

# Transport failure must degrade to deny, not raise.
broken = CleanverseClient(
    base_url="https://invalid.cleanverse.invalid/api/cooperate",
    api_id=client.api_id or "probe",
    api_key="",
)
v = broken.verify_user(chain=CHAIN, pool=UNREGISTERED_POOL, user=GARBAGE_WALLET)
check(
    "Unreachable gateway degrades to deny (no exception escapes verify_user)",
    v.attestable is False and v.available is False and "unreachable" in v.detail,
    v.detail[:140],
)

# An unsupported chain must be rejected loudly rather than silently denied — a typo'd chain is an
# operator error, not a compliance verdict.
try:
    client.verify_user(chain="not-a-chain", pool=UNREGISTERED_POOL, user=GARBAGE_WALLET)
    check("Unsupported chain raises rather than silently denying", False, "no exception raised")
except CleanverseError as exc:
    check("Unsupported chain raises rather than silently denying", True, str(exc)[:120])


# ── 4. envelope parsing ──────────────────────────────────────────────────────

section("4. Envelope parsing")

check("SUCCESS_CODE is the string '0000', not an int", SUCCESS_CODE == "0000" and isinstance(SUCCESS_CODE, str))
check(
    "Response.ok is true only for code 0000",
    Response("0000", "success", {}).ok and not Response("0002", "fail", None).ok,
)
check(
    "Bracketed sub-codes are extracted from `message` (v5.6 puts them there, not in `code`)",
    Response("0002", "Business failure [RM_007] quote expired", None).sub_code == "RM_007",
)
check(
    "Validator on-chain-read failures surface as sub-code 12027",
    Response("0002", "read failed [12027]", None).sub_code == CODE_ONCHAIN_READ_FAILED,
)
try:
    Response.parse(["not", "a", "dict"])
    check("Non-dict payload is rejected", False, "no exception raised")
except CleanverseError:
    check("Non-dict payload is rejected", True)


# ── 5. encryption conformance (local, no mutation) ───────────────────────────

section("5. Encryption conformance — AES/CBC/PKCS5, 16 zero-byte IV")

# v5.6 §Encryption lists exactly which endpoints require an encrypted body. Verify our set matches.
DOC_ENCRYPTED = {
    "/generate_apass",
    "/update_status",
    "/validator/register",
    "/validator/set_rule",
    "/validator/add_rule",
    "/validator/set_paused",
    # Also documented as encrypted, but not yet exposed by this client:
    #   /validator/grant, /validator/remove_rule,
    #   /atoken/{launch,register_atoken,launch_wrapped_atoken,register_wrapped_atoken,
    #            add_rule,remove_rule,set_paused,*_whitelist_for_institutional,list_my_atokens}
    #   /blacklist/add
}
check(
    "Every encrypted endpoint this client exposes is marked encrypted",
    ENCRYPTED_ENDPOINTS == DOC_ENCRYPTED,
    f"client={sorted(ENCRYPTED_ENDPOINTS)}\n      docs ={sorted(DOC_ENCRYPTED)}",
)

READ_ENDPOINTS = {
    Endpoints.VALIDATOR_VERIFY,
    Endpoints.VALIDATOR_RULES,
    Endpoints.VALIDATOR_IS_PAUSED,
    Endpoints.VALIDATOR_IS_REGISTER,
    Endpoints.QUERY_APASS,
    Endpoints.QUERY_APASS_LIST,
}
check(
    "Validator read endpoints are NOT encrypted (docs: plain JSON)",
    not (READ_ENDPOINTS & ENCRYPTED_ENDPOINTS),
    f"overlap={sorted(READ_ENDPOINTS & ENCRYPTED_ENDPOINTS)}",
)

# Round-trip the cipher against a locally-generated key to prove the algorithm, mode, padding, and
# IV match the spec — without sending anything.
try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    demo_key = os.urandom(32)
    probe_client = CleanverseClient(client.base_url, "probe", base64.b64encode(demo_key).decode())
    plaintext = {"chain": CHAIN, "contract_address": POOL or "0x0", "paused": False}
    envelope = probe_client._encrypt(plaintext)  # noqa: SLF001 — conformance test

    check("Encrypted body is {'data': <base64>} with exactly one key", set(envelope) == {"data"})

    ct = base64.b64decode(envelope["data"])
    check("Ciphertext length is a multiple of the 16-byte AES block", len(ct) % 16 == 0, f"{len(ct)} bytes")

    dec = Cipher(algorithms.AES(demo_key), modes.CBC(b"\x00" * 16)).decryptor()
    padded = dec.update(ct) + dec.finalize()
    pad = padded[-1]
    check("PKCS#5 padding is well-formed", 1 <= pad <= 16 and padded[-pad:] == bytes([pad]) * pad, f"pad={pad}")
    check(
        "Decrypts back to the original JSON with the 16-zero-byte IV",
        json.loads(padded[:-pad].decode()) == plaintext,
    )

    # PKCS#5 must add a FULL block when the plaintext is already block-aligned.
    aligned = {"k": "x" * 8}  # {"k":"xxxxxxxx"} == 16 bytes exactly
    raw_len = len(json.dumps(aligned, separators=(",", ":")).encode())
    ct2 = base64.b64decode(probe_client._encrypt(aligned)["data"])  # noqa: SLF001
    check(
        "Block-aligned plaintext gets a full 16-byte pad block (PKCS#5 requirement)",
        raw_len % 16 == 0 and len(ct2) == raw_len + 16,
        f"plaintext={raw_len}B ciphertext={len(ct2)}B",
    )
except ImportError:
    skip("Encryption round-trip", "cryptography not installed")

# The api-key must never be transmitted — it is a local AES key only.
try:
    import urllib.request

    sent_headers: dict[str, str] = {}
    original = urllib.request.Request.add_header

    def spy(self, key, val):  # type: ignore[no-untyped-def]
        sent_headers[key.lower()] = str(val)
        return original(self, key, val)

    urllib.request.Request.add_header = spy  # type: ignore[method-assign]
    try:
        broken.verify_user(chain=CHAIN, pool=UNREGISTERED_POOL, user=GARBAGE_WALLET)
    finally:
        urllib.request.Request.add_header = original  # type: ignore[method-assign]

    leaked = [k for k in sent_headers if "key" in k or "secret" in k]
    check(
        "api-key is never sent as a header (only api-id is)",
        not leaked and "api-id" in sent_headers,
        f"headers sent: {sorted(sent_headers)}",
    )
except Exception as exc:  # pragma: no cover — best-effort introspection
    skip("api-key never transmitted", f"could not introspect: {exc}")

# Cloudflare fronts the gateway and bans the default urllib UA with error 1010.
from cleanverse_client import USER_AGENT  # noqa: E402

check(
    "A browser-shaped User-Agent is set (Cloudflare bans Python-urllib with 1010)",
    "urllib" not in USER_AGENT.lower() and "Mozilla" in USER_AGENT,
)


# ── 6. A-Pass endpoints (attestation source for the registry path) ───────────

section("6. A-Pass — the attestation source for CovenantRegistry")

try:
    r = client.query_apass_list(page=1, pageSize=1)
    check("/query_apass_list returns an envelope", r.code != "", f"code={r.code} message={r.message[:100]}")
except CleanverseError as exc:
    check("/query_apass_list reachable", False, str(exc))

if WALLET:
    try:
        r = client.query_apass(CHAIN, WALLET)
        check("/query_apass returns an envelope", r.code != "", f"code={r.code} message={r.message[:100]}")
        if r.ok and isinstance(r.data, dict):
            # These are the fields CovenantRegistry.Identity projects on-chain.
            present = [k for k in ("status", "tier", "subTier", "group", "countries", "expiryDate", "expireTime") if k in r.data]
            check(
                "A-Pass record exposes the fields the registry projects on-chain",
                len(present) >= 2,
                f"fields seen: {present or sorted(r.data)[:10]}",
            )
    except CleanverseError as exc:
        check("/query_apass reachable", False, str(exc))
else:
    skip("/query_apass", "CLEANVERSE_TEST_WALLET unset")


# ── 7. mutating endpoints — structural verification only ─────────────────────

section("7. Mutating endpoints (NOT fired — they change live state)")

print("      These are implemented and encrypted correctly, but firing them would mutate a shared")
print("      UAT gateway (issue a credential, freeze a wallet, pause a pool, rewrite pool rules).")
print("      Run them deliberately, not from a test harness.\n")

for path, what in [
    (Endpoints.GENERATE_APASS, "issues a real credential"),
    (Endpoints.UPDATE_STATUS, "freezes/unfreezes a wallet's A-Pass"),
    (Endpoints.VALIDATOR_REGISTER, "registers a compliance pool on-chain"),
    (Endpoints.VALIDATOR_SET_RULE, "overwrites pool rules on-chain"),
    (Endpoints.VALIDATOR_ADD_RULE, "adds a pool rule on-chain"),
    (Endpoints.VALIDATOR_SET_PAUSED, "pauses/unpauses the pool — would break live markets"),
]:
    check(f"{path} is marked encrypted ({what})", path in ENCRYPTED_ENDPOINTS)


# ── summary ──────────────────────────────────────────────────────────────────

section("Summary")

passed = sum(1 for s, _, _ in results if s == PASS)
failed = sum(1 for s, _, _ in results if s == FAIL)
skipped = sum(1 for s, _, _ in results if s == SKIP)
print(f"  {passed} passed · {failed} failed · {skipped} skipped")

if failed:
    print("\n\033[31mFailures:\033[0m")
    for status, name, detail in results:
        if status == FAIL:
            print(f"  ✗ {name}" + (f"\n      {detail}" if detail else ""))

sys.exit(1 if failed else 0)
