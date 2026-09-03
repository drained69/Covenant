import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { formatUnits } from "viem";
import {
  collateralNeeded,
  borrowWithVolatilityBuffer,
  fetchLenderOffer,
  fmtCollateral,
  fmtLoan,
  marketArgs,
  parseCollateralInput,
  parseLoanInput,
  useCollateralPrice,
  useCovenantPosition,
  useGateAuthorization,
  useScoreAuthorization,
} from "../hooks/useCovenant";
import { CREDIT, CREDIT_DEPLOYED, tierForScore, type TierKey } from "../config/credit";
import { CHAIN } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI, ETHOS_GATE_ABI } from "../config/abis";
import { useTx } from "../hooks/useTx";
import { describeError } from "../lib/errors";
import { IconCheck, IconX } from "./icons";

/**
 * Get trading capital — the borrow flow, presented as a checklist rather than
 * a wizard.
 *
 * The lending engine stays invisible until the trader asks for capital; when
 * they do, the three on-chain steps are exactly what the protocol requires,
 * each with its own action and live state:
 *
 *   1. Authorize the Ethos score at the tier gate (short-lived, wallet-bound)
 *   2. Post tBTC collateral (approve + supply)
 *   3. Borrow tUSDC by filling the lender's signed offer
 *
 * Every step re-checks on-chain state after a transaction, so the checklist
 * fills itself in as the trader progresses — and a returning borrower with
 * collateral already posted sees only the steps that remain.
 */
export function CapitalModal({ onClose, amountNeeded }: { onClose: () => void; amountNeeded?: number }) {
  const { address } = useAccount();

  if (!CREDIT_DEPLOYED || !address) {
    return (
      <Shell onClose={onClose}>
        <NotDeployedBody />
      </Shell>
    );
  }

  return <Flow address={address} onClose={onClose} amountNeeded={amountNeeded} />;
}

function Flow({ address, onClose, amountNeeded }: { address: `0x${string}`; onClose: () => void; amountNeeded?: number }) {
  const { data: scoreAuth } = useScoreAuthorization();
  const price = useCollateralPrice();
  /* Live tBTC allowance the Covenant contract may pull. Approve must fire
     when ALLOWANCE is short — the previous condition gated on the wallet's
     BALANCE being short, which approved exactly when the deposit was doomed
     and skipped the approve exactly when it was needed. */
  const allowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.collateralToken ?? undefined,
    chainId: CHAIN.id,
    functionName: "allowance",
    args: address ? [address, CREDIT.covenant!] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });

  const tier: TierKey = tierForScore(scoreAuth?.score ?? 0);
  const gate = useGateAuthorization(tier);
  const position = useCovenantPosition(tier);

  const [borrowInput, setBorrowInput] = useState(
    amountNeeded !== undefined ? amountNeeded.toFixed(2) : "",
  );
  const [collateralInput, setCollateralInput] = useState("");
  const [borrowing, setBorrowing] = useState(false);

  const { send, pending } = useTx();

  const priceRaw = price.data as bigint | undefined;

  const availableDebt = useMemo(() => {
    const maxDebt = position.maxDebt ?? 0n;
    const debt = position.debt ?? 0n;
    return maxDebt > debt ? maxDebt - debt : 0n;
  }, [position.maxDebt, position.debt]);

  const hasBorrowCapacity = availableDebt > 0n;
  // Default to the largest user-requested amount whose 10% reserve still fits
  // the current capacity. This keeps the empty field usable at the limit.
  const maxRequestedBorrow = (availableDebt * 100n) / 110n;
  const effectiveBorrowInput =
    borrowInput !== "" ? borrowInput : fmtLoan(maxRequestedBorrow);
  const requestedBorrowRaw = parseLoanInput(effectiveBorrowInput);
  // Apply the reserve before capacity and collateral checks. The buffer must
  // never bypass the protocol's collateral-backed borrowing limit.
  const borrowRaw = borrowWithVolatilityBuffer(requestedBorrowRaw);

  const neededCollateral = useMemo(() => {
    const totalDebt = (position.debt ?? 0n) + borrowRaw;
    const totalNeeded = collateralNeeded(tier, totalDebt, priceRaw);
    const posted = position.collateral ?? 0n;
    return totalNeeded === undefined || totalNeeded <= posted ? 0n : totalNeeded - posted;
  }, [tier, borrowRaw, priceRaw, position.debt, position.collateral]);

  const effectiveCollateralInput =
    collateralInput !== "" ? collateralInput : formatUnits(neededCollateral ?? 0n, 8);

  // Keep the first-open calculation useful when the wallet already has a position.
  const borrowHint = fmtLoan(availableDebt);

  const scoreAuthorized = (gate.data as boolean | undefined) === true;
  const walletTBtc = position.walletCollateral;

  // "Done" is per-transaction, not per-lifetime.
  //
  // Before: the modal marked Post/Borrow as DONE the moment ANY collateral
  // was on-chain or ANY debt was open, so a user opening it to add more
  // saw three green checks and a disabled borrow button — the wrong
  // signal: "you've completed something" instead of "here is what THIS
  // transaction needs".
  //
  // After: Post is done only when the currently-desired debt is fully
  // supported by already-posted collateral (i.e. no top-up needed for the
  // amount typed into the Borrow field). Borrow is only ever marked done
  // as a session-scoped flag flipped after a successful `fillOffer` in
  // this modal — never inferred from a prior debt balance.
  const collateralSufficient = neededCollateral === 0n;
  const [sessionBorrowed, setSessionBorrowed] = useState(false);

  async function authorizeScore() {
    if (!scoreAuth) {
      toast.error("Credit service unavailable — try again in a moment.");
      return;
    }
    const payload = scoreAuth.authorizations[tier];
    await send("Authorize score", {
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
        [
          payload.signature.v,
          payload.signature.r as `0x${string}`,
          payload.signature.s as `0x${string}`,
        ],
      ],
    });
  }

  async function depositCollateral() {
    const raw = parseCollateralInput(effectiveCollateralInput);
    if (raw <= 0n) return;

    // Approve only when the Covenant contract's pull allowance is short —
    // otherwise the deposit reverts with an ERC-20 allowance error after the
    // user already signed the supply. Infinite approval once (demo friction).
    if (((allowance.data as bigint | undefined) ?? 0n) < raw) {
      await send("Approve tBTC", {
        address: CREDIT.collateralToken!,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CREDIT.covenant!, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
      });
    }
    await send("Deposit collateral", {
      address: CREDIT.covenant!,
      abi: COVENANT_ABI,
      functionName: "supplyCollateral",
      args: [marketArgs(tier), 0n, raw, address],
    });
  }

  async function borrow() {
    if (borrowRaw <= 0n) return;
    setBorrowing(true);
    const t = toast.loading("Preparing lender offer…");
    try {
      const signed = await fetchLenderOffer(tier, borrowRaw);
      toast.loading("Borrow — confirm in wallet…", { id: t });
      await send("Borrow tUSDC", {
        address: CREDIT.covenant!,
        abi: COVENANT_ABI,
        functionName: "fillOffer",
        args: [offerToArgs(signed.offer), signed.notaryData as `0x${string}`, borrowRaw, address, address, "0x0000000000000000000000000000000000000000", "0x"],
      });
      // Session-scoped: this is what makes step 3 read as done. Not a
      // persisted flag — reopening the modal starts a fresh session.
      setSessionBorrowed(true);
      toast.dismiss(t);
    } catch (error) {
      toast.error(`Borrow failed: ${describeError(error).slice(0, 180)}`, {
        id: t,
        duration: 10_000,
      });
    } finally {
      setBorrowing(false);
    }
  }

  const lltvPct = ((Number(CREDIT.markets[tier].lltv) / 1e18) * 100).toFixed(1);
  const reserve = borrowRaw > requestedBorrowRaw ? borrowRaw - requestedBorrowRaw : 0n;
  const totalDebt = (position.debt ?? 0n) + borrowRaw;

  return (
    <Shell onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-ink-900/60 p-4 grid grid-cols-3 gap-4">
          <Mini label="Ethos score" value={scoreAuth ? scoreAuth.score.toLocaleString() : "…"} />
          <Mini label="Tier" value={scoreAuth?.tier ?? "…"} />
          <Mini label="Max LTV" value={`${lltvPct}%`} />
        </div>

        <div className="rounded-lg border border-brand-500/25 bg-brand-500/[0.04] p-4 space-y-3">
          <div>
            <div className="section-label text-brand-300">Your trading terms</div>
            <p className="mt-1 text-body-sm text-slate-300">
              Ethos is used to select your credit tier. The tier sets the maximum loan-to-value;
              the oracle price and your posted tBTC set the actual limit.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-body-sm">
            <Term label="Ethos score" value={scoreAuth ? scoreAuth.score.toLocaleString() : "Loading…"} />
            <Term label="Tier" value={tier[0].toUpperCase() + tier.slice(1)} />
            <Term label="Maximum LTV" value={`${lltvPct}%`} />
            <Term label="Available before reserve" value={`${fmtLoan(availableDebt)} tUSDC`} />
            <Term label="Total debt after borrow" value={`${fmtLoan(totalDebt)} tUSDC`} />
            <Term label="Volatility reserve" value={`${fmtLoan(reserve)} tUSDC`} />
            <Term label="Maturity" value={new Date(CREDIT.maturity * 1000).toISOString().slice(0, 10)} />
          </dl>
          <p className="text-micro text-subtle leading-relaxed">
            This is a collateralized credit limit, not a guaranteed fill. A live lender offer,
            valid score authorization{scoreAuthorized ? " (currently active)" : " (required)"}, oracle
            health, and market liquidity are checked again when you submit.
          </p>
        </div>

        <Step
          index={1}
          title="Authorize your score"
          done={scoreAuthorized}
          status={scoreAuthorized ? "live" : undefined}
          hint={
            scoreAuthorized
              ? `Authorization live at the ${tier} gate — expires with the 30-minute window.`
              : "A short-lived, wallet-bound authorization the tier gate verifies on-chain."
          }
        >
          {!scoreAuthorized && (
            <button className="btn-secondary btn-sm" onClick={authorizeScore} disabled={pending}>
              Authorize {scoreAuth?.score.toLocaleString() ?? "score"}
            </button>
          )}
        </Step>

        <Step
          index={2}
          title="Post tBTC collateral"
          done={collateralSufficient}
          status={collateralSufficient ? "sufficient" : undefined}
           hint={
             collateralSufficient
               ? `Current collateral supports the requested borrow. ${fmtCollateral(position.collateral)} tBTC posted · covers ${fmtLoan(position.maxDebt)} tUSDC of total debt.`
               : `Need +${fmtCollateral(neededCollateral)} tBTC for the borrow amount below. Currently posted: ${fmtCollateral(position.collateral)} tBTC.`
          }
        >
          <label className="field">
            <span className="field-label">Collateral amount (tBTC)</span>
            <input
              className="field-input font-mono tabular-nums"
              value={effectiveCollateralInput}
              onChange={(e) => setCollateralInput(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className="flex items-center justify-between text-micro text-subtle">
            <span>
               Wallet: {walletTBtc !== undefined ? fmtCollateral(walletTBtc) : "—"} tBTC · drip more from the{" "}
               <Link to="/faucet" className="link">faucet</Link>
            </span>
             {neededCollateral !== undefined && (
               <span className="font-mono">
                 {neededCollateral > 0n ? `needs +${fmtCollateral(neededCollateral)}` : "collateral sufficient"} tBTC
               </span>
            )}
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={depositCollateral}
              disabled={pending || parseCollateralInput(effectiveCollateralInput) <= 0n}
          >
            Approve & deposit
          </button>
        </Step>

        <Step
          index={3}
          title="Borrow tUSDC"
          done={sessionBorrowed}
          status={sessionBorrowed ? "done" : undefined}
           hint={
             sessionBorrowed
                ? `Borrowed ${fmtLoan(borrowRaw)} tUSDC (${fmtLoan(requestedBorrowRaw)} requested + 10% reserve). Existing debt: ${fmtLoan(position.debt)} tUSDC · health ${position.healthy ? "ok" : "at risk"}.`
               : (position.debt ?? 0n) > 0n
                 ? `You already owe ${fmtLoan(position.debt)} tUSDC · ${fmtLoan(availableDebt)} tUSDC remaining at this collateral level. Borrow more below.`
                 : "Fixed rate, fixed maturity — repayment is 1:1, exits never gated."
          }
        >
          <label className="field">
             <span className="field-label">Capital needed (tUSDC)</span>
            <input
              className="field-input font-mono tabular-nums"
               value={effectiveBorrowInput}
              onChange={(e) => setBorrowInput(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
            />
           </label>
           <p className="text-micro text-subtle">
             Covenant will borrow <span className="font-mono text-slate-200">{fmtLoan(borrowRaw)} tUSDC</span>:
             your requested amount plus a 10% volatility reserve.
           </p>
           {borrowRaw > availableDebt && requestedBorrowRaw > 0n && (
             <p className="text-micro text-warn">
               The requested amount plus the 10% reserve exceeds your collateral-backed capacity.
               Reduce the amount or post more tBTC.
             </p>
           )}
           <button
            className="btn-primary btn-sm w-full"
            onClick={borrow}
             disabled={borrowing || pending || borrowRaw <= 0n || !scoreAuthorized || !hasBorrowCapacity || borrowRaw > availableDebt}
           >
             {borrowing ? "Borrowing…" : `Borrow ${fmtLoan(borrowRaw)} tUSDC`}
           </button>
           <p className="text-micro text-subtle">
              Available to borrow: <span className="font-mono">{borrowHint} tUSDC</span> after the reserve. Add collateral to increase it.
           </p>
          {!scoreAuthorized && (
            <p className="text-micro text-subtle">Authorize your score first — the gate checks it inside the borrow.</p>
          )}
        </Step>
      </div>
    </Shell>
  );
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

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  /* Dialog mechanics the overlay-click close never provided:
      - Escape closes (the wallet dropdown already did this; the modal didn't).
      - Body scroll locks while open so the page behind can't be scrolled
        blind under the overlay.
      - Focus moves into the dialog on open and returns to the trigger on
        close — keyboard users otherwise restart from the top of the page.
      - Tab wraps inside the panel. `aria-modal="true"` tells assistive tech
        that nothing outside the dialog exists, so focus escaping into the
        page behind it (still tabbable, merely dimmed) breaks the contract
        the role makes.
      `onClose` is captured in a ref so a new function identity per parent
      render doesn't re-run the effect (which would restore focus and
        re-lock mid-session). */
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
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
      if (e.key !== "Tab" || e.shiftKey === undefined) return;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Get trading capital"
        tabIndex={-1}
        className="modal-panel max-w-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div>
            <div className="card-title">Get trading capital</div>
            <div className="text-body-sm text-subtle mt-0.5">
              Reputation sets the terms · collateral stays the safety net
            </div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX className="w-4 h-4" />
          </button>
        </div>
        {/* `overscroll-contain`: a scroll-chaining body would let a flick at
            the end of the checklist scroll the locked page behind the
            overlay on touch devices. */}
        <div className="card-body max-h-[70vh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  done,
  status,
  hint,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  status?: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
     <div className={`rounded-lg border p-4 space-y-3 ${done ? "border-ok/30 bg-ok/[0.04]" : "border-line bg-ink-900"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-micro font-bold ${
              done ? "bg-ok/15 text-ok border border-ok/40" : "bg-ink-900 text-subtle border border-line-strong"
            }`}
          >
            {done ? <IconCheck className="w-3.5 h-3.5" /> : index}
          </span>
          <span className="text-body-sm font-semibold text-slate-100">{title}</span>
        </div>
         {done && <span className="badge-ok">{status ?? "done"}</span>}
      </div>
      <p className="text-micro text-subtle leading-relaxed">{hint}</p>
       {children && <div className="space-y-2.5 pt-1">{children}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-body-lg font-semibold text-slate-50 tabular-nums">{value}</div>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-body-sm text-slate-50 tabular-nums">{value}</dd>
    </div>
  );
}

function NotDeployedBody() {
  return (
    <div className="empty-state py-10">
      <div className="empty-state-title">Credit markets pending deployment</div>
      <p className="empty-state-body max-w-sm">
        The tier-gated credit engine deploys to Somnia testnet next — until then, trade with
        wallet collateral from the faucet. DreamDEX discovery and order execution are live.
      </p>
    </div>
  );
}
