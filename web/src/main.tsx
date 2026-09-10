// SPDX-License-Identifier: Apache-2.0
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { AppBoundary, AppLoading } from "./AppBoundary.js";
import "./styles.css";

const roleMode = window.location.hash === "#roles" || window.location.hash.startsWith("#roles?");
const Workspace = lazy(async () => {
  await import("./globals.js");
  const { setNetworkId } = await import("@midnight-ntwrk/midnight-js-network-id");
  setNetworkId(import.meta.env.VITE_MIDNIGHT_NETWORK ?? "undeployed");
  return roleMode
    ? import("./RoleWorkspace.js").then(({ RoleWorkspace }) => ({ default: RoleWorkspace }))
    : import("./App.js");
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary><Suspense fallback={<AppLoading />}><Workspace /></Suspense></AppBoundary>
  </React.StrictMode>,
);
