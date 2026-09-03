import type { Address } from "viem";
import { config } from "./config.js";
import { placeIoc, type BotKitContext, type OrderPreview, type PlacedOrder } from "./dreamdex-bot-kit.js";

/**
 * The only wallet Telegram may operate. This is an operator wallet, not a
 * user's wallet: users never provide keys and this tool has no arbitrary-call
 * or withdrawal primitive.
 */
export class WalletCustodyTool {
  constructor(private readonly ctx: BotKitContext) {}

  get address(): Address | undefined {
    return this.ctx.exchange.walletAddress;
  }

  get enabled(): boolean {
    return config.custodyEnabled && config.tradingEnabled && this.ctx.canTrade;
  }

  async executeOrder(preview: OrderPreview): Promise<PlacedOrder> {
    if (!this.enabled) {
      throw new Error(
        "Wallet custody is disabled. Set BOT_CUSTODY_ENABLED=true and BOT_TRADING_ENABLED=true with a dedicated testnet key.",
      );
    }
    return placeIoc(this.ctx, preview);
  }
}
