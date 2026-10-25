# Mezo testnet deployment

Covenant on Mezo is the credit engine only. Borrowers post Mezo BTC, authorize a short-lived Ethos score, and fill a lender offer for MUSD. Debt is fixed-rate and repaid one-for-one in MUSD. DreamDEX Event Contracts stay on Somnia. The frontend keeps that app when `VITE_TARGET` is unset and switches to this one when `VITE_TARGET=mezo`.

The deployment below is already on chain. Do not rebroadcast `script/DeployMezo.s.sol` against these addresses.

## Public demo

| Surface | URL |
|---|---|
| App | https://covenant-web-production.up.railway.app |
| Credit service | https://covenant-api-production-90cf.up.railway.app |
| Health | `GET /api/health` returns `chainId` 31611 and the three gates |
| Offer | `GET /api/offer?market=open&units=1000000000000000000` |
| Chain | Mezo testnet, id `31611` (`0x7b7b`) |
| RPC | `https://rpc.test.mezo.org` |
| WebSocket | `wss://rpc-ws.test.mezo.org` |
| Explorer | https://explorer.test.mezo.org |
| BTC faucet | https://faucet.test.mezo.org |
| Mezo app | https://testnet.mezo.org |

`GET /api/ethos-score?address=0x…` returns the live score, the tier, and one signed authorization per gate. `units` on `/api/offer` is raw token units. MUSD has 18 decimals, so `1e18` is one MUSD.

## How to try the demo

1. Open the app and connect a wallet that holds Mezo testnet BTC. Gas and collateral are the same native asset. A new wallet gets BTC from the faucet first.
2. Switch the wallet to Mezo testnet (chain 31611).
3. Open **Markets** to see Open, Established, and Reputable. Borrow is enabled on the tier your score qualifies for.
4. Choose **Borrow MUSD**, authorize the Ethos score, post BTC, and confirm the fill.
5. Open **Positions** to repay MUSD or withdraw BTC. That page does not ask for a score.

A lender connects on a market page, approves MUSD, authorizes the notary, and posts a one-hour par offer. Borrowers fill that offer before the house inventory. A score authorization lasts six hours, and the browser keeps the last one, so a later service outage does not erase a signature that is still inside its deadline. The first authorization still needs the service.

This deployment stays on Mezo testnet. Do not broadcast it to Mezo mainnet. Mainnet MUSD is a different token, and that cutover waits on an independent review.

Liquidations are permissionless. A dry-run keeper checks the oracle, the credit service, and open debt:

```bash
MANIFEST=../deployments/mezo-testnet.json \
CREDIT_SERVICE_URL=https://covenant-api-production-90cf.up.railway.app \
node offchain/keeper.mjs
```

It does not send a transaction unless `KEEPER_SEND=1` and `KEEPER_KEY` are set. `ALERT_WEBHOOK` receives a JSON `{ "text" }` body for each alert.

An unlinked Ethos score takes the Open tier (38.5% LTV). Established is score ≥ 1600 (62.5%). Reputable is score ≥ 2000 (77%). Repayment and collateral withdrawal do not require a fresh score.

The faucet does not mint MUSD. MUSD is borrowed at [testnet.mezo.org](https://testnet.mezo.org), or swapped from BTC. The demo lender already holds MUSD and has approved the Covenant core, so a borrower does not need MUSD of their own before the first fill.

## Contracts

Manifest: [`deployments/mezo-testnet.json`](../deployments/mezo-testnet.json). The frontend copy is `MEZO_DEPLOYMENT` in `frontend/src/config/credit.ts`. Update both together after any new deployment.

| Contract | Address |
|---|---|
| Covenant | `0x3149af999eB6Faa478E6C2AFe2f5858183Ba17ed` |
| EcrecoverNotary | `0xCDC06AaE7617c3b6f44CC1f2a9a7163252d8a797` |
| SkipBtcUsdOracle | `0x0C19a3f5441B519803C34f4fc703c7ce3b2b62de` |
| Open gate (38.5%) | `0x7dBe32f1e1D3DB45123f60EC5a79312863A7e279` |
| Established gate (62.5%) | `0xaBDBf56354494b5328ef3d75bf85Cf8B2288BFC7` |
| Reputable gate (77%) | `0xBBD1F4F83BC8D87FF808778D09CfDD1E17D17985` |
| MUSD (loan) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Mezo BTC (collateral) | `0x7b7C000000000000000000000000000000000000` |
| Skip BTC/USD feed | `0x7b7c000000000000000000000000000000000015` |

Market ids:

| Tier | Market id |
|---|---|
| Open | `0x2e4fea7d8656bbc209cb649362990a937c3011cd4f2fdc813e0972d2a5cfa20a` |
| Established | `0x6cd41664bd5a2d765153ea60de36cf005f41c41d102b4a62af457d8a59f8e437` |
| Reputable | `0x4804122681cd41a9184ca049e5b48133010220753d51298c6dbe587a4f0c9cd5` |

Maturity is Unix `1803859200` (`2027-03-01 00:00:00 UTC`).

The score signer address is `0xaAb51184CA096F8ea48331a4262E689AAc4B5787`. The demo lender is `0x8C6eE34413f0c7D472Ab157fbED84De1234EF54F`. Both are public addresses. Their keys stay in the service environment and are never committed.

## Assets and oracle

MUSD on this network is "Mezo USD", 18 decimals, at the address above. The mainnet MUSD address is different. Do not point this deployment at it.

Mezo BTC is the ERC-20 precompile for native BTC. `balanceOf` mirrors the wallet's gas balance, and `decimals` is 18. Do not deploy an 8-decimal mock tBTC here. The Somnia tBTC (8 decimals) and DreamDEX TestUSDC (6 decimals) belong only to chain 50312.

The Skip feed's `latestRoundData` answer is 18 decimals, around 8e22 for a BTC price near $80,000. Its `decimals()` selector reenters, so nothing in this deployment calls it. `SkipBtcUsdOracle` hardcodes feed decimals as 18:

```
SCALE = ORACLE_PRICE_SCALE * 10^loanDecimals / 10^(collateralDecimals + feedDecimals)
      = 1e36 * 1e18 / 10^(18 + 18)
      = 1e18
price = answer * SCALE
```

The live oracle uses a 6-hour staleness window and reverts on a zero, negative, or stale answer. Read `price()` with `cast` after the contract is deployed. Do not call it inside the Forge script. The simulator rejects some Skip staticcalls that succeed on the real RPC. The same reason rules out `ChainlinkBtcUsdOracle` on this feed: that contract queries `decimals()` at runtime.

Mezo's block gas limit is 10,000,000. The Covenant create used about 5.4 million gas and fits. The repo's Foundry profile stays on Cancun because the core uses transient storage. A broadcast that asks for more than 10 million gas, or that is compiled for an older EVM, is not a drop-in replacement.

## Deploy again

Only for a new deployment. The command that matches the live script:

```bash
export PRIVATE_KEY=0x...              # wallet with Mezo testnet BTC
export SCORE_SIGNER_ADDRESS=0x...     # address only; the key must hold no funds
export MATURITY=1803859200            # optional

forge script script/DeployMezo.s.sol \
  --tc DeployMezo \
  --rpc-url https://rpc.test.mezo.org \
  --broadcast --slow --with-gas-price 1000 -vv
```

`--tc DeployMezo` is required because `SkipBtcUsdOracle` is in the same file. Pass the Mezo RPC on the command line. `.env` `RPC_URL` is the Somnia RPC, and Foundry's `somnia` endpoint reads that variable. If a receipt is briefly null, poll `eth_getTransactionReceipt` instead of treating one empty response as a failed deploy. Resume a partial broadcast with `--resume` rather than starting a second set of contracts.

Bare Python `urllib` requests to `https://rpc.test.mezo.org` get HTTP 403. `cast` and `curl` with a normal user agent work.

After the script logs addresses:

1. Write them to `deployments/mezo-testnet.json` and to `MEZO_DEPLOYMENT` in `frontend/src/config/credit.ts`.
2. From the lender wallet, approve MUSD to the new Covenant core for the amount to be lent.
3. Authorize the new `EcrecoverNotary` for that lender (`setIsAuthorized`).
4. Start the service with the new manifest. The lender key and the score-signer key are environment variables, not file contents.

```bash
export SCORE_SIGNER_KEY=0x...
export LENDER_KEY=0x...
export MANIFEST=../deployments/mezo-testnet.json
export PORT=3001
node offchain/somnia-service.mjs
```

The service process is chain-agnostic. It reads `chainId`, contract addresses, and market ids from `MANIFEST`, then signs Ethos authorizations (EIP-712 domain "Covenant Ethos Score", version 1, `verifyingContract` = the gate) and lender buy offers at par (`MAX_TICK` 5820). The root image copies both manifests into `/app/offchain`. `MANIFEST` defaults to `./somnia-testnet.json`; the Mezo host overrides it to `./mezo-testnet.json`.

## Frontend

```bash
cd frontend
VITE_TARGET=mezo \
VITE_CREDIT_SERVICE_URL=http://localhost:3001 \
npm run dev
```

`IS_MEZO` is `import.meta.env.VITE_TARGET === "mezo"`. On that build:

- `/` is the lending dashboard: protocol stats, your position, Ethos tier, and the market table.
- `/markets`, `/markets/:tier`, and `/positions` are the Mezo market list, market detail (parameters, contracts, supply panel), and loan management.
- The DreamDEX client is null. Call sites go through a guard that throws "DreamDEX is not part of this deployment" if something still reaches them.
- The faucet page links to the Mezo BTC faucet and to Borrow MUSD. It does not call the DreamDEX TestUSDC faucet.

Vite inlines `VITE_*` while it builds. A Docker image must declare `ARG VITE_TARGET` and `ARG VITE_CREDIT_SERVICE_URL` before `npm run build`. Setting them only on the running container does nothing to an already-built bundle. `index.html`'s title still says Somnia; the chain is selected in the JavaScript bundle, not in that static file.

Check the build with:

```bash
cd frontend
VITE_TARGET=mezo npx tsc -b --pretty false --noEmit
```

## What this build does not do

- It does not move DreamDEX. Event Contract discovery, order books, and redemption remain Somnia-only.
- It does not change the tier numbers. Open, Established, and Reputable are still 38.5%, 62.5%, and 77% LLTV.
- It does not use the matsnet-era MUSD address. That token is dead.
- It does not commit signer keys, `.env`, Foundry broadcast files, or compiler cache. The manifest of addresses is the published artifact.
