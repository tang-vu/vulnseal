// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import { parseInvitation, type ProgramInvitation } from "./role-recovery.js";
import { parseProgramInvitationLink } from "./program-invitation-link.js";

export function ProgramInvitationJoin({ onJoin }: { onJoin: (invitation: ProgramInvitation) => void }) {
  const initial = window.location.hash.startsWith("#roles?") ? window.location.href : "";
  const [link, setLink] = useState(initial);
  const [review, setReview] = useState<{ invitation?: ProgramInvitation; error?: string }>(() => decode(initial));
  const generation = useRef(0), fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; }, []);
  function decode(value: string) {
    if (!value) return {};
    try { return { invitation: parseProgramInvitationLink(value) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : "Invalid public invitation" }; }
  }
  const read = async (file?: File) => {
    const current = ++generation.current; setLink(""); setReview({});
    if (!file) return;
    try {
      if (file.size > 4096) throw new Error("Program invitation is too large");
      const invitation = parseInvitation(await file.text());
      if (current === generation.current) setReview({ invitation });
    } catch (cause) {
      if (current === generation.current) setReview({ error: cause instanceof Error ? cause.message : "Cannot read public invitation" });
    }
  };
  return <form className="form-panel" onSubmit={event => { event.preventDefault(); if (review.invitation) onJoin(review.invitation); }}>
    <h2>Join as researcher</h2>
    <p>Open a vendor invitation link or import its public invitation file. Confirm the network, contract address and program ID through your agreed channel before connecting Lace. An invitation does not establish testing permission or vendor ownership.</p>
    <label>Program invitation URL<input type="text" inputMode="url" value={link} maxLength={4096} onChange={event => { generation.current++; if (fileInput.current) fileInput.current.value = ""; setLink(event.target.value); setReview(decode(event.target.value)); }} /></label>
    <label>Public program invitation<input ref={fileInput} type="file" accept=".json,application/json" onChange={event => void read(event.target.files?.[0])} /></label>
    {review.error && <p role="alert">{review.error}</p>}
    {review.invitation && <section aria-label="Review public program invitation">
      <h3>Review program invitation</h3>
      <dl><dt>Network</dt><dd>{review.invitation.network}</dd><dt>Contract address</dt><dd className="public-value">{review.invitation.contractAddress}</dd><dt>Program ID</dt><dd className="public-value">{review.invitation.programId}</dd></dl>
      <p>Joining checks the program with your wallet connection. It does not submit a report.</p>
    </section>}
    <button className="primary-button" disabled={!review.invitation}>Connect Lace and join as researcher</button>
  </form>;
}
