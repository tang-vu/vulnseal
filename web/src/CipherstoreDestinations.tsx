// SPDX-License-Identifier: Apache-2.0
export function CipherstoreDestinations({ urls }: { readonly urls: readonly string[] }) {
  return <details><summary>Ciphertext storage destinations ({urls.length})</summary><p>Only encrypted report bytes are uploaded. {urls.length > 1 ? "Every configured store must acknowledge the upload. Reads try the next store if a copy is unavailable or fails its digest check." : "This configuration uses one storage endpoint."} Operators can observe ciphertext size, address and request timing. Keep your encrypted backup; an acknowledgment is not a retention guarantee.</p><ul>{urls.map((url) => <li key={url} className="public-value">{url}</li>)}</ul></details>;
}
