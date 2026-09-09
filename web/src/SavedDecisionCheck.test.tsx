// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";
import { SavedDecisionCheck } from "./SavedDecisionCheck.js";
import { savedPatchCommitment } from "./patch-comparison.js";

afterEach(cleanup);
const notes = { reportId: "ab".repeat(32), text: "  Saved decision\nExact whitespace matters. ", tier: "3" };
const values = async () => ({ decisionDigest: bytesToHex(await sha256(utf8(notes.text))), severity: "3", rewardTier: "3" });

it("compares the exact saved decision digest and severity and detects later note changes", async () => {
  const observed = await values();
  const view = render(<SavedDecisionCheck circuit="acceptReport" reportId={notes.reportId} notes={notes} values={observed} />);
  expect(await screen.findByText(/Saved decision matches/)).toHaveTextContent("decision text digest, severity tier");
  view.rerender(<SavedDecisionCheck circuit="acceptReport" reportId={notes.reportId} notes={{ ...notes, text: notes.text.trim(), tier: "4" }} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("decision text digest, severity tier");
});

it("compares rejection text without severity and payout tier without unrelated text", async () => {
  const observed = { ...await values(), severity: "0" };
  const view = render(<SavedDecisionCheck circuit="rejectReport" reportId={notes.reportId} notes={notes} values={observed} />);
  expect(await screen.findByText(/Saved decision matches/)).toHaveTextContent("decision text digest");
  view.rerender(<SavedDecisionCheck circuit="authorizePayout" reportId={notes.reportId} notes={{ ...notes, text: "Unrelated working note" }} values={observed} />);
  expect(await screen.findByText(/Saved decision matches/)).toHaveTextContent("reward tier");
  view.rerender(<SavedDecisionCheck circuit="authorizePayout" reportId={notes.reportId} notes={{ ...notes, tier: "4" }} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("reward tier");
});

it("does not claim comparison for missing snapshots, unsupported operations or a different report", async () => {
  const observed = await values();
  const view = render(<SavedDecisionCheck circuit="acceptReport" reportId={notes.reportId} values={observed} />);
  expect(screen.getByText(/No saved decision comparison/)).toBeInTheDocument();
  view.rerender(<SavedDecisionCheck circuit="submitRetest" reportId={notes.reportId} notes={notes} values={observed} />);
  expect(screen.getByText(/not implemented/)).toBeInTheDocument();
  view.rerender(<SavedDecisionCheck circuit="acceptReport" reportId={"cd".repeat(32)} notes={notes} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("different report");
});

it("compares patch commitments from exact saved notes and rejects missing evidence", async () => {
  const observed = { ...await values(), patchCommitment: await savedPatchCommitment(notes.reportId, notes.text) };
  const view = render(<SavedDecisionCheck circuit="anchorPatch" reportId={notes.reportId} notes={notes} values={observed} />);
  expect(await screen.findByText(/Saved decision matches/)).toHaveTextContent("patch commitment");
  view.rerender(<SavedDecisionCheck circuit="anchorPatch" reportId={notes.reportId} notes={{ ...notes, text: notes.text.trim() }} values={observed} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("patch commitment");
  view.rerender(<SavedDecisionCheck circuit="anchorPatch" reportId={notes.reportId} notes={notes} values={{ ...observed, patchCommitment: "" }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No valid replayed patch commitment");
  expect(screen.queryByText(/Saved decision matches/)).not.toBeInTheDocument();
});
