// SPDX-License-Identifier: Apache-2.0
import "./globals.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import App from "./App.js";
import { RoleWorkspace } from "./RoleWorkspace.js";
import "./styles.css";

const configuredNetwork = import.meta.env.VITE_MIDNIGHT_NETWORK ?? "undeployed";
setNetworkId(configuredNetwork);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.hash === "#roles" ? <RoleWorkspace /> : <App />}
  </React.StrictMode>,
);
