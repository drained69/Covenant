import { useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { ADDRESSES, EXPLORER } from "../config/chain";
import { ERC20_ABI } from "../config/abis";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useTx } from "../hooks/useTx";
import { fmtUnits, shortAddr } from "../lib/format";
import { IconExternal, IconWallet, TokenMark } from "./icons";

/**
 * The two demo ERC20s behind every market on this deployment. Both were deployed
 * by `script/DeployTestTokens.s.sol`, whose `MockERC20.mint` carries no access
 * control — which is what makes a user-facing faucet possible at all.
 */
type FaucetToken = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  /** Quick-pick amounts, in human units. First entry is the default. */
  presets: string[];
  tone: "brand" | "warn";
  role: string;
};

const TOKENS: FaucetToken[] = [
  {
    address: ADDRESSES.usdc as `0x${string}`,
    symbol: "tUSDC",
    name: "Test USDC",
    decimals: 6,
    presets: ["10000", "1000", "100000"],
    tone: "brand",
    role: "Loan token — lend it, borrow it, repay with it.",
  },
  {
    address: ADDRESSES.wbtc as `0x${string}`,
    symbol: "tWBTC",
    name: "Test Wrapped BTC",
    decimals: 8,
    presets: ["1", "0.1", "5"],
    tone: "warn",
    role: "Collateral token — post it to open a borrow.",
  },
];

/**
 * Faucet body. Rendered both as its own page (`/faucet`) and as a tab inside the
 * market-detail ActionPanel, so the two can never drift apart.
 */
export function FaucetPanel({ compact = false }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <IconWallet className="w-5 h-5" />
        </div>
        <p className="empty-state-title">Wallet not connected</p>
        <p className="empty-state-body">
          Connect a wallet to mint test tokens to it. Minting is permissionless — no A-Pass or
          allowlist required.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "grid gap-5 md:grid-cols-2"}>
      {TOKENS.map((t) => (
        <TokenFaucet key={t.address} token={t} account={address} compact={compact} />
      ))}
    </div>
  );
}

function TokenFaucet({
  token,
  account,
  compact,
}: {
  token: FaucetToken;
  account?: `0x${string}`;
  compact: boolean;
}) {
  const { send, pending } = useTx();
  const balance = useTokenBalance(token.address, account);
  const [amount, setAmount] = useState(token.presets[0]);

  const parsed = safeParse(amount, token.decimals);
  const invalid = amount.trim() !== "" && parsed === undefined;

  async function mint() {
    if (!parsed || !account) return;
    await send(`Mint ${amount} ${token.symbol}`, {
      address: token.address,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [account, parsed],
    });
  }

  return (
    <div className={compact ? "rounded-lg border border-line bg-ink-900/40 p-4 space-y-4" : "card"}>
      <div
        className={
          compact
            ? "flex items-center justify-between gap-4"
            : "card-header"
        }
      >
        <div className="flex items-center gap-3 min-w-0">
          <TokenMark symbol={token.symbol.replace(/^t/, "")} tone={token.tone} />
          <div className="min-w-0">
            <div className="text-body font-semibold text-slate-100">{token.symbol}</div>
            <div className="text-body-sm text-subtle truncate">{token.name}</div>
          </div>
        </div>
        <span className="badge-neutral flex-shrink-0">{token.decimals} dec</span>
      </div>

      <div className={compact ? "space-y-4" : "card-body space-y-4"}>
        {!compact && <p className="text-body-sm text-muted">{token.role}</p>}

        <div className="flex items-center justify-between text-body-sm px-3 py-2 rounded-lg bg-white/5 border border-line">
          <span className="text-muted">Your balance</span>
          <span className="font-mono text-slate-100">
            {balance.isLoading ? "…" : fmtUnits(balance.data as bigint | undefined, token.decimals)}
          </span>
        </div>

        <div className="flex gap-1.5">
          {token.presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={amount === p ? "btn-primary btn-sm flex-1" : "btn-secondary btn-sm flex-1"}
            >
              {Number(p).toLocaleString()}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Amount to mint</span>
          <input
            className="field-input font-mono"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {invalid && (
            <p className="text-body-sm text-bad mt-1.5">
              Enter a positive number with at most {token.decimals} decimal places.
            </p>
          )}
        </label>

        <button className="btn-primary w-full" disabled={!parsed || pending} onClick={mint}>
          {pending ? "Minting…" : `Mint ${token.symbol}`}
        </button>

        <div className="flex items-center justify-between text-body-sm text-subtle">
          <span className="font-mono">{shortAddr(token.address)}</span>
          <a
            href={`${EXPLORER}/address/${token.address}`}
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

/**
 * `parseUnits` throws on more fraction digits than the token has, and happily
 * accepts "0", "-1", and "1e5" — none of which are valid mint amounts here.
 */
function safeParse(s: string, decimals: number): bigint | undefined {
  const v = s.trim();
  if (!/^\d*\.?\d+$/.test(v)) return undefined;
  try {
    const raw = parseUnits(v, decimals);
    return raw > 0n ? raw : undefined;
  } catch {
    return undefined;
  }
}
