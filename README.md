# Covenant

**Trade the future with reputation-backed capital.**

Covenant is a reputation-aware prediction market application for [DreamDEX Event Contracts](https://docs.dreamdex.io/developers/event-contracts) on Somnia. It helps traders discover live markets, access conservative collateralized trading capital based on [Ethos](https://www.ethos.network/) credibility, and execute Up or Down positions from one interface.

The product is the trading experience; reputation and credit are what make it different:

- **DreamDEX trading (the product):** live Event Contract discovery, implied probabilities, order-book depth, expiry countdowns, testnet order execution, and position/payout tracking — all through the official Somnia Markets SDK.
- **Ethos-powered trading limits (the differentiator):** a wallet's Ethos credibility score maps it to a transparent credit tier whose gate is hashed into the market's identity — the same collateral supports 2× more borrowing at Reputable (77% LTV) than at Open (38.5%).
- **Covenant lending (the infrastructure):** a fixed-rate, fixed-maturity credit engine that stays invisible until the trader asks for capital — then it is three clicks: authorize score, post collateral, borrow.

> [!IMPORTANT]
> Covenant is experimental software under active development. It has not been audited and must not be used with production assets. The trading application and the **entire tier-gated credit layer run live on Somnia testnet**: DreamDEX discovery, Up/Down execution, the unified portfolio, on-chain Ethos score authorization, collateralized borrowing, and redemption — all verified end-to-end against the live chain (a test trader borrowed 500 tUSDC against 1 tBTC through a live Ethos-gated market). The contracts remain unaudited; test tokens only.

## Project at a Glance

| Item | Detail |
|---|---|
| Product | Reputation-aware Event Contract trading interface and collateralized credit layer |
| Network | Somnia Shannon testnet, chain `50312` |
| Event venue | DreamDEX Event Contracts |
| Trading collateral | DreamDEX TestUSDC, `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |
| Credit collateral | Test Wrapped BTC (`tBTC`), 8 decimals |
| Reputation source | Ethos v2 credibility score API |
| Frontend | React 18, TypeScript, Vite, wagmi, viem, RainbowKit |
| DreamDEX integration | `@somnia-chain/markets-sdk` and `@somnia-chain/markets-sdk/react` |
| Credit contracts | Solidity and Foundry, deployed to Somnia testnet |
| Prototype status | Working testnet prototype; unaudited and not production-ready |

### What Makes the Integration Meaningful

Covenant does not use DreamDEX as a logo, price feed, or isolated widget. DreamDEX
is the execution and settlement venue for the product:

1. The first screen discovers active Event Contracts from DreamDEX.
2. Market pages stream DreamDEX books, fills, and the settlement oracle price.
3. User orders are submitted to DreamDEX contracts through the official SDK.
4. The resulting ERC-6909 outcome positions and PnL are read back from DreamDEX.
5. Winning positions are redeemed through DreamDEX settlement.
6. Covenant loans are issued in the exact TestUSDC token DreamDEX escrows for orders.

The sixth point is the product's central integration thesis. Reputation-backed
credit does not stop at a separate lending dashboard: the borrowed asset becomes
usable trading capital on every live DreamDEX Event Contract immediately after
the borrow transaction.

### Submission Criteria

| Criterion | Evidence in Covenant |
|---|---|
| Working prototype | Live DreamDEX reads and writes, deployed Somnia credit contracts, faucet flow, wallet transactions, portfolio, repayment, and redemption |
| Event Contract integration | Discovery, lifecycle, four-sided outcome book, order entry, cancellation, fills, ERC-6909 balances, settlement, and claims |
| Meaningful API/SDK use | Shared `SomniaMarkets` client, React live-tail hooks, indexer queries, trader writes, Ethos score reads, and EIP-712 authorization service |
| Clear user experience | Markets-first homepage, searchable market table, explicit YES/NO prices, payoff preview, three-step capital checklist, and unified portfolio |
| Innovation | Portable reputation changes collateral efficiency while collateral remains the enforceable safety boundary |
| Adoption potential | More qualified trading capital can produce additional DreamDEX participation; the same capital can also fund SDK-compatible trading agents |
| Ecosystem impact | Connects reputation, fixed-maturity credit, and Event Contract execution without requiring DreamDEX to modify its contracts |

## Table of Contents

- [Overview](#overview)
- [Why Covenant](#why-covenant)
- [Hackathon Scope](#hackathon-scope)
- [Evaluator Demo](#evaluator-demo)
- [Product Experience](#product-experience)
- [Architecture](#architecture)
- [DreamDEX Integration](#dreamdex-integration)
- [Protocol Mechanics](#protocol-mechanics)
- [Trust Model](#trust-model)
- [Security](#security)
- [Development](#development)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

## Overview

Prediction-market traders need capital, but existing platforms treat every wallet identically. Covenant's trading flow:

1. A trader opens Covenant and lands on **live DreamDEX Event Contracts** — questions, implied probabilities, depth, and time to expiry.
2. They open a market and see the order panel, which includes their **trading capital**: wallet collateral plus the credit line their Ethos tier earns.
3. One click — **Get trading capital** — walks the on-chain credit flow: authorize the Ethos score at the tier gate, post tBTC collateral, borrow tUSDC by filling a signed lender offer.
4. They place an **Up or Down order** through the official DreamDEX SDK.
5. The portfolio tracks the whole trade together: debt, collateral health, outcome positions, and PnL — with repayment and withdrawal never gated by reputation.

Collateral remains the primary security mechanism. Ethos is a bounded underwriting signal that sets the terms; it never replaces collateral and never blocks an exit.

## Why Covenant

### For Traders

- Trade DreamDEX Event Contracts from an interface that treats capital as part of the product.
- See the exact tier a score earns, and how far it is from the next bar, before committing.
- Convert reputation into borrowing power: the same tBTC supports 2× more debt at Reputable than at Open.
- Keep repayment and withdrawal paths available even if a reputation authorization expires.

### For Lenders

- Select explicit maturity, price, collateral, and reputation requirements.
- Sign offers off-chain and settle only accepted offers on-chain.
- Rely on deterministic collateral-health and liquidation rules.
- Isolate risk across immutable, content-addressed markets.

### For DreamDEX

- Qualified traders get access to additional working capital, directly in the venue's collateral.
- Lending activity connects directly to Event Contract participation.
- A foundation for reputation-aware trading agents and portfolio risk tools.

## Hackathon Scope

Covenant is being prepared for the **Somnia x DreamDEX Event Contracts Hackathon**. The target submission is a working Somnia testnet prototype with the following end-to-end flow:

```text
Open Covenant — land on live DreamDEX markets        (live)
      |
      v
Discover an Event Contract: probability, depth,     (live)
expiry, settlement state
      |
      v
Connect a wallet · see Ethos score and credit tier  (live)
      |
      v
Get trading capital: authorize score at the tier    (live Somnia
gate, post tBTC, borrow tUSDC via signed offer       deployment)
      |
      v
Place an Up or Down order through the SDK           (live)
      |
      v
Track debt, collateral health, position, and PnL    (live)
in one portfolio · repay or redeem anytime
```

### Implementation Status

| Component | Status | Notes |
|---|---|---|
| DreamDEX market discovery | Implemented | Live markets, lifecycle state, prices, and order-book depth through the official SDK |
| DreamDEX order execution | Implemented | Testnet Up/Down order placement and cancellation using venue collateral |
| Unified portfolio | Implemented | Credit + collateral + outcome positions with avg-cost PnL, resting orders, fills |
| Ethos score lookup | Implemented | Live v2 API read with tier assignment in the UI |
| Ethos tier gate | Implemented | `src/reputation/EthosTierGate.sol` — signed score authorizations, wallet/chain/nonce/expiry-bound, fail-closed |
| Tier-gated credit markets | Implemented | Three markets at 38.5% / 62.5% / 77% LLTV; gate address hashed into each market id |
| Credit service | Implemented | `offchain/somnia-service.mjs` — signs score authorizations from live Ethos reads and lender offers |
| Somnia deployment | **Deployed** | Live on Somnia testnet — verified end-to-end with a real borrow; addresses in [Deployment](#deployment) |
| Fixed-maturity lending engine | Implemented | Offer fills, collateral, repayment, redemption, liquidation, and fees — 524-test Foundry suite |
| EIP-712 offer authorization | Implemented | Off-chain offers with on-chain notary verification |

This table is the source of truth for submission readiness. Features are marked implemented only after they are integrated and verified in this repository.

## Evaluator Demo

This is the shortest path through the complete working product. It is designed
to make the connection between reputation, borrowed capital, and DreamDEX
execution visible rather than asking an evaluator to infer it from separate
screens.

### Before Starting

Use a browser wallet connected to Somnia Shannon testnet (`50312`). The wallet
needs:

- A small amount of STT for transaction gas.
- DreamDEX TestUSDC for direct trading or as the balance that visibly increases after borrowing.
- Covenant tBTC for the collateralized credit demonstration.
- An Ethos-linked wallet if demonstrating the Established or Reputable tiers. An unlinked or unavailable score follows the conservative Open-tier path.

The in-app **Faucet** page links to the STT faucet, calls the official DreamDEX
TestUSDC faucet through the SDK, and mints the test tBTC used by the deployed
credit markets.

### Recommended Demo Script

1. **Open Markets.** Confirm that the page lists live DreamDEX Event Contracts rather than static sample cards. Point out the question, asset, interval, YES/NO probability, volume, and settlement countdown.
2. **Open one active contract.** Show the live settlement-oracle EMA, strike, price-versus-strike indicator, two-sided outcome selector, order-book depth, spread, volume, and recent fills.
3. **Switch YES and NO.** The application follows each outcome's real tradable book. The displayed probabilities remain complementary while execution switches to the selected outcome token.
4. **Connect the evaluator wallet.** Show the wallet's Ethos score, earned tier, DreamDEX TestUSDC balance, current Event Contract exposure, and total available trading capacity.
5. **Record the starting TestUSDC balance.** This makes the shared-collateral integration visible when the balance increases after borrowing.
6. **Select Get trading capital.** The modal reads a live Ethos score authorization and chooses the highest tier the wallet qualifies for.
7. **Authorize the score.** Submit the short-lived EIP-712 authorization to the selected `EthosTierGate`. The gate verifies the configured signer and records the wallet's authorization on-chain.
8. **Post tBTC collateral.** Approve if required, then supply the amount calculated from the requested borrow, oracle price, and tier LLTV.
9. **Borrow TestUSDC.** The service produces a fresh signed lender offer. Filling it on Covenant creates debt and transfers DreamDEX venue collateral to the trader wallet.
10. **Verify the balance increase.** The borrowed TestUSDC appears in the same wallet balance the DreamDEX order ticket spends.
11. **Place an Event Contract order.** Select YES or NO, choose Buy, size the order, and review limit price, total notional, payout if correct, and potential profit. Submit the IOC limit order through the official SDK.
12. **Open Positions.** Show credit tier, debt, posted collateral, debt-capacity utilization, health, Event Contract mark value, average-cost PnL, recent fills, and any resting orders.
13. **Demonstrate an exit.** A borrower can repay debt and withdraw collateral without a fresh reputation authorization. A settled DreamDEX winner can redeem outcome tokens for venue collateral.

### What the Demo Proves

| Demo moment | What it establishes |
|---|---|
| Markets load from the venue | DreamDEX is the product's live market source |
| Book and tape update | The app consumes the SDK's event-sourced WebSocket tail |
| Score selects a tier | Reputation affects transparent underwriting policy |
| Borrow increases TestUSDC | Covenant credit and DreamDEX execution share one asset |
| Order lands on DreamDEX | The borrowed capital has a direct venue use |
| Portfolio joins debt and outcomes | The interface tracks the whole economic trade |
| Repay/redeem remain available | Reputation gates new exposure, not user exits |

No market, price, order, fill, position, or payout is fabricated. If a live
dependency is unavailable, Covenant reports the unavailable state instead of
substituting preview data.

## Product Experience

### Markets

The Markets route is a trading work surface rather than a marketing landing
page. It provides:

- Active binary Event Contracts loaded from DreamDEX.
- Search by question or underlying asset.
- Asset filters derived from the venue's current inventory.
- An ending-soon filter for contracts inside the final 24 hours.
- Sorting by indexed volume, settlement time, or last probability.
- Live YES/NO prices in cents and a visual probability split.
- Volume and continuously updating time-to-settlement.
- Connected-wallet capacity and open-position summaries.

### Market Detail and Order Entry

Each market page combines the information needed to form and execute a view:

- Human-readable Event Contract question and interval.
- Live on-chain lifecycle badge, independent of indexer lag.
- The same oracle EMA used by the market's settlement process.
- Strike price and distance between the live oracle and strike.
- Complementary YES and NO probabilities.
- Selected outcome's real bids, asks, spread, and depth.
- Recent DreamDEX fills received from the live venue tail.
- Buy and sell flows with wallet-bounded quick sizing.
- Limit price, notional cost, winning payout, and potential profit preview.
- Actual venue collateral balance and reputation-informed capacity.
- Transaction result with Somnia explorer link.

Orders are IOC limit orders in the prototype. A buy crosses the best ask and a
sell hits the best bid. The app reads the market's authoritative on-chain status
immediately before submission; only status `Trading (1)` is allowed to reach the
wallet confirmation.

### Trading Capital

The capital modal presents protocol operations as a live checklist:

| Step | User action | On-chain result |
|---|---|---|
| 1 | Authorize Ethos score | `EthosTierGate.authorize` records a short-lived wallet authorization |
| 2 | Approve and post tBTC | Covenant custody receives collateral assigned to the selected tier market |
| 3 | Fill lender offer | Covenant creates borrower debt and transfers DreamDEX TestUSDC to the wallet |

Returning users do not repeat completed steps unnecessarily. The interface
re-reads gate authorization, collateral, debt, wallet balances, and health after
transactions and renders the remaining actions.

### Unified Portfolio

The Positions route is the closing screen of the product story. It combines:

- Earned Ethos tier and maximum LTV.
- Covenant debt and posted collateral.
- Maximum debt and capacity utilization.
- Current collateral health.
- Repayment and collateral-withdrawal actions.
- DreamDEX outcome balances by Event Contract.
- Average cost, mark value, and unrealized PnL.
- Resting order cancellation.
- Recent indexed fills.
- Settled positions with claimable payout.
- Resolved and void-market redemption behavior.

Settled markets disappear from DreamDEX's live inventory. Covenant therefore
scans recent finalized markets and reads ERC-6909 balances directly so winning
outcome tokens do not remain invisible and unclaimed.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Covenant Markets — the trading application (live on Somnia testnet) │
│ React · TypeScript · wagmi · viem · @somnia-chain/markets-sdk        │
│ Market discovery · Up/Down execution · capital · unified portfolio  │
└──────────────┬───────────────────────────────┬───────────────────────┘
               │                               │
      reads Ethos scores              market discovery · books
      submits Up/Down orders          orders · portfolio · cancels
               │                               │
┌──────────────┴──────────────┐  ┌─────────────┴──────────────────────┐
│ Ethos v2 API                │  │ DreamDEX Event Contracts           │
│ Credibility score · level   │  │ On-chain limit order book          │
└──────────────┬──────────────┘  │ ERC-6909 Up/Down outcomes          │
               │                 │ Oracle resolution · redemption     │
   score attestation             └─────────────┬──────────────────────┘
               │                                │ borrowed tUSDC
┌──────────────┴────────────────────────────────┴──────────────────────┐
│ Covenant Credit Engine · EthosTierGate × 3 (Somnia deployment)       │
│ Markets · positions · fills · collateral · fees · liquidation        │
│ Signed score authorizations: wallet · chain · nonce · expiry bound   │
│ Tier markets at 38.5% / 62.5% / 77% LLTV — gate IS the policy        │
└──────────────────────────────────────────────────────────────────────┘

The off-chain half: offchain/somnia-service.mjs reads Ethos live and signs
short-lived score authorizations for every tier gate, and signs lender
offers. The signer can only attest scores — it holds no funds, cannot move
collateral, disable liquidation, or override the solvency check.
```

### Credit Engine

`src/Covenant.sol` implements a zero-coupon, fixed-maturity credit market:

- Lenders buy credit units below or at face value.
- Borrowers sell credit units and receive loan assets at execution.
- Credit units redeem one-for-one for loan tokens, subject to protocol fees and socialized losses.
- Interest is represented by the difference between execution price and face value.
- Offers are signed off-chain and filled on-chain.
- Collateral health is checked after debt-increasing execution.

The engine is not a utilization-based pool. Rates originate from lender and borrower offers, giving each loan a deterministic price and maturity.

### Market Identity

A market is defined by its loan token, collateral configuration, maturity, recovery threshold, entry gate, and liquidation gate:

```solidity
struct Market {
    address loanToken;
    CollateralParams[] collateralParams;
    uint256 maturity;
    uint256 rcfThreshold;
    address entryGate;
    address seizureGate;
}
```

Its identifier commits to the complete market configuration, the Covenant deployment, and the original chain ID:

```text
marketId = keccak256(covenant, chainId, encodedMarketConfiguration)
```

Changing an asset, oracle, maturity, collateral ratio, or gate creates a different market. Existing terms cannot be silently rebound to a new underwriting policy.

### Reputation Layer

The engine exposes narrow policy hooks:

```solidity
function canIncreaseCredit(address account) external view returns (bool);
function canIncreaseDebt(address account) external view returns (bool);
function canLiquidate(address account) external view returns (bool);
```

`src/reputation/EthosTierGate.sol` implements these hooks today. An off-chain service reads a wallet's Ethos credibility score and returns a short-lived EIP-712 `ScoreAuthorization`; anyone may submit it to the gate, and once accepted the wallet may increase debt in the market until the authorization expires. Each authorization commits to:

- Borrower wallet
- Observed score
- Expiration deadline
- Unique nonce (replay protection)
- Somnia chain id
- The gate's own address (policy version — a different threshold is a different gate, and a different market id)

The gate rejects expired, replayed, cross-chain, cross-contract, and wrong-signer authorizations. Missing or unavailable reputation data fails closed to the Open tier — never enhanced terms. The signer can only attest scores: it holds no funds, cannot alter thresholds or LLTVs, and cannot override the solvency check.

### Credit Tiers

The tier ladder uses a small number of understandable thresholds rather than an opaque borrower-specific formula, and each tier's LTV is one of the engine's allowed collateral tiers — the reputation bar and the collateral terms are one object:

| Ethos score | Tier | Maximum LTV | 1 tBTC supports |
|---:|---|---:|---:|
| Below 1600 | Open | 38.5% | ~$41,600 of debt |
| 1600–1999 | Established | 62.5% | ~$67,500 of debt |
| 2000 and above | Reputable | 77.0% | ~$83,200 of debt |

Reputable carries **2× the capital efficiency** of Open — earned by the credibility score rather than by posting more collateral. These thresholds and ratios are Covenant application policy, not recommendations or guarantees from Ethos.

### DreamDEX Integration

DreamDEX is the on-chain central limit order book on Somnia. Its **Event
Contracts** are binary markets: each question has an Up and a Down side, both
trading on one book, where a Down price is always `1 − Up`. Positions are ids in
a shared **ERC-6909** outcome-token singleton rather than separate ERC-20
deployments, and a complete set (1 Up + 1 Down) is always mintable from — and
redeemable for — one unit of collateral.

Covenant integrates with it at three levels.

#### 1. Shared collateral — the integration thesis

Covenant's loan token **is** the DreamDEX venue collateral
(`0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`, 6dp tUSDC on Shannon). Borrowed
capital is therefore immediately tradable on DreamDEX with no bridge, wrapper,
or swap in between: a borrower draws credit against collateral and takes a
position on an Event Contract in the same asset, in the next transaction.

This is deliberately conventional on the risk side. Covenant lends *against*
ordinary collateral so a position can be liquidated on a normal solvency test;
it does not accept ERC-6909 outcome positions as collateral. Direct outcome-token
collateral needs token-id-aware custody, pre-settlement valuation, liquidation
liquidity, and void-market accounting — see [Roadmap](#roadmap).

#### 2. Live venue tail — the read path

The app holds **one** `SomniaMarkets` client for its lifetime
(`frontend/src/config/dreamdex.ts`), published to the tree through
`SomniaMarketsProvider`. The SDK's engine tier is event-sourced: a single
WebSocket carries chain logs into a local store, and the `/react` hooks read
that store synchronously. Order books, prices, and fills therefore update the
moment a log lands — there is no refetch interval on the market data path.

| Surface | Hook | Behaviour |
|---|---|---|
| Order book | `useLiveBinaryOrderBookByMarket` | 4-sided book materialized locally from order events |
| Trade tape | `useLiveFills` | Fills as the socket sees them, newest first |
| Underlying price | `useLivePrice` | The same EMA feed the market settles against |
| Subscription | `useWatchMarket` | Ref-counted per pool; shared across components |
| Connection state | `useLiveStatus` | Socket state and how far the store trails the chain head |

Two details matter for correctness:

- **Books are keyed by `marketId`, never by pool.** A `BinaryPool` is recycled
  across expiry windows, so a pool-keyed read on a page left open would silently
  begin rendering the *successor* market's orders. The by-market read returns an
  empty book once a market is no longer the pool's current binding.
- **Decimals are read per market**, from `quoteDecimals` / `baseDecimals`, not
  assumed. Collateral is 6dp tUSDC on testnet and 18dp USDso on mainnet — a
  10^12 difference that a hardcoded scale would turn into a silent mispricing.

#### 3. Lifecycle-gated writes

Every write reads the market's live on-chain status first and refuses to sign
unless it is `Trading (1)`. The indexer trails the chain by seconds, so a market
that just expired can still look active in a list; gating on the chain read means
the wallet is never asked to confirm an order the pool has already stopped
accepting.

| Status | Value | Meaning |
|---|---|---|
| Listed | 0 | Deployed, not yet open |
| **Trading** | **1** | The only state that accepts orders |
| Locked | 2 | Window ended; no new orders, cancels still work |
| Resolved | 4 | Winning side fixed; winners redeem at par |
| Voided | 5 | Both sides redeem at 0.5 |

Writes travel the same client the reads tail, so a fill lands in the live store
over an already-open socket. Covered: IOC limit orders, cancellation,
settlement redemption (including the void case, where each side pays 0.5), and
the testnet collateral faucet.

Settlement itself is permissionless — the oracle publishes and Somnia's on-chain
reactivity triggers the `BinaryMarketsModule` callback. Because settled markets
leave the live list, the app scans the finalized tail and reads outcome balances
per market so winnings are never stranded unnoticed in the ERC-6909 singleton.

#### SDK and API call map

The table below maps visible product behavior to the concrete DreamDEX SDK path
used by the application. This is also a navigation guide for reviewers who want
to trace the integration in source.

| Product behavior | SDK/API operation | Covenant implementation |
|---|---|---|
| Load active Event Contracts | `SomniaMarkets.loadMarkets(true)` and the exchange market registry | `useDreamDexMarkets` in `frontend/src/hooks/useDreamDex.ts` |
| Read one binary market | `client.getBinaryMarket(marketId)` | `useDreamDexMarket` |
| Subscribe to a market | `useWatchMarket(poolAddress)` | `useDreamDexBook`, `useDreamDexTape` |
| Stream YES/NO book | `useLiveBinaryOrderBookByMarket(marketId, depth)` | `useDreamDexBook` |
| Stream recent fills | `useLiveFills(poolAddress, limit)` | `useDreamDexTape` |
| Stream settlement reference | `useLivePrice(asset)` | `useLivePrice` wrapper |
| Expose venue-tail health | `useLiveStatus()` | `useVenueTail` |
| Read authoritative lifecycle | `client.getMarketOnchain(marketId)` | `useMarketOnchain` and the pre-submit guard |
| Place order | `exchange.createOrder(symbol, "limit", side, amount, price, { timeInForce: "IOC" })` | `useDreamDexTrader.placeOrder` |
| Cancel resting order | `client.createTrader({ walletClient }).cancelOrder(...)` | `useDreamDexTrader.cancelOrder` |
| Read wallet portfolio | `client.getPortfolio(address)` | `useDreamDexPortfolio` |
| Read positions and PnL | `client.getOpenPositionsWithPnL(address)` | `useDreamDexPositions` |
| Find settled claims | `client.listBinaryMarkets({ status: "Finalized" })` plus outcome-balance reads | `useSettledClaimables` |
| Redeem outcomes | `client.createTrader({ walletClient }).redeem(...)` | `useDreamDexTrader.redeemOutcome` |
| Drip test collateral | `client.createTrader({ walletClient }).faucet()` | `useDreamDexTrader.faucet` |

#### Shared client lifecycle

`frontend/src/config/dreamdex.ts` creates one `SomniaMarkets` object for the
application lifetime. `frontend/src/main.tsx` exposes its engine client through
`SomniaMarketsProvider`, while write helpers reuse the exchange wrapper after
binding the connected wagmi wallet client.

This design is deliberate:

- One WebSocket serves all mounted market-data components.
- Multiple components watching one pool share the SDK's ref-counted subscription.
- The indexer snapshot and live chain tail hydrate one local store.
- A transaction submitted by the app returns through the already-open event tail.
- Route changes do not create and discard venue clients.
- Disconnecting a wallet does not tear down public market reads.

Creating a new SDK client inside each React query would turn the live system into
repeated snapshots, increase socket churn, and create inconsistent books across
components. The singleton is therefore a correctness decision, not only a
performance optimization.

#### Binary outcome accounting

DreamDEX stores outcome positions in a shared ERC-6909 token contract. Covenant
keeps the outcome token model visible in its accounting while presenting familiar
YES/NO language to users:

- Outcome index `0` is YES/UP.
- Outcome index `1` is NO/DOWN.
- YES and NO probabilities are complementary.
- A winning resolved outcome redeems at one unit of quote collateral.
- In a void market, each side redeems at `0.5`.
- A complete YES + NO pair remains collateral-equivalent at par.

The UI never assumes that a selected NO order is merely a visual inverse. It
switches to the NO tradable and its executable side of the SDK-derived book.

#### Decimal and price safety

Price and balance scaling are read from venue or market metadata wherever
available. This matters because the test venue uses 6-decimal TestUSDC while
other deployments may use 18-decimal collateral. The application uses:

- `quoteDecimals` for prices, quote volume, costs, marks, and payouts.
- `baseDecimals` for Event Contract quantities.
- ERC-20 `decimals()` for the connected wallet's venue-collateral balance.
- Raw integer values for transaction arguments.
- Human-readable decimal values only at the interface boundary.

Hardcoding an 18-decimal scale would misprice the Shannon venue by a factor of
one trillion. The per-market conversion in `useDreamDexBook` prevents that class
of silent error.

#### DreamDEX failure behavior

| Failure | User-visible behavior | Safety property |
|---|---|---|
| Indexer unavailable | Markets page reports that live registry data is unavailable | No fabricated market inventory |
| WebSocket hydrating | Book identifies the non-live state while snapshot and tail join | No false “streaming” claim |
| Indexer trails expiry | Pre-submit on-chain status read blocks the order | Wallet is not asked to sign an already-invalid order |
| Wrong wallet network | Interface offers a switch to Somnia Shannon | No write is sent to an unintended chain |
| Insufficient TestUSDC | Ticket blocks oversized buy and points to faucet or smaller size | No predictably reverting transaction |
| Insufficient outcome tokens | Sell sizing is bounded by the selected holding | No unsupported close size |
| Settled market leaves live list | Finalized-tail scan finds held outcome balances | Winnings are not hidden from the portfolio |

#### DreamDEX contract addresses

Identical on Shannon testnet (50312) and mainnet (5031) — deployed with CREATE3.
All are proxies: implementations upgrade while addresses stay stable.

| Contract | Address |
|---|---|
| `BinaryMarketsModule` | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| `MarketsCore` | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| `BinarySettlement` | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| `OutcomeToken6909` | `0xB52c5934113Af5c0Bb20eb3C72290C8215f755b9` |
| `OracleHub` | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` |
| `CollateralRouter` | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` |

Market and pool addresses are per-window and recycled — always resolve them from
the module registry, never hardcode them.

#### Automated trading against Covenant credit

Covenant's credit layer is venue-native, so anything that trades DreamDEX can
trade on borrowed capital: the loan token is already the venue collateral, and a
tier gate authorizes the *wallet*, not a session. A bot funded by a Covenant
position needs no Covenant-specific integration — it points at DreamDEX as usual.

- **[DreamDEX Bot Kit](https://github.com/somnia-chain/dreamdex-bot-kit)** —
  strategy framework with a shared client (TypeScript and Python), a backtester,
  and reference strategies. The `ec-*` variants target binary Up/Down Event
  Contracts specifically. Note that `placeTakerOrderWithoutVault` is obsolete;
  current code uses a single `payable` `placeOrder` that pulls funds from the
  wallet.
- **[DreamDEX Bot Builder](https://dreambot-builder.vercel.app/)** — scaffolds a
  bot without cloning the kit by hand.
- **[`telegram-bot/`](telegram-bot/README.md)** — Covenant's Telegram control
  plane, built from the Bot Kit's Event Contract safety patterns. Public users
  can inspect markets, books, Ethos scores, capacity and positions, then preview
  an order and open Covenant to sign it. Server-side execution is off by default,
  allowlisted, capped, and uses only a dedicated testnet bot wallet.
- **[Event Contracts documentation](https://docs.dreamdex.io/developers/event-contracts)**
  — the protocol reference: market structure and lifecycle, recipes, and the
  addresses above.

Bot Kit dry-runs default to `DRY_RUN=true`; keep it there until a strategy is
proven on Shannon. Covenant is unaudited testnet software and the Bot Kit is
explicitly educational reference code — neither is production-ready.

## Protocol Mechanics

### Offers

An `Offer` is an EIP-712 signed quote containing:

- Complete market configuration
- Buy or sell side
- Maker and optional receiver
- Start and expiry times
- Price tick
- Consumption group
- Notary and authorization data
- Maximum units or assets
- Reduce-only behavior

Publishing offers is free. Gas is paid only when a counterparty fills an offer on-chain. Offer discovery remains an off-chain concern so marketplaces and trading agents can compete without changing the settlement contract.

### Collateral Health

For activated collateral assets, Covenant calculates maximum supported debt as:

```text
maxDebt = sum(collateralAmount[i] * oraclePrice[i] * LLTV[i])
```

With the protocol's fixed-point scales made explicit:

```text
maxDebt = sum(
  collateralAmount[i]
  * oraclePrice[i] / ORACLE_PRICE_SCALE
  * LLTV[i] / WAD
)
```

A borrower is healthy when:

```text
debt <= maxDebt
```

Collateral and oracle parameters are immutable components of the market identity.

### Access Policy

Policy checks apply only when exposure increases:

| Action | Policy check |
|---|---|
| Increase lender credit | `canIncreaseCredit` |
| Increase borrower debt | `canIncreaseDebt` |
| Liquidate a borrower | `canLiquidate` |
| Repay debt | None |
| Redeem lender credit | None |
| Supply collateral | None |
| Withdraw collateral | Solvency check only |

Repayment and redemption remain available when reputation data is stale, a score falls, or an authorization expires. A reputation change may prevent new borrowing but does not, by itself, liquidate an otherwise solvent position.

### Settlement and Losses

- Borrower debt is repaid in credit units at face value.
- Repaid loan tokens become withdrawable by lenders.
- Lender credit is adjusted for continuous fees and realized market losses.
- Unrecoverable debt is reflected through a market loss factor.
- Liquidations repay debt in exchange for collateral under the market's configured incentive limits.

For a detailed derivation of protocol arithmetic, see [`docs/CoreMath.md`](./docs/CoreMath.md).

## Trust Model

Covenant minimizes, but does not eliminate, trust.

### On-Chain Guarantees

- Market configuration is immutable and content-addressed.
- Score-gated markets cannot substitute a different gate without becoming a new market.
- Offers are authenticated by the configured notary.
- Collateral health is enforced by the lending engine.
- Position exits do not depend on reputation service availability.
- Score authorizations are intended to be wallet-, chain-, contract-, nonce-, and expiry-bound.

### Trusted Components

- Price-oracle correctness and availability
- The service that reads Ethos and signs score authorizations
- Ethos API availability, profile resolution, and score methodology
- Deployment administrators and configured protocol roles
- Off-chain offer publication and discovery infrastructure

The score signer will be able to grant only bounded access to preconfigured markets. It will not be able to move funds, modify collateral parameters, disable liquidation, or override the core solvency check.

### Ethos Limitations

Ethos credibility is a mutable reputation signal. It may change as reviews, vouches, attestations, slashing events, account relationships, and score methodology evolve. It is not proof that a borrower will repay.

Covenant therefore follows these principles:

- Never grant unsecured credit solely from an Ethos score.
- Bind every score decision to the borrowing wallet.
- Use short-lived authorizations for new exposure.
- Treat pending or unavailable score calculations conservatively.
- Version underwriting policy independently of the source score.
- Never liquidate a collateralized position solely because reputation declines.

## Security

### Current Status

- The contracts have **not** received a completed independent audit.
- The repository is intended for testnet development and evaluation only.
- Known accounting, callback, oracle-availability, and post-maturity edge cases are represented by proof-of-concept tests and require remediation before any production deployment.
- Passing exploit-reproduction tests do not indicate that the underlying issue is fixed.
- No contract in this repository should be treated as production-ready.

### Security Priorities

Before a public deployment, the project must complete:

1. Remediation and regression testing for all known proof-of-concept findings.
2. Invariant and stateful fuzz testing across fills, callbacks, repayment, redemption, and liquidation.
3. Independent review of the lending engine and score-authorization boundary.
4. Oracle failure, staleness, and manipulation analysis.
5. Signer compromise, rotation, replay, and policy-version testing.
6. Conservative asset, market, and global debt ceilings.
7. Emergency response and pause procedures that do not strand exits.

To report a vulnerability, contact the maintainers privately rather than opening a public issue containing exploit details.

## Repository Structure

| Path | Description |
|---|---|
| `src/Covenant.sol` | Core fixed-maturity lending engine |
| `src/reputation/` | `EthosTierGate` — signed score authorizations bound to tier markets |
| `src/interfaces/` | Market, gate, oracle, callback, token, and notary interfaces |
| `src/libraries/` | Market identity, ticks, arithmetic, transfers, constants, and events |
| `src/notaries/` | EIP-712 offer authorization |
| `src/oracles/` | Price-oracle implementations |
| `src/periphery/` | Bundled actions, authorization helpers, and credit-ladder views |
| `src/compliance/` | Legacy policy adapters superseded by the reputation layer |
| `test/reputation/` | Tier-gate unit tests and the end-to-end credit-flow rehearsal |
| `script/DeploySomnia.s.sol` | One-command Somnia deployment of the credit layer |
| `deployments/` | Deployment manifests (template + runbook) |
| `offchain/somnia-service.mjs` | Ethos score authorizations + lender offer signing |
| `test/` | Foundry unit, fuzz, integration, regression, and proof-of-concept tests |
| `frontend/` | Covenant Markets — the trading application |
| `docs/` | Protocol mathematics and supporting documentation |

## Technology

### Smart Contracts

- Solidity
- Foundry
- EIP-712 signed offers
- CREATE2 and bytecode-backed immutable market storage
- ERC-20 loan and collateral assets

### Application

- React 18, TypeScript, Vite
- wagmi / viem / RainbowKit — Somnia testnet (`somniaShannon`, chain 50312)
- `@somnia-chain/markets-sdk` **0.28.1** — one shared client for the app's
  lifetime, providing live order books, the trade tape, price feed, portfolio
  reads, and order placement
- `@somnia-chain/markets-sdk/react` — `SomniaMarketsProvider` and the WebSocket
  tail hooks that back every market-data surface
- TanStack Query — wallet- and indexer-scoped reads only; market data is
  streamed, not polled
- Ethos v2 REST API for credibility scores

> The SDK floor is **0.28.0**. Earlier versions carry indexer-compatibility and
> price-tick-grid bugs.

### Integrations

| Integration | What Covenant uses it for | Status |
|---|---|---|
| Somnia Shannon (chain 50312) | Settlement layer for both the credit engine and the venue | Live |
| DreamDEX Event Contracts | Binary markets that borrowed capital trades on | Live |
| `@somnia-chain/markets-sdk` | Live book/tape/price tail, lifecycle-gated writes | Live |
| Ethos v2 API | Credibility score behind the credit tier | Live (see [Ethos Limitations](#ethos-limitations)) |
| DreamDEX Bot Kit | Telegram market/book/capacity interface and guarded Event Contract execution | Integrated in [`telegram-bot/`](telegram-bot/README.md), dry-run by default |

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation), including `forge`, `cast`, and `anvil`
- Node.js 20 or later and npm
- A browser wallet compatible with RainbowKit/wagmi
- A small amount of Somnia testnet STT for interactive transactions
- Git submodules initialized for `forge-std`

The frontend can browse public DreamDEX data without private keys. Executing
orders requires a connected wallet. Running the reputation/offer service requires
two service keys, and deploying a fresh credit layer requires a funded deployer
key.

### Clone and Initialize

```bash
git clone <repository-url>
cd Covenant
git submodule update --init --recursive
```

Install JavaScript dependencies for both runtime packages:

```bash
npm install --prefix frontend
npm install --prefix offchain
```

### Build Contracts

```bash
forge build
```

The default Foundry profile enables the optimizer, IR compilation, and Cancun
EVM output. Somnia Shannon supports the transient-storage behavior required by
the core. A deployment compiled for an older EVM target is not equivalent to the
tested configuration.

### Run Contract Tests

```bash
forge test
```

At the time of this README update, the complete local suite reports:

```text
524 tests passed
0 tests failed
0 tests skipped
```

This count includes tests that reproduce known security findings, and the 20-test reputation suite (`test/reputation/`) that rehearses the full tier-gated credit flow end-to-end: score authorization → collateral → borrow → health → repay → withdraw, plus ladder, gating, and expiry semantics. Review the [Security](#security) section before interpreting the result as a readiness signal.

Useful focused commands and what they cover:

```bash
# EIP-712 score authorization, replay, expiry, threshold, and domain binding
forge test --match-contract EthosTierGateTest -vvv

# Complete collateralized credit journey and tier economics
forge test --match-contract EthosCreditFlowTest -vvv

# General borrow/lend/repay protocol flow
forge test --match-contract ProtocolFlowTest -vvv

# Core compilation
forge build
```

`forge build` currently completes with existing advisory lint notes. Running
`forge lint` as a standalone command depends on the installed Foundry release;
the repository's lint exclusion list includes `block-timestamp`, which some
versions do not recognize as a configurable lint ID.

> [!CAUTION]
> Some tests intentionally reproduce known security findings. A passing
> proof-of-concept test can mean that the vulnerable behavior was reproduced,
> not that it was remediated. Read [Security](#security) before treating the test
> count as a production-readiness statement.

### Run the Frontend

```bash
cd frontend
npm run dev
```

Vite serves the application at `http://localhost:5173`. Public DreamDEX reads
work with the built-in Shannon configuration. The following optional variables
override public defaults:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DREAMDEX_INDEXER_URL` | `https://dev.smk.somnia.host/v1/graphql` | DreamDEX GraphQL indexer |
| `VITE_DREAMDEX_WS_RPC_URL` | `wss://api.infra.testnet.somnia.network/ws` | WebSocket chain tail used by the SDK |
| `VITE_CREDIT_SERVICE_URL` | `http://localhost:3001` | Covenant score-authorization and offer service |
| `VITE_WALLETCONNECT_PROJECT_ID` | empty | Optional WalletConnect Cloud project id for mobile QR/deep-links; browser wallets do not require it |

Create a production build with:

```bash
npm run build
```

The current production build completes successfully. The frontend does not yet have an automated browser-test suite.

The application keeps configuration responsibilities explicit:

- `frontend/src/config/chain.ts` — chain (Somnia testnet, chain 50312), explorer, and the DreamDEX venue collateral address (resolved from the SDK's deployment manifest)
- `frontend/src/config/dreamdex.ts` — indexer and WebSocket endpoints, Ethos API, and the tier policy (`ETHOS_TIERS`)
- `frontend/src/config/credit.ts` — deployed Covenant addresses, immutable tier markets, maturity, token metadata, and service URL
- `deployments/somnia-testnet.json` — machine-readable source manifest for the credit service

### Run the Credit Service

The service is the narrow off-chain authority behind reputation-gated borrowing.
It reads the deployment manifest at startup and refuses to run if required fields
or keys are missing.

```bash
export SCORE_SIGNER_KEY=0x...
export LENDER_KEY=0x...
export MANIFEST=../deployments/somnia-testnet.json
export PORT=3001
npm --prefix offchain install
node offchain/somnia-service.mjs
```

Check startup and manifest wiring before opening the frontend:

```bash
curl http://localhost:3001/api/health
```

#### Service API

| Method and path | Inputs | Result |
|---|---|---|
| `GET /api/health` | None | Chain, signer, lender, and configured tier summary |
| `GET /api/ethos-score` | `address=0x...` | Live score, selected tier, and one signed authorization per gate |
| `GET /api/offer` | `market=open|established|reputable`, `units=<raw>` | Fresh lender `Offer`, EIP-712 notary proof, maker, market ID, and expiry |

Score authorizations expire after 30 minutes. They commit to wallet, observed
score, deadline, nonce, chain ID, and the gate's EIP-712 domain. An Ethos API
failure is converted to score `0` and can therefore grant only Open-tier terms.

The service does not:

- Hold borrower funds.
- Submit transactions for users.
- Change market thresholds or collateral ratios.
- Override Covenant's health check.
- Disable liquidation or block repayment.
- Sign for a gate whose signer was not configured at deployment.

#### Lender Preparation

The wallet behind `LENDER_KEY` must hold DreamDEX TestUSDC, approve the Covenant
core to pull that token during fills, and authorize the deployed
`EcrecoverNotary`. For a fresh deployment, execute these calls from the lender
wallet before requesting offers:

```bash
export RPC_URL=https://api.infra.testnet.somnia.network
export COVENANT=0x...
export NOTARY=0x...
export DREAMDEX_COLLATERAL=0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E
export LENDER_KEY=0x...
export LENDER_ADDRESS=0x...

cast send "$DREAMDEX_COLLATERAL" \
  "approve(address,uint256)" "$COVENANT" \
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
  --private-key "$LENDER_KEY" --rpc-url "$RPC_URL"

cast send "$COVENANT" \
  "setIsAuthorized(address,bool,address)" "$NOTARY" true "$LENDER_ADDRESS" \
  --private-key "$LENDER_KEY" --rpc-url "$RPC_URL"
```

The lender signs offers off-chain and spends gas only when performing setup or
other on-chain account management. The borrower submits and pays for the fill.

### Deploy the Credit Layer to Somnia

The full credit layer — core, notary, three Ethos tier gates, tBTC collateral, oracle, and three tier markets — is one script. Prerequisites:

1. A deployer key with STT for gas (the public faucet is Discord-gated): `faucet.somnia.network`
2. A score-signer key for the reputation service (any fresh key — its address, not the key, goes on-chain)
3. A lender key with venue tUSDC to lend into the tier markets (drip it from the DreamDEX faucet through the app)

```bash
export PRIVATE_KEY=0x...                   # funded Somnia deployer
export SCORE_SIGNER_ADDRESS=0x...          # public address only, never the key
export DREAMDEX_COLLATERAL=0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E
export BTC_USD_RAW_PRICE=10800000000000     # $108,000 with 8 feed decimals
export MATURITY=1803859200                  # 2027-03-01 00:00:00 UTC

forge script script/DeploySomnia.s.sol \
  --rpc-url https://api.infra.testnet.somnia.network --broadcast
```

The script deploys and configures:

1. Permissionlessly mintable 8-decimal test tBTC.
2. A BTC/USD oracle seeded from `BTC_USD_RAW_PRICE`.
3. The Covenant core in required-compliance mode.
4. The EIP-712 `EcrecoverNotary`.
5. Open, Established, and Reputable `EthosTierGate` contracts.
6. Three immutable credit markets at 38.5%, 62.5%, and 77% LLTV.

The script prints every address, `maxLif`, and market ID. Copy the output into
`deployments/somnia-testnet.json` using
`deployments/somnia-testnet.template.json`, then mirror the values in
`frontend/src/config/credit.ts`. `CREDIT_DEPLOYED` evaluates to true only when
all required addresses and market IDs are non-null.

After deployment:

1. Confirm the score key derives to `SCORE_SIGNER_ADDRESS`.
2. Fund the lender with DreamDEX TestUSDC.
3. Complete the lender approval and notary authorization above.
4. Start `offchain/somnia-service.mjs` with the matching keys and manifest.
5. Point `VITE_CREDIT_SERVICE_URL` at that service for non-local frontend deployments.
6. Run a small authorization, collateral deposit, borrow, repayment, and withdrawal before publishing addresses.

The full flow is rehearsed in `test/reputation/EthosCreditFlow.t.sol`, which deploys the identical configuration locally and walks a trader through authorization, borrowing, and exit.

### Offer Tooling

```bash
cd offchain
npm install
node sign_offer.js
node build_offer_book.js
```

The EIP-712 signing flow is documented in [`offchain/SIGNING.md`](./offchain/SIGNING.md).

### Configuration

For the current DreamDEX prototype, the
relevant variables are:

```bash
# Fresh deployment
PRIVATE_KEY=0x...
SCORE_SIGNER_ADDRESS=0x...
DREAMDEX_COLLATERAL=0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E
BTC_USD_RAW_PRICE=10800000000000
MATURITY=1803859200

# Credit service
SCORE_SIGNER_KEY=0x...
LENDER_KEY=0x...
MANIFEST=../deployments/somnia-testnet.json
PORT=3001

# Optional frontend overrides
VITE_DREAMDEX_INDEXER_URL=https://dev.smk.somnia.host/v1/graphql
VITE_DREAMDEX_WS_RPC_URL=wss://api.infra.testnet.somnia.network/ws
VITE_CREDIT_SERVICE_URL=http://localhost:3001
```

Never commit private keys, API credentials, or signer secrets. The frontend
contains no service private key. Public network endpoints and deployment
addresses are expected to be visible; signing authority is not.

## Deployment

The trading application runs entirely against public Somnia testnet infrastructure — the DreamDEX indexer, the Somnia RPC, and the Ethos API. The credit layer is deployed and verified:

**Somnia testnet (Shannon) — chain 50312 · [explorer](https://shannon-explorer.somnia.network) · manifest: [`deployments/somnia-testnet.json`](./deployments/somnia-testnet.json)**

| Contract | Address | Role |
|---|---|---|
| Covenant core | `0xA11c466cbebB86f865e2Ccea5F0f273b078E30C7` | Fixed-maturity lending engine (compliance mode) |
| EcrecoverNotary | `0x82E4C657aaE87151243AE439eC8c33210AE30415` | EIP-712 offer verification |
| TestBTC (tBTC) | `0xCb4f3F36C723C186AbaA3DE6Ec2A04F3656e77eD` | Collateral (permissionless mint) |
| BtcUsdOracle | `0xADbE706FF8c80850457D0A91f19cd79A5C9098E0` | BTC/USD, seeded at $108,000 |
| EthosTierGate · Open | `0xEE6fF9E8FD639E15d9a077c2aceF0e8Ba16A4844` | Any scored wallet → 38.5% LLTV |
| EthosTierGate · Established | `0xC0E6a382e9F761c793F6714fC427e93e26520161` | Score ≥ 1600 → 62.5% LLTV |
| EthosTierGate · Reputable | `0x0f596034793EDDDd3a6c32C00c4BbF780E31868D` | Score ≥ 2000 → 77.0% LLTV |
| Loan token | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | DreamDEX venue collateral (tUSDC) |

The deployed score signer is
`0xaAb51184CA096F8ea48331a4262E689AAc4B5787`. This is a public verification
address, not a secret. The corresponding private key belongs only in the credit
service environment.

### Deployed Tier Markets

All values below come from
[`deployments/somnia-testnet.json`](./deployments/somnia-testnet.json). LLTV and
`maxLif` values are represented on-chain as 18-decimal fixed-point integers.

| Tier | Minimum score | LLTV | Gate | Market ID |
|---|---:|---:|---|---|
| Open | 0 | 38.5% | `0xEE6fF9E8FD639E15d9a077c2aceF0e8Ba16A4844` | `0xbc1f231da78029b2a891e8c7d80c765224f45697d2bf2a2ee7e7ecb00f3df1ae` |
| Established | 1600 | 62.5% | `0xC0E6a382e9F761c793F6714fC427e93e26520161` | `0x987fb3b208df8942d4adb5dfc2639ce997e8d1f1ed29ba41370db429c405149f` |
| Reputable | 2000 | 77.0% | `0x0f596034793EDDDd3a6c32C00c4BbF780E31868D` | `0xef116848e2da8cb6553350b02f8670c00a04629f765295797d38baf7cc787046` |

Every market uses:

- Loan token: DreamDEX TestUSDC.
- Collateral token: deployed test tBTC.
- Oracle: deployed BTC/USD oracle.
- Recovery threshold: `0`.
- Entry and seizure gate: the tier's `EthosTierGate`.
- Fixed maturity: Unix `1803859200`, or `2027-03-01 00:00:00 UTC`.

### Source-of-Truth Rules

Deployment values exist in two locations because the Node service reads JSON
while the browser imports typed TypeScript:

1. `deployments/somnia-testnet.json` is the machine-readable service manifest.
2. `frontend/src/config/credit.ts` is the frontend's typed deployment constant.

They must be updated together after any redeployment. DreamDEX core addresses
and venue collateral are not copied from this Covenant manifest; they are sourced
from the official SDK deployment manifest in `frontend/src/config/chain.ts` and
`frontend/src/config/dreamdex.ts`.

### Live-Deployment Limitations

- All assets are testnet assets with no monetary value.
- The tBTC collateral and BTC/USD oracle are prototype components.
- The oracle is owner-pushed and was deployed with staleness disabled for the demo.
- The credit markets have a fixed maturity and do not roll automatically.
- Lender liquidity is supplied by the configured demo lender rather than an open liquidity marketplace.
- The contracts are unaudited and include known security issues documented in this repository.
- The DreamDEX protocol contracts are external upgradeable proxies; Covenant does not control their implementations.

## Roadmap

### Hackathon Milestone

- [x] Somnia-native trading application: live DreamDEX discovery, Up/Down execution, unified portfolio
- [x] Ethos qualification with live score reads and transparent tier policy
- [x] `EthosTierGate` — on-chain score verification with expiry, nonce, wallet, and chain binding
- [x] Tier-gated credit markets at 38.5% / 62.5% / 77% LLTV, rehearsed end-to-end in tests
- [x] Credit service: score authorizations from live Ethos reads + lender offer signing
- [x] One-command Somnia deployment script + runbook
- [x] Deep DreamDEX integration: live oracle price feed, on-chain status gating, volume telemetry, settled-market redemption scan
- [x] Deploy to Somnia testnet and publish verified addresses
- [ ] Resolve or isolate known high-impact protocol findings
- [ ] Reproducible demo video

### Post-Hackathon

- Decentralize or replace the score signer with a verifiable oracle mechanism.
- Add lender-defined reputation policies and portfolio-level exposure limits.
- Introduce robust market indexing and offer discovery.
- Add simulation, monitoring, analytics, and automated liquidation infrastructure.
- Research ERC-6909 outcome-position collateral adapters.
- Explore constrained credit for autonomous Event Contract trading agents.
- Complete an independent security audit before any production deployment.

## Design Principles

1. **Collateral first.** Reputation improves terms but does not replace economic security.
2. **Explicit maturity.** Every credit market has a known settlement horizon.
3. **Immutable policy.** Underwriting requirements are part of market identity.
4. **Open exits.** Reputation failures cannot block repayment or redemption.
5. **Fail conservatively.** Missing or invalid score data grants no enhanced access.
6. **Bounded trust.** Off-chain signers cannot override on-chain solvency limits.
7. **Honest status.** Planned integrations are not presented as completed features.
8. **Focused scope.** The first product funds Event Contract trading; it does not attempt unsecured consumer credit.

## Documentation

- [`docs/CoreMath.md`](./docs/CoreMath.md): protocol arithmetic and invariants
- [`offchain/SIGNING.md`](./offchain/SIGNING.md): EIP-712 offer production and validation
- [DreamDEX Event Contracts documentation](https://docs.dreamdex.io/developers/event-contracts)
- [DreamDEX market structure and lifecycle](https://docs.dreamdex.io/developers/event-contracts/market-structure)
- [DreamDEX bot kit](https://github.com/somnia-chain/dreamdex-bot-kit)
- [Ethos developer documentation](https://developers.ethos.network/)
- [Ethos score API](https://developers.ethos.network/api-documentation/api-v2/score)
- [Somnia documentation](https://docs.somnia.network/)

## Disclaimer

Covenant is experimental software provided for development, research, and hackathon evaluation. It is not a bank, broker, investment adviser, credit-rating agency, or licensed financial institution. Nothing in this repository constitutes financial, legal, or investment advice. Test tokens and testnet markets have no monetary value.

Do not deploy or use Covenant with assets of value without completing remediation, independent security review, legal analysis, risk calibration, and operational controls appropriate to the intended jurisdiction and use case.
