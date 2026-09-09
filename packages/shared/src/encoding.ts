// SPDX-License-Identifier: Apache-2.0

export const bytesToHex = (value: Uint8Array): string =>
  [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const hexToBytes = (value: string): Uint8Array => {
  const normalized = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal string");
  }
  return Uint8Array.from(
    normalized.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
  );
};

export const bytesToBase64Url = (value: Uint8Array): string => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export const base64UrlToBytes = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url string");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== value) throw new Error("Noncanonical base64url string");
  return bytes;
};

export const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
export const fromUtf8 = (value: Uint8Array): string => new TextDecoder("utf-8", {
  fatal: true,
}).decode(value);

export const assertBytes32 = (value: Uint8Array, name: string): Uint8Array => {
  if (value.byteLength !== 32) throw new Error(`${name} must be exactly 32 bytes`);
  return new Uint8Array(value);
};
