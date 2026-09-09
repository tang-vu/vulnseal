// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AttachmentDigest } from "@vulnseal/shared";
const mocks = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock("./attachments.js", async (original) => ({ ...await original<typeof import("./attachments.js")>(), hashAttachment: mocks.hash }));
import { AttachmentEditor } from "./AttachmentFields.js";
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
