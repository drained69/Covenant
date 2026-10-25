/**
 * The Covenant credit layer's Somnia deployment.
 *
 * Filled from `deployments/somnia-testnet.json` once `script/DeploySomnia.s.sol`
 * has run (see `deployments/somnia-testnet.template.json`). Until then
 * `CREDIT_DEPLOYED` is false and every credit surface degrades honestly to a
 * "pending deployment" state — the DreamDEX trading product works regardless.
 *
 * Tier keys match the manifest's market keys and the engine's allowed LLTVs:
 * the Ethos ladder is bound to real collateral parameters, not illustrative
 * ones — 1 tBTC supports 2× more borrowing at Reputable (77%) than at Open
 * (38.5%).
 */
import { IS_MEZO } from "./target";

export type TierKey = "open" | "established" | "reputable";

const SOMNIA_DEPLOYMENT = {
  chainId: 50312,
  covenant: "0xA11c466cbebB86f865e2Ccea5F0f273b078E30C7" as `0x${string}` | null,
  notary: "0x82E4C657aaE87151243AE439eC8c33210AE30415" as `0x${string}` | null,
  /** DreamDEX venue collateral (TestUSDC, 6 dec) — borrowed capital trades directly. */
  loanToken: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as `0x${string}`,
  /** Test Wrapped BTC (8 dec) — collateral, mintable from the faucet. */
  collateralToken: "0xCb4f3F36C723C186AbaA3DE6Ec2A04F3656e77eD" as `0x${string}` | null,
  oracle: "0xADbE706FF8c80850457D0A91f19cd79A5C9098E0" as `0x${string}` | null,
  maturity: 1803859200,
  markets: {
    open: {
      gate: "0xEE6fF9E8FD639E15d9a077c2aceF0e8Ba16A4844" as `0x${string}` | null,
      threshold: 0,
      lltv: 385000000000000000n,
      maxLif: 1181683899556868537n,
      marketId: "0xbc1f231da78029b2a891e8c7d80c765224f45697d2bf2a2ee7e7ecb00f3df1ae" as `0x${string}` | null,
    },
    established: {
      gate: "0xC0E6a382e9F761c793F6714fC427e93e26520161" as `0x${string}` | null,
      threshold: 1600,
      lltv: 625000000000000000n,
      maxLif: 1103448275862068965n,
      marketId: "0x987fb3b208df8942d4adb5dfc2639ce997e8d1f1ed29ba41370db429c405149f" as `0x${string}` | null,
    },
    reputable: {
      gate: "0x0f596034793EDDDd3a6c32C00c4BbF780E31868D" as `0x${string}` | null,
      threshold: 2000,
      lltv: 770000000000000000n,
      maxLif: 1061007957559681697n,
      marketId: "0xef116848e2da8cb6553350b02f8670c00a04629f765295797d38baf7cc787046" as `0x${string}` | null,
    },
  } as Record<TierKey, {
    gate: `0x${string}` | null;
    threshold: number;
    lltv: bigint;
    maxLif: bigint;
    marketId: `0x${string}` | null;
  }>,
} as const;

/** Mezo testnet: real MUSD lent against Mezo BTC. Addresses from DeployMezo.s.sol. */
const MEZO_DEPLOYMENT = {
  chainId: 31611,
  covenant: "0x3149af999eB6Faa478E6C2AFe2f5858183Ba17ed" as `0x${string}` | null,
  notary: "0xCDC06AaE7617c3b6f44CC1f2a9a7163252d8a797" as `0x${string}` | null,
  loanToken: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  collateralToken: "0x7b7C000000000000000000000000000000000000" as `0x${string}` | null,
  oracle: "0x0C19a3f5441B519803C34f4fc703c7ce3b2b62de" as `0x${string}` | null,
  maturity: 1803859200,
  markets: {
    open: {
      gate: "0x7dBe32f1e1D3DB45123f60EC5a79312863A7e279" as `0x${string}` | null,
      threshold: 0,
      lltv: 385000000000000000n,
      maxLif: 1181683899556868537n,
      marketId: "0x2e4fea7d8656bbc209cb649362990a937c3011cd4f2fdc813e0972d2a5cfa20a" as `0x${string}` | null,
    },
    established: {
      gate: "0xaBDBf56354494b5328ef3d75bf85Cf8B2288BFC7" as `0x${string}` | null,
      threshold: 1600,
      lltv: 625000000000000000n,
      maxLif: 1103448275862068965n,
      marketId: "0x6cd41664bd5a2d765153ea60de36cf005f41c41d102b4a62af457d8a59f8e437" as `0x${string}` | null,
    },
    reputable: {
      gate: "0xBBD1F4F83BC8D87FF808778D09CfDD1E17D17985" as `0x${string}` | null,
      threshold: 2000,
      lltv: 770000000000000000n,
      maxLif: 1061007957559681697n,
      marketId: "0x4804122681cd41a9184ca049e5b48133010220753d51298c6dbe587a4f0c9cd5" as `0x${string}` | null,
    },
  } as Record<TierKey, {
    gate: `0x${string}` | null;
    threshold: number;
    lltv: bigint;
    maxLif: bigint;
    marketId: `0x${string}` | null;
  }>,
} as const;

const DEPLOYMENT = IS_MEZO ? MEZO_DEPLOYMENT : SOMNIA_DEPLOYMENT;

/** True once every address and market id is present. */
export const CREDIT_DEPLOYED =
  DEPLOYMENT.covenant !== null &&
  DEPLOYMENT.notary !== null &&
  DEPLOYMENT.collateralToken !== null &&
  DEPLOYMENT.oracle !== null &&
  (Object.values(DEPLOYMENT.markets) as { gate: unknown; marketId: unknown }[]).every(
    (m) => m.gate !== null && m.marketId !== null,
  );

export const CREDIT = DEPLOYMENT;

/** Loan/collateral display metadata. Decimals are fixed by the deployment. */
export const CREDIT_TOKENS = IS_MEZO
  ? {
      loan: { symbol: "MUSD", decimals: 18, name: "Mezo USD" },
      collateral: { symbol: "BTC", decimals: 18, name: "Mezo BTC" },
    }
  : {
      loan: { symbol: "tUSDC", decimals: 6, name: "DreamDEX Test Collateral" },
      collateral: { symbol: "tBTC", decimals: 8, name: "Test Wrapped BTC" },
    };

/** The base URL of the Covenant Somnia service (score auths + lender offers). */
export const CREDIT_SERVICE_URL =
  import.meta.env.VITE_CREDIT_SERVICE_URL ?? "http://localhost:3001";

/** Best tier a score qualifies for — mirrors the service's tierFor. */
export function tierForScore(score: number): TierKey {
  if (score >= DEPLOYMENT.markets.reputable.threshold) return "reputable";
  if (score >= DEPLOYMENT.markets.established.threshold) return "established";
  return "open";
}
