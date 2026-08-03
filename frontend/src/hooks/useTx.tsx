import { useState, useCallback } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { EXPLORER } from "../config/chain";

/**
 * Thin wrapper around wagmi's writeContractAsync that:
 *   - shows a toast lifecycle (waiting → mined → error)
 *   - waits for 1 confirmation before resolving
 *   - returns a `pending` flag for UI disable
 *   - **invalidates every wagmi read query after a confirmed tx**, so the UI
 *     reflects the new on-chain state immediately (credit, debt, withdrawable,
 *     token balances, market vitals — all read via useReadContract*).
 *
 * Kept a hook (not a service) so each button gets its own local pending state.
 */
export function useTx() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (label: string, params: Parameters<typeof writeContractAsync>[0]): Promise<`0x${string}` | undefined> => {
      if (!address) { toast.error("Connect a wallet first."); return; }
      const t = toast.loading(`${label} — confirm in wallet…`);
      setPending(true);
      try {
        const hash = await writeContractAsync(params);
        toast.loading(
          <span>
            {label} · submitted{" "}
            <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">
              {hash.slice(0, 10)}…
            </a>
          </span>,
          { id: t }
        );
        await client?.waitForTransactionReceipt({ hash });
        toast.success(`${label} · confirmed`, { id: t });

        // Bust the read-side cache so every useReadContract remounts with fresh
        // data. `invalidateQueries()` with no key hits everything — including
        // usePosition, useMarketVitals, useTokenBalance — which is what we want
        // after a state-changing tx.
        await queryClient.invalidateQueries();
        return hash;
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || String(e);
        toast.error(`${label} failed: ${msg.slice(0, 140)}`, { id: t });
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [address, client, writeContractAsync, queryClient]
  );

  return { send, pending };
}
