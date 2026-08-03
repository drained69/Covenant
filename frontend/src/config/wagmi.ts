import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { CHAIN, WC_PROJECT_ID } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "Covenant",
  projectId: WC_PROJECT_ID,
  chains: [CHAIN],
  transports: { [CHAIN.id]: http() },
  ssr: false,
});
