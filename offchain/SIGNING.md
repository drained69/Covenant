# Off-chain signing → on-chain fill

## The flow

Covenant offers are **signed off-chain and consumed on-chain**. There is no order book on-chain. A lender publishes a signed offer (via API, database, chat, whatever); a borrower takes it by calling `fillOffer` on the deployed contract.

```
  ┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
  │    Lender    │                    │  Marketplace │                    │   Borrower   │
  │  (offer.maker)│                   │   (off-chain)│                    │   (taker)    │
  └──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
         │                                    │                                    │
         │ 1. Sign Offer with EIP-712        │                                    │
         │──────────────────────────────────▶│                                    │
         │                                    │                                    │
         │                                    │ 2. Fetch offer + signature        │
         │                                    │◀──────────────────────────────────│
         │                                    │                                    │
         │                                                                        │
         │                              3. covenant.fillOffer(offer, sig, ...)    │
         │◀────────────────────────────────────────────────────────────────────── │
         │                                                                        │
         │        (on-chain: gate checks compliance, notary verifies sig,       │
         │         positions update, loan tokens flow, collateral is escrowed)    │
         │                                                                        │
```

The signature is verified by an **`EcrecoverNotary`** — a helper contract that Covenant delegates to via the `offer.notary` field. The notary's job is to answer one question: "did `offer.maker` authorise this specific offer?" It does that by recomputing the EIP-712 digest and running `ecrecover`.

## Why this design

- **No gas until it's real.** A lender can publish 1,000 offers across 10 markets and pay zero gas — only the fills cost gas, and only for the units actually consumed.
- **Instant cancellation.** A lender can invalidate all their outstanding offers by moving to a new `group` (or bumping their nonce) without any on-chain transaction — they just stop signing.
- **Marketplace-agnostic.** The signature format is the same whether the marketplace is a website, a Telegram bot, or an inter-institutional message bus.

## The pieces you need

| Piece | Where it lives | What it does |
|---|---|---|
| **`Offer` struct** | `src/interfaces/ICovenant.sol` | The trade quote: market, side, price band, max size, expiry, notary |
| **`EcrecoverNotary`** | `src/ratifiers/EcrecoverNotary.sol` | Verifies EIP-712 sigs against `offer.maker` |
| **EIP-712 domain** | `EIP712_DOMAIN_TYPEHASH` in `IEcrecoverNotary.sol` | `(chainId, verifyingContract)` only — no name/version |
| **`MARKET_TYPE`, `OFFER_TYPE`** | `test/HashLibTest.sol` (canonical strings) | The exact field names/types that hash into the typehash |
| **`fillOffer`** | `Covenant.fillOffer` | The on-chain function the taker calls, passing `offer` + signature |

## Running the example

```bash
cd offchain
npm install ethers@6
LENDER_PRIVATE_KEY=0x<throwaway-key> node sign_offer.js
```

The script prints:
- The signer address (must equal `offer.maker`)
- The signature to pass as `notaryData` to `fillOffer`
- The on-chain call shape

## What to change for a real signing session

Open `offchain/sign_offer.js` and update `CONFIG`:

- `chainId` — the target network's chain ID (50312 for Somnia testnet)
- `ecrecoverRatifier` — the deployed periphery notary address (needs to be deployed if not already)
- `lenderPrivateKey` — passed via env, not hardcoded

Then update the `market` and `offer` objects to match the market you're trading in. Every field on `market` must exactly match the on-chain configuration — the market id is `keccak256(abi.encode(market))`, so a single-bit difference produces a completely different market that no one else can find.

## Verification-side sanity check

Before sending the borrower's `fillOffer` transaction, verify off-chain that:

1. `offer.maker == recovered_signer` (the notary will do this, but check locally to fail fast)
2. `block.timestamp` is within `[offer.start, offer.expiry]`
3. The `Market` struct matches an already-touched market on-chain (query `covenant.marketState(id)` — `tickSpacing > 0` means the market exists)
4. The `offer.notary` address is the notary the maker actually authorized (via `covenant.setIsAuthorized`)

Any of these failing on-chain reverts the whole transaction and burns the taker's gas — cheap to check off-chain first.

## Trees of offers (advanced)

The `EcrecoverNotary` also supports signing a **Merkle root of offers**, so a single signature authorizes a batch. See `test/EcrecoverRatifierIntegrationTest.sol` for the pattern. Not covered here — the single-offer flow is enough for the standard product.
