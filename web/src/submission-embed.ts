// SPDX-License-Identifier: Apache-2.0
import { programInvitationLink, type ProgramInvitation } from "@vulnseal/api/program-invitation";
const attribute = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
export function submissionEmbed(base: string, invitation: ProgramInvitation): string {
  const link = programInvitationLink(base, invitation);
  const script = new URL("assets/submission-widget.js", link).href;
  return `<script type="module" src="${attribute(script)}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>\n<vulnseal-submission invitation="${attribute(link)}">\n  <a href="${attribute(link)}" target="_blank" rel="noopener noreferrer">Report a vulnerability on VulnSeal</a>\n</vulnseal-submission>`;
}
