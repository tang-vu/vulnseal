// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SavedRetestCheck } from "./SavedRetestCheck.js";
import { savedRetestCommitment } from "./retest-comparison.js";
afterEach(cleanup);
const notes = { reportId: "ab".repeat(32), text: " Exact retest\n", tier: "3" };
const values = async () => ({ decisionDigest: "00".repeat(32), severity: "3", rewardTier: "0", patchCommitment: "cd".repeat(32), retestPassed: false, retestCommitment: await savedRetestCommitment(notes.reportId, "cd".repeat(32), notes.text, false) });

it("compares explicit false and exact notes, and clears a match after the choice changes", async () => {
  const observed = await values();
  const view = render(<SavedRetestCheck reportId={notes.reportId} notes={notes} passed={false} values={observed} />);
  expect(await screen.findByText(/Saved retest matches/)).toBeInTheDocument();
  view.rerender(<SavedRetestCheck reportId={notes.reportId} notes={notes} passed={true} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Pass/Fail choice, retest commitment");
  view.rerender(<SavedRetestCheck reportId={notes.reportId} notes={{ ...notes, text: notes.text.trim() }} passed={false} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("retest commitment");
});

it("never guesses old choices or claims comparison for missing and foreign evidence", async () => {
  const observed = await values();
  const view = render(<SavedRetestCheck reportId={notes.reportId} notes={notes} values={observed} />);
  expect(screen.getByText(/Older choices are not inferred/)).toBeInTheDocument();
  view.rerender(<SavedRetestCheck reportId={notes.reportId} notes={notes} passed={false} values={{ ...observed, retestCommitment: "" }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No valid replayed retest evidence");
  view.rerender(<SavedRetestCheck reportId={"ef".repeat(32)} notes={notes} passed={false} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("different report");
  expect(screen.queryByText(/Saved retest matches/)).not.toBeInTheDocument();
});
