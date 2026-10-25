# Covenant

**Your reputation, priced into your Bitcoin loan.**

Covenant is a fixed-rate, fixed-maturity lending market on [Mezo](https://mezo.org). Borrowers post BTC and borrow MUSD, and their [Ethos](https://www.ethos.network/) credibility score sets the loan-to-value: the same BTC supports up to **twice the borrowing power** at the Reputable tier (77% LTV) as at Open (38.5%). Lenders post their own signed offers. Each market's reputation rule is locked into its on-chain identity, and repaying or withdrawing collateral never needs a score.

- **App:** <https://covenantv1.up.railway.app>
- **Network:** Mezo testnet, chain `31611`
- **Loan asset:** MUSD · **Collateral:** Mezo BTC · **Reputation:** Ethos v2

## Table of Contents

- [The Problem](#the-problem)
- [What's New](#whats-new)
- [How It Works](#how-it-works)
- [Product Walkthrough](#product-walkthrough)
- [Architecture](#architecture)
- [How the Lending Protocol Works](#how-the-lending-protocol-works)
- [Trust Model](#trust-model)
- [Deployment](#deployment)
- [Development](#development)
- [Repository Structure](#repository-structure)
- [Roadmap](#roadmap)
- [Design Principles](#design-principles)
- [Documentation](#documentation)

## The Problem

On-chain lending today makes three trade-offs that Bitcoin holders feel directly:

1. **Every wallet gets the same terms.** A wallet with a years-long track record borrows at the same loan-to-value as one created yesterday. Reputation is invisible to the protocol, so the only lever is more collateral.
2. **Rates float.** Pool-based lending prices loans by utilization, so the cost of an open loan moves while you hold it.
3. **Lenders can't pick their risk.** Deposits pool together under one shared policy; a lender cannot choose who they lend to or on what terms.

## What's New

| | Covenant |
|---|---|
| **Reputation-priced LTV** | Your Ethos score selects a tier market: 38.5%, 62.5%, or 77% LTV on the same BTC. Up to 2× the borrowing power, earned by credibility rather than extra collateral. |
| **Fixed rate, fixed maturity** | Loans fill at a price agreed in a signed offer and are repaid one-for-one at or before maturity (Mar 1, 2027). No floating rate to watch. |
| **Peer-to-peer signed offers** | Any wallet can lend: sign an EIP-712 offer off-chain (no gas) and it joins the book borrowers fill from. Only filled offers settle on-chain. |
| **Rules locked into the market** | The reputation gate, LLTV, oracle, assets, and maturity are hashed into each market's id. Change any of them and it is a different market, so terms cannot change after creation. |
| **Exits are never gated** | Repaying, withdrawing collateral, and lender redemption never read a score. An expired authorization cannot trap funds. |

Collateral stays the safety net. Reputation improves terms; it never replaces collateral and never triggers a liquidation on its own.

## How It Works

1. **Connect.** The app reads the wallet's live Ethos credibility score and shows the tier it earns.
2. **Authorize the score.** The credit service signs a short-lived EIP-712 `ScoreAuthorization` (six hours) for the wallet. One transaction submits it to the tier's `EthosTierGate`.
3. **Post BTC.** Collateral is deposited into the tier market; the borrow form suggests enough for a 1.5 health factor.
4. **Borrow MUSD.** The borrower fills a lender's signed offer. Inside the same transaction, Covenant asks the market's gate `canIncreaseDebt(borrower)` and checks collateral health. Either check failing reverts the whole fill.
5. **Manage the loan.** Positions shows debt, collateral, health factor, and liquidation price. Repay and withdraw at any time, with no score required.

| Ethos score | Tier | Max LTV | Per 1 BTC at $100,000 |
|---:|---|---:|---:|
| Below 1,600 | Open | 38.5% | 38,500 MUSD |
| 1,600–1,999 | Established | 62.5% | 62,500 MUSD |
| 2,000 and above | Reputable | 77.0% | 77,000 MUSD |

These thresholds and ratios are Covenant application policy, not recommendations or guarantees from Ethos.

## Product Walkthrough

You need a browser wallet on Mezo testnet (chain 31611) holding a little testnet BTC from <https://faucet.test.mezo.org>. BTC is both gas and collateral. You do not need MUSD to borrow.

1. **Open the app** and connect. The Borrow dashboard shows protocol liquidity, the on-chain BTC price, your Ethos score, and the tier ladder.
2. **Choose Borrow MUSD.** Enter an amount. The modal shows collateral to add, loan-to-value, health factor before and after, liquidation price, and the fixed rate.
3. **Authorize Ethos score.** One signature binds your tier to this wallet for six hours.
4. **Deposit BTC.** Approve and supply the suggested collateral.
5. **Borrow.** The app requests a lender offer and you confirm the fill. MUSD lands in your wallet.
6. **Try a market above your tier.** Its market page shows `Requires Ethos 2,000+`; a direct `fillOffer` would revert with `BorrowerIneligible()`.
7. **Lend.** On any market page, the *Supply MUSD* panel lets a wallet approve MUSD, authorize the offer notary once, and post a one-hour signed offer. It appears under *Open lender offers*, and borrowers fill wallet offers before the house book.
8. **Open Positions.** Repay MUSD, add BTC, or withdraw spare collateral. None of these check your score.

| Demo moment | What it establishes |
|---|---|
| Score selects a tier | Reputation sets transparent, on-chain underwriting terms |
| Gate check inside the fill | The rule is enforced by the contract, not by the UI |
| Lower score is refused | A wallet cannot borrow above the tier its score earns |
| Wallet posts an offer | Lending is peer-to-peer, signed off-chain, settled on fill |
| Repay and withdraw without a score | Reputation gates new exposure, never exits |

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Covenant app — React · TypeScript · wagmi · viem · RainbowKit        │
│ Borrow dashboard · tier markets · lender offers · positions          │
└───────┬───────────────────────────────┬──────────────────────────────┘
        │ score authorization,          │ approve · authorize · supply
        │ lender offers, offer book     │ fillOffer · repay · withdraw
┌───────┴──────────────────────┐        │
│ Credit service (Node)        │        │
│ offchain/credit-service.mjs  │        │
│ reads Ethos v2, signs        │        │
│ ScoreAuthorizations + offers │        │
└───────┬──────────────────────┘        │
        │ Ethos v2 API                  │
┌───────┴───────────────────────────────┴──────────────────────────────┐
│ Mezo testnet (chain 31611)                                           │
│ Covenant core · EcrecoverNotary · EthosTierGate × 3                  │
│ SkipBtcUsdOracle → Skip BTC/USD feed · MUSD · Mezo BTC precompile    │
│ Tier markets at 38.5% / 62.5% / 77% LLTV — the gate IS the policy    │
└──────────────────────────────────────────────────────────────────────┘
```

### Credit Engine

`src/Covenant.sol` implements a zero-coupon, fixed-maturity credit market. Lenders buy credit units at a discount to face value, borrowers sell them for loan tokens against posted collateral, and each unit redeems one-for-one at maturity. Rates originate from signed offers rather than pool utilization, so every loan has a deterministic price and maturity.

### Market Identity

A market is defined by its loan token, collateral configuration, maturity, recovery threshold, entry gate, and liquidation gate:

```solidity
struct Market {
    address loanToken;
    CollateralParams[] collateralParams; // token, LLTV, maxLif, oracle
    uint256 maturity;
    uint256 rcfThreshold;
    address entryGate;
    address seizureGate;
}
```

Its identifier commits to the complete configuration, the Covenant deployment, and the original chain ID:

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

`src/reputation/EthosTierGate.sol` implements them. The credit service reads a wallet's Ethos score and returns a short-lived EIP-712 `ScoreAuthorization`; anyone may submit it to the gate, and once accepted the wallet may increase debt in that gate's market until the authorization expires. Each authorization commits to:

- Borrower wallet
- Observed score
- Expiration deadline
- Unique nonce (replay protection)
- Chain id (31611)
- The gate's own address (a different threshold is a different gate, and a different market id)

The gate rejects expired, replayed, cross-chain, cross-contract, and wrong-signer authorizations. `canIncreaseDebt` fails closed: an expired, missing, or below-threshold score returns `false`. Lending (`canIncreaseCredit`) and liquidation (`canLiquidate`) are open to everyone, so unhealthy positions are always liquidatable.

## How the Lending Protocol Works

Covenant is a fixed-rate, fixed-maturity, over-collateralized lending protocol. It is not a utilization-based pool. Each loan originates from a signed offer with a defined price, size, collateral policy, and maturity.

### Credit Units and Fixed-Rate Pricing

Debt and lender claims are denominated in zero-coupon **credit units**:

- A lender buys credit units at or below face value. Each unit ultimately redeems for one MUSD, subject to fees and realized market losses.
- A borrower sells credit units and receives MUSD immediately. Each debt unit is repaid with one MUSD.
- The difference between execution price and face value is the fixed financing cost. At a price of `0.95`, the borrower receives `0.95` MUSD and owes `1.00` at repayment. The live Mezo offers are priced at par, so the displayed fixed APR is 0.00%.

Prices are represented by deterministic ticks. Adjacent ticks change price by about 0.5%, and the market's tick spacing controls which ticks may be quoted.

### Signed Offers and Atomic Fills

Loans originate from EIP-712 `Offer` messages published off-chain. Each offer binds the market, buy or sell side, maker, validity window, price tick, consumption group, notary, optional callback, and a `maxUnits` or `maxAssets` limit.

- A **buy offer** has a lender as maker. A borrower fills it to receive MUSD and create debt.
- A **sell offer** has a borrower as maker. A lender fills it to acquire credit units.
- A consumption group caps aggregate fills across related offers from the same maker.
- A `reduceOnly` offer may close exposure but cannot increase the maker's credit or debt.

`fillOffer` verifies the notary proof, time window, tick accessibility, and consumption limit. It then transfers MUSD, updates lender credit and borrower debt, applies fees, checks the policy gates, and verifies the borrower's health. The operation is atomic: if any check fails, no funds or positions move.

### Collateral Health and Borrowing Capacity

For each activated collateral asset, Covenant reads its oracle price, converts the balance into loan-token value, and applies the market's liquidation loan-to-value ratio (LLTV):

```text
maxDebt = sum(
  collateralAmount[i]
  * oraclePrice[i] / ORACLE_PRICE_SCALE
  * LLTV[i] / WAD
)

healthy := debt <= maxDebt
```

All divisions round down, so rounding can only reduce borrowing capacity. Health is checked whenever debt increases and whenever collateral is withdrawn. Reputation decides which immutable market a wallet may enter; collateral and oracle-enforced health remain the solvency boundary.

### Fees

- **Settlement fee:** added to the buyer's execution price, following a piecewise-linear schedule over time to maturity with bounded rates.
- **Continuous fee:** reserved when credit is issued for the remaining term (`credit * rate * (maturity - now)`). The rate is locked at issuance and capped on-chain at 1% annualized.

### Repayment, Redemption, and Maturity

- `repay` reduces debt at face value: one MUSD repays one debt unit.
- `withdraw` lets a lender redeem credit units against available MUSD. At maturity, credit redeems at face value, adjusted for fees and any socialized losses.
- New debt cannot be created after maturity.

### Liquidation and Bad Debt

A borrower becomes liquidatable when debt exceeds LLTV-weighted collateral value. Any liquidator can call `seize`, repay debt units, and receive collateral according to the market's liquidation incentive factor (18.17% / 10.34% / 6.10% maximum bonus for Open / Established / Reputable). After maturity the incentive ramps from `1.0` to `maxLif` over 15 minutes. Uncovered debt becomes bad debt, shared pro rata across lenders through the market's loss factor.

### Policy Boundaries

| Action | Policy requirement |
|---|---|
| Increase borrower debt | `canIncreaseDebt` (Ethos tier) |
| Increase lender credit | `canIncreaseCredit` (open to all) |
| Liquidate a borrower | `canLiquidate` (open to all) |
| Repay debt | None |
| Redeem lender credit | None |
| Supply collateral | None |
| Withdraw collateral | Solvency check only |

For the complete arithmetic, rounding rules, invariants, and parameter bounds, see [`docs/CoreMath.md`](./docs/CoreMath.md).

## Trust Model

Covenant minimizes, but does not eliminate, trust.

**On-chain guarantees**

- Market configuration is immutable and content-addressed.
- A score-gated market cannot substitute a different gate without becoming a new market.
- Offers are authenticated by the configured notary.
- Collateral health is enforced by the lending engine.
- Exits do not depend on the reputation service being available.
- Score authorizations are wallet-, chain-, contract-, nonce-, and expiry-bound.

**Trusted components**

- The Skip BTC/USD feed's correctness and availability (6-hour staleness bound)
- The credit service that reads Ethos and signs score authorizations
- Ethos API availability, profile resolution, and score methodology
- Deployment administrators and configured protocol roles
- Off-chain offer publication and discovery

The score signer can grant only bounded access to preconfigured markets. It cannot move funds, change collateral parameters, disable liquidation, or override the solvency check.

**Ethos limitations.** Ethos credibility is a mutable reputation signal, not proof that a borrower will repay. Covenant therefore never grants unsecured credit from a score, binds every score decision to the borrowing wallet, uses short-lived authorizations for new exposure, treats unavailable scores as the Open tier, and never liquidates a position because reputation declines.

## Deployment

**Mezo testnet — chain 31611 · [explorer](https://explorer.test.mezo.org) · manifest: [`deployments/mezo-testnet.json`](./deployments/mezo-testnet.json) · runbook: [`docs/Mezo.md`](./docs/Mezo.md)**

| Surface | URL |
|---|---|
| App | <https://covenantv1.up.railway.app> |
| Credit service | <https://covenant-api-production-90cf.up.railway.app> (`GET /api/health` reports chain 31611) |
| BTC faucet | <https://faucet.test.mezo.org> |

| Contract | Address | Role |
|---|---|---|
| Covenant core | `0x3149af999eB6Faa478E6C2AFe2f5858183Ba17ed` | Fixed-maturity lending engine |
| EcrecoverNotary | `0xCDC06AaE7617c3b6f44CC1f2a9a7163252d8a797` | EIP-712 offer verification |
| SkipBtcUsdOracle | `0x0C19a3f5441B519803C34f4fc703c7ce3b2b62de` | BTC/USD adapter, feed decimals 18, staleness 6 hours |
| EthosTierGate · Open | `0x7dBe32f1e1D3DB45123f60EC5a79312863A7e279` | Any authorized wallet → 38.5% LLTV |
| EthosTierGate · Established | `0xaBDBf56354494b5328ef3d75bf85Cf8B2288BFC7` | Score ≥ 1600 → 62.5% LLTV |
| EthosTierGate · Reputable | `0xBBD1F4F83BC8D87FF808778D09CfDD1E17D17985` | Score ≥ 2000 → 77.0% LLTV |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | Loan token, 18 decimals |
| Mezo BTC | `0x7b7C000000000000000000000000000000000000` | Collateral, 18 decimals; mirrors native BTC |
| Skip BTC/USD feed | `0x7b7c000000000000000000000000000000000015` | Price feed precompile |

| Tier | Minimum score | LLTV | Market ID |
|---|---:|---:|---|
| Open | 0 | 38.5% | `0x2e4fea7d8656bbc209cb649362990a937c3011cd4f2fdc813e0972d2a5cfa20a` |
| Established | 1600 | 62.5% | `0x6cd41664bd5a2d765153ea60de36cf005f41c41d102b4a62af457d8a59f8e437` |
| Reputable | 2000 | 77.0% | `0x4804122681cd41a9184ca049e5b48133010220753d51298c6dbe587a4f0c9cd5` |

Maturity is Unix `1803859200` (`2027-03-01 00:00:00 UTC`). The score signer is `0xaAb51184CA096F8ea48331a4262E689AAc4B5787` and the house lender is `0x8C6eE34413f0c7D472Ab157fbED84De1234EF54F`; both are public addresses whose keys live only in the service environment.

**Testnet limitations.** All assets are testnet assets with no monetary value. The markets have one fixed maturity and do not roll. Liquidity comes from the house lender plus any wallet offers. The contracts have not been independently audited.

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)
- Node.js 20+ and npm
- A RainbowKit-compatible browser wallet with Mezo testnet BTC

```bash
git clone https://github.com/drained69/covenant.git
cd covenant
git submodule update --init --recursive
npm install --prefix frontend
npm install --prefix offchain
```

### Contracts

```bash
forge build
forge test
```

The suite has 529 tests. Focused runs:

```bash
forge test --match-contract EthosTierGateTest -vvv   # score authorization, replay, expiry, domain binding
forge test --match-contract EthosCreditFlowTest -vvv # the full Mezo borrow → repay → withdraw journey
forge test --match-contract ProtocolFlowTest -vvv    # general borrow / lend / repay flow
```

The Foundry profile targets Cancun because the core uses transient storage, which Mezo supports.

### Frontend

```bash
cd frontend
VITE_CREDIT_SERVICE_URL=http://localhost:3001 npm run dev
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_CREDIT_SERVICE_URL` | `http://localhost:3001` | Credit service base URL. Inlined at build time, so hosted images take it as a Docker build arg |
| `VITE_WALLETCONNECT_PROJECT_ID` | empty | Optional WalletConnect project id for mobile QR / deep links |

`frontend/src/config/chain.ts` holds the chain and MUSD metadata; `frontend/src/config/credit.ts` holds the deployed addresses and tier markets; `frontend/src/config/ethos.ts` holds the Ethos API and tier display policy.

### Credit Service

```bash
export SCORE_SIGNER_KEY=0x...
export LENDER_KEY=0x...
export MANIFEST=../deployments/mezo-testnet.json   # default
export PORT=3001
node offchain/credit-service.mjs
curl http://localhost:3001/api/health
```

| Method and path | Inputs | Result |
|---|---|---|
| `GET /api/health` | — | Chain, signer, lender, authorization TTL, tier gates |
| `GET /api/ethos-score` | `address=0x…` | Live score, tier, and one signed authorization per gate |
| `GET /api/offer` | `market=open\|established\|reputable`, `units=<raw>` | Best posted wallet offer that covers `units`, else a fresh house offer |
| `GET /api/offers` | optional `market` | Open lender offers (the book) |
| `POST /api/offers` | `market`, `offer`, `signature` | Validate and publish a wallet's signed offer |
| `POST /api/offers/cancel` | `market`, `maker`, `signature` | Withdraw a wallet's offer |

The service holds no borrower funds, submits no transactions for users, cannot change thresholds or collateral ratios, and cannot override the health check. An Ethos failure resolves to score `0`, which grants only Open-tier terms. The lender wallet must hold MUSD, approve it to the Covenant core, and authorize the notary (`setIsAuthorized`).

### Deploying Again

The live deployment is already published; do not rebroadcast it. For a fresh deployment:

```bash
export PRIVATE_KEY=0x...                   # Mezo deployer with testnet BTC
export SCORE_SIGNER_ADDRESS=0x...          # public address only
export MATURITY=1803859200                 # optional

forge script script/DeployMezo.s.sol \
  --tc DeployMezo \
  --rpc-url https://rpc.test.mezo.org \
  --broadcast --slow --with-gas-price 1000
```

Then copy the logged addresses into `deployments/mezo-testnet.json` and `frontend/src/config/credit.ts` together. Details, the Skip oracle caveat, and RPC quirks are in [`docs/Mezo.md`](./docs/Mezo.md).

Never commit private keys, API credentials, or signer secrets. The frontend contains no service key.

## Repository Structure

| Path | Description |
|---|---|
| `src/Covenant.sol` | Core fixed-maturity lending engine |
| `src/reputation/EthosTierGate.sol` | Signed, short-lived Ethos score authorizations bound to tier markets |
| `src/oracles/SkipBtcUsdOracle.sol` | BTC/USD adapter for Mezo's Skip feed |
| `src/notaries/` | EIP-712 offer authorization |
| `src/interfaces/`, `src/libraries/` | Market, gate, oracle, and token interfaces; identity, ticks, math |
| `src/periphery/` | Bundled actions, authorization helpers, credit-ladder views |
| `src/compliance/` | Earlier policy adapters, superseded by the reputation layer |
| `script/DeployMezo.s.sol` | Mezo deployment: Skip oracle, core, notary, three Ethos markets |
| `deployments/mezo-testnet.json` | Machine-readable manifest the credit service loads |
| `offchain/credit-service.mjs` | Ethos score authorizations, lender offers, and the offer book |
| `offchain/keeper.mjs` | Dry-run liquidation keeper |
| `frontend/` | The Covenant app |
| `test/` | Foundry unit, fuzz, integration, regression, and PoC tests |
| `docs/` | Mezo runbook and protocol mathematics |

## Roadmap

**Delivered**

- [x] Fixed-rate, fixed-maturity credit engine with signed offers
- [x] `EthosTierGate`: on-chain score verification bound to wallet, chain, nonce, gate, and expiry
- [x] Three immutable Ethos tier markets at 38.5% / 62.5% / 77% LLTV, live on Mezo testnet
- [x] MUSD loans against Mezo BTC, priced by the Skip BTC/USD feed
- [x] Credit service: live Ethos reads, score authorizations, house offers, and a wallet offer book
- [x] Peer-to-peer lending: any wallet signs and posts offers from the app
- [x] Borrow, manage, repay, and withdraw flows, with exits that never check a score

**Planned**

- Lender-defined rates and reputation requirements per offer, with borrower-side offer selection
- Rolling maturities and more collateral types
- Decentralize or replace the score signer with a verifiable oracle mechanism
- Monitoring, analytics, and automated liquidation infrastructure
- Independent security review before any mainnet MUSD deployment

## Design Principles

1. **Collateral first.** Reputation improves terms; it does not replace economic security.
2. **Explicit maturity.** Every market has a known settlement date.
3. **Immutable policy.** Underwriting requirements are part of market identity.
4. **Open exits.** Reputation failures cannot block repayment or redemption.
5. **Fail conservatively.** Missing or invalid score data grants no enhanced access.
6. **Bounded trust.** Off-chain signers cannot override on-chain solvency limits.
7. **Honest status.** Planned work is not presented as shipped.

## Documentation

- [`docs/Mezo.md`](./docs/Mezo.md): Mezo deployment runbook, Skip oracle, and redeploy steps
- [`docs/CoreMath.md`](./docs/CoreMath.md): protocol arithmetic and invariants
- [`offchain/SIGNING.md`](./offchain/SIGNING.md): EIP-712 offer production and validation
- [Mezo developer docs](https://mezo.org/docs/developers/getting-started/) · [Borrow testnet MUSD](https://mezo.org/docs/users/borrow/mint-musd/)
- [Ethos developer docs](https://developers.ethos.network/) · [Ethos score API](https://developers.ethos.network/api-documentation/api-v2/score)
