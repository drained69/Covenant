import { useAccount, useBalance } from "wagmi";
import { useLoanTokenBalance } from "../hooks/useLoanTokenBalance";
import { CHAIN, MEZO_APP_URL, MEZO_FAUCET_URL } from "../config/chain";
import { CREDIT_TOKENS } from "../config/credit";
import { fmtUnits, shortAddr } from "../lib/format";
import { IconExternal, IconWallet, TokenMark } from "./icons";

/**
 * Mezo testnet funding panel. BTC is both gas and collateral, so one faucet
 * covers everything a borrower needs; MUSD is borrowed here, not dripped.
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
          {`Connect a wallet on ${CHAIN.name}. The faucet drips BTC for gas and collateral. It does not mint MUSD.`}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <MezoBtcCard account={address!} />
      <MezoMusdCard account={address!} />
    </div>
  );
}

function MezoBtcCard({ account }: { account: `0x${string}` }) {
  const btc = useBalance({ address: account, chainId: CHAIN.id });
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol="BTC" tone="warn" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">BTC</div>
            <div className="text-body-sm text-subtle truncate">Gas and loan collateral</div>
          </div>
        </div>
        <span className="badge-neutral">Mezo faucet</span>
      </div>
      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          Mezo testnet BTC pays gas and is the collateral Covenant accepts. The same balance
          is the ERC-20 at the BTC precompile. Drip it from the public faucet.
        </p>
        <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-ink-900 border border-line">
          <span className="text-muted">Your balance · {shortAddr(account)}</span>
          <span className="font-mono text-slate-100">
            {btc.isLoading ? "…" : btc.data ? `${Number(btc.data.formatted).toFixed(5)} BTC` : "—"}
          </span>
        </div>
        <a
          href={MEZO_FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-primary w-full text-center inline-flex items-center justify-center gap-2"
        >
          Get BTC from the Mezo faucet
          <IconExternal className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

function MezoMusdCard({ account }: { account: `0x${string}` }) {
  const quote = useLoanTokenBalance();
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol="USDC" tone="ok" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">{CREDIT_TOKENS.loan.symbol}</div>
            <div className="text-body-sm text-subtle truncate">{CREDIT_TOKENS.loan.name}</div>
          </div>
        </div>
        <span className="badge-ok">Borrow here</span>
      </div>
      <div className="card-body space-y-4">
        <p className="text-body-sm text-muted">
          You do not need MUSD to borrow. Covenant lends it against your BTC. To mint your own,
          open a trove on the Mezo testnet app.
        </p>
        <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-ink-900 border border-line">
          <span className="text-muted">Your balance · {shortAddr(account)}</span>
          <span className="font-mono text-slate-100">
            {quote.isLoading || quote.raw === undefined
              ? "…"
              : fmtUnits(quote.raw, quote.decimals, 2)}
          </span>
        </div>
        <a
          href={MEZO_APP_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary w-full text-center inline-flex items-center justify-center gap-2"
        >
          Mint MUSD on Mezo
          <IconExternal className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
