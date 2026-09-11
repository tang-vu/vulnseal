// SPDX-License-Identifier: Apache-2.0
export type HistoricalAction = {
  readonly kind: "ContractDeploy" | "ContractCall" | "ContractUpdate";
  readonly address: string; readonly entryPoint: string | null;
  readonly transactionHash: string; readonly identifiers: readonly string[];
  readonly blockHeight: number; readonly blockHash: string;
};
const hex = (value: unknown, identifier = false): string => {
  if (typeof value !== "string" || !(identifier ? /^(?:0x)?(?:[a-f0-9]{64}|[a-f0-9]{66})$/i : /^(?:0x)?[a-f0-9]{64}$/i).test(value)) throw new Error("Invalid history identifier");
  return value.replace(/^0x/i, "").toLowerCase();
};
const parseAction = (value: any): HistoricalAction => {
  if (!value || !["ContractDeploy", "ContractCall", "ContractUpdate"].includes(value.__typename)) throw new Error("Unsupported history action");
  const tx = value.transaction;
  if (!Array.isArray(tx?.identifiers) || !tx.identifiers.length || tx.identifiers.length > 64 || tx.transactionResult?.status !== "SUCCESS" || !Number.isSafeInteger(tx.block?.height) || tx.block.height < 0) throw new Error("Malformed or unsuccessful history action");
  if (value.__typename === "ContractCall" && (typeof value.entryPoint !== "string" || !value.entryPoint.length || value.entryPoint.length > 256)) throw new Error("Invalid history circuit");
  return { kind: value.__typename, address: hex(value.address), entryPoint: value.__typename === "ContractCall" ? value.entryPoint : null, transactionHash: hex(tx.hash), identifiers: tx.identifiers.map((id: unknown) => hex(id, true)), blockHeight: tx.block.height, blockHash: hex(tx.block.hash) };
};
const query = `subscription RecoveryHistory($address: HexEncoded!, $offset: BlockOffset!) {
  contractActions(address: $address, offset: $offset) { __typename address
    ... on ContractCall { entryPoint }
    transaction { hash block { height hash } ... on RegularTransaction { identifiers transactionResult { status } } }
  }
}`;

/** Bounded source-reported history, not an authenticated completeness proof.
 * Same-block/multiple-action histories and non-success results are deliberately refused. */
export function findPreviousContractAction(input: {
  readonly websocketUrl: string; readonly contractAddress: string; readonly deploymentHeight: number;
  readonly transactionId: string; readonly signal?: AbortSignal; readonly timeoutMs?: number; readonly maxActions?: number;
}): Promise<{ previous: HistoricalAction; target: HistoricalAction; actionsRead: number }> {
  // Capture caller choices once, retaining the original signal for cancellation and cleanup.
  const options = { ...input };
  const address = hex(options.contractAddress), identifier = hex(options.transactionId, true);
  const timeoutMs = options.timeoutMs ?? 20_000, maxActions = options.maxActions ?? 1000;
  if (!Number.isSafeInteger(options.deploymentHeight) || options.deploymentHeight < 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !Number.isSafeInteger(maxActions) || maxActions < 2 || maxActions > 10_000) throw new Error("Invalid history scan limits");
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("History scan cancelled")); return; }
    const wallDeadline = Date.now() + timeoutMs, monotonicDeadline = performance.now() + timeoutMs;
    const expired = () => Date.now() >= wallDeadline || performance.now() >= monotonicDeadline;
    const timeoutError = () => new Error("History scan timed out before finding the target; predecessor is unknown");
    const ws = new WebSocket(options.websocketUrl, "graphql-transport-ws");
    let settled = false, subscribed = false, count = 0, previous: HistoricalAction | undefined;
    const finish = (error?: Error, target?: HistoricalAction) => {
      if (settled) return; settled = true;
      if (expired()) error = timeoutError();
      clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.OPEN && subscribed) ws.send(JSON.stringify({ id: "history", type: "complete" }));
        ws.close();
      } catch { /* A transport close failure must not prevent promise settlement. */ }
      if (error) reject(error); else resolve({ previous: previous!, target: target!, actionsRead: count });
    };
    const abort = () => finish(new Error("History scan cancelled"));
    const timer = setTimeout(() => finish(timeoutError()), timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    ws.onopen = () => {
      if (expired()) { finish(timeoutError()); return; }
      try { ws.send(JSON.stringify({ type: "connection_init" })); }
      catch { finish(new Error("History connection initialization failed")); }
    };
    ws.onerror = () => finish(new Error("History connection failed"));
    ws.onclose = () => finish(new Error("History stream closed before the target; predecessor is unknown"));
    ws.onmessage = (event) => {
      if (settled) return;
      if (expired()) { finish(timeoutError()); return; }
      try {
        if (typeof event.data !== "string" || event.data.length > 65_536) throw new Error("Invalid or excessive history message");
        const message = JSON.parse(event.data);
        if (message.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
        if (message.type === "connection_ack") {
          if (subscribed) throw new Error("Duplicate history acknowledgement");
          subscribed = true; ws.send(JSON.stringify({ id: "history", type: "subscribe", payload: { query, variables: { address, offset: { height: options.deploymentHeight } } } })); return;
        }
        if (message.id !== "history") return;
        if (message.type === "error" || message.type === "complete") throw new Error("History stream ended without the target; predecessor is unknown");
        if (message.type !== "next" || !subscribed || message.payload?.errors?.length) throw new Error("Invalid history response");
        const action = parseAction(message.payload?.data?.contractActions);
        if (++count > maxActions) throw new Error("History action limit reached; predecessor is unknown");
        if (action.address !== address) throw new Error("History contains a foreign contract");
        if (!previous && (action.kind !== "ContractDeploy" || action.blockHeight !== options.deploymentHeight)) throw new Error("History does not begin with the requested deployment");
        if (previous && action.blockHeight <= previous.blockHeight) throw new Error("Unordered or same-block history requires further reconciliation");
        if (action.identifiers.includes(identifier)) {
          if (!previous) throw new Error("Deployment has no previous contract action");
          finish(undefined, action); return;
        }
        previous = action;
      } catch (cause) { finish(cause instanceof Error ? cause : new Error("History scan failed")); }
    };
  });
}
