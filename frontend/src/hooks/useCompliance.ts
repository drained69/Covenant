import { useReadContracts } from "wagmi";
import { ADDRESSES } from "../config/chain";
import { CLEANVERSE_VALIDATOR_ABI } from "../config/abis";

/**
 * Runs the same two staticcalls the gate performs — `isRegistered(pool)` and
 * `complianceVerify(pool, wallet)` — and reports whether the wallet clears it.
 *
 * Both reads fail closed: a reverted or unreachable read is reported as `false`
 * rather than surfacing as an error, which mirrors how the gate itself behaves.
 * `allowFailure` keeps one failing read from discarding the other's result.
 *
 * Shared by the compliance page's status view and the verification form, so the
 * form can tell whether the connected wallet already holds an A-Pass instead of
 * inviting the user to request a second one.
 */
export function useCompliance(wallet: `0x${string}` | undefined) {
  const validator = ADDRESSES.validator as `0x${string}`;
  const gate = ADDRESSES.gate as `0x${string}`;

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: validator,
        abi: CLEANVERSE_VALIDATOR_ABI,
        functionName: "isRegistered",
        args: [gate],
      },
      {
        address: validator,
        abi: CLEANVERSE_VALIDATOR_ABI,
        functionName: "complianceVerify",
        args: [gate, wallet as `0x${string}`],
      },
    ],
    query: { enabled: !!wallet },
  });

  // `null` means "not asked yet" (no wallet connected), which the status view
  // renders differently from a definitive `false`.
  const registered = wallet && data ? data[0].status === "success" && !!data[0].result : null;
  const verified = wallet && data ? data[1].status === "success" && !!data[1].result : null;

  return {
    loading: !!wallet && isLoading,
    registered,
    verified,
    eligible: !!registered && !!verified,
    refetch,
  };
}
