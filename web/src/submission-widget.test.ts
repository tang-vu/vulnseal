// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it } from "vitest";
import { programInvitationLink } from "@vulnseal/api/program-invitation";
import { submissionEmbed } from "./submission-embed.js";
import "./submission-widget.js";
const invitation = { format: "vulnseal-program-invitation" as const, version: 1 as const, network: "preprod", contractAddress: "ab".repeat(32), programId: "12".repeat(32) };
const link = programInvitationLink("https://example.test/releases/v1/", invitation);
afterEach(() => document.body.replaceChildren());
it("renders a validated invitation and removes a stale link when attributes change", () => {
  const widget = document.createElement("vulnseal-submission"); widget.setAttribute("invitation", link); document.body.append(widget);
  const anchor = widget.shadowRoot!.querySelector("a")!;
  expect(anchor.href).toBe(link); expect(anchor.target).toBe("_blank"); expect(anchor.rel).toBe("noopener noreferrer");
  expect(widget.shadowRoot!.textContent).toContain(invitation.programId);
  widget.setAttribute("invitation", link + "&actorSecret=private");
  expect(widget.shadowRoot!.querySelector("a")).toBeNull(); expect(widget.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull();
  widget.setAttribute("invitation", link); expect(widget.shadowRoot!.querySelector("a")!.href).toBe(link);
});
it.each(["javascript:alert(1)", "data:text/html,unsafe", "https://user:secret@example.test/#roles?network=preprod"])("rejects unsafe widget invitation %s", value => {
  const widget = document.createElement("vulnseal-submission"); widget.setAttribute("invitation", value); document.body.append(widget);
  expect(widget.shadowRoot!.querySelector("a")).toBeNull();
});
it("generates a release-relative script and usable fallback without credentials/private fields", () => {
  const html = submissionEmbed("https://user:secret@example.test/releases/v1/?token=private", invitation);
  expect(html).not.toContain("secret"); expect(html).not.toContain("private"); expect(html).toContain("&amp;contract=");
  const template = document.createElement("template"); template.innerHTML = html;
  expect(template.content.querySelector("script")!.src).toBe("https://example.test/releases/v1/assets/submission-widget.js");
  expect(template.content.querySelector("script")!.getAttribute("crossorigin")).toBe("anonymous");
  expect(template.content.querySelector("script")!.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(template.content.querySelector("a")!.href).toBe(link);
  expect(() => submissionEmbed(link, { ...invitation, actorSecret: "private" } as typeof invitation)).toThrow();
});
