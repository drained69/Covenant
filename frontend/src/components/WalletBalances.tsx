import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { EXPLORER, TOKENS } from "../config/chain";
import { useWalletBalances } from "../hooks/useTokenBalance";
import { fmtUnits, shortAddr } from "../lib/format";
import { TokenMark, IconWallet, IconChevronRight, IconExternal } from "./icons";

/**
 * The connected wallet's holdings, every token, in one place.
 *
 * Before this, a balance appeared in exactly two of the six ActionPanel tabs —
 * "Your tWBTC" under Post collateral, "Your tUSDC" under Repay debt. So the
 * only way to answer "what do I actually hold?" was to open a market, pick a
 * tab you had no intention of submitting, read one number, then switch tabs for
 * the other. Holdings are context for every decision on every page, not a
 * footnote to two forms, so they belong somewhere persistent.
 *
 * Balances come from one batched multicall (`useWalletBalances`) polling at 15s,
 * the same cadence the forms already used.
 */

/** One token row: mark, symbol + role, balance. Shared by the popover and the card. */
function BalanceRow({
  symbol,
  name,
  role,
  tone,
  address,
  raw,
  decimals,
  digits,
  loading,
}: {
  symbol: string;
  name: string;
  role: string;
  tone: "warn" | "ok";
  address: string;
  raw?: bigint;
  decimals: number;
  digits: number;
  loading: boolean;
}) {
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.03]">
      <TokenMark symbol={symbol.replace(/^t/, "")} tone={tone} />

      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-slate-100 truncate">{symbol}</div>
        {/* The role is the point of this line. "tWBTC" means nothing to someone
            who hasn't read the market page; "Collateral · Test WBTC" does. */}
        <div className="text-micro text-subtle truncate">
          {role} · {name}
        </div>
      </div>

      {/*
        The figure and its unit are now two ranked elements rather than one
        run-on string. A balance is read as "how much" first and "of what"
        second — giving the amount full contrast and the symbol `subtle` on a
        line beneath matches how every institutional balance sheet renders it,
        and it stops long values from pushing the symbol out of alignment
        between rows.
      */}
      {loading ? (
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-2.5 w-9" />
        </div>
      ) : (
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-end flex-shrink-0 transition-colors
                     hover:text-brand-300 focus-visible:text-brand-300"
          data-tip={`${symbol} · ${shortAddr(address)}`}
        >
          <span className="font-mono text-body-sm tabular-nums text-white leading-tight">
            {fmtUnits(raw, decimals, digits)}
          </span>
          <span className="text-micro text-subtle group-hover:text-muted transition-colors">
            {symbol}
          </span>
        </a>
      )}
    </div>
  );
}

/** Fewer decimals for a 6-dec stablecoin than an 8-dec BTC-alike. */
const digitsFor = (decimals: number) => (decimals <= 6 ? 2 : 4);

/**
 * Header control: a wallet button that opens the balance list.
 *
 * A popover rather than inline figures because the header already carries the
 * brand, four nav items and the connect button — two more numbers there would
 * be the widest element on the bar competing with navigation. Collapsed it is
 * one affordance; expanded it is the full picture.
 */
export function WalletBalancesMenu() {
  const { address, isConnected } = useAccount();
  const { balances, isLoading } = useWalletBalances(address);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. A popover that can only be dismissed
  // by re-clicking its own trigger is a trap on touch devices.
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

  // The collapsed label shows the loan-token balance, because that is the figure
  // that gates the most common action (filling an offer). The rest is one tap away.
  const primary = balances[0];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      {/*
        The trigger reads as a control on the bar rather than a card floating on
        it. Previously it was `rounded-lg` with a filled plate and its own
        border — three separate treatments to say "button" — while sitting next
        to `nav-tab`s that use none of them, so it was the loudest element in
        the header despite being the least important. It now borrows the nav's
        radius and height rhythm and keeps a single hairline border, which is
        the Stripe account-switcher idiom: present, quiet, obviously clickable.

        The label is also ranked now — figure at full contrast, unit `subtle` —
        matching the rows it opens, so expanding the popover feels like the same
        object getting larger rather than a different component appearing.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Wallet balances"
        className={`inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-md border
                    text-body-sm font-medium transition-colors duration-150 ${
                      open
                        ? "border-line-strong bg-white/[0.06] text-white"
                        : "border-line text-slate-200 hover:bg-white/[0.04] hover:border-line-strong hover:text-white"
                    }`}
      >
        <IconWallet className="w-4 h-4 flex-shrink-0 opacity-70" />
        {isLoading ? (
          <span className="skeleton h-3.5 w-16" />
        ) : (
          <span className="font-mono tabular-nums">
            {fmtUnits(primary.raw, primary.token.decimals, digitsFor(primary.token.decimals))}
            <span className="ml-1 text-subtle">{primary.token.symbol}</span>
          </span>
        )}
        <IconChevronRight
          className={`w-3.5 h-3.5 flex-shrink-0 text-subtle transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        /*
          The panel gains a real header and footer separated by rules, instead
          of two `divider my-1` hairlines floating in uniform 6px padding. A
          popover that is structurally a card — titled zone, content zone,
          caption zone — is what makes it read as part of an application rather
          than a context menu. Padding is scoped to the list so the rules run
          the full width, which is what makes the zones legible as zones.
        */
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
            {balances.map(({ token, raw }) => (
              <BalanceRow
                key={token.address}
                symbol={token.symbol}
                name={token.name}
                role={token.role}
                tone={token.tone}
                address={token.address}
                raw={raw}
                decimals={token.decimals}
                digits={digitsFor(token.decimals)}
                loading={isLoading}
              />
            ))}
          </div>

          <div className="px-4 py-3 border-t border-line bg-ink-950/40 text-micro text-subtle">
            Held in your wallet — separate from collateral posted to a market.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full-width balances card for pages with room for it.
 *
 * The caption matters as much as the numbers: on the positions page this sits
 * next to protocol-side collateral, and users conflate the two. Money in your
 * wallet and money posted to a market are different states with different
 * risks, so the card says so rather than assuming it's obvious.
 */
export function WalletBalancesCard() {
  const { address, isConnected } = useAccount();
  const { balances, isLoading } = useWalletBalances(address);

  if (!isConnected) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">Wallet balances</div>
        </div>
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconWallet className="w-5 h-5" />
            </div>
            <div className="empty-state-title">No wallet connected</div>
            <div className="empty-state-body">
              Connect a wallet to see your {TOKENS.map((t) => t.symbol).join(" and ")} balances.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Wallet balances</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Held in your wallet — not yet supplied or posted to a market.
          </div>
        </div>
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="link inline-flex items-center gap-1 font-mono text-body-sm flex-shrink-0"
        >
          {shortAddr(address)}
          <IconExternal className="w-3.5 h-3.5 opacity-60" />
        </a>
      </div>

      {/*
        Not `.card-body` here. Each row carries its own `px-3` so it can show a
        hover plate, and the previous `-mx-3` cancelled that against the old
        20px body padding to land back at the card's text margin. Now that
        `.card-body` is 24px, that negative margin would leave the rows 12px
        from the border while every other card in the app aligns at 24px.
        Padding the grid at 12px and letting the row's own 12px complete the
        inset keeps the text on the shared margin and gives the hover plate a
        gap to sit in.
      */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {balances.map(({ token, raw }) => (
          <BalanceRow
            key={token.address}
            symbol={token.symbol}
            name={token.name}
            role={token.role}
            tone={token.tone}
            address={token.address}
            raw={raw}
            decimals={token.decimals}
            digits={digitsFor(token.decimals)}
            loading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}
