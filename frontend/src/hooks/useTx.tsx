import { useState, useCallback } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BaseError, type PublicClient } from "viem";
import { EXPLORER } from "../config/chain";
import { describeError } from "../lib/errors";

/** Thrown when a transaction mines with status "reverted". */
class TxRevertedError extends Error {
  constructor(
    public hash: `0x${string}`,
    public reason: string,
  ) {
    super(reason);
    this.name = "Reverted";
  }
}

/**
 * Re-executes a mined transaction against its parent block's state to recover
 * the revert reason — receipts carry status but drop the reason.
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
      blockNumber: tx.blockNumber! - 1n,
    });
    return "reverted on-chain (reason unavailable — state-dependent)";
  } catch (e) {
    return describeError(e);
  }
}

/**
 * Thin wagmi writeContract wrapper for the Covenant credit layer:
 *   - simulates first, so reverts surface BEFORE the wallet prompt
 *   - toast lifecycle (simulating → confirm → mined → error)
 *   - waits for the receipt and verifies it did not revert
 *   - invalidates every wagmi/react-query read so the UI follows the chain
 */
export function useTx() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (
      label: string,
      params: Parameters<typeof writeContractAsync>[0],
    ): Promise<`0x${string}` | undefined> => {
      if (!address) {
        toast.error("Connect a wallet first.");
        return;
      }
      const t = toast.loading(`${label} — simulating…`);
      setPending(true);
      try {
        if (client) {
          await client.simulateContract({ ...(params as any), account: address });
        }

        toast.loading(`${label} — confirm in wallet…`, { id: t });
        const hash = await writeContractAsync(params);
        toast.loading(
          <span>
            {label} · submitted{" "}
            <a
              href={`${EXPLORER}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {hash.slice(0, 10)}…
            </a>
          </span>,
          { id: t },
        );
        if (!client) throw new Error("No RPC client — cannot confirm the transaction.");
        const receipt = await client.waitForTransactionReceipt({ hash });

        if (receipt.status === "reverted") {
          throw new TxRevertedError(hash, await revertReasonFor(client, hash));
        }

        toast.success(`${label} · confirmed`, { id: t });
        await queryClient.invalidateQueries();
        return hash;
      } catch (e: any) {
        if (e instanceof TxRevertedError) {
          toast.error(
            <span>
              {label} reverted: {e.reason.slice(0, 160)}{" "}
              <a
                href={`${EXPLORER}/tx/${e.hash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                view tx
              </a>
            </span>,
            { id: t, duration: 12_000 },
          );
          return undefined;
        }
        if (e instanceof BaseError) {
          toast.error(`${label} failed: ${describeError(e).slice(0, 200)}`, {
            id: t,
            duration: 10_000,
          });
          return undefined;
        }
        toast.error(`${label} failed: ${describeError(e).slice(0, 200)}`, {
          id: t,
          duration: 10_000,
        });
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [address, client, writeContractAsync, queryClient],
  );

  return { send, pending };
}
