// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import App from "./App.js";

describe("VulnSeal product interface", () => {
  it("warns for edited private drafts, clears when reverted, and removes its listener on unmount", async () => {
    const user = userEvent.setup();
    const leaving = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    const view = render(<App />);
    expect(leaving()).toBe(false);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/i }));
    expect(leaving()).toBe(false);
    const title = screen.getByLabelText("Report title");
    const original = (title as HTMLInputElement).value;
    await user.clear(title);
    expect(leaving()).toBe(true);
    await user.type(title, original);
    expect(leaving()).toBe(false);
    await user.type(title, " private edit");
    expect(leaving()).toBe(true);
    view.unmount();
    expect(leaving()).toBe(false);
  });
  it("does not claim a saved ciphertext when report validation fails before encryption", async () => {
    const user = userEvent.setup();
    const upload = vi.fn(); vi.stubGlobal("fetch", upload);
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/i }));
    await user.clear(screen.getByLabelText("Report title"));
    fireEvent.submit(screen.getByRole("button", { name: /Encrypt & seal/i }).closest("form")!);
    await screen.findByRole("heading", { name: "Review your draft" });
    expect(screen.getByText(/Preparation did not finish/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry saved report upload" })).not.toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review report" }));
    expect(screen.getByLabelText("Report title")).toHaveValue("");
  });
  it("retries a failed upload with the same prepared ciphertext and prevents draft replacement", async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockRejectedValueOnce(new Error("Upload response lost")).mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", upload);
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Seal a vulnerability/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Encrypt & seal/i }));
    expect(await screen.findByText(/The ciphertext may already be stored/)).toHaveTextContent("retry its identical ciphertext");
    const leaving = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Review report" }));
    expect(screen.queryByLabelText("Report title")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry saved report upload" }));
    await screen.findByRole("heading", { name: "Your report is sealed" });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]![0]).toBe(upload.mock.calls[0]![0]);
    expect(upload.mock.calls[1]![1].body).toBe(upload.mock.calls[0]![1].body);
    const finished = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(finished);
    expect(finished.defaultPrevented).toBe(true); // The sealed report's key is still in this tab.
  });
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
