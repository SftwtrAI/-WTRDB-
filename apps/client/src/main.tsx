import * as React from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as TanStackReactQuery from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./i18n";

// Expose React globally for plugin bundles
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;

// Expose TanStack Query globally for plugin bundles
// This allows plugins to use the host app's QueryClient and hooks
(window as any).TanStackReactQuery = TanStackReactQuery;

createRoot(document.getElementById("root")!).render(<App />);
