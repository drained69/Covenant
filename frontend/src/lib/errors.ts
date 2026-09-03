import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Pulls the most specific message out of a viem/SDK error, preferring custom
 * error names over wall-of-text reverts. Shared by the DreamDEX order panel,
 * the faucet, and order cancellation so every failure surface reads the same.
 */
export function describeError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) {
        const args = revert.data?.args;
        return args?.length ? `${name}(${args.join(", ")})` : `${name}()`;
      }
      if (revert.reason) return revert.reason;
    }
    return e.shortMessage || e.message;
  }
  const any = e as { shortMessage?: string; details?: string; message?: string };
  return any?.shortMessage || any?.details || any?.message || String(e);
}
