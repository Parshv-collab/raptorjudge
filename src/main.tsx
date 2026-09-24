/// <reference types="vite/client" />

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";
import { createTokenStorage, purgeLegacyTokenStorage } from "./lib/tokenStorage";

declare const __CONVEX_URL__: string;
const convexUrl =
  typeof __CONVEX_URL__ !== "undefined" && __CONVEX_URL__ !== "__CONVEX_URL_PLACEHOLDER__"
    ? __CONVEX_URL__
    : (import.meta.env.VITE_CONVEX_URL as string);
const client = new ConvexReactClient(convexUrl);

// Security item 68: drop any session/refresh token an earlier build wrote to
// localStorage, then keep tokens in sessionStorage (per tab, cleared on close)
// instead of a credential that outlives the browser session.
purgeLegacyTokenStorage();
const tokenStorage = createTokenStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={client}>
      <ConvexAuthProvider
        client={client}
        storage={tokenStorage}
        storageNamespace="raptorjudge"
      >
        <BrowserRouter>
          <App />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </ConvexAuthProvider>
    </ConvexProvider>
  </StrictMode>,
);
