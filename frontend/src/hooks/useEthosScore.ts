import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { ETHOS_API_URL, ETHOS_CLIENT, ethosTier } from "../config/dreamdex";

export type EthosScore = { score: number; level: string };

export function useEthosScore() {
  const { address } = useAccount();
  return useQuery<EthosScore>({
    queryKey: ["ethos", "score", address],
    queryFn: async () => {
      const response = await fetch(
        `${ETHOS_API_URL}/score/address?address=${encodeURIComponent(address!)}`,
        { headers: { "X-Ethos-Client": ETHOS_CLIENT } },
      );
      if (!response.ok) throw new Error("Ethos score unavailable");
      const data = (await response.json()) as { score?: number; level: string };
      return { score: data.score ?? 0, level: data.level };
    },
    enabled: !!address,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useEthosCredit() {
  const score = useEthosScore();
  const tier = ethosTier(score.data?.score ?? 0);
  return { ...score, tier, enhanced: !!score.data && score.data.score >= tier.minimum };
}
