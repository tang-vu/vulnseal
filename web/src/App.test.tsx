// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import App from "./App.js";

describe("VulnSeal product interface", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete window.midnight;
  });

  it("explains the product and honest local evidence boundary", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Disclose the truth/i })).toBeInTheDocument();
    expect(screen.getByText(/workflow changes are not Midnight transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/Exploit details sealed/i)).toBeInTheDocument();
  });

  it("completes local encryption, ciphertext upload, and receipt flow", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ stored: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/i }));
    expect(await screen.findByRole("heading", { name: "Your report is sealed" })).toBeInTheDocument();
    expect(screen.getByText(/Guided local receipt · not on-chain/i)).toBeInTheDocument();
    expect(screen.getByText("AES-256-GCM")).toBeInTheDocument();
  });

  it("shows a proof-server configuration failure without exposing secrets", async () => {
    const user = userEvent.setup();
    window.midnight = {
      lace: {
        apiVersion: "4.0.1",
        connect: vi.fn().mockResolvedValue({
          getConnectionStatus: vi.fn().mockResolvedValue({ status: "connected", networkId: "preprod" }),
          getConfiguration: vi.fn().mockResolvedValue({
            indexerUri: "https://indexer.example.test/graphql",
            indexerWsUri: "wss://indexer.example.test/graphql/ws",
          }),
        }),
      } as never,
    };
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Guided local" }));
    expect(await screen.findByText("Wallet has no proof-server configuration")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("actorSecret");
  });

  it("has no serious or critical automated accessibility violations", async () => {
    const { container } = render(<App />);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    const material = results.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical",
    );
    expect(material).toEqual([]);
  });

  it("keeps a usable verifier empty state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: /Verify/i })[0]!);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Verify a sealed disclosure" })).toBeInTheDocument());
    expect(screen.getByText(/never needs the vulnerability plaintext/i)).toBeInTheDocument();
  });
});
