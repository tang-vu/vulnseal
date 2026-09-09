// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AttachmentDigest } from "@vulnseal/shared";
const mocks = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock("./attachments.js", async (original) => ({ ...await original<typeof import("./attachments.js")>(), hashAttachment: mocks.hash }));
import { AttachmentEditor, AttachmentReview } from "./AttachmentFields.js";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const entry = { filename: "proof.txt", mediaType: "text/plain", size: 3, sha256: "ab".repeat(32) };

it("preserves report edits made while hashing and blocks sealing until the digest is added", async () => {
  let finish!: (entry: AttachmentDigest) => void;
  mocks.hash.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  function Harness() {
    const [draft, setDraft] = useState({ title: "Before", attachments: [] as readonly AttachmentDigest[] });
    const [pending, setPending] = useState(false);
    return <><input aria-label="Draft title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><AttachmentEditor attachments={draft.attachments} onChange={(attachments) => setDraft({ ...draft, attachments })} onPending={setPending} /><button disabled={pending}>Seal</button></>;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Hash a local attachment"), { target: { files: [new File(["abc"], "proof.txt")] } });
  expect(screen.getByRole("button", { name: "Seal" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Draft title"), { target: { value: "Edited while hashing" } });
  await act(async () => finish(entry));
  expect(screen.getByLabelText("Draft title")).toHaveValue("Edited while hashing");
  expect(screen.getByText(entry.sha256)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Seal" })).toBeEnabled();
});

it("discards a file read that finishes after leaving the editor", async () => {
  let finish!: (entry: AttachmentDigest) => void;
  mocks.hash.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const change = vi.fn();
  const { unmount } = render(<AttachmentEditor attachments={[]} onChange={change} onPending={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Hash a local attachment"), { target: { files: [new File(["abc"], "proof.txt")] } });
  unmount();
  await act(async () => finish(entry));
  expect(change).not.toHaveBeenCalled();
});

it("lets the author cancel hashing and ignores the old result while a replacement is pending", async () => {
  let first!: (value: AttachmentDigest) => void, second!: (value: AttachmentDigest) => void;
  mocks.hash.mockImplementationOnce(() => new Promise((resolve) => { first = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
  const change = vi.fn(), pending = vi.fn();
  render(<AttachmentEditor attachments={[]} onChange={change} onPending={pending} />);
  const input = screen.getByLabelText("Hash a local attachment");
  fireEvent.change(input, { target: { files: [new File(["abc"], "old.txt")] } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel hashing" }));
  expect(pending).toHaveBeenLastCalledWith(false);
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { files: [new File(["abc"], "proof.txt")] } });
  await act(async () => first({ ...entry, filename: "old.txt" }));
  expect(change).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "Cancel hashing" })).toBeInTheDocument();
  await act(async () => second(entry));
  expect(change).toHaveBeenCalledExactlyOnceWith([entry]);
  expect(pending).toHaveBeenLastCalledWith(false);
});

it("keeps a canceled review neutral when the file read later fails", async () => {
  let reject!: (cause: Error) => void;
  mocks.hash.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<AttachmentReview attachments={[entry]} />);
  fireEvent.change(screen.getByLabelText("Check local file against proof.txt"), { target: { files: [new File(["abc"], "proof.txt")] } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel file check" }));
  await act(async () => reject(new Error("Late file error")));
  expect(screen.getByRole("status")).toHaveTextContent("File check canceled. No comparison was made.");
  expect(screen.queryByText("Late file error")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel file check" })).not.toBeInTheDocument();
});

it("clears old comparison results and pending checks when sealed metadata changes", async () => {
  mocks.hash.mockResolvedValueOnce(entry);
  const { rerender } = render(<AttachmentReview attachments={[entry]} />);
  fireEvent.change(screen.getByLabelText("Check local file against proof.txt"), { target: { files: [new File(["abc"], "proof.txt")] } });
  expect(await screen.findByText("File bytes match the sealed attachment digest and size.")).toBeInTheDocument();
  rerender(<AttachmentReview attachments={[{ ...entry, filename: "renamed.txt" }]} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  rerender(<AttachmentReview attachments={[entry]} />);
  let finish!: (value: AttachmentDigest) => void;
  mocks.hash.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.change(screen.getByLabelText("Check local file against proof.txt"), { target: { files: [new File(["abc"], "proof.txt")] } });
  rerender(<AttachmentReview attachments={[{ ...entry, size: 4 }]} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => finish(entry));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  mocks.hash.mockResolvedValueOnce(entry);
  fireEvent.change(screen.getByLabelText("Check local file against proof.txt"), { target: { files: [new File(["abc"], "proof.txt")] } });
  expect(await screen.findByText("File does not match the sealed attachment digest and size.")).toBeInTheDocument();
});
