import { i as __toESM, t as __commonJSMin } from "./rolldown-runtime-CoDluQUr.js";
import { T as warnIfInsecureRemoteUrl, h as zkConfigToProvingKeyMaterial, r as InvalidProtocolSchemeError } from "./dist-sP9ktYvK.js";
import { Xi as parseCheckResult, gi as createCheckPayload, m as CostModel, vi as createProvingPayload } from "./midnight_ledger_wasm-DY-mCxaE.js";
import { t as require_browser_ponyfill } from "./browser-ponyfill-CY0ElSBd.js";
//#region ../node_modules/fetch-retry/dist/fetch-retry.umd.js
var require_fetch_retry_umd = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(global, factory) {
		typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.fetchRetry = factory());
	})(exports, (function() {
		"use strict";
		var fetchRetry = function(fetch, defaults) {
			defaults = defaults || {};
			if (typeof fetch !== "function") throw new ArgumentError("fetch must be a function");
			if (typeof defaults !== "object") throw new ArgumentError("defaults must be an object");
			if (defaults.retries !== void 0 && !isPositiveInteger(defaults.retries)) throw new ArgumentError("retries must be a positive integer");
			if (defaults.retryDelay !== void 0 && !isPositiveInteger(defaults.retryDelay) && typeof defaults.retryDelay !== "function") throw new ArgumentError("retryDelay must be a positive integer or a function returning a positive integer");
			if (defaults.retryOn !== void 0 && !Array.isArray(defaults.retryOn) && typeof defaults.retryOn !== "function") throw new ArgumentError("retryOn property expects an array or function");
			defaults = Object.assign({
				retries: 3,
				retryDelay: 1e3,
				retryOn: []
			}, defaults);
			return function fetchRetry(input, init) {
				var retries = defaults.retries;
				var retryDelay = defaults.retryDelay;
				var retryOn = defaults.retryOn;
				if (init && init.retries !== void 0) {
					if (isPositiveInteger(init.retries)) retries = init.retries;
					else throw new ArgumentError("retries must be a positive integer");
				}
				if (init && init.retryDelay !== void 0) {
					if (isPositiveInteger(init.retryDelay) || typeof init.retryDelay === "function") retryDelay = init.retryDelay;
					else throw new ArgumentError("retryDelay must be a positive integer or a function returning a positive integer");
				}
				if (init && init.retryOn) {
					if (Array.isArray(init.retryOn) || typeof init.retryOn === "function") retryOn = init.retryOn;
					else throw new ArgumentError("retryOn property expects an array or function");
				}
				return new Promise(function(resolve, reject) {
					var wrappedFetch = function(attempt) {
						fetch(typeof Request !== "undefined" && input instanceof Request ? input.clone() : input, init).then(function(response) {
							if (Array.isArray(retryOn) && retryOn.indexOf(response.status) === -1) resolve(response);
							else if (typeof retryOn === "function") try {
								return Promise.resolve(retryOn(attempt, null, response)).then(function(retryOnResponse) {
									if (retryOnResponse) retry(attempt, null, response);
									else resolve(response);
								}).catch(reject);
							} catch (error) {
								reject(error);
							}
							else if (attempt < retries) retry(attempt, null, response);
							else resolve(response);
						}).catch(function(error) {
							if (typeof retryOn === "function") try {
								Promise.resolve(retryOn(attempt, error, null)).then(function(retryOnResponse) {
									if (retryOnResponse) retry(attempt, error, null);
									else reject(error);
								}).catch(function(error) {
									reject(error);
								});
							} catch (error) {
								reject(error);
							}
							else if (attempt < retries) retry(attempt, error, null);
							else reject(error);
						});
					};
					function retry(attempt, error, response) {
						var delay = typeof retryDelay === "function" ? retryDelay(attempt, error, response) : retryDelay;
						setTimeout(function() {
							wrappedFetch(++attempt);
						}, delay);
					}
					wrappedFetch(0);
				});
			};
		};
		function isPositiveInteger(value) {
			return Number.isInteger(value) && value >= 0;
		}
		function ArgumentError(message) {
			this.name = "ArgumentError";
			this.message = message;
		}
		return fetchRetry;
	}));
}));
//#endregion
//#region ../node_modules/@midnight-ntwrk/midnight-js-http-client-proof-provider/dist/index.mjs
var import_browser_ponyfill = /* @__PURE__ */ __toESM(require_browser_ponyfill(), 1);
var fetchRetry = (0, (/* @__PURE__ */ __toESM(require_fetch_retry_umd(), 1)).default)(import_browser_ponyfill.default, {
	retries: 3,
	retryDelay: (attempt) => 2 ** attempt * 1e3,
	retryOn: [500, 503]
});
var CHECK_PATH = "/check";
var PROVE_PATH = "/prove";
var buildEndpointUrl = (baseUrl, endpoint) => {
	const url = new URL(baseUrl);
	url.pathname = url.pathname.replace(/\/$/, "") + endpoint;
	return url;
};
var DEFAULT_TIMEOUT = 3e5;
var getKeyMaterial = async (zkConfigProvider, keyLocation) => {
	try {
		const zkConfig = await zkConfigProvider.get(keyLocation);
		return zkConfigToProvingKeyMaterial(zkConfig);
	} catch {
		return;
	}
};
var makeHttpRequest = async (url, payload, timeout, headers = {}) => {
	const response = await fetchRetry(url, {
		method: "POST",
		body: new Uint8Array(payload),
		headers: {
			"Content-Type": "application/octet-stream",
			...headers
		},
		signal: AbortSignal.timeout(timeout)
	});
	if (!response.ok) throw new Error(`Failed Proof Server response: url="${response.url}", code="${response.status}", status="${response.statusText}"`);
	return new Uint8Array(await response.arrayBuffer());
};
var httpClientProvingProvider = (url, zkConfigProvider, config) => {
	const checkUrl = buildEndpointUrl(url, CHECK_PATH);
	const proveUrl = buildEndpointUrl(url, PROVE_PATH);
	if (checkUrl.protocol !== "http:" && checkUrl.protocol !== "https:") throw new InvalidProtocolSchemeError(checkUrl.protocol, ["http:", "https:"]);
	if (proveUrl.protocol !== "http:" && proveUrl.protocol !== "https:") throw new InvalidProtocolSchemeError(proveUrl.protocol, ["http:", "https:"]);
	warnIfInsecureRemoteUrl(url, "proof server URL");
	const timeout = config?.timeout ?? 3e5;
	const headers = config?.headers ?? {};
	return {
		async check(serializedPreimage, keyLocation) {
			const keyMaterial = await getKeyMaterial(zkConfigProvider, keyLocation);
			const payload = createCheckPayload(serializedPreimage, keyMaterial?.ir);
			const result = await makeHttpRequest(checkUrl, payload, timeout, headers);
			return parseCheckResult(result);
		},
		async prove(serializedPreimage, keyLocation, overwriteBindingInput) {
			const keyMaterial = await getKeyMaterial(zkConfigProvider, keyLocation);
			const payload = createProvingPayload(serializedPreimage, overwriteBindingInput, keyMaterial);
			return makeHttpRequest(proveUrl, payload, timeout, headers);
		}
	};
};
var DEFAULT_CONFIG = {
	timeout: 3e5,
	zkConfig: void 0
};
/**
* Creates a high-level {@link ProofProvider} that implements transaction-level proving
* using the low-level circuit-by-circuit {@link ProvingProvider} as its foundation.
*
* This adapter bridges the gap between:
* - High-level ProofProvider interface (works with complete transactions)
* - Low-level ProvingProvider interface (works with individual circuits)
*
* @param url The URL of the proof server
* @param zkConfigProvider Provider for zero-knowledge configuration artifacts
* @param config Optional configuration for the underlying ProvingProvider
* @returns A ProofProvider instance that uses ProvingProvider internally
*
* @remarks
* **Architecture:**
* ```
* ProofProvider (Transaction-level)
*     ↓ (adapter)
* ProvingProvider (Circuit-level)
*     ↓ (HTTP client)
* Proof Server (/check, /prove endpoints)
* ```
*
* **Note:** The /prove-tx endpoint is NOT used. All proving is done through
* individual circuit operations using /check and /prove endpoints.
*/
var httpClientProofProvider = (url, zkConfigProvider, config) => {
	const baseProvingProvider = httpClientProvingProvider(url, zkConfigProvider, config);
	return { async proveTx(unprovenTx, _partialProveTxConfig) {
		const costModel = CostModel.initialCostModel();
		return unprovenTx.prove(baseProvingProvider, costModel);
	} };
};
//#endregion
export { DEFAULT_CONFIG, DEFAULT_TIMEOUT, httpClientProofProvider, httpClientProvingProvider };
