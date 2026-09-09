// SPDX-License-Identifier: Apache-2.0
import { Component, type ReactNode } from "react";
import { RoleCopyCatalog } from "./RoleCopyCatalog.js";

export function AppLoading() {
  return <main id="main-content" className="page narrow-page" aria-busy="true">
    <h1>Loading VulnSeal</h1><p role="status">Preparing the private workspace. The first load may take longer while browser components download.</p>
    <p>If loading does not finish, check your connection and reload this page. Keep your encrypted backups and passwords.</p>
  </main>;
}

export class AppBoundary extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main id="main-content" className="page narrow-page">
      <h1>VulnSeal could not open this view</h1>
      <p role="alert">An application component could not load or render. Check your connection and reload when ready.</p>
      <p>This recovery screen does not delete saved encrypted browser copies. Unsaved edits may not be recoverable. Avoid clearing site data; you may need those copies and their passwords to restore your workspace.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Reload VulnSeal</button>
      <RoleCopyCatalog disabled={false} />
    </main>;
  }
}
