import { useState, useCallback } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BaseError, ContractFunctionRevertedError, type PublicClient } from "viem";
import { EXPLORER } from "../config/chain";

/** Thrown when a transaction mines with status "reverted". */
class TxRevertedError extends Error {
  constructor(public hash: `0x${string}`, public reason: string) {
    super(reason);
    this.name = "Reverted";
  }
}

/**
 * Re-executes a mined transaction against the state of its parent block to
 * recover the revert reason. `waitForTransactionReceipt` gives us status but
 * never the reason, and most RPCs drop revert data from the receipt entirely.
 */
async function revertReasonFor(client: PublicClient, hash: `0x${string}`): Promise<string> {
  try {
    const tx = await client.getTransaction({ hash });
    await client.call({
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
      blockNumber: tx.blockNumber - 1n,
    });
    // The replay succeeded — the revert depended on state within the block itself.
    return "reverted on-chain (reason unavailable — state-dependent)";
  } catch (e) {
    return describeError(e);
  }
}

/** Pulls the most specific message out of a viem error, preferring custom error names. */
function describeError(e: any): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) {
        const args = revert.data?.args;
        return args?.length ? `${name}(${args.join(", ")})` : `${name}()`;
      }
      if (revert.reason) return revert.reason;
      // Undecodable selector — surface the raw 4 bytes so it can be looked up.
      const raw = (revert as any).signature ?? (revert as any).raw;
      if (raw) return `reverted with unknown error ${raw}`;
    }
    return e.shortMessage || e.message;
  }
  return e?.shortMessage || e?.details || e?.message || String(e);
}

/**
 * Thin wrapper around wagmi's writeContractAsync that:
 *   - simulates the call first, so reverts surface *before* the wallet prompt
 *   - shows a toast lifecycle (waiting → mined → error)
 *   - waits for 1 confirmation AND verifies the receipt did not revert
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
      const t = toast.loading(`${label} — simulating…`);
      setPending(true);
      try {
        // Pre-flight: catch reverts before the user signs anything. This turns a
        // wasted gas fee + confusing failure into an actionable message up front.
        if (client) {
          await client.simulateContract({ ...(params as any), account: address });
        }

        toast.loading(`${label} — confirm in wallet…`, { id: t });
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
        if (!client) throw new Error("No RPC client — cannot confirm the transaction.");
        const receipt = await client.waitForTransactionReceipt({ hash });

        // waitForTransactionReceipt resolves for reverted txs too — it does NOT throw.
        // Without this check every mined tx reports "confirmed", including reverts.
        if (receipt.status === "reverted") {
          throw new TxRevertedError(hash, await revertReasonFor(client, hash));
        }

        toast.success(`${label} · confirmed`, { id: t });

        // Bust the read-side cache so every useReadContract remounts with fresh
        // data. `invalidateQueries()` with no key hits everything — including
        // usePosition, useMarketVitals, useTokenBalance — which is what we want
        // after a state-changing tx.
        await queryClient.invalidateQueries();
        return hash;
      } catch (e: any) {
        if (e instanceof TxRevertedError) {
          toast.error(
            <span>
              {label} reverted on-chain: {e.reason.slice(0, 160)}{" "}
              <a href={`${EXPLORER}/tx/${e.hash}`} target="_blank" rel="noreferrer" className="underline">
                view tx
              </a>
            </span>,
            { id: t, duration: 12000 }
          );
          return undefined;
        }
        toast.error(`${label} failed: ${describeError(e).slice(0, 200)}`, { id: t, duration: 10000 });
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [address, client, writeContractAsync, queryClient]
  );

  return { send, pending };
}
