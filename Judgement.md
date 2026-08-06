# Cleanverse Compliance Expectation for Testnet (Covenant on Monad)

**Date**: 2026-08-05  
**Question**: For the purpose of this project, while still on testnet, are people expected to do real KYC?

---

## Verdict

**Yes — participants on the Monad testnet deployment must hold a valid A-Pass (CVI) credential, but the testnet environment uses minimal identity data collection.**

The live Monad testnet market (`market_id=0x831f8a…`) is bound to the **real `CleanversePoolGate`** (deployed at `0xbbd1f4f8…`), not the `PermissiveGate` demo contract. This gate enforces compliance by calling the **live CCP V2 Compliance Validator** at `0xaC7e5179C2C7f03f209136886c172eb34F161792` inside every settlement path.

### What the live rule requires

The gate's current RuleV2 is **"fully permissive (all fields zero)"** — no tier, group, sub-group, or country restriction. However, an all-zero rule is **not an open door**:

> "A wallet with no matching CVI returns `false`."  
> — `src/compliance/interfaces/IAPassComplianceValidator.sol:54`

Even with zero restrictions, the validator still checks whether the wallet holds **a valid CVI/A-Pass credential**. A wallet with no A-Pass on the chain returns `false` from `complianceVerify`, which the gate interprets as ineligible. The fail-closed staticcall at `VALIDATOR_GAS_LIMIT = 150_000` gas means every revert, timeout, malformed return, or "no credential" state resolves to denial.

### How A-Passes are issued on testnet

The project integrates against Cleanverse's **UAT sandbox** (`https://uatapi.cleanverse.com/api/cooperate`), not production. Operators can issue A-Passes directly via:

```bash
python3 offchain/cleanverse_client.py generate-apass \
  --chain monad \
  --wallet 0x... \
  --country US \
  --name "Jane Smith"
```

The frontend intake form (`frontend/src/pages/Compliance.tsx`) collects:
- Full legal name ("Exactly as it appears on your government-issued document")
- Document type (passport, national ID, driver's license)
- Document number ("Retained by the issuer for the verification record. Never written on-chain.")
- Issuing country (ISO 3166-1 alpha-2, e.g., "US")

The form submits to `/api/generate-apass`, which calls Cleanverse's encrypted `POST /generate_apass` endpoint. The A-Pass is then bound to the wallet address.

### What document verification is expected

Cleanverse's platform stack includes:
- Sumsub integration (`/api/business/generateSumsubAccessToken`, `/notification/sumsub_webhook`)
- Document recognition (`/api/document/recognize`)
- Liveness checks (`/api/document/liveness-check`)
- Sanctions datasources (OFAC SDN, FATF risk jurisdictions, Basel AML rankings)

And the CVA Integration Guide states:

> "CVA uses RuleV2 policies to guarantee that only qualified users can hold or transfer the asset, satisfying **institutional-grade KYC / AML / Travel Rule** regulatory requirements."

However, the guide lists only EVM **mainnets** (Ethereum, Base, BSC, Arbitrum, Polygon) as supported networks — **no testnets are named**. This signals that testnet is **demo-scale**, not production onboarding.

### Testnet posture indicators

1. **UAT sandbox base URL** — `.env.example` points at `uatapi.cleanverse.com`, marked: *"Sandbox base. Swap for the production URL when going live."*

2. **Test wallet placeholder** — `CLEANVERSE_TEST_WALLET` is described as *"a wallet with an A-Pass, used only for smoke testing"*.

3. **`todo.md`** — still reads: *"make an actual address to be a maker and let the market be real"*.

4. **Frontend form submission** — collects document number and issuing country, but the fields are marked as *"Retained by the issuer for the verification record. Never written on-chain."* The A-Pass issuance API (`generate_apass`) accepts `fullName`, `idType`, `issuingCountryISO2` via `identityDataList[]`, but the endpoint is **encrypted** (AES/CBC) and goes through Cleanverse's UAT gateway, not directly to a Sumsub flow visible from the repo.

5. **Privacy notice** — *"Cleanverse processes this information under applicable data protection law. Only the credential tier and issuing country reach the chain — your name and document number do not."*

### The unresolved question

**Does Cleanverse's UAT environment issue A-Passes against real document submission (Sumsub-backed KYC), or does it mirror sandbox behavior where credentials can be issued programmatically with minimal verification?**

This cannot be determined from the local repository or the unreachable hosted docs (`docs.cleanverse.com` — client-side rendered, access code `vhp3FyNV` could not be applied via `WebFetch`). The operator's CLI script (`cleanverse_client.py generate-apass`) can issue A-Passes directly by calling the encrypted `/generate_apass` endpoint with only:
- Wallet address
- Full name (defaults to "Covenant User" if omitted)
- ISO country code
- Document type (defaults to "ID_CARD")
- Expiration timestamp

No document upload, no Sumsub token, no liveness check. This suggests the **UAT environment may issue credentials programmatically for testing purposes** rather than requiring full document KYC for every testnet participant.

However, the frontend form **does** collect document number and issuing country as if preparing for real document verification, and the platform's general API surface (`offchain/spec/cleanverse-openapi-v3.json`) includes full Sumsub/liveness/OFAC integration paths. So the **capability exists**, but whether it is **enforced in UAT** for testnet credentials is unclear.

---

## Conclusion

**Cleanverse's stated expectation** (from code, docs, and API design) is:

1. **Participants must hold a valid A-Pass** — the live testnet gate enforces this. A wallet with no credential cannot open positions.

2. **The A-Pass is a real CVI credential** — it carries tier, sub-tier, group, sub-group, country tags, and an expiry derived from identity data (as described in the CVA guide and the validator interface).

3. **The testnet rule is zero-restriction** — no tier gate, no country blocklist, no group requirement. This lowers the compliance bar but does not remove the credential requirement.

4. **The environment is UAT sandbox** — pointing at `uatapi.cleanverse.com`, not production, with operator-issued test credentials documented in `.env.example`.

**Assumption for testnet participation**: Cleanverse's UAT environment likely issues A-Passes with **minimal identity verification** (name + country) rather than full document KYC with Sumsub liveness checks. This would align with the "testnet/demo" posture signaled by `.env.example`, `todo.md`, and the CVA guide's mainnet-only network list.

To definitively confirm UAT issuance policy, contact Cleanverse or consult the hosted integration docs at `docs.cleanverse.com` (which require authenticated access and could not be fetched in this review).

---

## Supporting Evidence

| Source | Finding |
|--------|---------|
| `deployments/monad.log` | Market bound to **CleanversePoolGate** (`0xbbd1f4f8…`), not PermissiveGate |
| `src/compliance/CleanversePoolGate.sol` | Gate calls `isRegistered(this) ∧ complianceVerify(this, account)` via 150k-gas staticcall, fail-closed |
| `src/compliance/interfaces/IAPassComplianceValidator.sol` | *"Covenant's live rule is fully permissive (all fields zero)"* + *"A wallet with no matching CVI returns `false`"* |
| `offchain/cleanverse_client.py` | `generate_apass` endpoint accepts name + country, no document upload in the API call itself |
| `frontend/src/pages/Compliance.tsx` | Form collects document type/number/country, marked as "retained by issuer, never on-chain" |
| `.env.example` | `CLEANVERSE_BASE_URL=https://uatapi.cleanverse.com/api/cooperate` — *"Sandbox base. Swap for production when going live."* |
| CVA Integration Guide (PDF) | *"institutional-grade KYC / AML / Travel Rule"* + supported networks are **mainnets only** (Ethereum, Base, BSC, Arbitrum, Polygon) |
| `offchain/spec/cleanverse-openapi-v3.json` | Platform includes Sumsub tokens, liveness checks, OFAC/FATF/Basel datasources — capability exists |
| `README.md` | Cooperate API **v5.6**, A-Pass country tags "derived from holder's identity documents" |

**API version discrepancy noted**: README cites v5.6, while hosted docs title says "v3" and local spec has `"version": "v0"`. This does not affect the verdict but should be reconciled with Cleanverse.
