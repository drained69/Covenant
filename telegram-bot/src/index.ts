import { createServer } from "node:http";
import { InlineKeyboard } from "grammy";
import { config } from "./config.js";
import { createTelegramBot } from "./app.js";
import { createConnectApi } from "./connect-api.js";
import { closeBotKit, createBotKitContext } from "./dreamdex-bot-kit.js";
import { StateStore } from "./state.js";
import type { Address } from "viem";

const kit = createBotKitContext();
const store = new StateStore(config.stateFile);
await store.load();
const bot = createTelegramBot(kit, store);

/* The bot's own t.me link, resolved from the token at startup so the Mini
   App's out-of-Telegram fallback page can deep-link back into the chat. */
const me = await bot.api.getMe();

/* The bot itself confirms a finished wallet link in chat: the user may still
   be on the signing page, and a Telegram message is the clearest signal the
   loop is closed. Best-effort only — a failed DM (user blocked the bot)
   must not fail the HTTP request. */
const confirmInChat = (userId: number, address: Address) => {
  void bot.api
    .sendMessage(
      userId,
      `<b>Wallet verified</b>\n\n<code>${address}</code> is now linked to this Telegram account for wallet, score, capacity, and position views.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("My capacity", "menu:capacity")
          .text("My positions", "menu:positions"),
      },
    )
    .catch(() => undefined);
};

const server = createConnectApi(store, {
  health: () => ({
    network: "testnet",
    tradingEnabled: config.tradingEnabled,
    signerConfigured: kit.canTrade,
  }),
  onVerified: confirmInChat,
  botUrl: me.username ? `https://t.me/${me.username}` : undefined,
});

server.listen(config.port, () => {
  console.log(
    `Covenant Telegram bot health server on :${config.port} · trading=${config.tradingEnabled ? "enabled" : "dry-run only"}`,
  );
});

const shutdown = async (signal: string) => {
  console.log(`${signal}: stopping Covenant Telegram bot`);
  bot.stop();
  server.close();
  await closeBotKit(kit);
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

// The visible "/" command menu is kept to the actions a trader actually
// reaches for, in the order they use them. Diagnostic/admin commands
// (/link, /unlink, /status, /id, /execute) still work when typed but are
// left off the menu so it reads as a product surface, not a console.
await bot.api.setMyCommands([
  { command: "markets", description: "List live DreamDEX Event Contracts" },
  { command: "market", description: "Show one market: /market 1" },
  { command: "book", description: "Show a YES/NO order book: /book 1 YES" },
  { command: "connect", description: "Link your wallet to Telegram" },
  { command: "wallet", description: "View your wallet balances" },
  { command: "score", description: "View your Ethos credibility" },
  { command: "capacity", description: "View your trading capacity" },
  { command: "positions", description: "View your open positions" },
  { command: "trade", description: "Preview an order: /trade 1 YES buy 5" },
  { command: "help", description: "Commands and safety" },
]);

// Put the wallet connector in Telegram's native chat menu as well as the
// persistent reply keyboard. Users should not need to scroll back to /start
// to find the primary account action.
await bot.api.setChatMenuButton({
  menu_button: {
    type: "web_app",
    text: "Connect wallet",
    web_app: { url: config.webAppUrl },
  },
});

console.log("Starting Telegram long polling");

/* Railway replaces workers during deploys. Telegram permits only one
   getUpdates consumer, so the old container can hold the lease for a short
   moment after the new one starts. A 409 is therefore an expected rollout
   race, not a fatal bot error; retry with a visible backoff until this worker
   owns the poll. Other errors still fail fast for Railway to restart. */
async function startPolling(): Promise<void> {
  for (;;) {
    try {
      await bot.start({ drop_pending_updates: false });
      return;
    } catch (error) {
      const telegramError = error as { error_code?: number; error?: { error_code?: number } };
      const code = telegramError.error_code ?? telegramError?.error?.error_code;
      if (code !== 409) throw error;
      console.warn("Telegram polling handoff in progress; retrying in 5 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

await startPolling();
