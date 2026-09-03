# Covenant Telegram Bot

Telegram control plane for Covenant and DreamDEX Event Contracts, built from
DreamDEX Bot Kit's Event Contract safety patterns.

## Safety model

- Users verify ownership of public wallets through the Telegram Mini App. The
  bot never asks for private keys or seed phrases. There is intentionally no
  "paste your private key and auto-approve" option: that would make Telegram a
  custodial hot-wallet vault. WalletConnect/RainbowKit keeps keys in the user's
  wallet and requires explicit approval for each transaction.
- `/trade` is a dry-run preview and deep-links to Covenant, where the user signs
  in their own wallet.
- `/execute` is restricted to `TELEGRAM_ADMIN_IDS`, disabled unless both
  `BOT_CUSTODY_ENABLED=true` and `BOT_TRADING_ENABLED=true`, and signs only from
  one dedicated testnet bot key.
- The custody tool has one capability: bounded DreamDEX IOC orders. It cannot
  import user keys, make arbitrary contract calls, or withdraw assets. For
  production, replace the environment key with a KMS/HSM signer behind the
  same capability boundary.
- Every order is checked against on-chain market status, venue tick/lot grids,
  expiry, wallet funding, and `BOT_MAX_ORDER_USD` before signing.
- The DreamDEX Bot Kit session-key/operator model documented for spot pools is
  not wired into `ec-core`; do not claim Event Contract split-key custody until
  the venue supports and verifies it.

## Commands

| Command | Purpose |
|---|---|
| `/markets` | List live DreamDEX Event Contracts |
| `/market 1` | Market detail and Covenant link |
| `/book 1 YES` | Live outcome book |
| `/link 0x…` | Legacy read-only address link; use Connect wallet for verification |
| `/wallet` | TestUSDC/STT balances |
| `/score` | Ethos score and Covenant tier |
| `/capacity` | Wallet collateral + undrawn Covenant credit |
| `/positions` | DreamDEX open Event Contract positions |
| `/trade 1 YES buy 5 0.62` | Safe order preview; no send |
| `/status` | Venue, signer and execution mode |
| `/id` | Telegram numeric ID for the operator allowlist |
| `/execute …` | Admin-only bot-wallet IOC execution |

## Local setup

```bash
cd telegram-bot
npm install
# The bot also loads the repository-root ../.env during local development.
# Add TELEGRAM_BOT_TOKEN there, or create telegram-bot/.env from the example.
npm run doctor
npm start
```

`npm run doctor` is read-only and does not require Telegram credentials.

When a user sends `/start`, the bot provides both an inline home menu and a
persistent Telegram keyboard. `Home` is always available at the bottom of the
chat; `Markets`, `Wallet`, `Capacity`, `Score`, `Positions`, and `Help` are
one-tap shortcuts. `Connect wallet` opens Covenant inside Telegram's Mini App
webview, which shows a one-time link code and QR; the user opens the
verification page wherever their wallet lives (wallet-app browser, desktop
browser, or WalletConnect via the QR) and verifies ownership with one
human-readable signature — Telegram's webview has no EVM wallet since OKX
paused its Telegram Mini wallet (Sep 30, 2025), so the signature is taken in
the wallet's own context and bound back to the Telegram account with a
single-use code. The Home screen explains Somnia Shannon testnet,
TestUSDC/STT, YES/NO Event Contracts, Ethos credibility, capacity, and the
complete first-trade journey before users act. The bot never accepts a private
key or seed phrase.

## Railway

Create a third service in the Covenant Railway project:

- Root directory: `/telegram-bot`
- Dockerfile: `/telegram-bot/Dockerfile`
- Start command: provided by the Dockerfile
- Healthcheck path: `/health`
- Required variable: `TELEGRAM_BOT_TOKEN`
- Keep `BOT_TRADING_ENABLED=false` for the first deploy
- Keep `BOT_CUSTODY_ENABLED=false` for the first deploy
- Recommended volume: mount at `/app/data` and set
  `BOT_STATE_FILE=/app/data/state.json`

Keep `BOT_TRADING_ENABLED=false` and `BOT_CUSTODY_ENABLED=false` until a
dedicated testnet bot wallet is funded, its Telegram operator IDs are
allowlisted, and `/doctor` succeeds.

## DreamDEX Bot Kit attribution

The Event Contract adapter retains the protocol guards from the MIT-licensed
[`dreamdex-bot-kit`](https://github.com/somnia-chain/dreamdex-bot-kit). See
`THIRD_PARTY_NOTICES.md`.
