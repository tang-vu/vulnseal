// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReportEffectCheck } from "./ReportEffectCheck.js";

const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { instances.push(this); }
}
const props = { network: "preprod", transactionId: "ab".repeat(33), contractAddress: "12".repeat(32), programId: "34".repeat(32), reportId: "56".repeat(32), circuit: "authorizePayout" };
const result = { checkedAt: "2026-09-09T00:00:00Z", reportId: props.reportId, before: "RETEST_PASSED", after: "PAYOUT_AUTHORIZED", blockHeight: 20, previousBlockHeight: 19, actionsRead: 7 };
beforeEach(() => { instances.length = 0; vi.useFakeTimers(); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const start = () => fireEvent.click(screen.getByRole("button", { name: "Check report effects", hidden: true }));

it("starts only explicitly, sends public metadata and terminates on the overall deadline", () => {
  render(<ReportEffectCheck {...props} savedEnvelope="Saved envelope must stay local" savedNotes={{ reportId: props.reportId, text: "Private snapshot must stay local", tier: "3" }} />);
  expect(instances).toHaveLength(0);
  start();
  expect(instances[0]!.postMessage).toHaveBeenCalledWith({ transactionId: props.transactionId, contractAddress: props.contractAddress, programId: props.programId, reportId: props.reportId, circuit: props.circuit, indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql", rpcUrl: "https://rpc.preprod.midnight.network", websocketUrl: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws" });
  act(() => vi.advanceTimersByTime(90_000));
  expect(instances[0]!.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("timed out");
  act(() => instances[0]!.onmessage?.({ data: { result } }));
  expect(screen.queryByText(/Replayed report change:/)).not.toBeInTheDocument();
});

it("ignores cancelled and replaced workers and terminates on unmount", () => {
  const view = render(<ReportEffectCheck {...props} />);
  start();
  fireEvent.click(screen.getByRole("button", { name: "Cancel report check", hidden: true }));
  start();
  act(() => instances[0]!.onmessage?.({ data: { result } }));
  expect(screen.queryByText(/Replayed report change:/)).not.toBeInTheDocument();
  view.rerender(<ReportEffectCheck {...props} reportId={"78".repeat(32)} />);
  expect(instances[1]!.terminate).toHaveBeenCalledOnce();
  act(() => instances[1]!.onmessage?.({ data: { result } }));
  expect(screen.queryByText(/Replayed report change:/)).not.toBeInTheDocument();
  start(); view.unmount();
  expect(instances[2]!.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("clears an earlier result when rechecking fails", () => {
  render(<ReportEffectCheck {...props} />); start();
  act(() => instances[0]!.onmessage?.({ data: { result } }));
  expect(screen.getByText(/Replayed report change:/)).toHaveTextContent("PAYOUT_AUTHORIZED");
  start();
  act(() => instances[1]!.onerror?.());
  expect(screen.queryByText(/Replayed report change:/)).not.toBeInTheDocument();
  expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("could not load or run");
});
