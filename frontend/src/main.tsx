import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { App } from "./App";
import { wagmiConfig } from "./config/wagmi";

import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

const queryClient = new QueryClient();

/**
 * App entrypoint. Providers layer bottom-up:
 *   Wagmi (chain + transport) → ReactQuery (cache) → RainbowKit (wallet UI) →
 *   Router (client-side routes) → toast portal → App.
 * That order matters: RainbowKit reads from wagmi + query, Router reads from window.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#3b82f6",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <BrowserRouter>
            <App />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#121a2f",
                  color: "#f1f5f9",
                  border: "1px solid rgba(148,163,184,0.14)",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: "13px",
                },
              }}
            />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
