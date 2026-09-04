import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import type { Address } from "viem";
import { config, parseAddress } from "./config.js";
import { capacitySummary, ethosSummary, nativeBalance } from "./covenant.js";
import {
  activeMarkets,
  book,
  previewOrder,
  type BotKitContext,
  type Outcome,
} from "./dreamdex-bot-kit.js";
import { cents, commandArgs, escapeHtml, money, remaining, shortAddress } from "./format.js";
import { StateStore } from "./state.js";
import { WalletCustodyTool } from "./wallet-custody.js";

const WELCOME = `<b>Covenant</b> — trade DreamDEX Event Contracts on Somnia testnet.

Binary <b>YES / NO</b> markets. Check live prices and your positions here, then sign every trade in your own wallet.

<b>Connect wallet</b> to see your balances, Ethos score, and capacity — or tap <b>Markets</b> to browse first.

<i>Testnet only. The bot never asks for a private key or seed phrase.</i>`;

// The persistent "Home" button and /start are the deliberate "tell me about
// the product" actions, so they get the full picture: what Covenant is, how
// reputation becomes trading capacity, and a numbered path to using it. This
// is distinct from `menu:home` (the "← Main menu" back button peppered
// through the UI), which stays on the short WELCOME so a navigation tap never
// dumps an essay.
const HOME_OVERVIEW = `<b>Covenant</b> — reputation-backed trading for <b>DreamDEX Event Contracts</b>
<i>Somnia Shannon testnet · chain</i> <code>50312</code>

<blockquote>Covenant is a credit layer on DreamDEX. Your on-chain reputation earns you trading capacity; your collateral keeps every position safe. You trade binary markets, and your own wallet signs every transaction.</blockquote>

<b>━━ What you trade ━━</b>
Event Contracts are <b>binary markets</b>. Each asks a question — "Will BTC close above $X?" — with two sides:
• <b>YES</b> pays 1 if it happens
• <b>NO</b> pays 1 if it doesn't
A YES price of <b>62¢</b> means the market implies a <b>62%</b> chance. You profit when your side wins, or when you sell it for more than you paid.

<b>━━ Reputation → capacity ━━</b>
Covenant reads your <b>Ethos</b> credibility and maps it to a credit tier:
• <b>Open</b> — everyone · up to 38.5% LTV
• <b>Established</b> — 1600+ · up to 62.5% LTV
• <b>Reputable</b> — 2000+ · up to 77% LTV
A higher tier lets the same collateral back a larger position. <b>Reputation only sets the terms — collateral is always the safety net and never replaces it.</b>

<b>━━ How to use it ━━</b>
<b>1.</b> Tap <b>Connect wallet</b> — sign one ownership message; no funds move, no key is shared.
<b>2.</b> Check <b>Wallet</b>, <b>Score</b>, and <b>Capacity</b> to see your balances, tier, and trading room.
<b>3.</b> Open <b>Markets</b> to browse live contracts — price, depth, and expiry.
<b>4.</b> Preview a trade with <code>/trade 1 YES buy 5</code>, then sign it on Covenant.
<b>5.</b> Track <b>Positions</b> and redeem winning outcomes at settlement.

<b>━━ From this bot ━━</b>
Browse markets and YES/NO books · view TestUSDC + STT balances · check Ethos tier and capacity · monitor positions and mark value · preview orders before signing.

<b>━━ Safety ━━</b>
Testnet only — TestUSDC and STT have no real value. The bot <b>never</b> asks for a private key or seed phrase; signing stays in your wallet. Never paste a seed phrase into Telegram, the Mini App, or any chat.`;

// One canonical wallet-link explanation, reused by /connect, /start connect,
// and the menu:connect callback. Three separate copies had drifted apart.
const CONNECT_TEXT = `<b>Connect your wallet</b>

Tap <b>Connect wallet</b> below. Covenant opens with a one-time code and QR — open it in your wallet's own browser, or scan from another device, and sign one ownership message.

<i>A signature, not a transaction. No funds move and no key is shared.</i>`;

const HELP = `<b>Commands</b>

<b>Markets</b>
/markets — live Event Contracts
/market 1 — one market
/book 1 YES — order book

<b>Your wallet</b> — needs Connect wallet
/wallet — balances
/score — Ethos credibility
/capacity — trading capacity
/positions — open positions
/link 0x… — add a read-only address · /unlink to remove

<b>Trade</b>
/trade 1 YES buy 5 0.62 — preview, then sign on Covenant

<i>Testnet only. Never share a private key or seed phrase.</i>`;

// Ordered by the user's journey, not alphabetically or by internal grouping:
//   1. Connect wallet — the primary gate, full-width so it reads as the hero
//      action a new user takes right after the overview.
//   2. Explore & learn — Live markets and How it works need no wallet.
//   3. Your account — capacity, positions, score all require a linked wallet,
//      so they sit together below the gate that unlocks them.
//   4. Help — support, last.
const MAIN_MENU = new InlineKeyboard()
  .text("🔗 Connect wallet", "menu:connect")
  .row()
  .text("Live markets", "menu:markets")
  .text("How it works", "menu:how")
  .row()
  .text("My capacity", "menu:capacity")
  .text("My positions", "menu:positions")
  .row()
  .text("Ethos score", "menu:score")
  .text("Help & safety", "menu:help");

const BACK_MENU = new InlineKeyboard().text("← Main menu", "menu:home");

/* Telegram's persistent reply keyboard is the always-available Home button.
   Inline keyboards are excellent for contextual navigation, but they scroll
   away with messages. The bottom keyboard gives users a stable escape hatch
   from any command without requiring them to remember /start. */
const HOME_KEYBOARD = new Keyboard()
  .text("Markets")
  .webApp("Connect wallet", config.webAppUrl)
  .row()
  .text("Wallet")
  .text("Positions")
  .text("Home")
  .resized()
  .persistent()
  .placeholder("Markets · Connect wallet · Wallet");

function webMenu(path = "/markets"): InlineKeyboard {
  return new InlineKeyboard()
    .url("Open Covenant", `${config.webUrl}${path}`)
    .row()
    .text("← Main menu", "menu:home");
}

/* Edit-in-place menus break in two ordinary situations: a second tap of the
   same button after the rate-limit window ("message is not modified", because
   the content is already on screen) and a message older than Telegram's edit
   window ("message is too old" / "message to edit not found"). Neither is an
   error the user can act on — treat the first as a no-op and fall back to a
   fresh reply for the second, so a menu tap always leads somewhere. */
async function editOrReply(context: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
  try {
    await context.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (error) {
    if (((error as Error).message ?? "").includes("message is not modified")) return;
    await context.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

/* The one Connect-wallet keyboard: the Mini App launcher plus a route home.
   Used by /connect, /start connect, and menu:connect so the button set never
   drifts between entry points. */
function connectKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .webApp("Connect wallet", config.webAppUrl)
    .row()
    .text("← Main menu", "menu:home");
}

function walletRecoveryMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .webApp("Connect wallet", config.webAppUrl)
    .row()
    .text("← Main menu", "menu:home");
}

function marketInfo(market: Awaited<ReturnType<typeof activeMarkets>>[number]) {
  if (market.info.marketType !== "BINARY") throw new Error("Not an Event Contract market.");
  return market.info;
}

async function marketAt(ctx: BotKitContext, indexRaw: string | undefined) {
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 1) throw new Error("Market number must be 1 or greater.");
  const markets = await activeMarkets(ctx, 50);
  const market = markets[index - 1];
  if (!market) throw new Error(`Market #${index} is not in the current live list.`);
  return { market, index };
}

function linkedAddress(context: Context, store: StateStore, explicit?: string): Address {
  const id = context.from?.id;
  if (!id) throw new Error("Telegram user ID unavailable.");
  if (explicit) {
    if (store.wallet(id)?.toLowerCase() !== parseAddress(explicit).toLowerCase()) {
      throw new Error("Personal commands require the verified wallet connected to this Telegram account.");
    }
    return parseAddress(explicit);
  }
  const address = store.wallet(id) ?? store.readOnlyWallet(id);
  if (!address) {
    throw new Error("Connect and verify a wallet first using the Connect wallet button.");
  }
  return address;
}

function isAdmin(context: Context): boolean {
  return context.from !== undefined && config.adminIds.has(context.from.id);
}

async function sendMarkets(context: Context, ctx: BotKitContext): Promise<void> {
  const markets = await activeMarkets(ctx, 10);
  if (markets.length === 0) {
    await context.reply("No live DreamDEX Event Contracts right now.", {
      reply_markup: BACK_MENU,
    });
    return;
  }

  const lines = markets.map((market, index) => {
    const info = marketInfo(market);
    return `<b>${index + 1}. ${escapeHtml(info.question)}</b>\n${escapeHtml(info.asset ?? "Event")} · ${remaining(Number(info.expiry))}`;
  });

  const keyboard = new InlineKeyboard();
  markets.forEach((_, index) => {
    keyboard.text(`Market ${index + 1}`, `market:${index + 1}`);
    if ((index + 1) % 2 === 0 || index === markets.length - 1) keyboard.row();
  });
  keyboard.url("Open Covenant", `${config.webUrl}/markets`).row().text("← Main menu", "menu:home");

  await context.reply(
    `<b>Live DreamDEX markets</b>\n\n${lines.join("\n\n")}\n\nUse <code>/market 1</code> or <code>/trade 1 YES buy 5</code>.`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    },
  );
}

async function sendMarketDetail(context: Context, ctx: BotKitContext, indexRaw: string): Promise<void> {
  const { market, index } = await marketAt(ctx, indexRaw);
  const info = marketInfo(market);
  const yes = await book(ctx, market, "YES", 3);
  const bid = yes.bids[0]?.[0];
  const ask = yes.asks[0]?.[0];
  const mid = bid !== undefined && ask !== undefined ? (bid + ask) / 2 : bid ?? ask;
  const text = `<b>#${index} ${escapeHtml(info.question)}</b>

Asset: ${escapeHtml(info.asset ?? "Event")}
YES: <b>${cents(mid)}</b> · NO: <b>${cents(mid === undefined ? undefined : 1 - mid)}</b>
Best YES bid/ask: ${cents(bid)} / ${cents(ask)}
Settles in: ${remaining(Number(info.expiry))}
Market ID: <code>${escapeHtml(info.marketId)}</code>`;
  await context.reply(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("YES book", `book:${index}:YES`)
      .text("NO book", `book:${index}:NO`)
      .row()
      .url("Trade on Covenant", `${config.webUrl}/markets/${encodeURIComponent(market.id)}`)
      .row()
      .text("← Markets", "menu:markets")
      .text("Main menu", "menu:home"),
  });
}

async function sendBook(context: Context, ctx: BotKitContext, indexRaw: string, outcome: Outcome): Promise<void> {
  const { market, index } = await marketAt(ctx, indexRaw);
  const orderBook = await book(ctx, market, outcome, 5);
  const levels = (side: "Bids" | "Asks", values: [number, number][]) =>
    `<b>${side}</b>\n${values.length ? values.map(([price, size]) => `${cents(price)} · ${size.toFixed(2)}`).join("\n") : "—"}`;
  await context.reply(`<b>#${index} ${outcome} book</b>\n\n${levels("Bids", orderBook.bids)}\n\n${levels("Asks", orderBook.asks)}`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("← Market", `market:${index}`)
      .text("Markets", "menu:markets")
      .text("Main menu", "menu:home"),
  });
}

export function parseTrade(text?: string) {
  const [marketNumber, outcomeRaw, sideRaw, sharesRaw, priceRaw] = commandArgs(text);
  const outcome = outcomeRaw?.toUpperCase() as Outcome | undefined;
  const side = sideRaw?.toLowerCase();
  const shares = Number(sharesRaw);
  const price = priceRaw === undefined ? undefined : Number(priceRaw);
  if (!marketNumber || (outcome !== "YES" && outcome !== "NO")) {
    throw new Error("Usage: /trade <market #> <YES|NO> <buy|sell> <shares> [price]");
  }
  if (side !== "buy" && side !== "sell") {
    throw new Error("Side must be buy or sell.");
  }
  if (!(shares > 0)) throw new Error("Shares must be greater than zero.");
  if (price !== undefined && !(price > 0 && price < 1)) {
    throw new Error("Price must be a probability between 0 and 1 (example: 0.62).");
  }
  return { marketNumber, outcome, side, shares, price } as const;
}

export function createTelegramBot(ctx: BotKitContext, store: StateStore): Bot {
  if (!config.telegramToken) throw new Error("Set TELEGRAM_BOT_TOKEN.");
  const bot = new Bot(config.telegramToken);
  const custody = new WalletCustodyTool(ctx);

  // Serialize expensive commands per user and apply a small burst limit so a
  // Telegram client cannot create overlapping indexer/RPC requests.
  const activeUsers = new Set<number>();
  const lastRequest = new Map<number, number>();
  bot.use(async (context, next) => {
    const userId = context.from?.id;
    if (!userId) return next();
    const now = Date.now();
    if (now - (lastRequest.get(userId) ?? 0) < 650 || activeUsers.has(userId)) {
      /* An unanswered callback query leaves Telegram's button spinner
         running forever, and context.reply() here would spam a fresh message
         per double-tap. Answer the tap where it happened instead. */
      if (context.callbackQuery) {
        await context
          .answerCallbackQuery("One moment — still working on your last request.")
          .catch(() => undefined);
      } else {
        await context
          .reply("Please wait a moment before sending another request.")
          .catch(() => undefined);
      }
      return;
    }
    lastRequest.set(userId, now);
    activeUsers.add(userId);
    try {
      await next();
    } finally {
      activeUsers.delete(userId);
    }
  });

  // /start recognises a `?start=connect` deeplink payload (from the web
  // fallback's "Open the Covenant bot" button) and drops straight into the
  // wallet-link screen. Any other payload shows the same full overview as the
  // persistent Home button, but with the reply keyboard (not MAIN_MENU) as
  // markup: /start is the first message a new user receives, so it is what
  // establishes the persistent bottom keyboard.
  bot.command("start", async (context) => {
    const payload = (context.match ?? "").trim().toLowerCase();

    if (payload === "connect") {
      await context.reply(CONNECT_TEXT, {
        parse_mode: "HTML",
        reply_markup: connectKeyboard(),
      });
      return;
    }

    await context.reply(HOME_OVERVIEW, {
      parse_mode: "HTML",
      reply_markup: HOME_KEYBOARD,
    });
  });

  // /connect — typed shortcut to the same wallet-link surface, for users who
  // arrive via a deeplink, search, or muscle memory.
  bot.command("connect", (context) =>
    context.reply(CONNECT_TEXT, { parse_mode: "HTML", reply_markup: connectKeyboard() }),
  );
  bot.command("help", (context) =>
    context.reply(HELP, { parse_mode: "HTML", reply_markup: HOME_KEYBOARD }),
  );

  bot.command("id", async (context) => {
    if (!context.from) throw new Error("Telegram user ID unavailable.");
    await context.reply(
      `Your Telegram user ID is <code>${context.from.id}</code>.\n\nOnly add this numeric ID to TELEGRAM_ADMIN_IDS. Never share your bot token, private key, or seed phrase.`,
      { parse_mode: "HTML", reply_markup: BACK_MENU },
    );
  });

  bot.command("status", async (context) => {
    const markets = await activeMarkets(ctx, 50);
    await context.reply(
       `<b>Covenant bot status</b>\n\nNetwork: Somnia Shannon testnet\nLive Event Contracts: ${markets.length}\nPublic trading: preview + wallet signing\nWallet custody tool: ${custody.enabled ? "enabled" : "disabled"}\nBot signer: ${custody.address ? `<code>${custody.address}</code>` : "not configured"}`,
      { parse_mode: "HTML", reply_markup: BACK_MENU },
    );
  });

  /* The persistent keyboard mirrors the inline menu for users who prefer
     Telegram's native bottom navigation. These are intentionally aliases of
     the same helpers/commands, not a second behavioral path. */
  // The persistent Home button = the full product overview + how-to. The
  // inline "← Main menu" back button (menu:home) stays on the short WELCOME.
  bot.hears("Home", (context) =>
    context.reply(HOME_OVERVIEW, { parse_mode: "HTML", reply_markup: MAIN_MENU }),
  );
  bot.hears("Markets", async (context) => {
    await context.reply("Loading live DreamDEX markets…");
    await sendMarkets(context, ctx);
  });
  bot.hears("Wallet", async (context) => {
    const address = linkedAddress(context, store);
    const [capacity, gas] = await Promise.all([capacitySummary(address), nativeBalance(address)]);
    await context.reply(
      `<b>Wallet</b> <code>${address}</code>\n\nTestUSDC: <b>${money(capacity.walletCollateral)}</b>\nSTT gas: ${gas.toFixed(4)}\nEthos: ${capacity.score.toLocaleString()} · ${escapeHtml(capacity.level)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Capacity", "menu:capacity").text("Score", "menu:score") },
    );
  });
  bot.hears("Capacity", async (context) => {
    const address = linkedAddress(context, store);
    const value = await capacitySummary(address);
    await context.reply(
      `<b>Covenant capacity</b>\n\nAvailable now: <b>${money(value.available)}</b>\nWallet collateral: ${money(value.walletCollateral)}\nUndrawn tier credit: ${money(value.undrawnCredit)}\nDebt: ${money(value.debt)}\nEthos: ${value.score.toLocaleString()} · ${value.tier}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("Open Credit", `${config.webUrl}/credit`).row().text("Main menu", "menu:home") },
    );
  });
  bot.hears("Score", async (context) => {
    const address = linkedAddress(context, store);
    const ethos = await ethosSummary(address);
    await context.reply(
      `<b>Ethos credibility</b>\n\nScore: <b>${ethos.score.toLocaleString()}</b>\nLevel: ${escapeHtml(ethos.level)}\nCovenant tier: <b>${ethos.tier}</b>`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("View Ethos profile", `https://app.ethos.network/profile/${address}`).row().text("Main menu", "menu:home") },
    );
  });
  bot.hears("Positions", async (context) => {
    const address = linkedAddress(context, store);
    const positions = await ctx.exchange.client.getOpenPositionsWithPnL(address);
    if (positions.length === 0) {
      await context.reply("No open DreamDEX Event Contract positions.", { reply_markup: webMenu("/markets") });
      return;
    }
    const lines = positions.slice(0, 10).map((position, index) => {
      const decimals = position.market.quoteDecimals;
      const yes = Number(position.balanceYes) / 10 ** decimals;
      const no = Number(position.balanceNo) / 10 ** decimals;
      const mark = Number(position.markValue) / 10 ** decimals;
      return `<b>${index + 1}. ${escapeHtml(position.market.question)}</b>\nYES ${yes.toFixed(2)} · NO ${no.toFixed(2)} · mark ${money(mark)}`;
    });
    await context.reply(`<b>Open positions</b>\n\n${lines.join("\n\n")}`, { parse_mode: "HTML", reply_markup: webMenu("/positions") });
  });
  bot.hears("Help", (context) =>
    context.reply(HELP, { parse_mode: "HTML", reply_markup: BACK_MENU }),
  );

  /* Inline navigation keeps the first-run experience inside Telegram instead
     of forcing users to memorize commands. Callback handlers only route to
     the same command logic; there is one source of truth for every result. */
  bot.callbackQuery("menu:home", async (context) => {
    await context.answerCallbackQuery();
    await editOrReply(context, WELCOME, MAIN_MENU);
  });
  bot.callbackQuery("menu:help", async (context) => {
    await context.answerCallbackQuery();
    await editOrReply(context, HELP, BACK_MENU);
  });
  bot.callbackQuery("menu:connect", async (context) => {
    await context.answerCallbackQuery();
    await editOrReply(context, CONNECT_TEXT, connectKeyboard());
  });
  bot.callbackQuery("menu:how", async (context) => {
    await context.answerCallbackQuery();
    await editOrReply(
      context,
      `<b>How it works</b>\n\n<b>1 · Discover</b> — compare YES/NO prices, depth, and expiry across live markets.\n<b>2 · Capacity</b> — collateral is the safety net; your Ethos score sets the terms.\n<b>3 · Position</b> — pick a side and sign the order in your own wallet.\n<b>4 · Settle</b> — track to resolution and redeem winning tokens.`,
      BACK_MENU,
    );
  });
  bot.callbackQuery("menu:markets", async (context) => {
    await context.answerCallbackQuery();
    await context.reply("Loading live DreamDEX markets…");
    await sendMarkets(context, ctx);
  });
  bot.callbackQuery(/^market:(\d+)$/, async (context) => {
    await context.answerCallbackQuery();
    await sendMarketDetail(context, ctx, context.match[1] ?? "");
  });
  bot.callbackQuery(/^book:(\d+):(YES|NO)$/, async (context) => {
    await context.answerCallbackQuery();
    await sendBook(context, ctx, context.match[1] ?? "", (context.match[2] ?? "YES") as Outcome);
  });
  bot.callbackQuery("menu:score", async (context) => {
    await context.answerCallbackQuery();
    const address = linkedAddress(context, store);
    const ethos = await ethosSummary(address);
    await context.reply(
      `<b>Ethos credibility</b>\n\nScore: <b>${ethos.score.toLocaleString()}</b>\nLevel: ${escapeHtml(ethos.level)}\nCovenant tier: <b>${ethos.tier}</b>\n\nEthos provides the signal; Covenant applies it to collateralized terms.`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("View Ethos profile", `https://app.ethos.network/profile/${address}`).row().text("← Main menu", "menu:home") },
    );
  });
  bot.callbackQuery("menu:capacity", async (context) => {
    await context.answerCallbackQuery();
    const address = linkedAddress(context, store);
    const value = await capacitySummary(address);
    await context.reply(
      `<b>Covenant capacity</b>\n\nAvailable now: <b>${money(value.available)}</b>\nWallet collateral: ${money(value.walletCollateral)}\nUndrawn tier credit: ${money(value.undrawnCredit)}\nDebt: ${money(value.debt)}\nPosted tBTC: ${value.postedCollateral.toFixed(6)}\nEthos: ${value.score.toLocaleString()} · ${value.tier}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("Open Credit", `${config.webUrl}/credit`).row().text("← Main menu", "menu:home") },
    );
  });
  bot.callbackQuery("menu:positions", async (context) => {
    await context.answerCallbackQuery();
    const address = linkedAddress(context, store);
    const positions = await ctx.exchange.client.getOpenPositionsWithPnL(address);
    if (positions.length === 0) return void (await context.reply("No open DreamDEX Event Contract positions.", { reply_markup: webMenu("/markets") }));
    const lines = positions.slice(0, 10).map((position, index) => {
      const decimals = position.market.quoteDecimals;
      const yes = Number(position.balanceYes) / 10 ** decimals;
      const no = Number(position.balanceNo) / 10 ** decimals;
      const mark = Number(position.markValue) / 10 ** decimals;
      return `<b>${index + 1}. ${escapeHtml(position.market.question)}</b>\nYES ${yes.toFixed(2)} · NO ${no.toFixed(2)} · mark ${money(mark)}`;
    });
    await context.reply(`<b>Open positions</b>\n\n${lines.join("\n\n")}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("Open Portfolio", `${config.webUrl}/positions`).row().text("← Main menu", "menu:home") });
  });

  bot.command("markets", async (context) => {
    await sendMarkets(context, ctx);
  });

  bot.command("market", async (context) => {
    await sendMarketDetail(context, ctx, commandArgs(context.match)[0] ?? "");
  });

  bot.command("book", async (context) => {
    const [number, outcomeRaw = "YES"] = commandArgs(context.match);
    const outcome = outcomeRaw.toUpperCase() as Outcome;
    if (outcome !== "YES" && outcome !== "NO") throw new Error("Outcome must be YES or NO.");
    await sendBook(context, ctx, number ?? "", outcome);
  });

  bot.command("link", async (context) => {
    const id = context.from?.id;
    if (!id) throw new Error("Telegram user ID unavailable.");
    const address = parseAddress(commandArgs(context.match)[0] ?? "");
    await store.setReadOnlyWallet(id, address);
    await context.reply(
      `Linked <code>${shortAddress(address)}</code> for public read-only lookups.\n\nThis address is not verified as yours. Use Connect wallet for personal wallet, capacity, and position views.`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("Verify wallet in Telegram", config.webAppUrl).row().text("View score", "menu:score").text("Main menu", "menu:home") },
    );
  });

  bot.command("unlink", async (context) => {
    if (!context.from) throw new Error("Telegram user ID unavailable.");
    /* Removes BOTH the verified wallet and the read-only link — the message
       used to imply only the public link was dropped. */
    await store.removeWallet(context.from.id);
    await context.reply(
      "Removed your linked and verified wallets. Use Connect wallet to re-verify, or /link 0x… for a public read-only address.",
      {
        reply_markup: walletRecoveryMenu(),
      },
    );
  });

  bot.command("wallet", async (context) => {
    const address = linkedAddress(context, store, commandArgs(context.match)[0]);
    const [capacity, gas] = await Promise.all([capacitySummary(address), nativeBalance(address)]);
    await context.reply(
      `<b>Wallet</b> <code>${address}</code>\n\nTestUSDC: <b>${money(capacity.walletCollateral)}</b>\nSTT gas: ${gas.toFixed(4)}\nEthos: ${capacity.score.toLocaleString()} · ${escapeHtml(capacity.level)}`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Capacity", "menu:capacity").text("Score", "menu:score").row().text("Main menu", "menu:home") },
    );
  });

  bot.command("score", async (context) => {
    const address = linkedAddress(context, store, commandArgs(context.match)[0]);
    const ethos = await ethosSummary(address);
    await context.reply(
      `<b>Ethos credibility</b>\n\nScore: <b>${ethos.score.toLocaleString()}</b>\nLevel: ${escapeHtml(ethos.level)}\nCovenant tier: <b>${ethos.tier}</b>\n\nEthos provides the signal; Covenant applies it to collateralized terms.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(
          "View Ethos profile",
          `https://app.ethos.network/profile/${address}`,
        ).row().text("Capacity", "menu:capacity").text("Main menu", "menu:home"),
      },
    );
  });

  bot.command("capacity", async (context) => {
    const address = linkedAddress(context, store, commandArgs(context.match)[0]);
    const value = await capacitySummary(address);
    await context.reply(
      `<b>Covenant capacity</b>\n\nAvailable now: <b>${money(value.available)}</b>\nWallet collateral: ${money(value.walletCollateral)}\nUndrawn tier credit: ${money(value.undrawnCredit)}\nDebt: ${money(value.debt)}\nPosted tBTC: ${value.postedCollateral.toFixed(6)}\nEthos: ${value.score.toLocaleString()} · ${value.tier}`, 
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url("Open Credit", `${config.webUrl}/credit`).row().text("Score", "menu:score").text("Main menu", "menu:home"),
      },
    );
  });

  bot.command("positions", async (context) => {
    const address = linkedAddress(context, store, commandArgs(context.match)[0]);
    const positions = await ctx.exchange.client.getOpenPositionsWithPnL(address);
    if (positions.length === 0) return void (await context.reply("No open DreamDEX Event Contract positions.", { reply_markup: new InlineKeyboard().url("Explore markets", `${config.webUrl}/markets`).row().text("Main menu", "menu:home") }));
    const lines = positions.slice(0, 10).map((position, index) => {
      const decimals = position.market.quoteDecimals;
      const yes = Number(position.balanceYes) / 10 ** decimals;
      const no = Number(position.balanceNo) / 10 ** decimals;
      const mark = Number(position.markValue) / 10 ** decimals;
      return `<b>${index + 1}. ${escapeHtml(position.market.question)}</b>\nYES ${yes.toFixed(2)} · NO ${no.toFixed(2)} · mark ${money(mark)}`;
    });
    await context.reply(`<b>Open positions</b>\n\n${lines.join("\n\n")}`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("Open Portfolio", `${config.webUrl}/positions`).row().text("Main menu", "menu:home"),
    });
  });

  bot.command("trade", async (context) => {
    const args = parseTrade(context.match);
    const { market, index } = await marketAt(ctx, args.marketNumber);
    const preview = await previewOrder(ctx, market, args.outcome, args.side, args.shares, args.price);
    const info = marketInfo(market);
    await context.reply(
      `<b>Order preview — no transaction sent</b>\n\nMarket #${index}: ${escapeHtml(info.question)}\n${preview.side.toUpperCase()} ${preview.size} ${preview.outcome}\nPrice: ${cents(preview.price)}\nNotional: <b>${money(preview.notional)}</b>\n\nOpen Covenant to connect your wallet and confirm the order.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(
          "Review on Covenant",
          `${config.webUrl}/markets/${encodeURIComponent(market.id)}`,
        ).row().text("← Markets", "menu:markets").text("Main menu", "menu:home"),
      },
    );
  });

  bot.command("execute", async (context) => {
    if (!isAdmin(context)) throw new Error("This command is restricted to configured bot operators.");
    const args = parseTrade(context.match);
    const { market } = await marketAt(ctx, args.marketNumber);
    const preview = await previewOrder(ctx, market, args.outcome, args.side, args.shares, args.price);
     const placed = await custody.executeOrder(preview);
    await context.reply(
      `<b>Bot order submitted</b>\n\n${placed.side.toUpperCase()} ${placed.size} ${placed.outcome}\nPrice: ${cents(placed.price)}\nFilled: ${placed.filled}\nTx: <code>${placed.hash ?? "pending"}</code>`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Main menu", "menu:home") },
    );
  });

  bot.catch(async (error) => {
    console.error("Telegram command error", error.error);
    const message = (error.error as Error).message;
    const action = /wallet|connect and verify/i.test(message) ? walletRecoveryMenu() : BACK_MENU;
    await error.ctx.reply(`Could not complete that command: ${message}`, { reply_markup: action }).catch(() => undefined);
  });

  return bot;
}
