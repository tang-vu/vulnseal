// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { bytesToHex, sha256, utf8 } from "@vulnseal/shared";

export function SavedCiphertextCheck({ envelope, digest }: { envelope?: string | undefined; digest?: string | undefined }) {
  const [result, setResult] = useState<"match" | "mismatch" | "error">();
  useEffect(() => {
    let active = true; setResult(undefined);
    if (!envelope || !digest) return;
    if (!/^[a-f0-9]{64}$/.test(digest)) { setResult("error"); return; }
    void sha256(utf8(envelope)).then((value) => { if (active) setResult(bytesToHex(value) === digest ? "match" : "mismatch"); }, () => { if (active) setResult("error"); });
    return () => { active = false; };
  }, [envelope, digest]);
  if (!envelope || !digest) return <p>No saved ciphertext comparison is available for this journal entry.</p>;
  if (!result) return <p role="status">Comparing the saved ciphertext locally…</p>;
  return <div>
    {result === "match" ? <p>Saved ciphertext matches the digest in the replayed report.</p> : <p role="alert">{result === "mismatch" ? "Saved ciphertext differs from the digest in the replayed report. Keep your backup and investigate; do not resubmit automatically." : "Could not compare the saved ciphertext with the replayed digest."}</p>}
    <p>This hashes the exact saved envelope on this device. It does not upload ciphertext, test remote retention, authenticate chain data, verify every submission argument or make retry safe.</p>
  </div>;
}
