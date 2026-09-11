// SPDX-License-Identifier: Apache-2.0
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { expect, it, vi } from "vitest";
import { findPreviousContractAction } from "./contract-history.js";

const address = "ab".repeat(32), id = "cd".repeat(33);
const action = (height: number, target = false) => ({ __typename: height === 1 ? "ContractDeploy" : "ContractCall", address, entryPoint: "beginTriage", transaction: { hash: height.toString(16).padStart(64, "0"), block: { height, hash: "ef".repeat(32) }, identifiers: [target ? id : height.toString(16).padStart(66, "0")], transactionResult: { status: "SUCCESS" } } });
async function withServer(values: unknown[], run: (url: string, sent: any[]) => Promise<void>, beforeActions = () => {}) {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const sent: any[] = [];
  server.on("connection", (socket) => socket.on("message", (bytes) => {
    const message = JSON.parse(bytes.toString()); sent.push(message);
    if (message.type === "connection_init") socket.send(JSON.stringify({ type: "connection_ack" }));
    if (message.type === "subscribe") { beforeActions(); for (const value of values) socket.send(JSON.stringify({ id: "history", type: "next", payload: { data: { contractActions: value } } })); }
  }));
  try { await run(`ws://127.0.0.1:${(server.address() as { port: number }).port}`, sent); }
  finally { for (const socket of server.clients) socket.terminate(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}
const scan = (websocketUrl: string, options = {}) => findPreviousContractAction({ websocketUrl, contractAddress: address, deploymentHeight: 1, transactionId: id, ...options });
it("captures the requested deployment before the WebSocket handshake", async () => {
  await withServer([action(1), action(2, true)], async (url, sent) => {
    const options = { websocketUrl: url, contractAddress: address, deploymentHeight: 1, transactionId: id };
    const pending = findPreviousContractAction(options);
    options.deploymentHeight = 99;
    await expect(pending).resolves.toMatchObject({ previous: { blockHeight: 1 }, target: { blockHeight: 2 } });
    expect(sent.find(message => message.type === "subscribe").payload.variables.offset.height).toBe(1);
  });
});

it.each([false, true])("removes the original abort listener after options change, cancelled=%s", async cancelled => {
  await withServer([action(1), action(2, true)], async url => {
    const original = new AbortController(), replacement = new AbortController();
    const add = vi.spyOn(original.signal, "addEventListener"), remove = vi.spyOn(original.signal, "removeEventListener");
    try {
      const options = { websocketUrl: url, contractAddress: address, deploymentHeight: 1, transactionId: id, signal: original.signal };
      const pending = findPreviousContractAction(options);
      options.signal = replacement.signal;
      if (cancelled) { original.abort(); await expect(pending).rejects.toThrow("cancelled"); }
      else await expect(pending).resolves.toMatchObject({ target: { blockHeight: 2 } });
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]![1]);
    } finally { add.mockRestore(); remove.mockRestore(); }
  });
});
it("finds the adjacent action through a real WebSocket subscription from deployment", async () => {
  await withServer([action(1), action(2), action(3, true)], async (url, sent) => {
    const result = await scan(url);
    expect(result.previous.blockHeight).toBe(2); expect(result.target.blockHeight).toBe(3); expect(result.actionsRead).toBe(3);
    expect(sent.find((message) => message.type === "subscribe").payload.variables).toEqual({ address, offset: { height: 1 } });
  });
});

it.each(["wall", "monotonic", "backwards wall"])("rejects %s expiry on a real socket before accepting a delayed target", async clock => {
  let wall = 1000, monotonic = 1000;
  const wallSpy = vi.spyOn(Date, "now").mockImplementation(() => wall);
  const monotonicSpy = vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  try {
    await withServer([action(1), action(2, true)], async url => {
      await expect(scan(url)).rejects.toThrow("History scan timed out");
    }, () => {
      if (clock === "wall") wall += 20_000;
      else { monotonic += 20_000; if (clock === "backwards wall") wall -= 60_000; }
    });
  } finally { wallSpy.mockRestore(); monotonicSpy.mockRestore(); }
  await withServer([action(1), action(2, true)], async url => {
    await expect(scan(url)).resolves.toMatchObject({ target: { blockHeight: 2 } });
  });
});
it("refuses foreign, incomplete, same-block and unsuccessful streams", async () => {
  const samples = [[action(2)], [action(1), action(1, true)], [action(1), { ...action(2, true), address: "ff".repeat(32) }], [action(1), { ...action(2, true), transaction: { ...action(2).transaction, transactionResult: { status: "PARTIAL_SUCCESS" } } }], [null]];
  for (const values of samples) await withServer(values, async (url) => { await expect(scan(url)).rejects.toThrow(); });
});
it("stops at the action budget, deadline and explicit cancellation without returning a guessed predecessor", async () => {
  await withServer([action(1), action(2), action(3, true)], async (url) => { await expect(scan(url, { maxActions: 2 })).rejects.toThrow("limit"); });
  await withServer([action(1)], async (url) => { await expect(scan(url, { timeoutMs: 200 })).rejects.toThrow("timed out"); });
  await withServer([action(1)], async (url) => {
    const controller = new AbortController(); const pending = scan(url, { signal: controller.signal });
    controller.abort(); await expect(pending).rejects.toThrow("cancelled");
  });
});
