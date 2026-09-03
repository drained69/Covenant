import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import toast from "react-hot-toast";
import {
  useDreamDexBook,
  useDreamDexMarkets,
  useDreamDexTape,
  useDreamDexPositions,
  useDreamDexQuoteBalance,
  useDreamDexTrader,
  useLivePrice,
  useMarketOnchain,
} from "../hooks/useDreamDex";
import { useEthosCredit } from "../hooks/useEthosScore";
import { useNow } from "../hooks/useNow";
import { useTradingCapacity } from "../hooks/useTradingCapacity";
import { CapitalModal } from "../components/CapitalModal";
import { EthosMark } from "../components/icons";
import { CREDIT_DEPLOYED } from "../config/credit";
import { CHAIN, EXPLORER } from "../config/chain";
import { describeError } from "../lib/errors";
import { countdown, fmtCents, fmtMoney, fmtUnits } from "../lib/format";
import {
  IconArrowLeft,
  IconExternal,
  IconInfo,
  IconOutcomeDown,
  IconOutcomeUp,
} from "../components/icons";

/**
 * DreamDEX Event Contract detail: live book on the left, the Up/Down order
 * panel on the right.
 *
 * Outcome 0 is the market's YES side — for price-direction Event Contracts
 * that is UP; outcome 1 is DOWN. The panel always follows the selected
 * outcome's own tradable symbol, so a DOWN order is a real buy of the NO
 * token, not a synthesized inverse of the YES book.
 */
export function DreamDexMarketDetail() {
  const { marketId } = useParams<{ marketId: string }>();
  const { data: markets, isLoading, refetch: refetchMarkets } = useDreamDexMarkets();
  const market = markets?.find((item) => item.id === marketId);
  const up = market?.outcomes?.[0];
  const down = market?.outcomes?.[1];

  const [outcome, setOutcome] = useState<"up" | "down">("up");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("5");
  const [submitting, setSubmitting] = useState(false);

  const symbol = outcome === "up" ? up?.symbol : down?.symbol;
  const trader = useDreamDexTrader();
  const quote = useDreamDexQuoteBalance();
  const positions = useDreamDexPositions();
  const { data: ethos, tier } = useEthosCredit();
  const capacity = useTradingCapacity();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const now = useNow();

  const marketInfo = market?.info.marketType === "BINARY" ? market.info : undefined;
  // The book streams off the venue tail and follows the selected outcome, so a
  // DOWN order books against real NO liquidity rather than an inverted YES.
  const { data: book, isLive: bookLive } = useDreamDexBook(marketInfo, outcome);
  const tape = useDreamDexTape(marketInfo, 12);
  const live = useLivePrice(marketInfo?.asset);
  const onchain = useMarketOnchain(marketId);

  const ask = book?.asks[0]?.[0];
  const bid = book?.bids[0]?.[0];
  const mid = useMemo(
    () => (ask !== undefined && bid !== undefined ? (ask + bid) / 2 : ask ?? bid),
    [ask, bid],
  );
  // A buy crosses the ask, a sell hits the bid; fall back to the other touch,
  // then to a 50/50 prior until the book materializes.
  const price = useMemo(
    () => (side === "buy" ? ask ?? bid ?? 0.5 : bid ?? ask ?? 0.5),
    [side, ask, bid],
  );

  // Strike is raw in the oracle's 1e18 price scale (same scale as the live
  // feed's `raw` strings) — divide through to human dollars before comparing
  // against `live.data.price`, which the SDK already scales to human units.
  const strike =
    marketInfo && marketInfo.strike !== "0" ? Number(marketInfo.strike) / 1e18 : undefined;
  const aboveStrike =
    live.data && strike !== undefined ? live.data.price - strike : undefined;

  const contracts = Number(amount);
  const notional = Number.isFinite(contracts) ? contracts * price : 0;

  /* The credit line: on-chain when deployed, preview otherwise. Either way
     the panel's capacity figure comes from the shared useTradingCapacity
     hook — the same number the header and homepage quote. */
  const [capitalOpen, setCapitalOpen] = useState(false);

  // Real spends are bounded by the wallet's actual collateral — available
  // credit requires borrowing it first (one click below).
  const spendLimit = capacity.available;
  const overCapacity =
    side === "buy" && isConnected && !capacity.isLoading && notional > spendLimit;

  /* The wallet's standing position in THIS market, if any — the sell flow's
     "what can I actually sell" number and the panel's position chip. */
  const held = positions.data?.find((p) => p.market.id === marketId);
  const heldDecimals = held?.market.quoteDecimals ?? quote.decimals;
  const heldUp = held ? Number(fmtUnits(held.balanceYes, heldDecimals, 2)) : 0;
  const heldDown = held ? Number(fmtUnits(held.balanceNo, heldDecimals, 2)) : 0;
  const heldSelected = outcome === "up" ? heldUp : heldDown;

  /* Quick-size ceiling: buys are bounded by collateral (units of collateral
     per contract ≈ price), sells by the contracts actually held. */
  const maxContracts =
    side === "buy"
      ? capacity.available > 0 && price > 0
        ? Math.floor((capacity.available / price) * 100) / 100
        : undefined
      : heldSelected > 0
        ? heldSelected
        : undefined;

  if (isLoading)
    return (
      <section className="shell py-16">
        <div className="skeleton h-8 w-72" />
      </section>
    );
  if (!market || !symbol) {
    // Distinguish three possible states from useMarketOnchain:
    //   - onchain status says Trading (1) → indexer lags the chain; a refetch
    //     usually resolves this within one interval, so we say "syncing" and
    //     surface a manual retry rather than a dead-end "unavailable".
    //   - onchain status says Locked/Resolved/Voided → the market's window
    //     is genuinely closed; the empty state should say so with the
    //     specific terminal state, so redemption is discoverable.
    //   - onchain read itself failed → truly unavailable / unknown marketId.
    const onchainStatus = onchain.data?.status;
    const isSyncing = onchainStatus === 1;
    const terminal =
      onchainStatus === 2 ? "Settlement in progress"
      : onchainStatus === 4 ? "Market resolved — redeem winning outcome tokens"
      : onchainStatus === 5 ? "Market voided — both sides redeem at 0.5"
      : null;
    return (
      <section className="shell py-16">
        <div className="card empty-state">
          <div className="empty-state-title">
            {isSyncing ? "Waiting for indexer" : terminal ? "Market closed" : "Market unavailable"}
          </div>
          <div className="empty-state-body">
            {isSyncing
              ? "The market is trading on-chain but the indexer has not caught up yet — usually only a moment."
              : terminal
                ? terminal
                : "This Event Contract is no longer in the active list. The market id may have expired or the indexer could not be reached."}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => refetchMarkets()}
              className="btn-secondary btn-sm"
              disabled={isLoading}
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
            <Link to="/markets" className="btn-secondary btn-sm">
              Back to markets
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const info = marketInfo;
  const expiresAt = info ? Number(info.expiry) * 1000 : undefined;
  const tradingOpen = expiresAt !== undefined && expiresAt > now;

  async function submit() {
    if (!symbol || !Number.isFinite(contracts) || contracts <= 0) return;
    const t = toast.loading("Placing order — confirm in wallet…");
    setSubmitting(true);
    try {
      const order = await trader.placeOrder(marketId!, symbol, side, contracts, price);
      const filled = order.filled > 0 ? `${order.filled} filled` : "no fill";
      const resting = order.remaining > 0 ? ` · ${order.remaining} resting` : "";
      const tx = order.txHash ? (
        <>
          {" "}
          <a
            href={`${EXPLORER}/tx/${order.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline inline-flex items-center gap-0.5"
          >
            tx <IconExternal className="w-3 h-3" />
          </a>
        </>
      ) : null;
      toast.success(
        <span>
          {side === "buy" ? "Bought" : "Sold"} {outcome === "up" ? "UP" : "DOWN"} · {filled}
          {resting}
          {tx}
        </span>,
        { id: t, duration: 8_000 },
      );
      await trader.refresh();
    } catch (error) {
      toast.error(`Order failed: ${describeError(error).slice(0, 180)}`, {
        id: t,
        duration: 10_000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled =
    submitting ||
    !Number.isFinite(contracts) ||
    contracts <= 0 ||
    overCapacity ||
    (side === "sell" && heldSelected < contracts) ||
    onchain.data !== undefined && onchain.data.status !== 1;

  return (
    <section className="shell py-8 space-y-6">
      <Link to="/markets" className="link inline-flex items-center gap-1.5 text-body-sm">
        <IconArrowLeft className="w-3.5 h-3.5" />
        All Event Contracts
      </Link>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6">
          <div className="card">
            <div className="card-body">
              <div className="flex flex-wrap items-center gap-2">
                {/* Status verified against the chain, not the indexer — the
                    indexer trails by seconds and the pool is the authority on
                    whether an order can land at all. */}
                <OnchainStatusBadge status={onchain.data?.status} />
                <span className="badge-neutral">{info?.asset ?? "Event"}</span>
                {info?.interval && <span className="badge-neutral">{info.interval} window</span>}
              </div>
              <h1 className="mt-5 text-h3 sm:text-h2 md:text-h1 text-slate-50 max-w-3xl leading-tight">
                {info?.question ?? market.base}
              </h1>
              <p className="mt-3 text-body-sm text-subtle">
                Settles against the oracle price at expiry. UP pays 1 collateral per contract
                if the market resolves above the strike; DOWN pays 1 otherwise.
              </p>

              {/* Ground truth: the live EMA oracle price for the underlying,
                  from the same feed the market settles against, marked against
                  the strike. This is the reference the whole trade is a view
                  on, so it gets hero treatment above the book. */}
              {live.data && (
                <div className="mt-5 rounded-lg border border-line bg-ink-900/50 p-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
                  <div>
                    <div className="stat-label">{info?.asset} live · oracle EMA</div>
                    <div className="mt-1 font-mono text-h3 text-slate-50 tabular-nums">
                      ${live.data.price.toLocaleString(undefined, { maximumFractionDigits: live.data.price < 100 ? 2 : 0 })}
                    </div>
                  </div>
                  {strike !== undefined && (
                    <div className="text-right">
                      <div className="stat-label">Strike</div>
                      <div className="mt-1 font-mono text-body-lg text-slate-200 tabular-nums">
                        ${strike.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  )}
                  {aboveStrike !== undefined && (
                    <div className="text-right">
                      <div className="stat-label">Price vs strike</div>
                      <div
                        className={`mt-1 font-mono text-body-lg font-semibold tabular-nums ${
                          aboveStrike >= 0 ? "text-ok" : "text-bad"
                        }`}
                      >
                        {aboveStrike >= 0 ? "+" : "−"}$
                        {Math.abs(aboveStrike).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {" · "}
                        {aboveStrike >= 0 ? "UP leads" : "DOWN leads"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* The probability hero: UP/DOWN in cents at figure scale, with the
                market's telemetry beneath. Cents are the event-contract unit —
                a UP share costs 62¢ and pays $1 — so the hero doubles as the
                payout reference for the panel below. */}
            <div className="border-t border-line grid grid-cols-2 divide-x divide-line">
              <div className="p-4 md:p-5">
                <div className="stat-label">Up</div>
                <div className="mt-1 font-mono text-[1.75rem] leading-tight font-semibold text-ok tabular-nums tracking-[-0.02em]">
                  {fmtCents(mid)}
                </div>
              </div>
              <div className="p-4 md:p-5">
                <div className="stat-label">Down</div>
                <div className="mt-1 font-mono text-[1.75rem] leading-tight font-semibold text-bad tabular-nums tracking-[-0.02em]">
                  {fmtCents(mid !== undefined ? 1 - mid : undefined)}
                </div>
              </div>
            </div>
            <div className="border-t border-line grid grid-cols-2 sm:grid-cols-3 divide-x divide-line">
              <Metric
                label="Volume"
                value={
                  info && info.quoteDecimals
                    ? fmtMoney(Number(info.cumulativeQuoteVolume) / 10 ** info.quoteDecimals)
                    : "—"
                }
              />
              <Metric
                label="Spread"
                value={ask !== undefined && bid !== undefined ? `${((ask - bid) * 100).toFixed(1)}¢` : "—"}
              />
              <Metric
                label="Settles in"
                value={expiresAt !== undefined ? (tradingOpen ? countdown(expiresAt / 1000, now) : "settled") : "—"}
                tone={tradingOpen && expiresAt! - now < 3_600_000 ? "warn" : undefined}
                mono
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Order book</div>
                <div className="text-body-sm text-subtle mt-0.5">
                  {outcome === "up" ? "UP" : "DOWN"} book · implied probability ·
                  bar depth = size
                </div>
              </div>
              {/* The book is event-sourced off the venue socket, so this is a
                  real connection state, not decoration: "Streaming" means the
                  levels below update as OrderPlaced logs land. */}
              <span className={bookLive ? "badge-ok" : "badge-neutral"}>
                {bookLive ? "Streaming" : "DreamDEX"}
              </span>
            </div>
            <div className="card-body grid grid-cols-2 gap-6">
              <BookSide title="Bids" levels={book?.bids ?? []} tone="up" />
              <BookSide title="Asks" levels={book?.asks ?? []} tone="down" />
            </div>
          </div>

          {/* The trade tape. Fills arrive over the same subscription that feeds
              the book, newest first — the clearest evidence to a trader that
              this surface is tailing the venue rather than polling it. */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Recent fills</div>
                <div className="text-body-sm text-subtle mt-0.5">
                  Live tape from the DreamDEX pool
                </div>
              </div>
              <span className="badge-neutral tabular-nums">{tape.length}</span>
            </div>
            <div className="card-body">
              {tape.length === 0 ? (
                <p className="text-body-sm text-subtle">
                  No fills yet in this window.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {tape.map((fill) => (
                    <li
                      key={fill.id}
                      className="flex items-center justify-between gap-4 py-2 text-body-sm"
                    >
                      <span className="font-mono text-micro text-subtle">
                        #{fill.blockNumber}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          fill.takerIsBid ? "text-ok" : "text-bad"
                        }`}
                      >
                        {marketInfo
                          ? (Number(fill.fillPrice) / 10 ** marketInfo.quoteDecimals).toFixed(3)
                          : "—"}
                      </span>
                      <span className="font-mono tabular-nums text-subtle">
                        {marketInfo
                          ? (Number(fill.quantity) / 10 ** marketInfo.baseDecimals).toFixed(2)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="card lg:sticky lg:top-24">
          <div className="card-header">
            <div>
              <div className="card-title">Trade this event</div>
              <div className="text-body-sm text-subtle mt-0.5">
                {isConnected ? `${side === "buy" ? "Buy" : "Sell"} · limit IOC` : "Connect a Somnia wallet"}
              </div>
            </div>
            <span className="badge-info">{tier.name}</span>
          </div>
          <div className="card-body space-y-5">
            {/* Outcome selection. Two full-width buttons, not a segmented
                control: the direction IS the trade, so it gets the largest
                touch target on the panel — the prediction-market idiom
                (Polymarket, Kalshi). Each carries its own live price so the
                choice is made against a number, not a color. */}
            <div className="grid grid-cols-2 gap-3">
                <OutcomeButton
                 label="Up"
                 price={mid}
                 tone="ok"
                 icon={<IconOutcomeUp className="w-4 h-4" />}
                 active={outcome === "up"}
                 onClick={() => setOutcome("up")}
               />
                <OutcomeButton
                 label="Down"
                 price={mid !== undefined ? 1 - mid : undefined}
                 tone="bad"
                 icon={<IconOutcomeDown className="w-4 h-4" />}
                 active={outcome === "down"}
                 onClick={() => setOutcome("down")}
               />
            </div>

            {/* The DOWN button shows the DOWN mid derived from the UP book.
                When the trader flips to DOWN the panel switches to the DOWN
                tradable's own book — the selector prices are orientation,
                the execution price below is the real one. */}
             <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-ink-900 border border-line">
              <Choice active={side === "buy"} onClick={() => setSide("buy")}>
                Buy
              </Choice>
              <Choice active={side === "sell"} onClick={() => setSide("sell")}>
                Sell
              </Choice>
            </div>

            <label className="field">
              <span className="field-label">
                Contracts{heldSelected > 0 && side === "sell" ? ` · holding ${heldSelected}` : ""}
              </span>
              <input
                className="field-input font-mono tabular-nums"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                spellCheck={false}
                autoComplete="off"
              />
            </label>

            {maxContracts !== undefined && maxContracts > 0 && (
              <div className="flex gap-1.5">
                {[0.25, 0.5, 1].map((frac) => {
                  const size = (Math.floor(maxContracts * frac * 100) / 100).toString();
                  return (
                    <button
                      key={frac}
                      onClick={() => setAmount(size)}
                      className={`btn btn-sm flex-1 ${
                        amount === size ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      {frac === 1 ? "Max" : `${frac * 100}%`}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Order economics, then the two numbers that gate it: spendable
                capacity and the Ethos signal that informs it. Capacity is
                quoted exactly as the header and homepage quote it (same
                hook), so the three surfaces can never disagree. */}
             <div className="rounded-lg border border-line bg-ink-900 p-4 space-y-2.5 text-body-sm">
              <Row label="Limit price" value={pct(price)} />
              <Row
                label="Total notional"
                value={`${notional.toFixed(2)} ${quote.symbol}`}
                strong
              />
              <div className="pt-2.5 border-t border-line space-y-2.5">
                <div className="flex justify-between gap-4">
                  <span className="text-subtle inline-flex items-center gap-1.5">
                    <EthosMark className="w-3 h-3 text-ethos-600" />
                    Ethos credibility
                  </span>
                  <span className="font-mono tabular-nums text-ethos-600">
                    {(ethos?.score ?? 0).toLocaleString()}
                    <span className="ml-1.5 text-micro text-muted font-sans font-medium">
                      {tier.name}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {CREDIT_DEPLOYED && (
              <button
                className="btn-secondary w-full"
                onClick={() => setCapitalOpen(true)}
              >
                Get trading capital{overCapacity ? ` · need ${(notional - spendLimit).toFixed(2)} ${quote.symbol}` : ""}
              </button>
            )}

            {overCapacity && (
              <p className="text-body-sm text-bad">
                Notional exceeds your available trading capacity. Get more capital or size down.
              </p>
            )}

            {!isConnected ? (
              <button className="btn-primary w-full" onClick={openConnectModal}>
                Connect wallet
              </button>
            ) : !trader.onSomnia ? (
              <button
                className="btn-primary w-full"
                onClick={() => switchChain({ chainId: CHAIN.id })}
              >
                Switch to {CHAIN.name}
              </button>
            ) : (
              /* The action button takes the selected outcome's tone rather
                 than the brand accent. This is a deliberate deviation from
                 "one accent button per view": in a prediction market the
                 direction IS the semantic content of the action, and the
                 color is the last line of defense against fat-fingering UP
                 for DOWN. Sells stay neutral — closing a position has no
                 direction. Disabled with a live reason when the chain says
                 the window is closed. */
              <button
                className={`btn w-full ${
                  side === "buy"
                    ? outcome === "up"
                      ? "bg-ok text-ink-950 hover:bg-ok/90"
                      : "bg-bad text-ink-950 hover:bg-bad/90"
                    : "btn-primary"
                }`}
                onClick={submit}
                disabled={submitDisabled}
              >
                {submitting
                  ? "Submitting…"
                  : onchain.data !== undefined && onchain.data.status !== 1
                    ? "Trading closed on-chain"
                    : `${side === "buy" ? "Buy" : "Sell"} ${outcome === "up" ? "UP" : "DOWN"} · ${notional.toFixed(2)} ${quote.symbol}`}
              </button>
            )}

            <p className="text-micro text-subtle leading-relaxed">
              Orders are immediate-or-cancel limit orders routed through the official DreamDEX
              SDK. Review the wallet transaction before confirming. Reputation tiers gate new
              credit, never exits.
            </p>
          </div>
        </div>
      </div>

      {capitalOpen && (
        <CapitalModal
          onClose={() => setCapitalOpen(false)}
          amountNeeded={overCapacity ? Math.ceil((notional - spendLimit) * 100) / 100 : undefined}
        />
      )}
    </section>
  );
}

/* ── panel primitives ──────────────────────────────────────────────── */

/** One of the two outcome buttons. Selected = tinted plate; price always shown. */
function OutcomeButton({
  label,
  price,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string;
  price: number | undefined;
  tone: "ok" | "bad";
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const activeTone =
    tone === "ok"
      ? "border-ok/50 bg-ok/[0.09] text-ok"
      : "border-bad/50 bg-bad/[0.09] text-bad";
  return (
      <button
       type="button"
       onClick={onClick}
      aria-pressed={active}
      /* Same press contract as .btn: color+border transitions and a 3%
         squeeze on press. These controls sit outside .btn, so the feedback
         must be re-declared here. */
      className={`rounded-lg border py-3 px-4 flex flex-col items-center gap-1.5
                  transition-[color,border-color,background-color,transform] duration-150 ease-out
                  active:scale-[0.97] ${
                    active ? activeTone : "border-line bg-ink-900/60 text-subtle hover:text-slate-200 hover:border-line-strong"
                  }`}
    >
      <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold uppercase">
        {icon}
        {label}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {fmtCents(price)}
      </span>
    </button>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      /* Press feedback mirrors .btn (these live outside it): instant release,
         150ms squeeze in. The active plate carries the state — motion is
         feedback, never the signal. */
      className={
        active
          ? "rounded-md bg-brand-400 text-ink-950 py-2 text-body-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.97]"
          : "rounded-md py-2 text-body-sm font-semibold text-subtle hover:text-slate-50 transition-colors duration-150"
      }
    >
      {children}
    </button>
  );
}

function Row({
  label,
  value,
  strong,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      {/* The hint is a `data-tip` on a focusable span, not a `title` attr or a
          raw `ⓘ` text glyph: titles never fire for keyboard or touch users,
          and a Unicode glyph ignores the icon set's stroke contract. The span
          takes tabIndex so the tooltip's :focus-visible path stays reachable. */}
      <span className="text-subtle" data-tip={hint} tabIndex={hint ? 0 : undefined}>
        {label}
        {hint && <IconInfo className="ml-1 w-3 h-3 opacity-60" />}
      </span>
      <span className={`font-mono tabular-nums ${strong ? "text-slate-50 font-semibold" : "text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}

/* ── market + book primitives ─────────────────────────────────────── */

/** MarketStatus enum on the BinaryMarket contract: 0-5. */
const ONCHAIN_STATUS: Record<number, { label: string; cls: string }> = {
  0: { label: "Listed", cls: "badge-neutral" },
  1: { label: "Trading · verified on-chain", cls: "badge-ok" },
  2: { label: "Locked", cls: "badge-warn" },
  3: { label: "Settling", cls: "badge-warn" },
  4: { label: "Resolved", cls: "badge-info" },
  5: { label: "Voided", cls: "badge-bad" },
};

/**
 * The market's lifecycle state as the CONTRACT sees it. The indexer trails the
 * chain; when the badge says Trading the pool will accept an order, and when
 * it stops saying so the order path is already disabled.
 */
function OnchainStatusBadge({ status }: { status: number | undefined }) {
  if (status === undefined) {
    return (
      <span className="badge-neutral">
        <span className="status-dot-idle" />
        Reading chain…
      </span>
    );
  }
  const s = ONCHAIN_STATUS[status] ?? { label: `Status ${status}`, cls: "badge-neutral" };
  return (
    <span className={s.cls}>
      <span className={`status-dot ${status === 1 ? "status-dot-ok" : status === 2 || status === 3 ? "status-dot-warn" : "status-dot-idle"}`} />
      {s.label}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "warn";
  mono?: boolean;
}) {
  const toneClass =
    tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-slate-50";
  return (
    <div className="p-4">
      <div className="stat-label">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${toneClass} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

const pct = (p: number | undefined) => (p !== undefined ? `${(p * 100).toFixed(1)}%` : "—");

/**
 * One side of the book with depth bars. Bar width is the level's size
 * relative to the largest size on display, and bars grow toward the CENTER
 * divide (bids anchored right, asks anchored left) so the two columns read
 * as mirror images meeting at the spread — the shape of the liquidity is
 * visible before any number is read.
 */
function BookSide({
  title,
  levels,
  tone,
}: {
  title: string;
  levels: [number, number][];
  tone: "up" | "down";
}) {
  const shown = levels.slice(0, 8);
  const maxSize = Math.max(0, ...shown.map(([, size]) => size));
  const barTone = tone === "up" ? "bg-ok/[0.08]" : "bg-bad/[0.08]";
  const priceTone = tone === "up" ? "text-ok" : "text-bad";
  const anchor = tone === "up" ? "right-0" : "left-0";

  return (
    <div>
      <div className="flex justify-between text-micro uppercase text-subtle pb-2 border-b border-line">
        <span>{title}</span>
        <span>Price · Size</span>
      </div>
      <div className="divide-y divide-line/60">
        {shown.map(([price, size], index) => (
          <div key={`${price}-${index}`} className="relative py-2.5 flex justify-between font-mono text-body-sm">
            {/* Depth bars transition width so a poll refresh reshapes the
                book instead of snapping it — the liquidity "breathes". */}
            <div
              className={`absolute inset-y-0.5 ${anchor} rounded-sm ${barTone} transition-[width] duration-300 ease-out`}
              style={{ width: `${maxSize > 0 ? (size / maxSize) * 100 : 0}%` }}
              aria-hidden="true"
            />
            <span className={`relative ${priceTone}`}>{fmtCents(price)}</span>
            <span className="relative text-slate-300 tabular-nums">{size.toFixed(2)}</span>
          </div>
        ))}
        {levels.length === 0 && (
          <div className="py-8 text-center text-body-sm text-subtle">No liquidity</div>
        )}
      </div>
    </div>
  );
}
