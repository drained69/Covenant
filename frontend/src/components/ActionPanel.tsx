import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { useSearchParams } from "react-router-dom";
import { ADDRESSES, MARKETS } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";
import { DEMO_OFFERS, type DemoOffer } from "../config/demoOffers";
import { useTx } from "../hooks/useTx";
import { useAllowance, useTokenBalance } from "../hooks/useTokenBalance";
import { useMarket } from "../hooks/useMarket";
import { fmtUnits } from "../lib/format";

type MarketMeta = (typeof MARKETS)[number];
type TabKey = "take" | "supply" | "withdraw-collat" | "repay" | "redeem" | "faucet";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "take",            label: "Take offer",       hint: "Fill a signed offer published off-chain by a lender or borrower." },
  { key: "supply",          label: "Post collateral",  hint: "Deposit tWBTC as collateral for a future borrow." },
  { key: "withdraw-collat", label: "Pull collateral",  hint: "Withdraw tWBTC if your position remains healthy." },
  { key: "repay",           label: "Repay debt",        hint: "Reduce your debt by paying tUSDC to the pool." },
  { key: "redeem",          label: "Redeem credit",     hint: "Burn credit units to receive tUSDC (post-maturity or from repaid pool)." },
  { key: "faucet",          label: "Testnet faucet",    hint: "Mint tUSDC / tWBTC to try the flow." },
];

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

  const active = TABS.find((t) => t.key === tab)!;
  return (
    <div id="actions-panel" className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Actions</div>
          <div className="text-xs text-subtle mt-0.5">{active.hint}</div>
        </div>
      </div>
      <div className="px-5 pt-4 flex gap-1 border-b border-line overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 text-sm font-medium transition whitespace-nowrap
              ${tab === t.key
                ? "border-brand-500 text-slate-100"
                : "border-transparent text-slate-400 hover:text-slate-100"}`}
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
        {tab === "faucet"          && <FaucetForm />}
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
function TakeOfferForm({ market: _market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { send, pending } = useTx();
  const [params] = useSearchParams();
  const [units, setUnits] = useState("");
  const [receiver, setReceiver] = useState("");

  const offerId = params.get("offer");
  const picked: DemoOffer | undefined = DEMO_OFFERS.find((o) => o.id === offerId);
  const parsedUnits = safeBig(units);

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
      <div className="text-sm text-slate-300 space-y-3">
        <p>Pick an offer from the <span className="text-brand-300 font-semibold">Order book</span> above. Clicking a row loads it here.</p>
        <p className="text-xs text-subtle">
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
          <span className="text-sm font-semibold text-slate-100">{picked.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-mono">
          <span className="text-muted">Side</span>       <span className="text-slate-200">{picked.offer.buy ? "maker BUYS credit (lender)" : "maker SELLS credit (borrower)"}</span>
          <span className="text-muted">Maker</span>      <span className="text-slate-200 truncate">{picked.maker}</span>
          <span className="text-muted">Expiry</span>     <span className="text-slate-200">{new Date(picked.expiry * 1000).toLocaleString()}</span>
          <span className="text-muted">Max units</span>  <span className="text-slate-200">{picked.maxUnits}</span>
          <span className="text-muted">Notary</span>     <span className="text-slate-200 truncate">{picked.offer.notary}</span>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Units to fill</span>
        <input className="field-input" placeholder="500"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Receiver if you are the seller (defaults to your wallet)</span>
        <input className="field-input" placeholder="0x…"
               value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </label>

      <div className="flex gap-2">
        {approveToken && (
          <button className="btn-secondary flex-1" disabled={!showApprove || pending}
            onClick={() => send("Approve tUSDC", {
              address: approveToken, abi: ERC20_ABI,
              functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
            })}>
            {showApprove ? "1. Approve tUSDC" : "Approved ✓"}
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
              (receiver as `0x${string}`) || address!,
              "0x0000000000000000000000000000000000000000",
              "0x",
            ],
          })}>
          {approveToken ? "2. Take offer" : "Take offer"}
        </button>
      </div>

      <p className="text-xs text-subtle">
        The compliance gate fires on both sides at fill time: your wallet and the maker's wallet must
        both satisfy the market's gate, or the transaction reverts with
        <code className="mx-1">LenderIneligible</code>/<code>BorrowerIneligible</code>.
      </p>
      {picked.notaryData === "0xdemo" && (
        <div className="text-[11px] text-warn/90 px-3 py-2 rounded-md bg-warn/10 border border-warn/30">
          This is a demo offer — the notary signature is a placeholder, so the on-chain notary will
          refuse to ratify it. Publish a real signed offer via <code>offchain/sign_offer.js</code> to submit a fill that settles.
        </div>
      )}
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
      <BalanceHint label="Your tWBTC" raw={balance.data} decimals={market.collateralDecimals} />
      <label className="field">
        <span className="field-label">Amount ({market.collateralSymbol})</span>
        <input className="field-input" placeholder="0.5"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" disabled={!needsApprove || pending}
          onClick={() => send("Approve tWBTC", {
            address: ADDRESSES.wbtc, abi: ERC20_ABI,
            functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
          })}>
          {needsApprove ? "1. Approve" : "Approved ✓"}
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
  const parsed = safeParse(amount, market.collateralDecimals);

  return (
    <div className="space-y-4">
      <label className="field">
        <span className="field-label">Amount ({market.collateralSymbol})</span>
        <input className="field-input" placeholder="0.1"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Receiver (defaults to your wallet)</span>
        <input className="field-input" placeholder="0x…"
               value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </label>
      <button className="btn-primary w-full" disabled={!parsed || !marketStruct || pending}
        onClick={() => marketStruct && parsed && send("Pull collateral", {
          address: ADDRESSES.covenant, abi: COVENANT_ABI,
          functionName: "withdrawCollateral",
          args: [marketStruct as any, 0n, parsed, address!, (receiver as `0x${string}`) || address!],
        })}>
        Pull collateral
      </button>
      <p className="text-xs text-subtle">
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
  const parsed = safeBig(units);
  const needsApprove = parsed !== undefined && allowance.data !== undefined && allowance.data < parsed;

  return (
    <div className="space-y-4">
      <BalanceHint label="Your tUSDC" raw={balance.data} decimals={market.loanDecimals} />
      <BalanceHint label="Outstanding debt (units)" raw={debt.data as bigint | undefined} decimals={0} />
      <label className="field">
        <span className="field-label">Debt units to repay</span>
        <input className="field-input" placeholder="500"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" disabled={!needsApprove || pending}
          onClick={() => send("Approve tUSDC", {
            address: ADDRESSES.usdc, abi: ERC20_ABI,
            functionName: "approve", args: [ADDRESSES.covenant, maxUint256],
          })}>
          {needsApprove ? "1. Approve" : "Approved ✓"}
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
  const parsed = safeBig(units);

  return (
    <div className="space-y-4">
      <BalanceHint label="Your credit (units)" raw={credit.data as bigint | undefined} decimals={0} />
      <label className="field">
        <span className="field-label">Credit units to redeem</span>
        <input className="field-input" placeholder="500"
               value={units} onChange={(e) => setUnits(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Receiver (defaults to your wallet)</span>
        <input className="field-input" placeholder="0x…"
               value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </label>
      <button className="btn-primary w-full" disabled={!parsed || !marketStruct || pending}
        onClick={() => marketStruct && parsed && send("Redeem credit", {
          address: ADDRESSES.covenant, abi: COVENANT_ABI,
          functionName: "withdraw",
          args: [marketStruct as any, parsed, address!, (receiver as `0x${string}`) || address!],
        })}>
        Redeem
      </button>
      <p className="text-xs text-subtle">
        Redemption is capped by the pool's `withdrawable` balance (loan tokens brought in by repayments).
        Post-maturity, the full face value settles.
      </p>
    </div>
  );
}

// ─── Faucet ───────────────────────────────────────────────────────────────
function FaucetForm() {
  const { address } = useAccount();
  const { send, pending } = useTx();
  return (
    <div className="grid grid-cols-2 gap-4">
      <button className="btn-secondary" disabled={!address || pending}
        onClick={() => send("Mint 10,000 tUSDC", {
          address: ADDRESSES.usdc, abi: ERC20_ABI,
          functionName: "mint", args: [address!, parseUnits("10000", 6)],
        })}>
        Mint 10,000 tUSDC
      </button>
      <button className="btn-secondary" disabled={!address || pending}
        onClick={() => send("Mint 1 tWBTC", {
          address: ADDRESSES.wbtc, abi: ERC20_ABI,
          functionName: "mint", args: [address!, parseUnits("1", 8)],
        })}>
        Mint 1 tWBTC
      </button>
      <p className="text-xs text-subtle col-span-2">
        Both tokens are demo ERC20s with public `mint()`. Not for production.
      </p>
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────
function BalanceHint({ label, raw, decimals }: { label: string; raw?: bigint; decimals: number }) {
  return (
    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white/5 border border-line">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-slate-100">{fmtUnits(raw, decimals)}</span>
    </div>
  );
}

function safeParse(s: string, decimals: number): bigint | undefined {
  if (!s || Number.isNaN(Number(s)) || Number(s) <= 0) return undefined;
  try { return parseUnits(s, decimals); } catch { return undefined; }
}
function safeBig(s: string): bigint | undefined {
  if (!s || !/^\d+$/.test(s)) return undefined;
  try { return BigInt(s); } catch { return undefined; }
}

