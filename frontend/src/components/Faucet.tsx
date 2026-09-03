import { useState } from "react";
import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import toast from "react-hot-toast";
import { parseUnits } from "viem";
import { useDreamDexQuoteBalance, useDreamDexTrader } from "../hooks/useDreamDex";
import { CREDIT, CREDIT_DEPLOYED } from "../config/credit";
import { ERC20_ABI } from "../config/abis";
import { CHAIN, EXPLORER, QUOTE_TOKEN, SOMNIA_FAUCET_URL } from "../config/chain";
import { describeError } from "../lib/errors";
import { fmtUnits, shortAddr } from "../lib/format";
import { IconExternal, IconWallet, TokenMark } from "./icons";

/**
 * Somnia testnet funding panel.
 *
 * Three things a wallet needs for the full Covenant flow:
 *  - TestUSDC — the DreamDEX venue collateral every order escrows (SDK faucet)
 *  - tBTC — Covenant's loan collateral, mintable once the credit layer deploys
 *  - STT — gas. The public faucet is Discord-gated, so it is linked, not called.
 */
export function FaucetPanel() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <IconWallet className="w-5 h-5" />
        </div>
        <p className="empty-state-title">Wallet not connected</p>
        <p className="empty-state-body">
          Connect a Somnia wallet to drip test collateral to it. Minting is permissionless
          testnet scaffolding.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <CollateralFaucet account={address!} />
      {CREDIT_DEPLOYED && <CreditCollateralFaucet account={address!} />}
      <GasCard account={address!} />
    </div>
  );
}

/** tBTC — the credit layer's collateral. Mint only after deployment. */
function CreditCollateralFaucet({ account }: { account: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);

  const balance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.collateralToken ?? undefined,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: [account],
    query: { enabled: !!CREDIT.collateralToken, refetchInterval: 10_000 },
  });

  const AMOUNT = parseUnits("1", 8); // 1 tBTC ≈ $108k of borrowing capacity

  async function mint() {
    const t = toast.loading("Minting tBTC — confirm in wallet…");
    setPending(true);
    try {
      const hash = await writeContractAsync({
        address: CREDIT.collateralToken!,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [account, AMOUNT],
      });
      toast.success(
        <span>
          1 tBTC minted{" "}
          <a
            href={`${EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline inline-flex items-center gap-0.5"
          >
            tx <IconExternal className="w-3 h-3" />
          </a>
        </span>,
        { id: t },
      );
    } catch (error) {
      toast.error(`Mint failed: ${describeError(error).slice(0, 160)}`, { id: t, duration: 9_000 });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol="BTC" tone="warn" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">tBTC</div>
            <div className="text-body-sm text-subtle truncate">Credit-layer collateral</div>
          </div>
        </div>
        <span className="badge-info">Covenant</span>
      </div>
      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          Post tBTC as collateral to borrow tUSDC at your Ethos tier's terms. One tBTC
          supports roughly $41.6k of borrowing at Open and $83.2k at Reputable.
        </p>
         <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-ink-900 border border-line">
          <span className="text-muted">Your balance</span>
          <span className="font-mono text-slate-100">
            {balance.isLoading || balance.data === undefined
              ? "…"
              : fmtUnits(balance.data as bigint, 8, 4)}
          </span>
        </div>
        <button className="btn-primary w-full" disabled={pending} onClick={mint}>
          {pending ? "Minting…" : "Mint 1 tBTC"}
        </button>
        <div className="flex items-center justify-between text-body-sm text-subtle">
          <span className="font-mono">{shortAddr(CREDIT.collateralToken ?? "0x")}</span>
          <a
            href={`${EXPLORER}/address/${CREDIT.collateralToken}`}
            target="_blank"
            rel="noreferrer"
            className="link inline-flex items-center gap-1.5"
          >
            Explorer
            <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function CollateralFaucet({ account }: { account: `0x${string}` }) {
  const trader = useDreamDexTrader();
  const quote = useDreamDexQuoteBalance();
  const { switchChain } = useSwitchChain();
  const [pending, setPending] = useState(false);

  async function drip() {
    const t = toast.loading("Dripping TestUSDC — confirm in wallet…");
    setPending(true);
    try {
      const result = await trader.faucet();
      // TxResult carries `hash` at the top level — `txHash` never existed.
      const hash = result.hash;
      toast.success(
        <span>
          TestUSDC minted{" "}
          {hash && (
            <a
              href={`${EXPLORER}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              tx <IconExternal className="w-3 h-3" />
            </a>
          )}
        </span>,
        { id: t },
      );
      await trader.refresh();
    } catch (error) {
      toast.error(`Faucet failed: ${describeError(error).slice(0, 160)}`, {
        id: t,
        duration: 9_000,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol="USDC" tone="ok" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">{QUOTE_TOKEN.symbol}</div>
            <div className="text-body-sm text-subtle truncate">{QUOTE_TOKEN.name}</div>
          </div>
        </div>
        <span className="badge-ok">DreamDEX faucet</span>
      </div>

      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          The collateral every Event Contract prices and settles against. One drip funds
          plenty of testnet orders.
        </p>

         <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-ink-900 border border-line">
          <span className="text-muted">Balance · {shortAddr(account)}</span>
          <span className="font-mono text-slate-100">
            {quote.isLoading || quote.raw === undefined
              ? "…"
              : fmtUnits(quote.raw, quote.decimals, 2)}
          </span>
        </div>

        {!trader.onSomnia ? (
          <button
            className="btn-primary w-full"
            onClick={() => switchChain({ chainId: CHAIN.id })}
          >
            Switch to {CHAIN.name}
          </button>
        ) : (
          <button className="btn-primary w-full" disabled={pending} onClick={drip}>
            {pending ? "Minting…" : "Drip TestUSDC"}
          </button>
        )}

        <div className="flex items-center justify-between text-body-sm text-subtle">
          <span className="font-mono">{shortAddr(QUOTE_TOKEN.address)}</span>
          <a
            href={`${EXPLORER}/address/${QUOTE_TOKEN.address}`}
            target="_blank"
            rel="noreferrer"
            className="link inline-flex items-center gap-1.5"
          >
            Explorer
            <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function GasCard({ account }: { account: `0x${string}` }) {
  const stt = useBalance({ address: account });

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol="STT" tone="warn" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">STT</div>
            <div className="text-body-sm text-subtle truncate">Somnia gas token</div>
          </div>
        </div>
        <span className="badge-neutral">External faucet</span>
      </div>

      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          Every order, approval, and cancel needs a little STT for gas. The public Somnia
          faucet is Discord-gated, so it opens in a new tab rather than dripping from here.
        </p>

         <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-ink-900 border border-line">
          <span className="text-muted">Your balance</span>
          <span className="font-mono text-slate-100">
            {stt.isLoading
              ? "…"
              : stt.data
                ? `${Number(stt.data.formatted).toFixed(4)} STT`
                : "—"}
          </span>
        </div>

        <a
          href={SOMNIA_FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary w-full text-center inline-flex items-center justify-center gap-2"
        >
          Get STT from the Somnia faucet
          <IconExternal className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
