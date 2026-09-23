/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { createTokenStorage, purgeLegacyTokenStorage } from "./lib/tokenStorage";

const client = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
purgeLegacyTokenStorage();
createRoot(document.getElementById("root")!).render(<StrictMode><ConvexProvider client={client}><ConvexAuthProvider client={client} storage={createTokenStorage()} storageNamespace="raptorjudge"><BrowserRouter><App /></BrowserRouter></ConvexAuthProvider></ConvexProvider></StrictMode>);
