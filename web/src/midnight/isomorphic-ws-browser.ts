// SPDX-License-Identifier: Apache-2.0
// The Midnight indexer provider's browser export expects both a default and a
// named WebSocket constructor. isomorphic-ws/browser only provides the former.
const BrowserWebSocket = globalThis.WebSocket;

export { BrowserWebSocket as WebSocket };
export default BrowserWebSocket;
