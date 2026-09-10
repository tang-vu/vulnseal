// SPDX-License-Identifier: Apache-2.0
import { parseProgramInvitationLink } from "@vulnseal/api/program-invitation";

/** Public entry widget only: private authoring and signing stay in the VulnSeal tab. */
export class VulnSealSubmission extends HTMLElement {
  static observedAttributes = ["invitation"];
  #root = this.attachShadow({ mode: "open" });
  connectedCallback() { this.#render(); }
  attributeChangedCallback() { if (this.isConnected) this.#render(); }
  #render() {
    this.#root.replaceChildren();
    const style = document.createElement("style");
    style.textContent = ":host{display:block;font:inherit}section{padding:1.25rem;border:1px solid #596773;border-radius:.75rem;background:var(--vulnseal-widget-surface,#f6f8fa);color:var(--vulnseal-widget-text,#17212b)}h2{font-size:1.2rem;margin:0 0 .75rem}p{line-height:1.5}dl{font-size:.875rem}dt{font-weight:700;margin-top:.5rem}dd{margin:0;overflow-wrap:anywhere}a{display:inline-block;margin-top:.75rem;padding:.75rem 1rem;border-radius:.4rem;background:var(--vulnseal-widget-accent,#234e38);color:#fff;text-decoration:none;font-weight:700}a:focus-visible{outline:3px solid #b66d00;outline-offset:3px}";
    this.#root.append(style);
    const section = document.createElement("section"); section.setAttribute("part", "container"); section.setAttribute("aria-label", "VulnSeal submission");
    const title = document.createElement("h2"); title.textContent = "Report a vulnerability"; title.setAttribute("part", "title"); section.append(title);
    try {
      const url = new URL(this.getAttribute("invitation") ?? "");
      const invitation = parseProgramInvitationLink(url.href);
      const description = document.createElement("p"); description.textContent = "Continue in a separate VulnSeal tab to review the program and prepare your private report. Check the program's testing permission first."; section.append(description);
      const details = document.createElement("dl"); details.setAttribute("part", "details");
      for (const [label, value] of [["Network", invitation.network], ["Contract", invitation.contractAddress], ["Program", invitation.programId]]) {
        const term = document.createElement("dt"), definition = document.createElement("dd"); term.textContent = label!; definition.textContent = value!; definition.setAttribute("part", "identifier"); details.append(term, definition);
      }
      const link = document.createElement("a"); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer"; link.textContent = "Start a private report"; link.setAttribute("part", "link");
      section.append(details, link);
    } catch {
      const error = document.createElement("p"); error.setAttribute("role", "alert"); error.textContent = "This program invitation is invalid. Ask the program owner for a valid public invitation."; section.append(error);
    }
    this.#root.append(section);
  }
}
if (!customElements.get("vulnseal-submission")) customElements.define("vulnseal-submission", VulnSealSubmission);
