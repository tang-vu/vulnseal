// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProgramInvitationJoin } from "./ProgramInvitationJoin.js";
import { programInvitationLink } from "./program-invitation-link.js";
const invitation = { format: "vulnseal-program-invitation" as const, version: 1 as const, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
const link = programInvitationLink(window.location.href, invitation);
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
it("reviews an incoming link and joins only on explicit submission", () => {
  window.history.replaceState(null, "", link);
  const join = vi.fn(); render(<ProgramInvitationJoin onJoin={join} />);
  expect(screen.getByRole("region", { name: "Review public program invitation" })).toHaveTextContent(invitation.contractAddress);
  expect(join).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Connect Lace and join as researcher" }));
  expect(join).toHaveBeenCalledExactlyOnceWith(invitation);
  fireEvent.change(screen.getByLabelText("Program invitation URL"), { target: { value: link + "&actorSecret=private" } });
  expect(screen.getByRole("button")).toBeDisabled();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
it("ignores a late file read after a different invitation link is selected", async () => {
  let finish!: (text: string) => void;
  const file = new File(["pending"], "invitation.json");
  Object.defineProperty(file, "text", { value: () => new Promise<string>(resolve => { finish = resolve; }) });
  const join = vi.fn(); render(<ProgramInvitationJoin onJoin={join} />);
  fireEvent.change(screen.getByLabelText("Public program invitation"), { target: { files: [file] } });
  const other = { ...invitation, programId: "34".repeat(32) };
  fireEvent.change(screen.getByLabelText("Program invitation URL"), { target: { value: programInvitationLink(window.location.href, other) } });
  await act(async () => { finish(JSON.stringify(invitation)); });
  expect(screen.getByRole("region")).toHaveTextContent(other.programId);
  fireEvent.click(screen.getByRole("button"));
  expect(join).toHaveBeenCalledExactlyOnceWith(other);
});
it("refuses oversized files before reading them", async () => {
  const file = new File(["x".repeat(4097)], "large.json"), read = vi.fn();
  Object.defineProperty(file, "text", { value: read });
  render(<ProgramInvitationJoin onJoin={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Public program invitation"), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("too large");
  expect(read).not.toHaveBeenCalled(); expect(screen.getByRole("button")).toBeDisabled();
});
