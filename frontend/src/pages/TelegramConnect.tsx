import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TELEGRAM_API_URL, TELEGRAM_BOT_URL } from "../config/telegram";
import { IconAlert, IconCheck, IconClock, IconCopy, IconExternal, IconWallet } from "../components/icons";

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

/** telegram-web-app.js (loaded in index.html) provides the real object; the
    full Mini App shape is read through this one cast. */
function telegramWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

type BeginResult = { code: string; url: string; expiresAt: number };
type Phase = "checking" | "linking" | "verified" | "error";

/**
 * Telegram Mini App wallet bridge.
 *
 * Telegram supplies the signed account context (initData). No EVM wallet can
 * run inside Telegram's webview, so the wallet itself signs wherever it
 * lives: this page shows a one-time link code, a QR, and an open button for
 * the verification page; that page connects any wallet (extension, wallet-app
 * browser, WalletConnect) and signs one human-readable ownership message; the
 * API verifies both signatures before associating the wallet with the
 * Telegram account. No private key ever enters the browser app, Telegram, or
 * Covenant's API.
 */
export function TelegramConnect() {
  const webApp = telegramWebApp();
  const openedInsideTelegram = Boolean(webApp?.initData);

  const [phase, setPhase] = useState<Phase>("checking");
  const [link, setLink] = useState<BeginResult | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const linkRef = useRef<BeginResult | null>(null);
  linkRef.current = link;

  /** Start (or restart) a one-time link session for this Telegram account. */
  const begin = useCallback(async () => {
    if (!webApp?.initData) return;
    setPhase("checking");
    setMessage("");
    try {
      const result = await fetch(`${TELEGRAM_API_URL}/api/connect/begin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      }).then(async (response) => {
        const payload = (await response.json()) as {
          ok: boolean;
          code?: string;
          url?: string;
          expiresAt?: number;
          message?: string;
        };
        if (!response.ok || !payload.ok || !payload.code || !payload.url || !payload.expiresAt) {
          throw new Error(payload.message ?? "Could not start wallet linking. Try again.");
        }
        return payload as BeginResult & { ok: true };
      });
      setLink(result);
      setPhase("linking");
    } catch (error) {
      setPhase("error");
      setMessage((error as Error).message);
    }
  }, [webApp]);

  useEffect(() => {
    webApp?.ready();
    webApp?.expand();
    let active = true;
    void (async () => {
      try {
        if (!webApp?.initData) return;
        const session = await fetch(`${TELEGRAM_API_URL}/api/connect/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: webApp.initData }),
        }).then(async (response) => {
          const payload = (await response.json()) as {
            ok: boolean;
            verified?: boolean;
            address?: string;
            message?: string;
          };
          if (!response.ok || !payload.ok) throw new Error(payload.message ?? "Could not check this account.");
          return payload;
        });
        if (!active) return;
        if (session.verified && session.address) {
          setVerifiedAddress(session.address);
          setPhase("verified");
          return;
        }
        // Not verified yet: start a link right away so the first visit needs
        // one fewer tap.
        await begin();
      } catch (error) {
        if (!active) return;
        setPhase("error");
        setMessage((error as Error).message);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Poll the link status while a code is live. Telegram suspends timers when
     the Mini App is backgrounded, so polling also resumes eagerly whenever
     the page becomes visible again. */
  useEffect(() => {
    if (phase !== "linking") return;
    let cancelled = false;
    const poll = async () => {
      const current = linkRef.current;
      if (!current || document.hidden) return;
      try {
        const status = await fetch(`${TELEGRAM_API_URL}/api/connect/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: current.code }),
        }).then(async (response) => {
          const payload = (await response.json()) as {
            ok: boolean;
            state?: "pending" | "verified" | "expired" | "unknown";
            address?: string;
          };
          if (!response.ok || !payload.ok) throw new Error("Status check failed.");
          return payload;
        });
        if (cancelled) return;
        if (status.state === "verified" && status.address) {
          setVerifiedAddress(status.address);
          setPhase("verified");
        } else if (status.state === "unknown") {
          // The code was replaced or pruned (worker restart): start a fresh
          // link instead of polling a dead code forever.
          await begin();
        }
      } catch {
        // Transient network errors must not kill the polling loop.
      }
    };
    const interval = window.setInterval(poll, 3_000);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, begin]);

  /* One-second ticker for the expiry countdown while a link is live. */
  useEffect(() => {
    if (phase !== "linking") return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(ticker);
  }, [phase]);

  const expired = link !== null && link.expiresAt < now;
  const secondsLeft = link ? Math.max(0, Math.floor((link.expiresAt - now) / 1000)) : 0;
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  function openVerificationPage() {
    if (!link) return;
    // openLink leaves Telegram for the system/browser; the Mini App stays
    // alive behind it, so polling picks up the verification on return.
    if (webApp?.openLink) webApp.openLink(link.url);
    else window.open(link.url, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      // Clipboard access can be denied; the URL stays selectable as text.
    }
  }

  if (!openedInsideTelegram) {
    return <TelegramConnectFallback />;
  }

  return (
    <main className="min-h-screen bg-ink-950 text-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2 text-brand-300 text-micro font-semibold uppercase">
          <IconWallet className="w-4 h-4" />
          Covenant wallet connection
        </div>
        <h1 className="mt-4 text-h2 text-white text-balance">Connect your wallet securely.</h1>
        <p className="mt-3 text-body text-slate-300 leading-relaxed">
          Your wallet signs wherever it lives — a wallet app, a desktop browser, or WalletConnect. Link it
          here with one clear ownership message. Your key never leaves your wallet.
        </p>

        <div className="mt-8 card p-5 space-y-4">
          {phase === "checking" && <p className="text-body-sm text-subtle">Preparing a secure link…</p>}

          {phase === "linking" && link && (
            <>
              <div className="flex items-start gap-3">
                <span className="empty-state-icon w-8 h-8 shrink-0"><span className="text-brand-300">1</span></span>
                <div>
                  <div className="text-body-sm font-semibold text-white">Open the verification page</div>
                  <p className="mt-1 text-body-sm text-subtle">
                    Open it in your wallet app's built-in browser (MetaMask, OKX, Trust…), a desktop
                    browser with your extension, or scan this QR with another device.
                  </p>
                </div>
              </div>
              <div className="flex justify-center pt-1">
                {/* A light plate keeps the QR scannable on the dark surface. */}
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG value={link.url} size={168} level="M" />
                </div>
              </div>
              <div className="text-center">
                <div className="step-label">One-time link code</div>
                <div className="code-inline mt-1 tracking-[0.2em] font-semibold">{link.code}</div>
              </div>
              {expired ? (
                <button className="btn-primary w-full" onClick={() => void begin()}>
                  Get a new code
                </button>
              ) : (
                <div className="space-y-2">
                  <button className="btn-primary w-full" onClick={openVerificationPage}>
                    <IconExternal className="w-4 h-4" /> Open verification page
                  </button>
                  <button
                    className="w-full text-body-sm text-subtle underline underline-offset-4 hover:text-slate-300 transition-colors inline-flex items-center justify-center gap-1.5"
                    onClick={() => void copyLink()}
                  >
                    <IconCopy className="w-3.5 h-3.5" />
                    {copied ? "Link copied" : "Copy link for your wallet's browser"}
                  </button>
                  <p className="text-micro text-subtle inline-flex items-center justify-center gap-1.5 w-full">
                    <IconClock className="w-3.5 h-3.5" />
                    {`Code expires in ${countdown}`}
                  </p>
                </div>
              )}
              <div className="flex items-start gap-3">
                <span className="empty-state-icon w-8 h-8 shrink-0"><span className="text-brand-300">2</span></span>
                <div>
                  <div className="text-body-sm font-semibold text-white">Sign once, then come back</div>
                  <p className="mt-1 text-body-sm text-subtle">
                    The verification page asks your wallet to sign one message that cannot move funds.
                    This page confirms automatically — you can also check Telegram for the bot's
                    confirmation.
                  </p>
                </div>
              </div>
            </>
          )}

          {phase === "verified" && (
            <>
              <p className="text-body-sm text-ok inline-flex items-center gap-2">
                <IconCheck className="w-4 h-4" /> Wallet verified
              </p>
              {verifiedAddress && (
                <div className="code-inline break-all text-body-sm">{verifiedAddress}</div>
              )}
              <p className="text-body-sm text-subtle">
                This wallet is linked to your Telegram account. Return to the Covenant bot to see your
                balances, Ethos score, capacity, and positions.
              </p>
              <button
                className="w-full text-body-sm text-subtle underline underline-offset-4 hover:text-slate-300 transition-colors"
                onClick={() => void begin()}
              >
                Link a different wallet
              </button>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-body-sm text-bad inline-flex items-start gap-2">
                <IconAlert className="w-4 h-4 mt-0.5 shrink-0" /> {message}
              </p>
              <button className="btn-primary w-full" onClick={() => void begin()}>
                Try again
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-micro text-subtle leading-relaxed">
          Never paste a seed phrase or private key into Telegram, this page, or any support chat.
        </p>
      </div>
    </main>
  );
}

/**
 * What a browser sees when the Mini App URL is opened outside Telegram: no
 * Telegram session means no wallet link can start here. The page's whole job
 * is to send the user into the bot with as few steps as possible — the bot
 * link comes from the API (resolved from the bot token at startup).
 */
function TelegramConnectFallback() {
  // Start with the config default so the "Open the Covenant bot" button
  // renders on FIRST paint, before any network round-trip. The API call
  // below only refines the value if it responds — a Railway cold start or
  // a network blip can no longer leave the button missing.
  const [botUrl, setBotUrl] = useState<string>(TELEGRAM_BOT_URL);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const info = await fetch(`${TELEGRAM_API_URL}/api/connect/info`).then(async (response) => {
          const payload = (await response.json()) as { ok: boolean; botUrl?: string | null };
          if (!response.ok || !payload.ok) throw new Error("unavailable");
          return payload;
        });
        if (active && info.botUrl) setBotUrl(info.botUrl);
      } catch {
        // The default already renders a working button; the API value would
        // only refine it. There is nothing to do on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Append the start payload so tapping the button always sends /start
  // connect, even for returning users. The bot recognises the payload and
  // jumps straight to the wallet-connect button.
  const deepLink = `${botUrl}?start=connect`;

  return (
    <main className="min-h-screen bg-surface-canvas text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2 text-brand-600 text-micro font-semibold uppercase">
          <IconWallet className="w-4 h-4" />
          Covenant wallet linking
        </div>
        <h1 className="mt-4 text-h2 text-slate-50 text-balance">
          Linking runs inside Telegram.
        </h1>
        <p className="mt-3 text-body text-muted leading-relaxed">
          Wallet linking binds a wallet to your Telegram account, so the flow
          has to start inside the Covenant bot — a regular browser tab has no
          Telegram session to sign against.
        </p>

        <div className="mt-8 card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="empty-state-icon w-8 h-8 shrink-0">
              <span className="text-brand-600 font-semibold">1</span>
            </span>
            <div>
              <div className="text-body-sm font-semibold text-slate-100">
                Open the bot with one tap
              </div>
              <p className="mt-1 text-body-sm text-subtle">
                The button below sends <code className="code-inline">/start&nbsp;connect</code>
                to <b>@Covenant_DreamDEXbot</b>, which drops you straight into
                the wallet-linking screen — no menu digging.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="empty-state-icon w-8 h-8 shrink-0">
              <span className="text-brand-600 font-semibold">2</span>
            </span>
            <div>
              <div className="text-body-sm font-semibold text-slate-100">
                Tap Connect wallet in the bot
              </div>
              <p className="mt-1 text-body-sm text-subtle">
                A one-time code, a QR, and an Open button appear. Open the
                verification page in your wallet's own browser, or scan the QR
                with a second device.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="empty-state-icon w-8 h-8 shrink-0">
              <span className="text-brand-600 font-semibold">3</span>
            </span>
            <div>
              <div className="text-body-sm font-semibold text-slate-100">
                Sign one message
              </div>
              <p className="mt-1 text-body-sm text-subtle">
                Your wallet signs a human-readable ownership message. It does
                not move funds and it cannot approve a transaction.
              </p>
            </div>
          </div>

          <a className="btn-primary w-full" href={deepLink} target="_blank" rel="noreferrer">
            <IconExternal className="w-4 h-4" /> Open the Covenant bot in Telegram
          </a>
        </div>

        {/* Escape hatch. Wallet linking is only needed for the bot's own
            /trade previews, /positions read, and /wallet lookup — the web
            app's own trading surface never requires a Telegram binding.
            Users who arrived here by mistake get a direct route back to
            the parts of Covenant that work without Telegram at all. */}
        <div className="mt-6 rounded-lg border border-line bg-surface-solid px-4 py-3">
          <div className="text-body-sm font-semibold text-slate-100">
            Don't need Telegram?
          </div>
          <p className="mt-1 text-body-sm text-subtle leading-relaxed">
            Covenant's web app trades DreamDEX Event Contracts without any
            Telegram binding. Linking is only needed for bot-side commands
            (<code className="code-inline">/trade</code>,{" "}
            <code className="code-inline">/positions</code>,{" "}
            <code className="code-inline">/wallet</code>).
          </p>
          <a
            href="/markets"
            className="link text-body-sm mt-2 inline-flex items-center gap-1.5"
          >
            Open the web app <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className="mt-5 text-micro text-subtle leading-relaxed">
          Never paste a seed phrase or private key into Telegram, this page, or any support chat.
        </p>
      </div>
    </main>
  );
}
