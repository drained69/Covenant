import { config } from "./config.js";
import {
  activeMarkets,
  book,
  closeBotKit,
  createBotKitContext,
  marketOnchain,
  previewOrder,
} from "./dreamdex-bot-kit.js";

const kit = createBotKitContext();
let exitCode = 0;
try {
  console.log(`network: Somnia Shannon 50312`);
  console.log(`trading: ${config.tradingEnabled ? "enabled" : "disabled (safe default)"}`);
  console.log(`signer: ${kit.exchange.walletAddress ?? "none"}`);
  const markets = await activeMarkets(kit, 20);
  console.log(`live markets: ${markets.length}`);
  const market = markets[0];
  if (!market) throw new Error("No live Event Contracts.");
  const onchain = await marketOnchain(kit, market);
  console.log(`first market: ${market.symbol}`);
  console.log(`on-chain status: ${onchain.status}`);
  const yes = await book(kit, market, "YES", 3);
  console.log(`YES book: ${yes.bids.length} bids / ${yes.asks.length} asks`);
  // The live book may legitimately be empty between windows. An explicit
  // probability still verifies the Bot Kit's tick/lot conversion and status
  // guard without pretending an order is executable at a missing touch.
  const preview = await previewOrder(kit, market, "YES", "buy", 1, 0.5);
  console.log(`preview: 1 YES @ ${preview.price} = ${preview.notional}`);
  console.log("doctor: OK");
} catch (error) {
  exitCode = 1;
  console.error(`doctor: FAILED — ${(error as Error).message}`);
} finally {
  await closeBotKit(kit);
  process.exit(exitCode);
}
