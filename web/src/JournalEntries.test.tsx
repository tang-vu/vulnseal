// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { JournalEntries } from "./JournalEntries.js";
import type { SubmissionAttempt } from "./role-recovery.js";
afterEach(cleanup);
const entries: SubmissionAttempt[] = Array.from({ length: 23 }, (_, i) => ({ transactionId: (i + 1).toString(16).padStart(64, "0"), recordedAt: "2026-09-09T00:00:00.000Z", intent: { circuit: i === 0 ? "anchorPatch" : "beginTriage", reportId: `${i === 0 ? "ab" : "cd"}`.repeat(32) }, notes: { reportId: "ab".repeat(32), text: "Private text is not a search field", tier: "3" } }));
const row = (entry: SubmissionAttempt) => <li>{entry.transactionId}</li>;

it("pages all retained attempts newest first and searches public identifiers without mutating history", () => {
  render(<JournalEntries entries={entries} label="Search journal">{row}</JournalEntries>);
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(entries[22]!.transactionId);
  fireEvent.click(screen.getByRole("button", { name: "Older attempts" }));
  fireEvent.click(screen.getByRole("button", { name: "Older attempts" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Older attempts" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search journal"), { target: { value: "ANCHORPATCH" } });
  expect(screen.getByRole("status")).toHaveTextContent("1 of 23 attempts match. Page 1 of 1");
  expect(screen.getByRole("listitem")).toHaveTextContent(entries[0]!.transactionId);
  fireEvent.change(screen.getByLabelText("Search journal"), { target: { value: "AB".repeat(32) } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Search journal"), { target: { value: entries[22]!.transactionId } });
  expect(screen.getByRole("listitem")).toHaveTextContent(entries[22]!.transactionId);
  fireEvent.change(screen.getByLabelText("Search journal"), { target: { value: "Private text" } });
  expect(screen.getByRole("status")).toHaveTextContent("No matching attempts");
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  expect(entries).toHaveLength(23);
});

it("returns to the newest page on a new journal and discards search state on close", () => {
  const view = render(<JournalEntries entries={entries} label="Search journal">{row}</JournalEntries>);
  fireEvent.click(screen.getByRole("button", { name: "Older attempts" }));
  view.rerender(<JournalEntries entries={entries.slice(0, 1)} label="Search journal">{row}</JournalEntries>);
  expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 1");
  fireEvent.change(screen.getByLabelText("Search journal"), { target: { value: "absent" } });
  view.unmount();
  render(<JournalEntries entries={entries} label="Search journal">{row}</JournalEntries>);
  expect(screen.getByLabelText("Search journal")).toHaveValue("");
});
