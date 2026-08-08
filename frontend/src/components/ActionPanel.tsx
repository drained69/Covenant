import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { useSearchParams } from "react-router-dom";
import { ADDRESSES, MARKETS } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";
import { type DemoOffer } from "../config/demoOffers";
import { useOffers } from "../hooks/useOffers";
import { useTx } from "../hooks/useTx";
import { useAllowance, useTokenBalance } from "../hooks/useTokenBalance";
import { useMarket } from "../hooks/useMarket";
import { fmtUnits } from "../lib/format";
import { IconCheck } from "./icons";

type MarketMeta = (typeof MARKETS)[number];
type TabKey = "take" | "supply" | "withdraw-collat" | "repay" | "redeem";

// The tab hints name specific tokens, so they can't be a module-level constant
// without hardcoding this deployment's pair into every future market. Built from
// the market's own symbols instead.
function tabsFor(market: MarketMeta): { key: TabKey; label: string; hint: string }[] {
  const { collateralSymbol: c, loanSymbol: l } = market;
  return [
    { key: "take",            label: "Take offer",       hint: "Fill a signed offer published off-chain by a lender or borrower." },
    { key: "supply",          label: "Post collateral",  hint: `Deposit ${c} as collateral for a future borrow.` },
    { key: "withdraw-collat", label: "Pull collateral",  hint: `Withdraw ${c} if your position remains healthy.` },
    { key: "repay",           label: "Repay debt",       hint: `Reduce your debt by paying ${l} to the pool.` },
    { key: "redeem",          label: "Redeem credit",    hint: `Burn credit units to receive ${l} (post-maturity or from repaid pool).` },
  ];
}

export function ActionPanel({ market }: { market: MarketMeta }) {
  // The tab (and take-offer selection) live in the URL so the OfferBook can deep-link users
  // straight into the fill flow with `?offer=<id>&tab=take`, and so refreshes preserve state.
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as TabKey) || (params.get("offer") ? "take" : "supply");
  const [tab, setTab] = useState<TabKey>(initialTab);

  // When the URL changes (order-book click, browser back/forward) sync the visible tab.
  useEffect(() => {
    const t = params.get("tab") as TabKey | null;
    const hasOffer = !!params.get("offer");
    if (t && t !== tab) setTab(t);
    else if (hasOffer && tab !== "take") setTab("take");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function selectTab(next: TabKey) {
    setTab(next);
    const q = new URLSearchParams(params);
    q.set("tab", next);
    setParams(q, { replace: true });
  }

  const TABS = tabsFor(market);
  const active = TABS.find((t) => t.key === tab)!;
  return (
    <div id="actions-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Actions</div>
          <div className="text-body-sm text-subtle mt-0.5">{active.hint}</div>
        </div>
      </div>
      <div className="px-5 pt-4 flex gap-1 border-b border-line overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={tab === t.key ? "tab-btn-active" : "tab-btn"}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card-body">
        {tab === "take"            && <TakeOfferForm market={market} />}
        {tab === "supply"          && <SupplyForm market={market} />}
        {tab === "withdraw-collat" && <WithdrawCollateralForm market={market} />}
        {tab === "repay"           && <RepayForm market={market} />}
        {tab === "redeem"          && <RedeemForm market={market} />}
      </div>
    </div>
  );
}

// ─── Take offer (fill a signed off-chain offer) ───────────────────────────
//
// Covenant offers are signed off-chain (EIP-712 via EcrecoverNotary) and consumed on-chain via
// `covenant.fillOffer`. The user picks an offer from the OfferBook above, which sets
// `?offer=<id>` on the URL; this form reads that id, prefills the preview, and takes only what
// the taker still needs to supply — units and (optionally) a receiver.
function TakeOfferForm({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { send, pending } = useTx();
  const [params] = useSearchParams();
  const [units, setUnits] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelf, setUseSelf] = useState(true);
  const { offers } = useOffers();
  const loanBalance = useTokenBalance(ADDRESSES.usdc, address);
  const collatBalance = useTokenBalance(ADDRESSES.wbtc, address);

  const offerId = params.get("offer");
  const picked: DemoOffer | undefined = offers.find((o) => o.id === offerId);
  const parsedUnits = safeParse(units, market.loanDecimals);

  // Approvals: when the taker is the seller they must have already posted collateral (`Post
  // collateral` tab). When the taker is the buyer (lender-side fill) they must have loan-token
  // allowance for Covenant to pull tUSDC — surface the approve button in that case.
  const takerIsSeller = picked?.offer.buy === true;
  const approveToken = takerIsSeller ? undefined : ADDRESSES.usdc;
  const approveAllowance = useAllowance(ADDRESSES.usdc, address, ADDRESSES.covenant);
  const showApprove = !takerIsSeller
    && !!picked
    && approveAllowance.data !== undefined
    && parsedUnits !== undefined
    && approveAllowance.data < parsedUnits;

  if (!picked) {
    return (
      <div className="text-body-sm text-slate-300 space-y-3">
        <p>Pick an offer from the <span className="text-brand-300 font-semibold">Order book</span> above. Clicking a row loads it here.</p>
        <p className="text-body-sm text-subtle">
          If you're producing your own offers with <code className="text-slate-200">offchain/sign_offer.js</code>, publish them into the book (source in <code className="text-slate-200">src/config/demoOffers.ts</code>) and they'll show up automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rich preview of the selected offer — same info the OfferBook shows, expanded. */}
      <div className="rounded-md border border-line bg-ink-900/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={picked.side === "lend" ? "badge-info" : "badge-warn"}>
            {picked.side === "lend" ? "LEND" : "BORROW"}
          </span>
          <span className="text-body-sm font-semibold text-slate-100">{picked.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-micro font-mono">
          <span className="text-muted">Side</span>       <span className="text-slate-200">{picked.offer.buy ? "maker BUYS credit (lender)" : "maker SELLS credit (borrower)"}</span>
          <span className="text-muted">Maker</span>      <span className="text-slate-200 truncate">{picked.maker}</span>
          <span className="text-muted">Expiry</span>     <span className="text-slate-200">{new Date(picked.expiry * 1000).toLocaleString()}</span>
          <span className="text-muted">Max units</span>  <span className="text-slate-200">{fmtUnits(BigInt(picked.maxUnits ?? 0), market.loanDecimals)}</span>
          <span className="text-muted">Notary</span>     <span className="text-slate-200 truncate">{picked.offer.notary}</span>
        </div>
      </div>

      {/*
        Which balance matters depends on which side of the offer you land on:
        filling a lender's offer makes you the borrower (you need collateral
        already posted), filling a borrower's offer makes you the lender (the
        market pulls loan tokens from your wallet). Both are shown, with the
        one this fill will actually draw on marked, because a taker who reads
        only "Take offer" has no way to infer which token leaves their wallet.
      */}
      <div className="grid grid-cols-2 gap-2">
        <BalanceHint
          label={`Your ${market.loanSymbol}`}
          raw={loanBalance.data}
          decimals={market.loanDecimals}
          note={!takerIsSeller ? "pulled on fill" : undefined}
        />
        <BalanceHint
          label={`Your ${market.collateralSymbol}`}
          raw={collatBalance.data}
          decimals={market.collateralDecimals}
          note={takerIsSeller ? "must be posted first" : undefined}
        />
      </div>

      <label className="field">
        <span className="field-label">Units to fill</span>
        <input className="field-input" placeholder="0"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>

      <ReceiverField
        label="Receiver if you are the seller"
        useSelf={useSelf}
        onUseSelfChange={setUseSelf}
        value={receiver}
        onChange={setReceiver}
        self={address}
      />

      <div className="flex gap-2">
        {approveToken && (
          <button className="btn-secondary flex-1" disabled={!showApprove || pending}
            onClick={() => send("Approve tUSDC", {
              address: approveToken, abi: ERC20_ABI,
              functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
            })}>
            <ApproveLabel needed={showApprove} label="1. Approve tUSDC" />
          </button>
        )}
        <button className="btn-primary flex-1"
          disabled={!parsedUnits || !address || (showApprove ?? false) || pending}
          onClick={() => parsedUnits && send("Take offer", {
            address: ADDRESSES.covenant, abi: COVENANT_ABI,
            functionName: "fillOffer",
            args: [
              coerceOffer(picked.offer) as any,
              picked.notaryData,
              parsedUnits,
              address!,
              resolveReceiver(useSelf, receiver, address),
              "0x0000000000000000000000000000000000000000",
              "0x",
            ],
          })}>
          {approveToken ? "2. Take offer" : "Take offer"}
        </button>      </div>

      <p className="text-body-sm text-subtle">
        The compliance gate fires on both sides at fill time: your wallet and the maker's wallet must
        both satisfy the market's gate, or the transaction reverts with
        <code className="mx-1">LenderIneligible</code>/<code>BorrowerIneligible</code>.
      </p>
    </div>
  );
}

// The Offer struct is stored as decimal strings so it round-trips through JSON without loss;
// coerce every uint256 field to BigInt for wagmi. Same shape as the demoOffers.ts entries and the
// output of offchain/sign_offer.js.
function coerceOffer(o: any) {
  return {
    market: {
      loanToken: o.market.loanToken,
      collateralParams: (o.market.collateralParams ?? []).map((c: any) => ({
        token:  c.token,
        lltv:   BigInt(c.lltv),
        maxLif: BigInt(c.maxLif),
        oracle: c.oracle,
      })),
      maturity:     BigInt(o.market.maturity),
      rcfThreshold: BigInt(o.market.rcfThreshold ?? 0),
      entryGate:    o.market.entryGate,
      seizureGate:  o.market.seizureGate,
    },
    buy:                     !!o.buy,
    maker:                   o.maker,
    start:                   BigInt(o.start ?? 0),
    expiry:                  BigInt(o.expiry),
    tick:                    BigInt(o.tick),
    group:                   o.group,
    callback:                o.callback,
    callbackData:            o.callbackData,
    receiverIfMakerIsSeller: o.receiverIfMakerIsSeller,
    notary:                  o.notary,
    reduceOnly:              !!o.reduceOnly,
    maxUnits:                BigInt(o.maxUnits ?? 0),
    maxAssets:               BigInt(o.maxAssets ?? 0),
  };
}

// ─── Supply collateral ────────────────────────────────────────────────────
function SupplyForm({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data: marketStruct } = useMarket(market.id);
  const { send, pending } = useTx();
  const balance = useTokenBalance(ADDRESSES.wbtc, address);
  const allowance = useAllowance(ADDRESSES.wbtc, address, ADDRESSES.covenant);
  const [amount, setAmount] = useState("");

  const parsed = safeParse(amount, market.collateralDecimals);
  const needsApprove = parsed !== undefined && allowance.data !== undefined && allowance.data < parsed;

  return (
    <div className="space-y-4">
      <BalanceHint
        label={`Your ${market.collateralSymbol}`}
        raw={balance.data}
        decimals={market.collateralDecimals}
        note="posted as collateral"
      />
      <label className="field">
        <span className="field-label">Amount ({market.collateralSymbol})</span>
        <input className="field-input" placeholder="0"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" disabled={!needsApprove || pending}
          onClick={() => send("Approve tWBTC", {
            address: ADDRESSES.wbtc, abi: ERC20_ABI,
            functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
          })}>
          <ApproveLabel needed={needsApprove} label="1. Approve" />
        </button>
        <button className="btn-primary flex-1" disabled={!parsed || !marketStruct || needsApprove || pending}
          onClick={() => marketStruct && parsed && send("Post collateral", {
            address: ADDRESSES.covenant, abi: COVENANT_ABI,
            functionName: "supplyCollateral",
            args: [marketStruct as any, 0n, parsed, address!],
          })}>
          2. Post collateral
        </button>
      </div>
    </div>
  );
}

// ─── Withdraw collateral ──────────────────────────────────────────────────
function WithdrawCollateralForm({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data: marketStruct } = useMarket(market.id);
  const { send, pending } = useTx();
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelf, setUseSelf] = useState(true);
  const parsed = safeParse(amount, market.collateralDecimals);
  const wallet = useTokenBalance(ADDRESSES.wbtc, address);
  // The amount you can actually pull lives in the market, not the wallet — this
  // form had neither figure, so the only way to discover your posted balance was
  // to guess an amount and read the revert.
  const posted = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "collateral", args: address ? [market.id, address, 0n] : undefined,
    query: { enabled: !!address },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <BalanceHint
          label={`Posted ${market.collateralSymbol}`}
          raw={posted.data as bigint | undefined}
          decimals={market.collateralDecimals}
          note="withdrawable if healthy"
        />
        <BalanceHint
          label={`Your ${market.collateralSymbol}`}
          raw={wallet.data}
          decimals={market.collateralDecimals}
          note="in wallet"
        />
      </div>
      <label className="field">
        <span className="field-label">Amount ({market.collateralSymbol})</span>
        <input className="field-input" placeholder="0"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <ReceiverField
        label="Receiver"
        useSelf={useSelf}
        onUseSelfChange={setUseSelf}
        value={receiver}
        onChange={setReceiver}
        self={address}
      />
      <button className="btn-primary w-full" disabled={!parsed || !marketStruct || pending}
        onClick={() => marketStruct && parsed && send("Pull collateral", {
          address: ADDRESSES.covenant, abi: COVENANT_ABI,
          functionName: "withdrawCollateral",
          args: [marketStruct as any, 0n, parsed, address!, resolveReceiver(useSelf, receiver, address)],
        })}>
        Pull collateral
      </button>
      <p className="text-body-sm text-subtle">
        Reverts if the resulting position would be unhealthy (`isHealthy(...) == false`).
      </p>
    </div>
  );
}

// ─── Repay ────────────────────────────────────────────────────────────────
function RepayForm({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data: marketStruct } = useMarket(market.id);
  const { send, pending } = useTx();
  const balance = useTokenBalance(ADDRESSES.usdc, address);
  const allowance = useAllowance(ADDRESSES.usdc, address, ADDRESSES.covenant);
  const debt = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "debtOf", args: address ? [market.id, address] : undefined,
    query: { enabled: !!address },
  });
  const [units, setUnits] = useState("");
  const parsed = safeParse(units, market.loanDecimals);
  const needsApprove = parsed !== undefined && allowance.data !== undefined && allowance.data < parsed;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <BalanceHint
          label={`Your ${market.loanSymbol}`}
          raw={balance.data}
          decimals={market.loanDecimals}
          note="spent on repay"
        />
        {/* Units are denominated in loan-token base units on-chain (`fillOffer`
            computes assets as units × price / WAD, and price ≈ WAD at par), so
            this reads with the loan token's decimals. It was `decimals={0}`,
            which printed a 6-decimal base-unit integer — a 100-unit debt showed
            as 100000000, and the number a user copied into the field below was
            off by 1e6. */}
        <BalanceHint
          label="Outstanding debt (units)"
          raw={debt.data as bigint | undefined}
          decimals={market.loanDecimals}
          note="what you owe"
        />
      </div>
      <label className="field">
        <span className="field-label">Debt units to repay</span>
        <input className="field-input" placeholder="0"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" disabled={!needsApprove || pending}
          onClick={() => send("Approve tUSDC", {
            address: ADDRESSES.usdc, abi: ERC20_ABI,
            functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
          })}>
          <ApproveLabel needed={needsApprove} label="1. Approve" />
        </button>
        <button className="btn-primary flex-1" disabled={!parsed || !marketStruct || needsApprove || pending}
          onClick={() => marketStruct && parsed && send("Repay debt", {
            address: ADDRESSES.covenant, abi: COVENANT_ABI,
            functionName: "repay",
            args: [marketStruct as any, parsed, address!, "0x0000000000000000000000000000000000000000", "0x"],
          })}>
          2. Repay
        </button>
      </div>
    </div>
  );
}

// ─── Redeem credit ────────────────────────────────────────────────────────
function RedeemForm({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data: marketStruct } = useMarket(market.id);
  const { send, pending } = useTx();
  const credit = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "creditOf", args: address ? [market.id, address] : undefined,
    query: { enabled: !!address },
  });
  const [units, setUnits] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelf, setUseSelf] = useState(true);
  const parsed = safeParse(units, market.loanDecimals);
  const wallet = useTokenBalance(ADDRESSES.usdc, address);

  return (
    <div className="space-y-4">
      {/* Redemption burns credit and pays out loan tokens, so both sides of the
          trade belong on screen — the units you're spending and the balance the
          proceeds land in. */}
      <div className="grid grid-cols-2 gap-2">
        <BalanceHint label="Your credit (units)" raw={credit.data as bigint | undefined} decimals={market.loanDecimals} note="burned on redeem" />
        <BalanceHint
          label={`Your ${market.loanSymbol}`}
          raw={wallet.data}
          decimals={market.loanDecimals}
          note="paid out here"
        />
      </div>
      <label className="field">
        <span className="field-label">Credit units to redeem</span>
        <input className="field-input" placeholder="0"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>
      <ReceiverField
        label="Receiver"
        useSelf={useSelf}
        onUseSelfChange={setUseSelf}
        value={receiver}
        onChange={setReceiver}
        self={address}
      />
      <button className="btn-primary w-full" disabled={!parsed || !marketStruct || pending}
        onClick={() => marketStruct && parsed && send("Redeem credit", {
          address: ADDRESSES.covenant, abi: COVENANT_ABI,
          functionName: "withdraw",
          args: [marketStruct as any, parsed, address!, resolveReceiver(useSelf, receiver, address)],
        })}>
        Redeem
      </button>
      <p className="text-body-sm text-subtle">
        Redemption is capped by the pool's `withdrawable` balance (loan tokens brought in by repayments).
        Post-maturity, the full face value settles.
      </p>
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────
//
// Was the literal string `"Approved ✓"` at three call sites. The tick was a
// character in the body font, so it sat at a different weight and optical size
// than the stroked icons doing the same job in the order book and elsewhere —
// and being three copies of a string, the three approve buttons were free to
// drift apart. One component, one geometry.
function ApproveLabel({ needed, label }: { needed: boolean; label: string }) {
  if (needed) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <IconCheck className="w-3.5 h-3.5" />
      Approved
    </span>
  );
}

// `note` names what the figure *does* in the current action — "pulled on fill",
// "paid out here". A bare number tells a user what they hold; it doesn't tell
// them whether this form is about to spend it, and that is the question the
// balance was put on screen to answer.
function BalanceHint({ label, raw, decimals, note }:
  { label: string; raw?: bigint; decimals: number; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-body-sm px-3 py-2 rounded-lg bg-white/5 border border-line">
      <span className="min-w-0">
        <span className="text-muted block truncate">{label}</span>
        {note && <span className="text-micro text-subtle block truncate">{note}</span>}
      </span>
      <span className="font-mono tabular-nums text-slate-100 flex-shrink-0">{fmtUnits(raw, decimals)}</span>
    </div>
  );
}

// Every amount field in this panel goes through here. Units (credit/debt) are
// denominated in loan-token base units on-chain, so they scale by the loan
// token's decimals exactly like a token amount does — there is no raw-integer
// field left in this panel. The previous `safeBig` helper parsed units as a
// literal integer, so "100" reached `fillOffer` as 100 base units (0.0001 tUSDC
// at 6 decimals) and settled as dust.
function safeParse(s: string, decimals: number): bigint | undefined {
  if (!s || Number.isNaN(Number(s)) || Number(s) <= 0) return undefined;
  try { return parseUnits(s, decimals); } catch { return undefined; }
}

// ReceiverField provides a checkbox to use the connected wallet address,
// with a manual input field shown only when unchecked. This eliminates
// the need to copy-paste addresses across multiple transactions.
function ReceiverField({
  label,
  useSelf,
  onUseSelfChange,
  value,
  onChange,
  self,
}: {
  label: string;
  useSelf: boolean;
  onUseSelfChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  self?: `0x${string}`;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useSelf}
          onChange={(e) => onUseSelfChange(e.target.checked)}
          className="w-4 h-4 rounded border-line bg-ink-900 text-brand-400 focus:ring-brand-400 focus:ring-offset-0 focus:ring-2"
        />
        <span className="text-body-sm text-slate-200">Use my wallet</span>
      </label>
      {!useSelf && (
        <label className="field">
          <span className="field-label">{label}</span>
          <input
            className="field-input"
            placeholder="0x…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
      {useSelf && self && (
        <div className="text-micro text-muted font-mono truncate">
          {self}
        </div>
      )}
    </div>
  );
}

// Resolves the receiver address based on the useSelf toggle
function resolveReceiver(
  useSelf: boolean,
  receiver: string,
  self?: `0x${string}`
): `0x${string}` {
  if (useSelf && self) return self;
  return (receiver as `0x${string}`) || self || "0x0000000000000000000000000000000000000000";
}

