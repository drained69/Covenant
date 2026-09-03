import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { CHAIN, EXPLORER, NATIVE_TOKEN, QUOTE_TOKEN } from "../config/chain";
import { useDreamDexQuoteBalance } from "../hooks/useDreamDex";
import { useEthosCredit } from "../hooks/useEthosScore";
import { shortAddr } from "../lib/format";
import { TokenMark, IconChevronRight, IconExternal, EthosMark } from "./icons";

/**
 * The connected wallet's spendable balances on Somnia, in one control.
 *
 * Two assets matter to the trading flow: the DreamDEX venue collateral
 * (TestUSDC — what orders escrow) and STT (gas). Both are read live; the
 * collapsed trigger shows the collateral figure because that is the number
 * that gates every order size.
 */
export function WalletBalancesMenu() {
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Both reads are pinned to Somnia (chainId) and polled. Unpinned reads
     execute on whatever chain the wallet is currently connected to — on any
     other network the ERC-20 read errors out and the native read shows the
     wrong chain's token. Unpolled reads went stale the moment a drip, trade,
     or borrow changed the balance — this control updated only on tab
     refocus. The quote balance reuses the shared hook the trade panel uses,
     so both surfaces always agree. */
  const quote = useDreamDexQuoteBalance();
  const stt = useBalance({
    address,
    chainId: CHAIN.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const ethos = useEthosCredit();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isConnected) return null;

  const rows: BalanceRowProps[] = [
    {
      symbol: QUOTE_TOKEN.symbol,
      name: QUOTE_TOKEN.name,
      role: QUOTE_TOKEN.role,
      tone: "ok",
      formatted: quote.raw !== undefined ? trim(formatUnits(quote.raw, quote.decimals)) : "—",
      loading: quote.isLoading,
      explorerPath: `${EXPLORER}/address/${QUOTE_TOKEN.address}`,
    },
    {
      symbol: NATIVE_TOKEN.symbol,
      name: NATIVE_TOKEN.name,
      role: NATIVE_TOKEN.role,
      tone: "warn",
      formatted: stt.data ? trim(stt.data.formatted) : "—",
      loading: stt.isLoading,
    },
  ];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      {/* The trigger is the wallet's IDENTITY, not its balance: the address,
          mono and short, with a chevron that rotates open. The spendable
          figure lives in its own masthead instrument (TokenStatus in the
          header) and in full inside this menu — one number, stated once as
          chrome, detailed on demand. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Wallet menu"
        className={`inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-md border
                    text-body-sm font-medium transition-colors duration-150 ${
                      open
                        ? "border-line-strong bg-ink-900 text-slate-50"
                        : "border-line text-slate-200 hover:bg-ink-900 hover:border-line-strong hover:text-slate-50"
                    }`}
      >
        <span className="font-mono tabular-nums">{shortAddr(address)}</span>
        <IconChevronRight
          className={`w-3.5 h-3.5 flex-shrink-0 text-subtle transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="dropdown-panel w-80 p-0 overflow-hidden" role="menu">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <span className="section-label">Wallet balances</span>
            <a
              href={`${EXPLORER}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="link inline-flex items-center gap-1.5 font-mono text-micro"
            >
              {shortAddr(address)}
              <IconExternal className="w-3 h-3 opacity-60" />
            </a>
          </div>

          <div className="p-1.5">
            {rows.map((row) => (
              <BalanceRow key={row.symbol} {...row} />
            ))}

            {/* Ethos credibility — the third number a Covenant trader thinks
                about, after collateral and gas. Lives here (rather than only
                on the Credit page) so the sm–xl band, where the header chip
                doesn't fit, still reads it one click away. Links to the full
                qualification view. */}
            <div className="my-1 border-t border-line" />
            <Link to="/credit" className="block rounded-md">
               <div className="group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-ink-900">
                <span className="w-7 h-7 rounded-full bg-ethos-500/10 border border-ethos-500/25 flex items-center justify-center text-ethos-600 flex-shrink-0">
                  <EthosMark className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium text-slate-100 truncate">
                    Ethos credibility
                  </div>
                  <div className="text-micro text-subtle truncate">sets your credit tier</div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  {ethos.isLoading ? (
                    <div className="skeleton h-4 w-12" />
                  ) : (
                    <span className="font-mono text-body-sm tabular-nums text-slate-50 leading-tight">
                      {ethos.data?.score.toLocaleString() ?? "—"}
                    </span>
                  )}
                  <span className="text-micro text-subtle">{ethos.tier.name}</span>
                </div>
              </div>
            </Link>
          </div>

           <div className="px-4 py-3 border-t border-line bg-ink-900 text-micro text-subtle">
            Held in your wallet — DreamDEX orders escrow collateral at fill time.
          </div>
        </div>
      )}
    </div>
  );
}

type BalanceRowProps = {
  symbol: string;
  name: string;
  role: string;
  tone: "warn" | "ok";
  formatted: string;
  loading: boolean;
  explorerPath?: string;
};

function BalanceRow({ symbol, name, role, tone, formatted, loading, explorerPath }: BalanceRowProps) {
  const body = (
    /* rounded-md matches .dropdown-item: concentric with the 12px panel + 6px
       padding (see index.css). */
     <div className="group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-ink-900">
      <TokenMark symbol={symbol} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-slate-100 truncate">{symbol}</div>
        <div className="text-micro text-subtle truncate">
          {role} · {name}
        </div>
      </div>
      {loading ? (
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="skeleton h-4 w-16" />
        </div>
      ) : (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="font-mono text-body-sm tabular-nums text-slate-50 leading-tight">
            {formatted}
          </span>
          <span className="text-micro text-subtle">{symbol}</span>
        </div>
      )}
    </div>
  );

  if (!explorerPath) return body;
  return (
    <a href={explorerPath} target="_blank" rel="noreferrer" className="block">
      {body}
    </a>
  );
}

function trim(s: string): string {
  const [i, d = ""] = s.split(".");
  const cut = d.slice(0, 4).replace(/0+$/, "");
  return cut ? `${i}.${cut}` : i;
}
