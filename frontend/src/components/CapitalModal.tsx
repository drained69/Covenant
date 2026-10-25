import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { formatUnits } from "viem";
import {
  GAS_RESERVE,
  collateralNeeded,
  displayCollateral,
  displayLoan,
  fetchLenderOffer,
  fmtLoan,
  healthFactor,
  liquidationPrice,
  marketArgs,
  maxDebtFor,
  parseCollateralInput,
  parseLoanInput,
  useCollateralPrice,
  useCovenantPosition,
  useGateAuthorization,
  useScoreAuthorization,
} from "../hooks/useCovenant";
import { CREDIT, CREDIT_DEPLOYED, CREDIT_TOKENS, tierForScore, type TierKey } from "../config/credit";
import { CHAIN, MEZO_FAUCET_URL } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI, ETHOS_GATE_ABI } from "../config/abis";
import { useTx } from "../hooks/useTx";
import { describeError } from "../lib/errors";
import { IconCheck, IconExternal, IconX } from "./icons";
import { HealthFactor } from "./lending";

const MAX_UINT = 2n ** 256n - 1n;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const TITLE = `Borrow ${CREDIT_TOKENS.loan.symbol}`;
const SUBTITLE = `Fixed-rate ${CREDIT_TOKENS.loan.symbol} against ${CREDIT_TOKENS.collateral.symbol} collateral`;

/**
 * The borrow flow. The amount comes first; the collateral it needs and the
 * resulting health follow from it, then the three on-chain steps:
 *   1. Authorize the Ethos score at the tier gate (short-lived, wallet-bound)
 *   2. Post collateral (approve + supply)
 *   3. Fill the lender's signed offer
 * Each step re-reads chain state, so a returning borrower sees only what remains.
 */
export function CapitalModal({
  onClose,
  amountNeeded,
  market,
}: {
  onClose: () => void;
  amountNeeded?: number;
  /** The market the user opened. Borrowing a different tier than this is refused. */
  market?: TierKey;
}) {
  const { address } = useAccount();

  if (!CREDIT_DEPLOYED) {
    return (
      <Shell onClose={onClose}>
        <NotDeployedBody />
      </Shell>
    );
  }
  if (!address) {
    return (
      <Shell onClose={onClose}>
        <ConnectBody onClose={onClose} />
      </Shell>
    );
  }

  return <Flow address={address} onClose={onClose} amountNeeded={amountNeeded} market={market} />;
}

function Flow({
  address,
  onClose,
  amountNeeded,
  market,
}: {
  address: `0x${string}`;
  onClose: () => void;
  amountNeeded?: number;
  market?: TierKey;
}) {
  const loanSymbol = CREDIT_TOKENS.loan.symbol;
  const collateralSymbol = CREDIT_TOKENS.collateral.symbol;
  const { data: scoreAuth, isLoading: scoreLoading, isError: scoreError } = useScoreAuthorization();
  const price = useCollateralPrice();
  const allowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.collateralToken ?? undefined,
    chainId: CHAIN.id,
    functionName: "allowance",
    args: [address, CREDIT.covenant!],
    query: { enabled: CREDIT_DEPLOYED, refetchInterval: 10_000 },
  });

  const earned: TierKey = tierForScore(scoreAuth?.score ?? 0);
  const tier: TierKey = market ?? earned;
  const gate = useGateAuthorization(tier);
  const position = useCovenantPosition(tier);

  const [borrowInput, setBorrowInput] = useState(amountNeeded !== undefined ? amountNeeded.toFixed(2) : "");
  const [collateralInput, setCollateralInput] = useState("");
  const [borrowing, setBorrowing] = useState(false);
  const [sessionBorrowed, setSessionBorrowed] = useState<bigint | null>(null);
  const { send, pending } = useTx();

  const priceRaw = price.data as bigint | undefined;
  const debt = position.debt ?? 0n;
  const posted = position.collateral ?? 0n;
  const wallet = position.walletCollateral;
  const spendable = wallet === undefined ? undefined : (wallet > GAS_RESERVE ? wallet - GAS_RESERVE : 0n);

  const borrowRaw = parseLoanInput(borrowInput);
  const totalDebt = debt + borrowRaw;

  const neededCollateral = useMemo(() => {
    if (borrowRaw === 0n) return 0n;
    const total = collateralNeeded(tier, totalDebt, priceRaw);
    return total === undefined || total <= posted ? 0n : total - posted;
  }, [tier, borrowRaw, totalDebt, priceRaw, posted]);

  /** Suggested deposit: enough for a 1.5 health factor, never below the minimum, capped at what the wallet can spend. */
  const suggestedCollateral = useMemo(() => {
    if (neededCollateral === 0n) return 0n;
    const target = collateralNeeded(tier, (totalDebt * TARGET_HF_BPS) / 10_000n, priceRaw);
    let amount = target === undefined || target <= posted ? neededCollateral : target - posted;
    amount = roundUp(amount, CREDIT_TOKENS.collateral.decimals, 6);
    if (spendable !== undefined && amount > spendable) amount = spendable > neededCollateral ? spendable : neededCollateral;
    return amount;
  }, [neededCollateral, tier, totalDebt, priceRaw, posted, spendable]);

  const effectiveCollateralInput =
    collateralInput !== "" ? collateralInput : suggestedCollateral > 0n ? formatUnits(suggestedCollateral, CREDIT_TOKENS.collateral.decimals) : "";
  const depositRaw = parseCollateralInput(effectiveCollateralInput);

  const availableDebt = position.maxDebt !== undefined && position.maxDebt > debt ? position.maxDebt - debt : 0n;
  /** Most the wallet could borrow if it posted all spendable collateral as well. */
  const potentialMax = useMemo(() => {
    const cap = maxDebtFor(tier, posted + (spendable ?? 0n), priceRaw);
    return cap === undefined || cap <= debt ? 0n : cap - debt;
  }, [tier, posted, spendable, priceRaw, debt]);

  const scoreAuthorized = gate.data === true;
  const collateralReady = borrowRaw > 0n && neededCollateral === 0n;
  const plannedCollateral = collateralReady ? posted : posted + depositRaw;
  const hfAfter = borrowRaw > 0n ? healthFactor(maxDebtFor(tier, plannedCollateral, priceRaw), totalDebt) : undefined;
  const liqAfter = borrowRaw > 0n ? liquidationPrice(tier, totalDebt, plannedCollateral) : undefined;
  const lltvPct = (Number(CREDIT.markets[tier].lltv) / 1e16).toFixed(1);
  const ltvAfter =
    borrowRaw > 0n && priceRaw !== undefined && plannedCollateral > 0n
      ? Number(totalDebt) / Number((plannedCollateral * priceRaw) / 10n ** 36n)
      : undefined;
  const depositShort = spendable !== undefined && depositRaw > spendable;
  const exceedsCapacity = borrowRaw > potentialMax && borrowRaw > 0n;

  async function authorizeScore() {
    if (!scoreAuth) {
      toast.error("The credit service did not return a score authorization. Try again in a moment.");
      return;
    }
    const payload = scoreAuth.authorizations[tier];
    await send("Authorize Ethos score", {
      address: CREDIT.markets[tier].gate!,
      abi: ETHOS_GATE_ABI,
      functionName: "authorize",
      args: [
        [
          payload.authorization.wallet as `0x${string}`,
          BigInt(payload.authorization.score),
          BigInt(payload.authorization.deadline),
          BigInt(payload.authorization.nonce),
          BigInt(payload.authorization.chainId),
        ],
        [payload.signature.v, payload.signature.r as `0x${string}`, payload.signature.s as `0x${string}`],
      ],
    });
  }

  async function depositCollateral() {
    if (depositRaw <= 0n) return;
    if (((allowance.data as bigint | undefined) ?? 0n) < depositRaw) {
      const approved = await send(`Approve ${collateralSymbol}`, {
        address: CREDIT.collateralToken!,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CREDIT.covenant!, MAX_UINT],
      });
      if (!approved) return;
    }
    const hash = await send(`Deposit ${displayCollateral(depositRaw)} ${collateralSymbol}`, {
      address: CREDIT.covenant!,
      abi: COVENANT_ABI,
      functionName: "supplyCollateral",
      args: [marketArgs(tier), 0n, depositRaw, address],
    });
    if (hash) setCollateralInput("");
  }

  async function borrow() {
    if (borrowRaw <= 0n) return;
    setBorrowing(true);
    const t = toast.loading("Requesting a lender offer…");
    try {
      const signed = await fetchLenderOffer(tier, borrowRaw);
      toast.dismiss(t);
      const hash = await send(`Borrow ${displayLoan(borrowRaw)} ${loanSymbol}`, {
        address: CREDIT.covenant!,
        abi: COVENANT_ABI,
        functionName: "fillOffer",
        args: [offerToArgs(signed.offer), signed.notaryData as `0x${string}`, borrowRaw, address, address, ZERO, "0x"],
      });
      if (hash) {
        setSessionBorrowed(borrowRaw);
        setBorrowInput("");
      }
    } catch (error) {
      toast.error(`Borrow failed: ${describeError(error).slice(0, 180)}`, { id: t, duration: 10_000 });
    } finally {
      setBorrowing(false);
    }
  }

  const blocked = market !== undefined && scoreAuth !== undefined && market !== earned;
  const authDeadline = scoreAuth?.authorizations[tier]?.deadline;

  if (blocked) {
    const need = CREDIT.markets[market].threshold;
    return (
      <Shell onClose={onClose}>
        <div className="space-y-3">
          <h2 className="text-h3 text-slate-50">This market is not open to your score</h2>
          <p className="text-body-sm text-muted leading-relaxed">
            {cap(market)} lends at {lltvPct}% LTV and requires an Ethos score of {need.toLocaleString()}+.
            Your score is {scoreAuth.score.toLocaleString()}, which opens the {cap(earned)} market.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/markets/${earned}`} className="btn-primary btn-sm" onClick={onClose}>
              Go to {cap(earned)}
            </Link>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </Shell>
    );
  }

  if (sessionBorrowed !== null) {
    return (
      <Shell onClose={onClose}>
        <div className="text-center py-4 space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-ok/15 text-ok grid place-items-center">
            <IconCheck className="w-6 h-6" />
          </div>
          <h2 className="text-h3 text-slate-50">Borrowed {displayLoan(sessionBorrowed)} {loanSymbol}</h2>
          <p className="text-body-sm text-muted">
            The {loanSymbol} is in your wallet. Total debt in the {cap(tier)} market is {displayLoan(debt)} {loanSymbol},
            due {new Date(CREDIT.maturity * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Link to="/positions" className="btn-primary btn-sm" onClick={onClose}>View position</Link>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSessionBorrowed(null)}>Borrow more</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} badge={`${cap(tier)} · ${lltvPct}% LLTV`}>
      <div className="space-y-4">
        {/* Amount */}
        <div>
          <div className="flex items-center justify-between text-micro">
            <span className="field-label mb-0">You borrow</span>
            <span className="text-subtle">
              Max{" "}
              <button type="button" className="link font-semibold font-mono" onClick={() => setBorrowInput(fmtLoan(roundDown(potentialMax, CREDIT_TOKENS.loan.decimals, 2)))} disabled={potentialMax === 0n}>
                {displayLoan(potentialMax)}
              </button>{" "}
              {loanSymbol}
            </span>
          </div>
          <div className="mt-1.5 rounded-lg border border-line-strong bg-surface-raised px-4 py-3 flex items-center gap-3 focus-within:shadow-focus-ring">
            <input
              className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none font-mono text-[1.5rem] leading-tight tabular-nums text-slate-50 placeholder:text-subtle"
              placeholder="0.00"
              value={borrowInput}
              onChange={(e) => setBorrowInput(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              aria-label={`Amount of ${loanSymbol} to borrow`}
              autoFocus
            />
            <span className="text-body font-semibold text-slate-200">{loanSymbol}</span>
          </div>
          {exceedsCapacity && (
            <p className="mt-1.5 text-micro text-warn">
              More than your {collateralSymbol} can support at {lltvPct}% LTV.
              {(
                <>
                  {" "}Get more from the{" "}
                  <a href={MEZO_FAUCET_URL} target="_blank" rel="noreferrer" className="link">faucet</a>.
                </>
              )}
            </p>
          )}
        </div>

        {/* Projection */}
        <dl className="rounded-lg border border-line divide-y divide-line text-body-sm">
          <Line
            label="Collateral to add"
            value={
              borrowRaw === 0n
                ? "—"
                : neededCollateral === 0n
                  ? "None, already posted"
                  : `${displayCollateral(depositRaw)} ${collateralSymbol}`
            }
          />
          <Line label="Loan-to-value" value={ltvAfter === undefined ? "—" : `${(ltvAfter * 100).toFixed(1)}% / ${lltvPct}% max`} />
          <Line
            label="Health factor"
            value={
              <span>
                {debt > 0n ? <HealthFactor value={healthFactor(position.maxDebt, position.debt)} /> : <span className="text-subtle">∞</span>}
                <span className="text-subtle mx-1.5">→</span>
                {borrowRaw > 0n ? <HealthFactor value={hfAfter} /> : <span className="text-subtle">—</span>}
              </span>
            }
          />
          <Line label="Liquidation price" value={liqAfter === undefined ? "—" : `$${liqAfter.toLocaleString("en-US", { maximumFractionDigits: 0 })} per ${collateralSymbol}`} />
          <Line label="Rate" value={`0.00% fixed · repay ${borrowRaw > 0n ? displayLoan(totalDebt) : "1:1"} ${borrowRaw > 0n ? loanSymbol : ""}`} />
        </dl>

        {hfAfter !== undefined && hfAfter < 1.2 && (
          <p className="rounded-lg border border-warn/30 bg-warn/[0.06] px-3.5 py-2.5 text-micro text-warn leading-relaxed">
            {hfAfter < 1.01
              ? `At a health factor of ${hfAfter.toFixed(2)} this loan becomes liquidatable on almost any ${collateralSymbol} price drop.`
              : `At a health factor of ${hfAfter.toFixed(2)}, a ${((1 - 1 / hfAfter) * 100).toFixed(1)}% drop in ${collateralSymbol} makes this loan liquidatable.`}{" "}
            Deposit more collateral or borrow less.
          </p>
        )}

        {/* Steps */}
        <ol className="space-y-2">
          <Step
            index={1}
            title="Authorize Ethos score"
            done={scoreAuthorized}
            hint={
              scoreAuthorized
                ? `Active at the ${cap(tier)} gate${authDeadline ? ` until ${new Date(authDeadline * 1000).toISOString().slice(11, 16)} UTC` : ""}`
                : scoreLoading
                  ? "Fetching your signed score…"
                  : scoreError
                    ? "Credit service unreachable. Try again shortly."
                    : `Score ${scoreAuth?.score.toLocaleString() ?? "—"} · valid for six hours`
            }
            action={
              !scoreAuthorized && (
                <button className="btn-secondary btn-sm" onClick={authorizeScore} disabled={pending || !scoreAuth}>
                  Authorize
                </button>
              )
            }
          />
          <Step
            index={2}
            title={`Deposit ${collateralSymbol}`}
            done={collateralReady}
            hint={
              collateralReady
                ? `${displayCollateral(posted)} ${collateralSymbol} posted covers this loan`
                : borrowRaw === 0n
                  ? `${displayCollateral(posted)} ${collateralSymbol} posted · enter an amount above`
                  : `Minimum ${displayCollateral(neededCollateral)} · wallet ${spendable === undefined ? "—" : displayCollateral(spendable)} ${collateralSymbol}${" after gas"}`
            }
          >
            {!collateralReady && borrowRaw > 0n && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 rounded-md border border-line-strong bg-surface-raised px-3 py-1.5 flex items-center gap-2 focus-within:shadow-focus-ring">
                  <input
                    className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none font-mono text-body-sm tabular-nums text-slate-50"
                    value={effectiveCollateralInput}
                    onChange={(e) => setCollateralInput(e.target.value)}
                    inputMode="decimal"
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={`${collateralSymbol} to deposit`}
                  />
                  <span className="text-micro text-subtle">{collateralSymbol}</span>
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={depositCollateral}
                  disabled={pending || depositRaw <= 0n || depositShort}
                >
                  Deposit
                </button>
              </div>
            )}
            {depositShort && !collateralReady && (
              <p className="mt-1.5 text-micro text-warn">
                Not enough {collateralSymbol} in this wallet.
                {(
                  <>
                    {" "}
                    <a href={MEZO_FAUCET_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                      Mezo faucet <IconExternal className="w-3 h-3" />
                    </a>
                  </>
                )}
              </p>
            )}
          </Step>
          <Step
            index={3}
            title={`Borrow ${loanSymbol}`}
            done={false}
            hint={
              !scoreAuthorized
                ? "Authorize your score first. The gate checks it inside the borrow."
                : !collateralReady
                  ? "Deposit collateral first."
                  : `Fills a signed lender offer. ${displayLoan(availableDebt)} ${loanSymbol} available at current collateral.`
            }
          />
        </ol>

        <button
          type="button"
          className="btn-primary w-full"
          onClick={borrow}
          disabled={borrowing || pending || borrowRaw <= 0n || !scoreAuthorized || !collateralReady || borrowRaw > availableDebt}
        >
          {borrowing ? "Borrowing…" : borrowRaw > 0n ? `Borrow ${displayLoan(borrowRaw)} ${loanSymbol}` : "Enter an amount"}
        </button>
        <p className="text-micro text-subtle text-center leading-relaxed">
          Repaying and withdrawing collateral never require an Ethos score.
        </p>
      </div>
    </Shell>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Health factor the suggested deposit aims for, in basis points. */
const TARGET_HF_BPS = 15_000n;

function roundDown(raw: bigint, decimals: number, places: number): bigint {
  if (decimals <= places) return raw;
  const step = 10n ** BigInt(decimals - places);
  return (raw / step) * step;
}

/** Round a raw amount up to `places` decimals so suggested inputs stay readable. */
function roundUp(raw: bigint, decimals: number, places: number): bigint {
  if (decimals <= places) return raw;
  const step = 10n ** BigInt(decimals - places);
  return ((raw + step - 1n) / step) * step;
}

/* ── offer conversion ───────────────────────────────────────────────────── */

/** Service offer JSON → viem fillOffer tuple args. */
function offerToArgs(offer: Record<string, any>): readonly unknown[] {
  const market = offer.market;
  return [
    [
      market.loanToken,
      [[market.collateralParams[0].token, BigInt(market.collateralParams[0].lltv), BigInt(market.collateralParams[0].maxLif), market.collateralParams[0].oracle]],
      BigInt(market.maturity),
      BigInt(market.rcfThreshold),
      market.entryGate,
      market.seizureGate,
    ],
    offer.buy,
    offer.maker,
    BigInt(offer.start),
    BigInt(offer.expiry),
    BigInt(offer.tick),
    offer.group,
    offer.callback,
    offer.callbackData,
    offer.receiverIfMakerIsSeller,
    offer.notary,
    offer.reduceOnly,
    BigInt(offer.maxUnits),
    BigInt(offer.maxAssets),
  ] as const;
}

/* ── primitives ─────────────────────────────────────────────────────────── */

function Shell({ children, onClose, badge }: { children: React.ReactNode; onClose: () => void; badge?: string }) {
  /* Escape closes, body scroll locks, focus moves in on open and returns to the
     trigger on close, and Tab wraps inside the panel (aria-modal contract).
     `onClose` sits in a ref so a new identity per parent render doesn't re-run
     the effect mid-session. */
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Portaled: a transformed ancestor (the route transition wrapper) would otherwise
  // become the containing block for `position: fixed` and center the dialog on the page.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={TITLE}
        tabIndex={-1}
        className="modal-panel max-w-md outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div>
            <div className="flex items-center gap-2">
              <div className="card-title">{TITLE}</div>
              {badge && <span className="badge-neutral">{badge}</span>}
            </div>
            <div className="text-body-sm text-subtle mt-0.5">{SUBTITLE}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX className="w-4 h-4" />
          </button>
        </div>
        {/* overscroll-contain keeps a flick at the end of the panel from scrolling the locked page. */}
        <div className="card-body max-h-[75vh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Step({
  index,
  title,
  done,
  hint,
  action,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  hint: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className={`rounded-lg border px-3.5 py-3 ${done ? "border-ok/30 bg-ok/[0.04]" : "border-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold flex-shrink-0 ${
              done ? "bg-ok/15 text-ok" : "bg-ink-900 text-subtle border border-line-strong"
            }`}
          >
            {done ? <IconCheck className="w-3 h-3" /> : index}
          </span>
          <div className="min-w-0">
            <div className="text-body-sm font-semibold text-slate-100">{title}</div>
            <div className="text-micro text-subtle">{hint}</div>
          </div>
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-subtle">{label}</dt>
      <dd className="font-mono tabular-nums text-slate-100 text-right">{value}</dd>
    </div>
  );
}

function ConnectBody({ onClose }: { onClose: () => void }) {
  const { openConnectModal } = useConnectModal();
  return (
    <div className="empty-state py-8">
      <div className="empty-state-title">Connect a wallet to borrow</div>
      <p className="empty-state-body max-w-sm">
        Covenant reads your Ethos score and {CREDIT_TOKENS.collateral.symbol} balance to size the loan. Nothing is signed until you confirm.
      </p>
      <button
        type="button"
        className="btn-primary btn-sm mt-4"
        onClick={() => {
          onClose();
          openConnectModal?.();
        }}
      >
        Connect wallet
      </button>
    </div>
  );
}

function NotDeployedBody() {
  return (
    <div className="empty-state py-10">
      <div className="empty-state-title">Credit markets pending deployment</div>
      <p className="empty-state-body max-w-sm">
        {"The Mezo credit markets are not in this build's configuration. Borrowing stays closed until the Covenant, notary, and market addresses are set."}
      </p>
    </div>
  );
}

