/** Public Telegram bot API used by the Mini App wallet proof flow. */
export const TELEGRAM_API_URL =
  import.meta.env.VITE_TELEGRAM_API_URL ??
  "https://covenant-telegram-bot-production.up.railway.app";

/**
 * The bot's public deeplink, hard-defaulted so the wallet-connect fallback
 * page can always render a working "Open in Telegram" button — even when the
 * bot API is briefly unreachable (Railway cold start, network blip) and the
 * `/api/connect/info` call fails. The API is still preferred: it is the
 * source of truth for the bot username the token points at, and overrides
 * this default at runtime whenever it responds.
 */
export const TELEGRAM_BOT_URL =
  import.meta.env.VITE_TELEGRAM_BOT_URL ?? "https://t.me/Covenant_DreamDEXbot";
