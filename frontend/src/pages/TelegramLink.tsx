import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { TELEGRAM_API_URL } from "../config/telegram";
import { IconAlert, IconCheck, IconWallet } from "../components/icons";

type Phase = "loading" | "ready" | "signing" | "done" | "error";

/**
 * Browser-side half of the Telegram wallet link.
 *
 * Reached from the Mini App's one-time code (link or QR), this page runs in
 * whatever browser holds the wallet — a wallet app's built-in browser, a
 * desktop browser with an extension, or WalletConnect on another device. The
 * wallet signs the ownership message the bot API prepared for this code; the
 * API recovers the signer and binds the address to the Telegram account that
 * started the link. Nothing here handles keys, and the signature cannot move
 * funds.
 */
export function TelegramLink() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [linkedAddress, setLinkedAddress] = useState<string | null>(null);

  const fail = useCallback((text: string) => {
    setPhase("error");
    setError(text);
  }, []);

  /* Fetch the exact message to sign once a wallet is connected. The message
     is rebuilt server-side at verify time, so it can never drift. */
  useEffect(() => {
    if (!code || !isConnected || !address) return;
    let active = true;
    setPhase("loading");
    setMessage(null);
    void (async () => {
      try {
        const result = await fetch(
          `${TELEGRAM_API_URL}/api/connect/message?code=${encodeURIComponent(code)}&address=${encodeURIComponent(address)}`,
        ).then(async (response) => {
          const payload = (await response.json()) as {
            ok: boolean;
            message?: string;
            expiresAt?: number;
          };
          if (!response.ok || !payload.ok || !payload.message) {
            throw new Error(payload.message ?? "Could not load the message to sign.");
          }
          return payload as { ok: true; message: string; expiresAt?: number };
        });
        if (!active) return;
        setMessage(result.message);
        setExpiresAt(result.expiresAt ?? null);
        setPhase("ready");
      } catch (caught) {
        if (active) fail((caught as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [code, isConnected, address, fail]);

  async function verify() {
    if (!message || !address) return;
    setPhase("signing");
    try {
      const signature = await signMessageAsync({ message });
      const result = await fetch(`${TELEGRAM_API_URL}/api/connect/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, address, signature }),
      }).then(async (response) => {
        const payload = (await response.json()) as { ok: boolean; address?: string; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "Wallet verification failed.");
        return payload;
      });
      setLinkedAddress(result.address ?? address);
      setPhase("done");
    } catch (caught) {
      fail((caught as Error).message || "Wallet verification failed.");
    }
  }

  const expired = expiresAt !== null && expiresAt < Date.now();

  return (
    <main className="min-h-screen bg-ink-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2 text-brand-300 text-micro font-semibold uppercase">
          <IconWallet className="w-4 h-4" />
          Covenant wallet verification
        </div>
        <h1 className="mt-4 text-h2 text-white text-balance">Verify your wallet for Telegram.</h1>
        <p className="mt-3 text-body text-slate-300 leading-relaxed">
          This one-time page links your wallet to your Covenant account on Telegram. Connect the wallet you
          trade with, then sign a single message. It cannot move funds or approve a transaction.
        </p>

        <div className="mt-8 card p-5 space-y-4">
          {!code && (
            <p className="text-body-sm text-bad inline-flex items-start gap-2">
              <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
              This link is missing its one-time code. Start again from the Covenant bot in Telegram
              (Connect wallet).
            </p>
          )}

          {code && !isConnected && phase !== "error" && (
            <>
              <div className="step-label">Step 1 · Connect the wallet you trade with</div>
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) =>
                  mounted ? (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="btn-primary w-full"
                    >
                      Connect wallet
                    </button>
                  ) : (
                    <div aria-hidden="true" className="h-10 w-full" />
                  )
                }
              </ConnectButton.Custom>
              <p className="text-micro text-subtle leading-relaxed">
                Prefer your phone's wallet app? Copy this page's address into its built-in browser, or
                scan the QR shown in Telegram.
              </p>
            </>
          )}

          {code && isConnected && phase === "loading" && (
            <p className="text-body-sm text-subtle">Preparing your verification message…</p>
          )}

          {code && isConnected && (phase === "ready" || phase === "signing") && message && (
            <>
              <div>
                <div className="step-label">Step 2 · Review the message</div>
                <pre className="code-inline mt-1.5 whitespace-pre-wrap break-words text-body-sm font-normal leading-relaxed">
                  {message}
                </pre>
              </div>
              {expired ? (
                <p className="text-body-sm text-bad inline-flex items-start gap-2">
                  <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  This code expired. Start Connect wallet again in Telegram to get a new one.
                </p>
              ) : (
                <button className="btn-primary w-full" onClick={() => void verify()} disabled={phase === "signing"}>
                  {phase === "signing" ? "Confirm in your wallet…" : "Sign & verify wallet"}
                </button>
              )}
            </>
          )}

          {phase === "done" && (
            <>
              <p className="text-body-sm text-ok inline-flex items-center gap-2">
                <IconCheck className="w-4 h-4" /> Wallet verified
              </p>
              {linkedAddress && <div className="code-inline break-all text-body-sm">{linkedAddress}</div>}
              <p className="text-body-sm text-subtle">
                Your wallet is now linked to your Telegram account. Return to Telegram — the Covenant bot
                has confirmed the link, and wallet, score, capacity, and position views are unlocked.
              </p>
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-body-sm text-bad inline-flex items-start gap-2">
                <IconAlert className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
              <p className="text-body-sm text-subtle">
                Start again from the Covenant bot in Telegram (Connect wallet) to get a fresh code.
              </p>
            </>
          )}
        </div>

        <p className="mt-5 text-micro text-subtle leading-relaxed">
          Covenant will never ask for your seed phrase. This signature only proves that this wallet is
          yours.
        </p>
      </div>
    </main>
  );
}
