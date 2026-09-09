// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";

type Health = { usage: number | undefined; quota: number | undefined; persisted: boolean | undefined; canRequest: boolean; checkedAt: string };
const bytes = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const display = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
const readHealth = async (): Promise<Health> => {
  const storage = navigator.storage;
  const [estimate, persistent] = await Promise.allSettled([
    Promise.resolve().then(() => storage?.estimate?.()),
    Promise.resolve().then(() => storage?.persisted?.()),
  ]);
  return {
    usage: estimate.status === "fulfilled" ? bytes(estimate.value?.usage) : undefined,
    quota: estimate.status === "fulfilled" ? bytes(estimate.value?.quota) : undefined,
    persisted: persistent.status === "fulfilled" && typeof persistent.value === "boolean" ? persistent.value : undefined,
    canRequest: typeof storage?.persist === "function",
    checkedAt: new Date().toLocaleTimeString(),
  };
};

/** Origin-wide browser estimates; never reads or decrypts a role copy. */
export function BrowserStorageHealth() {
  const [health, setHealth] = useState<Health>();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0), busy = useRef(false);
  const refresh = async (request = false) => {
    if (busy.current) return;
    busy.current = true; const current = ++generation.current;
    setWorking(true); setMessage("");
    try {
      const granted = request ? await navigator.storage.persist() : undefined;
      const observed = await readHealth();
      if (generation.current !== current) return;
      setHealth(observed);
      if (request) setMessage(granted ? "Storage request completed. Check the browser-reported status below and keep a file backup." : "The browser did not grant persistent storage. Keep an independent file backup; you can try again later.");
    } catch {
      if (generation.current === current) setMessage("Browser storage information or permission is unavailable. Keep an independent encrypted file backup.");
    } finally {
      if (generation.current === current) { busy.current = false; setWorking(false); }
    }
  };
  useEffect(() => {
    void refresh();
    return () => { generation.current++; busy.current = false; };
  }, []);
  return <details className="browser-storage-health">
    <summary>Device storage and retention</summary>
    <p>These estimates cover all data stored by this site, not only role backups. Available space can change; an estimate does not reserve space for the next save.</p>
    {health && <>
      <p>Last checked: {health.checkedAt}.</p>
      <p>Estimated site usage: {health.usage === undefined ? "Unavailable" : display(health.usage)}. Estimated site quota: {health.quota === undefined ? "Unavailable" : display(health.quota)}.</p>
      {health.usage !== undefined && health.quota !== undefined && <p>Estimated remaining space: {display(Math.max(0, health.quota - health.usage))}.</p>}
      <p>Browser-reported storage retention: {health.persisted === true ? "Persistent" : health.persisted === false ? "Best effort; the browser may evict site data" : "Unknown or unsupported"}.</p>
      {!health.canRequest && <p>This browser does not expose a persistent-storage request here.</p>}
    </>}
    <p>Persistent storage reduces automatic eviction risk when granted. Clearing site data, losing the device or deleting a copy can still remove it. Keep a downloaded encrypted backup and its password separately.</p>
    {working && <p role="status">Checking browser storage…</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="secondary-button" disabled={working} onClick={() => void refresh()}>Refresh storage status</button>
    <button type="button" className="secondary-button" disabled={working || !health?.canRequest || health.persisted === true} onClick={() => void refresh(true)}>Request persistent storage</button>
  </details>;
}
