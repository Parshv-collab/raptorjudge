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
const convexUrl = import.meta.env.VITE_CONVEX_URL || "http://localhost:3210";
document.documentElement.classList.remove("dark");
const client=new ConvexReactClient(convexUrl); purgeLegacyTokenStorage();
createRoot(document.getElementById("root")!).render(<StrictMode><ConvexProvider client={client}><ConvexAuthProvider client={client} storage={createTokenStorage()} storageNamespace="raptorjudge"><BrowserRouter><App/><Toaster richColors position="top-right"/></BrowserRouter></ConvexAuthProvider></ConvexProvider></StrictMode>);
