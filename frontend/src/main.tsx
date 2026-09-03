import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SomniaMarketsProvider } from "@somnia-chain/markets-sdk/react";

import { App } from "./App";
import { wagmiConfig } from "./config/wagmi";
import { dreamdexClient } from "./config/dreamdex";

import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

const queryClient = new QueryClient();

/**
 * App entrypoint. Providers layer bottom-up:
 *   Wagmi (chain + transport) → ReactQuery (cache) → RainbowKit (wallet UI) →
 *   SomniaMarkets (live DreamDEX tail) → Router (client-side routes) →
 *   toast portal → App.
 *
 * That order matters: RainbowKit reads from wagmi + query, Router reads from
 * window. SomniaMarketsProvider sits above the Router so the venue watch and
 * its local store survive navigation — moving between markets re-uses the tail
 * rather than re-hydrating it.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            /* The wallet sheet is the one large surface RainbowKit paints, and
               its accent must be the brand ramp, not the library default blue.
               brand-500 with the cream foreground is the exact pairing
               .btn-primary uses, so the modal's connect button and the app's
               primary buttons read as one product. The page is light; a dark
               modal sheet would land as a different product entirely. */
            accentColor: "#2e3d28",
            accentColorForeground: "#f4f0e5",
            borderRadius: "medium",
            /* RainbowKit's fontStack is an enum ("rounded" | "system"), not a
               CSS stack — an arbitrary family here is a type error and is
               ignored at runtime. Inter is applied to the sheet through the
               global font-family in index.css instead. */
            fontStack: "system",
          })}
        >
          <SomniaMarketsProvider client={dreamdexClient}>
            <BrowserRouter>
              <App />
              <Toaster
                position="bottom-right"
                toastOptions={{
                  /* Same surface recipe as .dropdown-panel / .modal-panel:
                     surface-raised fill, line hairline, Inter at the
                     body-sm step, the popover shadow. A black toast on a
                     cream page reads as an error even when it carries
                     success. */
                  style: {
                    background: "#ffffff",
                    color: "#161911",
                    border: "1px solid rgba(30, 30, 20, 0.18)",
                    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                    fontSize: "13px",
                    boxShadow: "0 18px 40px -12px rgba(20,20,10,0.16)",
                  },
                }}
              />
            </BrowserRouter>
          </SomniaMarketsProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
