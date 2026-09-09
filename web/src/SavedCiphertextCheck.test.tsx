// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";
import { SavedCiphertextCheck } from "./SavedCiphertextCheck.js";

afterEach(cleanup);
it("matches only exact saved bytes and clears the match after a changed envelope", async () => {
  const envelope = '{"synthetic":"ciphertext"}', digest = bytesToHex(await sha256(utf8(envelope)));
  const view = render(<SavedCiphertextCheck envelope={envelope} digest={digest} />);
  await screen.findByText(/Saved ciphertext matches/);
  view.rerender(<SavedCiphertextCheck envelope={`${envelope}\n`} digest={digest} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("differs from the digest");
  expect(screen.queryByText(/Saved ciphertext matches/)).not.toBeInTheDocument();
});
it("does not claim a match for absent material or malformed evidence", async () => {
  const view = render(<SavedCiphertextCheck digest={"ab".repeat(32)} />);
  expect(screen.getByText(/No saved ciphertext comparison/)).toBeInTheDocument();
  view.rerender(<SavedCiphertextCheck envelope="synthetic" digest="invalid" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not compare");
});
