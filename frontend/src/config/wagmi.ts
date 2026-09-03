import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";
import { CHAIN, CHAIN_RPC_HTTP, WC_PROJECT_ID } from "./chain";

const wallets = [
  {
    groupName: "Browser wallets",
    wallets: [
      injectedWallet,
      metaMaskWallet,
      coinbaseWallet,
      ...(WC_PROJECT_ID ? [walletConnectWallet] : []),
    ],
  },
];

export const wagmiConfig = getDefaultConfig({
  appName: "Covenant",
  // RainbowKit requires a projectId even when WalletConnect is not enabled.
  // The disabled fallback is never used by a connector because the wallet list
  // above only adds WalletConnect when a real project id is configured.
  projectId: WC_PROJECT_ID || "disabled",
  wallets,
  chains: [CHAIN],
  transports: { [CHAIN.id]: http(CHAIN_RPC_HTTP) },
  ssr: false,
});
