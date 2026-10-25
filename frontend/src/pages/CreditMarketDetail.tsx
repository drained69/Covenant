import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { keccak256, toHex } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CREDIT, CREDIT_DEPLOYED, CREDIT_SERVICE_URL, CREDIT_TOKENS, tierForScore, type TierKey } from "../config/credit";
import { CHAIN } from "../config/chain";
import { ERC20_ABI } from "../config/abis";
import {
  collateralValue,
  displayCollateral,
  displayLoan,
  fmtLoan,
  healthFactor,
  liquidationBonus,
  liquidationPrice,
  parseLoanInput,
  useCovenantPosition,
  useOfferBook,
  useProtocolStats,
} from "../hooks/useCovenant";
import { fmtPct, humanUntil, shortAddr } from "../lib/format";
import {
  AddressValue,
  AssetPair,
  HealthBadge,
  HealthBar,
  HealthFactor,
  MATURITY_LABEL,
  ParamRow,
  StatStrip,
  tierMeta,
} from "../components/lending";
import { IconCheck, IconChevronRight } from "../components/icons";
import { useTx } from "../hooks/useTx";
import { CapitalModal } from "../components/CapitalModal";
import { describeError } from "../lib/errors";
import { useEthosCredit } from "../hooks/useEthosScore";

const TIERS: TierKey[] = ["open", "established", "reputable"];

function isTier(value: string | undefined): value is TierKey {
  return !!value && (TIERS as string[]).includes(value);
}

const AUTH_ABI = [
  {
    type: "function",
    name: "isAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "authorized", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setIsAuthorized",
    stateMutability: "nonpayable",
    inputs: [
      { name: "authorized", type: "address" },
      { name: "newIsAuthorized", type: "bool" },
      { name: "onBehalf", type: "address" },
    ],
    outputs: [],
  },
] as const;

const OFFER_TYPES = {
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "maxLif", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "entryGate", type: "address" },
    { name: "seizureGate", type: "address" },
  ],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "notary", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint256" },
    { name: "maxAssets", type: "uint256" },
  ],
  OfferTree: [{ name: "offerTree", type: "Offer" }],
} as const;

/** Par tick. A lower tick is a worse price for the borrower, so the book ignores it while the house offers par. */
const PAR_TICK = 5820n;

export function CreditMarketDetail() {
  const { marketId } = useParams();
  if (!isTier(marketId)) {
    return (
      <section className="shell py-12">
        <h1 className="text-h2 text-slate-50">Unknown market</h1>
        <p className="mt-3 text-body text-muted">Credit markets are Open, Established, and Reputable.</p>
        <Link to="/markets" className="btn-secondary btn-sm mt-6 inline-flex">All markets</Link>
      </section>
    );
  }
  return <Detail tier={marketId} />;
}

function Detail({ tier }: { tier: TierKey }) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const position = useCovenantPosition(tier);
  const stats = useProtocolStats();
  const { data: score } = useEthosCredit();
  const [borrowOpen, setBorrowOpen] = useState(false);
  const meta = tierMeta(tier);
  const market = CREDIT.markets[tier];
  const loan = CREDIT_TOKENS.loan.symbol;
  const collateral = CREDIT_TOKENS.collateral.symbol;
  const earned = tierForScore(score?.score ?? 0);
  const eligible = isConnected && earned === tier;
  const s = stats.markets[tier];
  const debt = position.debt ?? 0n;
  const posted = position.collateral ?? 0n;
  const available = position.maxDebt !== undefined && position.maxDebt > debt ? position.maxDebt - debt : 0n;
  const hf = healthFactor(position.maxDebt, position.debt);
  const liqPrice = liquidationPrice(tier, debt, posted);
  const postedValue = collateralValue(posted, stats.priceRaw);

  return (
    <section className="shell py-10 lg:py-12 space-y-8">
      <nav aria-label="Breadcrumb" className="text-body-sm text-subtle flex items-center gap-1.5">
        <Link to="/markets" className="hover:text-slate-100 transition-colors">Markets</Link>
        <IconChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-300">{meta.name}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <AssetPair />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-h2 text-slate-50">{collateral} / {loan}</h1>
              <span className="badge-neutral">{meta.name} tier</span>
              {eligible && <span className="badge-info">Your tier</span>}
            </div>
            <p className="mt-1 text-body-sm text-subtle">
              Borrow {loan} against {collateral} · {meta.minimum === 0 ? "open to any Ethos score" : `requires Ethos ${meta.minimum.toLocaleString()}+`} · matures {MATURITY_LABEL}
            </p>
          </div>
        </div>
      </header>

      <StatStrip
        items={[
          { label: "Available liquidity", value: s?.liquidity === undefined ? "…" : `${displayLoan(s.liquidity)} ${loan}` },
          { label: "Total borrowed", value: s === undefined ? "…" : `${displayLoan(s.borrowed)} ${loan}` },
          { label: "Utilization", value: s?.utilization === undefined ? "…" : fmtPct(s.utilization, 1) },
          { label: "Fixed APR", value: "0.00%", sub: `until ${MATURITY_LABEL}` },
          { label: "LLTV", value: `${meta.ltv}%`, sub: "liquidation threshold" },
        ]}
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Market parameters</div>
                <div className="text-body-sm text-subtle mt-0.5">Immutable. Every value below is part of the market id.</div>
              </div>
            </div>
            <div className="px-6 divide-y divide-line">
              <ParamRow label="Liquidation LTV" hint="Debt / collateral value at which a loan can be liquidated">{meta.ltv}%</ParamRow>
              <ParamRow label="Liquidation bonus" hint="Maximum incentive paid to liquidators">{fmtPct(liquidationBonus(tier), 2)}</ParamRow>
              <ParamRow label="Interest model" hint="Lenders sign offers; the price fixes the rate at fill">Fixed rate · repay at par</ParamRow>
              <ParamRow label="Maturity" hint="Debt is due; lenders redeem afterwards">{MATURITY_LABEL}</ParamRow>
              <ParamRow label="Oracle price" hint="Skip BTC/USD, 6-hour staleness bound">
                {stats.price === undefined ? "…" : `${stats.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${loan}`}
              </ParamRow>
              <ParamRow label="Entry gate" hint={meta.minimum === 0 ? "Accepts any authorized wallet" : `Ethos score ≥ ${meta.minimum.toLocaleString()} to open debt`}>
                <AddressValue address={market.gate} />
              </ParamRow>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Contracts</div>
                <div className="text-body-sm text-subtle mt-0.5">Mezo testnet · chain {CREDIT.chainId}</div>
              </div>
            </div>
            <div className="px-6 divide-y divide-line">
              <ParamRow label={`Loan asset · ${loan}`}><AddressValue address={CREDIT.loanToken} /></ParamRow>
              <ParamRow label={`Collateral · ${collateral}`}><AddressValue address={CREDIT.collateralToken} /></ParamRow>
              <ParamRow label="Oracle"><AddressValue address={CREDIT.oracle} /></ParamRow>
              <ParamRow label="Covenant core"><AddressValue address={CREDIT.covenant} /></ParamRow>
              <ParamRow label="Market id"><AddressValue address={market.marketId} /></ParamRow>
            </div>
          </div>

          {isConnected && address && <LendPanel tier={tier} address={address} />}
        </div>

        <aside className="lg:sticky lg:top-24 space-y-4">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Your position</div>
              <HealthBadge value={hf} hasDebt={debt > 0n} />
            </div>
            <div className="px-6 divide-y divide-line">
              <ParamRow label="Collateral" hint={!isConnected || postedValue === undefined || posted === 0n ? undefined : `≈ ${displayLoan(postedValue)} ${loan}`}>
                {!isConnected ? "—" : position.isLoading ? "…" : `${displayCollateral(posted)} ${collateral}`}
              </ParamRow>
              <ParamRow label="Debt">{!isConnected ? "—" : position.isLoading ? "…" : `${displayLoan(debt)} ${loan}`}</ParamRow>
              <ParamRow label="Available to borrow">{!isConnected ? "—" : `${displayLoan(available)} ${loan}`}</ParamRow>
              <ParamRow label="Liquidation price" hint={`${collateral} price that triggers liquidation`}>
                {liqPrice === undefined ? "—" : `$${liqPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
              </ParamRow>
              <div className="py-3">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-slate-300">Health factor</span>
                  {isConnected && debt > 0n ? <HealthFactor value={hf} className="font-semibold" /> : <span className="text-subtle">—</span>}
                </div>
                {debt > 0n && <div className="mt-2"><HealthBar value={hf} /></div>}
              </div>
            </div>
            <div className="p-4 border-t border-line space-y-2">
              {!isConnected ? (
                <button type="button" className="btn-primary w-full" onClick={openConnectModal}>Connect wallet</button>
              ) : (
                <button type="button" className="btn-primary w-full" onClick={() => setBorrowOpen(true)} disabled={!eligible}>
                  {eligible ? `Borrow ${loan}` : `Requires Ethos ${meta.minimum.toLocaleString()}+`}
                </button>
              )}
              <Link to="/positions" className="btn-secondary w-full">Repay or withdraw</Link>
              {isConnected && !eligible && (
                <p className="text-micro text-subtle text-center pt-1">
                  Your score opens the <Link className="link" to={`/markets/${earned}`}>{tierMeta(earned).name}</Link> market.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {borrowOpen && <CapitalModal market={tier} onClose={() => setBorrowOpen(false)} />}
    </section>
  );
}

function LendPanel({ tier, address }: { tier: TierKey; address: `0x${string}` }) {
  const { data: wallet } = useWalletClient();
  const { send, pending } = useTx();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [posting, setPosting] = useState(false);
  const loan = CREDIT_TOKENS.loan.symbol;
  const units = parseLoanInput(amount);

  const allowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    chainId: CHAIN.id,
    functionName: "allowance",
    args: [address, CREDIT.covenant!],
    query: { enabled: CREDIT_DEPLOYED, refetchInterval: 10_000 },
  });
  const authorized = useReadContract({
    abi: AUTH_ABI,
    address: CREDIT.covenant ?? undefined,
    chainId: CHAIN.id,
    functionName: "isAuthorized",
    args: [address, CREDIT.notary!],
    query: { enabled: CREDIT_DEPLOYED && !!CREDIT.notary, refetchInterval: 10_000 },
  });
  const walletBalance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: CREDIT_DEPLOYED, refetchInterval: 15_000 },
  });
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const book = useOfferBook(tier);
  const mine = book.data?.offers.find((offer) => offer.maker.toLowerCase() === address.toLowerCase());

  const allowanceOk = ((allowance.data as bigint | undefined) ?? 0n) >= units && units > 0n;
  const notaryOk = authorized.data === true;

  async function approve() {
    await send(`Approve ${loan}`, {
      address: CREDIT.loanToken,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CREDIT.covenant!, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
    });
  }

  async function authorizeNotary() {
    await send("Authorize offer notary", {
      address: CREDIT.covenant!,
      abi: AUTH_ABI,
      functionName: "setIsAuthorized",
      args: [CREDIT.notary!, true, address],
    });
  }

  async function postOffer() {
    if (!wallet || units <= 0n) return;
    setPosting(true);
    const t = toast.loading("Sign the offer in your wallet…");
    try {
      if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
      const m = CREDIT.markets[tier];
      const now = Math.floor(Date.now() / 1000);
      const offer = {
        market: {
          loanToken: CREDIT.loanToken,
          collateralParams: [
            {
              token: CREDIT.collateralToken!,
              lltv: m.lltv,
              maxLif: m.maxLif,
              oracle: CREDIT.oracle!,
            },
          ],
          maturity: BigInt(CREDIT.maturity),
          rcfThreshold: 0n,
          entryGate: m.gate!,
          seizureGate: m.gate!,
        },
        buy: true,
        maker: address,
        start: 0n,
        expiry: BigInt(now + 3600),
        tick: PAR_TICK,
        group: keccak256(toHex(crypto.getRandomValues(new Uint8Array(32)))),
        callback: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        callbackData: "0x" as `0x${string}`,
        receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        notary: CREDIT.notary!,
        reduceOnly: false,
        maxUnits: units,
        maxAssets: 0n,
      };
      const signature = await wallet.signTypedData({
        account: address,
        domain: { chainId: CREDIT.chainId, verifyingContract: CREDIT.notary! },
        types: OFFER_TYPES,
        primaryType: "OfferTree",
        message: { offerTree: offer },
      });
      toast.loading("Posting offer…", { id: t });
      const response = await fetch(`${CREDIT_SERVICE_URL}/api/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: tier,
          signature,
          offer: stringifyOffer(offer),
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || "Offer was rejected");
      toast.success("Offer posted. Borrowers can fill it for the next hour.", { id: t });
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["credit", "offers"] });
    } catch (error) {
      toast.error(describeError(error).slice(0, 180), { id: t, duration: 10_000 });
    } finally {
      setPosting(false);
    }
  }

  async function cancelOffer() {
    if (!wallet) return;
    setPosting(true);
    const t = toast.loading("Sign to withdraw the offer…");
    try {
      const signature = await wallet.signMessage({
        account: address,
        message: `Covenant cancel offer\n${CREDIT.chainId}\n${tier}\n${address.toLowerCase()}`,
      });
      const response = await fetch(`${CREDIT_SERVICE_URL}/api/offers/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: tier, maker: address, signature }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || "Could not withdraw the offer");
      toast.success("Offer withdrawn. Unfilled MUSD stays in this wallet.", { id: t });
      void queryClient.invalidateQueries({ queryKey: ["credit", "offers"] });
    } catch (error) {
      toast.error(describeError(error).slice(0, 180), { id: t, duration: 10_000 });
    } finally {
      setPosting(false);
    }
  }

  const balance = (walletBalance.data as bigint | undefined) ?? undefined;
  const overBalance = balance !== undefined && units > balance;
  const offers = book.data?.offers ?? [];
  const steps = [
    { done: allowanceOk, label: `Approve ${loan}`, hint: "Lets Covenant pull MUSD only when a borrower fills your offer.", action: approve },
    { done: notaryOk, label: "Authorize offer signer", hint: "One-time: lets the notary contract verify your signed offers.", action: authorizeNotary },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Supply {loan}</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Post a signed lending offer to this market. Borrowers fill it before the house book; you can withdraw it until it is taken.
          </div>
        </div>
      </div>
      <div className="card-body grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="field">
            <span className="field-label flex items-center justify-between">
              <span>Amount</span>
              <span className="normal-case font-normal text-subtle">
                Wallet: <span className="font-mono">{displayLoan(balance)}</span> {loan}
                {balance !== undefined && balance > 0n && (
                  <button type="button" className="link ml-2 font-semibold" onClick={() => setAmount(fmtLoan(balance))}>
                    Max
                  </button>
                )}
              </span>
            </span>
            <div className="relative">
              <input
                className="field-input font-mono tabular-nums pr-16"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                spellCheck={false}
                autoComplete="off"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-subtle">{loan}</span>
            </div>
          </label>
          {overBalance && <p className="text-micro text-warn">Exceeds your {loan} balance. A fill would fail.</p>}
          <ul className="space-y-2">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold flex-shrink-0 ${step.done ? "bg-ok/15 text-ok" : "bg-ink-900 text-subtle border border-line-strong"}`}>
                    {step.done ? <IconCheck className="w-3 h-3" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-body-sm text-slate-100">{step.label}</div>
                    <div className="text-micro text-subtle truncate">{step.hint}</div>
                  </div>
                </div>
                {!step.done && (
                  <button type="button" className="btn-secondary btn-sm flex-shrink-0" disabled={pending} onClick={step.action}>
                    {i === 0 ? "Approve" : "Authorize"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={pending || posting || !allowanceOk || !notaryOk || units <= 0n || overBalance}
            onClick={postOffer}
          >
            {posting ? "Signing…" : units > 0n ? `Supply ${displayLoan(units)} ${loan}` : `Enter an amount`}
          </button>
          <p className="text-micro text-subtle leading-relaxed">
            Offers are valid for one hour and priced at par. Your {loan} stays in your wallet until a borrower fills the offer.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div className="stat-label">Open lender offers</div>
            {mine && (
              <button type="button" className="link text-body-sm" disabled={posting} onClick={cancelOffer}>
                Withdraw mine
              </button>
            )}
          </div>
          {offers.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-body-sm text-subtle">
              No wallet offers right now. Borrowers are filled by the house lender.
            </p>
          ) : (
            <table className="mt-3 w-full text-body-sm">
              <thead>
                <tr className="text-micro uppercase text-subtle border-b border-line">
                  <th className="py-2 text-left font-semibold">Lender</th>
                  <th className="py-2 text-right font-semibold">Size</th>
                  <th className="py-2 text-right font-semibold">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {offers.map((offer) => (
                  <tr key={`${offer.maker}-${offer.expiry}`}>
                    <td className="py-2 font-mono text-slate-300">
                      {shortAddr(offer.maker)}
                      {offer.maker.toLowerCase() === address.toLowerCase() && <span className="badge-info ml-2">you</span>}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-100">{displayLoan(BigInt(offer.maxUnits))} {loan}</td>
                    <td className="py-2 text-right text-subtle">{humanUntil(offer.expiry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function stringifyOffer(offer: {
  market: {
    loanToken: string;
    collateralParams: { token: string; lltv: bigint; maxLif: bigint; oracle: string }[];
    maturity: bigint;
    rcfThreshold: bigint;
    entryGate: string;
    seizureGate: string;
  };
  buy: boolean;
  maker: string;
  start: bigint;
  expiry: bigint;
  tick: bigint;
  group: string;
  callback: string;
  callbackData: string;
  receiverIfMakerIsSeller: string;
  notary: string;
  reduceOnly: boolean;
  maxUnits: bigint;
  maxAssets: bigint;
}) {
  return {
    ...offer,
    market: {
      ...offer.market,
      collateralParams: offer.market.collateralParams.map((cp) => ({
        ...cp,
        lltv: cp.lltv.toString(),
        maxLif: cp.maxLif.toString(),
      })),
      maturity: offer.market.maturity.toString(),
      rcfThreshold: offer.market.rcfThreshold.toString(),
    },
    start: offer.start.toString(),
    expiry: offer.expiry.toString(),
    tick: offer.tick.toString(),
    maxUnits: offer.maxUnits.toString(),
    maxAssets: offer.maxAssets.toString(),
  };
}
