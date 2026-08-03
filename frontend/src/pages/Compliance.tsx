import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CLEANVERSE_POOL_ABI } from "../config/abis";

export function Compliance() {
  const { address } = useAccount();
  const client = usePublicClient();
  const [pool, setPool] = useState("");
  const [wallet, setWallet] = useState(address ?? "");
  const [result, setResult] = useState<null | { reg: boolean; paused: boolean; verified: boolean; error?: string }>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    if (!/^0x[a-fA-F0-9]{40}$/.test(pool)) return setResult({ reg: false, paused: false, verified: false, error: "Invalid pool address" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return setResult({ reg: false, paused: false, verified: false, error: "Invalid wallet address" });
    setLoading(true);
    try {
      const [reg, paused, verified] = await Promise.all([
        client!.readContract({ address: pool as `0x${string}`, abi: CLEANVERSE_POOL_ABI, functionName: "isRegistered" }).catch(() => false),
        client!.readContract({ address: pool as `0x${string}`, abi: CLEANVERSE_POOL_ABI, functionName: "paused"       }).catch(() => false),
        client!.readContract({ address: pool as `0x${string}`, abi: CLEANVERSE_POOL_ABI, functionName: "verify", args: [wallet as `0x${string}`] }).catch(() => false),
      ]);
      setResult({ reg: !!reg, paused: !!paused, verified: !!verified });
    } catch (e: any) {
      setResult({ reg: false, paused: false, verified: false, error: e.message });
    } finally { setLoading(false); }
  }

  const eligible = result && result.reg && !result.paused && result.verified;

  return (
    <section className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <h2 className="text-2xl font-semibold">Cleanverse pool compliance check</h2>
      <p className="text-muted max-w-2xl">
        This runs the same three reads the on-chain gate performs before allowing a trade:
        <code className="mx-1 text-brand-400">isRegistered → paused → verify(wallet)</code>.
        Any read failure fails closed (denies), matching the on-chain semantics exactly.
      </p>
      <div className="card">
        <div className="card-body space-y-4">
          <label className="field">
            <span className="field-label">Cleanverse pool address</span>
            <input className="field-input" placeholder="0x…"
                   value={pool} onChange={(e) => setPool(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Wallet to check</span>
            <input className="field-input" placeholder="0x…"
                   value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </label>
          <button className="btn-primary w-full" onClick={check} disabled={loading}>
            {loading ? "Checking…" : "Check eligibility"}
          </button>
          {result && (
            <div className="mt-4 p-4 bg-ink-950/60 border border-line rounded-lg font-mono text-sm space-y-1">
              {result.error && <div className="text-bad">Error: {result.error}</div>}
              {!result.error && <>
                <Row label="isRegistered()" ok={result.reg} />
                <Row label="paused()"       ok={!result.paused} />
                <Row label="verify(wallet)" ok={result.verified} />
                <div className="pt-2 mt-2 border-t border-line">
                  Gate verdict: <span className={eligible ? "text-ok font-bold" : "text-bad font-bold"}>
                    {eligible ? "ELIGIBLE" : "DENIED"}
                  </span>
                </div>
              </>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={ok ? "text-ok" : "text-bad"}>{String(ok)}</span>
    </div>
  );
}
