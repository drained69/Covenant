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

const WELCOME = `<b>Welcome to Covenant</b>

Your Telegram command center for <b>DreamDEX Event Contracts</b> on <b>Somnia Shannon testnet</b> (chain <code>50312</code>).

<b>What Covenant does</b>
Covenant helps you trade binary Event Contracts on DreamDEX. Each market asks a question with two outcomes: <b>YES</b> or <b>NO</b>. You can inspect the live probability, order book, expiry, your Ethos credibility, and your available collateralized capacity before trading.

<b>How to get started</b>
1. Tap <b>Connect wallet</b> — Covenant opens inside Telegram and shows a one-time link code.
2. Open the verification page in any browser — your wallet app's built-in browser, a desktop browser, or by scanning the QR with another device.
3. Connect your wallet there and sign one ownership message. It does not move funds or approve a transaction.
4. Return here — your verified wallet unlocks wallet, score, capacity, and position views.
5. Use <b>Markets</b> to choose an Event Contract, then open it in Covenant to review and sign a trade.

<b>What Ethos means</b>
Ethos provides a reputation signal. Covenant uses that signal to determine your credit tier and potential borrowing terms. <b>Collateral remains the safety foundation; Ethos never replaces it.</b>

<b>What you can do here</b>
• Browse live DreamDEX markets and prices
• Inspect YES/NO bids and asks
• View your TestUSDC and STT balances
• View your Ethos credibility and Covenant tier
• Check available trading capacity
• Monitor open positions and mark value
• Preview an order before signing it on Covenant

<b>Somnia testnet only</b>
Use testnet funds such as TestUSDC and STT. Do not send production funds here. Testnet balances have no real-world value.

<b>Security</b>
This bot never asks for private keys or seed phrases. Never paste them into Telegram, the Mini App, or a support chat. Wallet signing stays with your wallet provider.

Use the buttons below, or tap the persistent <b>Home</b> button at any time.`;

const HELP = `<b>Covenant × DreamDEX</b>

<b>Network</b>
Somnia Shannon testnet · chain <code>50312</code>
Testnet only — use TestUSDC for trading collateral and STT for gas.

<b>Markets</b>
/markets — live Event Contracts
/market &lt;#&gt; — market detail
/book &lt;#&gt; [YES|NO] — order book

<b>Your wallet</b>
/link &lt;0x…&gt; — add a public address for read-only lookup
/unlink — remove it
/wallet — balances and linked address
/score — Ethos score and tier
/capacity — Covenant trading capacity
/positions — DreamDEX Event Contract positions

<b>Trading</b>
/trade &lt;#&gt; &lt;YES|NO&gt; &lt;buy|sell&gt; &lt;shares&gt; [price]
Creates a safe preview and opens Covenant for wallet signing. Example:
<code>/trade 1 YES buy 5 0.62</code>

<b>Wallet verification</b>
The Connect wallet Mini App proves that the wallet belongs to your Telegram account with one non-transaction signature. A pasted address is never treated as verified ownership.

<b>Operator only</b>
/execute uses the dedicated bot wallet only. It is disabled by default and never trades a user's linked wallet.

Never send private keys or seed phrases in Telegram.`;

const MAIN_MENU = new InlineKeyboard()
  .text("Live markets", "menu:markets")
  .text("Connect wallet", "menu:connect")
  .row()
  .text("My capacity", "menu:capacity")
  .text("My positions", "menu:positions")
  .row()
  .text("Ethos score", "menu:score")
  .text("How it works", "menu:how")
  .row()
  .text("Help & safety", "menu:help");

const BACK_MENU = new InlineKeyboard().text("← Main menu", "menu:home");

/* Telegram's persistent reply keyboard is the always-available Home button.
   Inline keyboards are excellent for contextual navigation, but they scroll
   away with messages. The bottom keyboard gives users a stable escape hatch
   from any command without requiring them to remember /start. */
const HOME_KEYBOARD = new Keyboard()
  .text("Home")
  .row()
  .text("Markets")
  .webApp("Connect wallet", config.webAppUrl)
  .text("Wallet")
  .text("Capacity")
  .row()
  .text("Score")
  .text("Positions")
  .text("Help")
  .resized()
  .persistent()
  .placeholder("Choose an action");

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

function walletRecoveryMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .webApp("Connect wallet in Telegram", config.webAppUrl)
    .row()
    .text("How to link", "menu:connect")
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

  bot.command("start", (context) =>
    context.reply(WELCOME, {
      parse_mode: "HTML",
      reply_markup: HOME_KEYBOARD,
    }).then(() => context.reply("Choose a destination:", { reply_markup: MAIN_MENU })),
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
  bot.hears("Home", (context) =>
    context.reply(WELCOME, { parse_mode: "HTML", reply_markup: MAIN_MENU }),
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
    const connector = new InlineKeyboard().webApp("Connect wallet in Telegram", config.webAppUrl);
    await editOrReply(
      context,
      `<b>Connect your wallet safely</b>\n\n1. Open the secure connector below inside Telegram — it shows a one-time link code and QR.\n2. Open the verification page in your wallet's browser, any desktop browser, or scan the QR with another device.\n3. Connect your wallet there and sign one human-readable ownership message. It cannot move funds.\n4. Return here — your wallet is verified for your Telegram account.\n\nThe bot never needs your private key. Telegram only receives proof of ownership.`,
      connector.row().text("← Main menu", "menu:home"),
    );
  });
  bot.callbackQuery("menu:how", async (context) => {
    await context.answerCallbackQuery();
    await editOrReply(
      context,
      `<b>How Covenant works</b>\n\n<b>01 · Discover</b>\nScan live DreamDEX Event Contracts and compare YES/NO prices, depth, volume, and expiry.\n\n<b>02 · Capacity</b>\nYour collateral remains the safety foundation. Ethos provides a reputation signal that can influence your Covenant tier.\n\n<b>03 · Position</b>\nChoose YES or NO and review the order on Covenant before signing with your wallet.\n\n<b>04 · Settlement</b>\nTrack the market to resolution and redeem winning outcome tokens.`,
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
