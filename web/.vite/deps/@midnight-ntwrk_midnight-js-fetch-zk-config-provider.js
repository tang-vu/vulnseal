import { i as __toESM } from "./rolldown-runtime-CoDluQUr.js";
import { d as createVerifierKey, f as createZKIR, r as InvalidProtocolSchemeError, s as ZKConfigProvider, u as createProverKey, y as assertSafeName } from "./dist-sP9ktYvK.js";
import { t as require_browser_ponyfill } from "./browser-ponyfill-CY0ElSBd.js";
//#region ../node_modules/@midnight-ntwrk/midnight-js-fetch-zk-config-provider/dist/index.mjs
var import_browser_ponyfill = /* @__PURE__ */ __toESM(require_browser_ponyfill(), 1);
/**
* The name of the path containing proving and verifying keys.
*/
var KEY_PATH = "keys";
/**
* File extension for proving keys.
*/
var PROVER_EXT = ".prover";
/**
* File extension for verifying keys.
*/
var VERIFIER_EXT = ".verifier";
/**
* The name of the path containing zkIRs.
*/
var ZKIR_PATH = "zkir";
/**
* File extension for zkIRs.
*/
var ZKIR_EXT = ".bzkir";
/**
* Retrieves ZK artifacts from a remote source.
*/
var FetchZkConfigProvider = class extends ZKConfigProvider {
	baseURL;
	fetchFunc;
	/**
	* @param baseURL The endpoint to query for ZK artifacts.
	* @param fetchFunc The function to use to execute queries.
	*/
	constructor(baseURL, fetchFunc = import_browser_ponyfill.fetch) {
		super();
		this.baseURL = baseURL;
		this.fetchFunc = fetchFunc;
		const urlObject = new URL(baseURL);
		if (urlObject.protocol !== "http:" && urlObject.protocol !== "https:") throw new InvalidProtocolSchemeError(urlObject.protocol, ["http:", "https:"]);
	}
	async sendRequest(url, circuitId, ext, responseType) {
		assertSafeName(circuitId, "circuitId");
		const base = this.baseURL.endsWith("/") ? this.baseURL : `${this.baseURL}/`;
		const fullUrl = new URL(`${url}/${encodeURIComponent(circuitId)}${ext}`, base).toString();
		const response = await this.fetchFunc(fullUrl, { method: "GET" });
		if (!response.ok) throw new Error(`Failed to fetch ZK artifact from ${fullUrl}: ${response.status} ${response.statusText}`);
		if ((response.headers.get("content-type") ?? "").includes("text/html")) throw new Error(`Expected ZK artifact, but received text/html from ${fullUrl}. This usually means the file does not exist and the server returned an SPA fallback page.`);
		return responseType === "text" ? await response.text() : await response.arrayBuffer().then((arrayBuffer) => new Uint8Array(arrayBuffer));
	}
	getProverKey(circuitId) {
		return this.sendRequest(KEY_PATH, circuitId, PROVER_EXT, "arraybuffer").then(createProverKey);
	}
	getVerifierKey(circuitId) {
		return this.sendRequest(KEY_PATH, circuitId, VERIFIER_EXT, "arraybuffer").then(createVerifierKey);
	}
	getZKIR(circuitId) {
		return this.sendRequest(ZKIR_PATH, circuitId, ZKIR_EXT, "arraybuffer").then(createZKIR);
	}
};
//#endregion
export { FetchZkConfigProvider };
