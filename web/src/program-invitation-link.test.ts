// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { parseProgramInvitationLink, programInvitationLink } from "./program-invitation-link.js";
const invitation = { format: "vulnseal-program-invitation" as const, version: 1 as const, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
it("round trips only public invitation fields and preserves a release path", () => {
  const link = programInvitationLink("https://user:secret@example.test/releases/v1/?token=secret#old", invitation);
  expect(link).toMatch(/^https:\/\/example.test\/releases\/v1\/#roles\?/);
  expect(link).not.toContain("secret");
  expect(parseProgramInvitationLink(link)).toEqual(invitation);
  expect(() => programInvitationLink(link, { ...invitation, actorSecret: "secret" } as typeof invitation)).toThrow("Unsupported role document");
});
it.each(["javascript:alert(1)", "file:///private.json", "data:text/plain,hello"])("refuses non-web destinations: %s", base => {
  expect(() => programInvitationLink(base, invitation)).toThrow("HTTP");
  expect(() => parseProgramInvitationLink(base)).toThrow();
});
it.each(["&network=preprod", "&actorSecret=private", "&extra=1"])("rejects extra or duplicated fields: %s", suffix => {
  expect(() => parseProgramInvitationLink(programInvitationLink("https://example.test/", invitation) + suffix)).toThrow("fields");
});
it.each(["https://user:secret@example.test/", "https://example.test/?secret=1"])("rejects incoming credentials and query fields: %s", base => {
  const hash = new URL(programInvitationLink("https://example.test", invitation)).hash;
  expect(() => parseProgramInvitationLink(base + hash)).toThrow("Not a public");
});
