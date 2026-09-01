import { i as __toESM, t as __commonJSMin } from "./rolldown-runtime-CoDluQUr.js";
import * as ocrt from "@midnight-ntwrk/onchain-runtime-v3";
import { ChargedState, ContractMaintenanceAuthority, ContractOperation, ContractState, CostModel, QueryContext, QueryResults, StateBoundedMerkleTree, StateMap, StateValue, VmResults, VmStack, bigIntModFr, bigIntToValue, communicationCommitment, communicationCommitmentRandomness, decodeCoinPublicKey, decodeContractAddress, decodeQualifiedShieldedCoinInfo, decodeRawTokenType, decodeShieldedCoinInfo, decodeUserAddress, dummyContractAddress, dummyUserAddress, encodeCoinPublicKey, encodeContractAddress, encodeQualifiedShieldedCoinInfo, encodeRawTokenType, encodeShieldedCoinInfo, encodeUserAddress, entryPointHash, leafHash, maxAlignedSize, maxField, proofDataIntoSerializedPreimage, rawTokenType, runProgram, runtimeCoinCommitment, sampleContractAddress, sampleRawTokenType, sampleSigningKey, sampleUserAddress, signData, signatureVerifyingKey, signingKeyFromBip340, valueToBigInt, verifySignature } from "@midnight-ntwrk/onchain-runtime-v3";
//#region (ignored) ../node_modules/object-inspect/util.inspect.js
var require_util_inspect = /* @__PURE__ */ __commonJSMin((() => {}));
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/error.js
var import_object_inspect = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var hasMap = typeof Map === "function" && Map.prototype;
	var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, "size") : null;
	var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === "function" ? mapSizeDescriptor.get : null;
	var mapForEach = hasMap && Map.prototype.forEach;
	var hasSet = typeof Set === "function" && Set.prototype;
	var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, "size") : null;
	var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === "function" ? setSizeDescriptor.get : null;
	var setForEach = hasSet && Set.prototype.forEach;
	var weakMapHas = typeof WeakMap === "function" && WeakMap.prototype ? WeakMap.prototype.has : null;
	var weakSetHas = typeof WeakSet === "function" && WeakSet.prototype ? WeakSet.prototype.has : null;
	var weakRefDeref = typeof WeakRef === "function" && WeakRef.prototype ? WeakRef.prototype.deref : null;
	var booleanValueOf = Boolean.prototype.valueOf;
	var objectToString = Object.prototype.toString;
	var functionToString = Function.prototype.toString;
	var $match = String.prototype.match;
	var $slice = String.prototype.slice;
	var $replace = String.prototype.replace;
	var $toUpperCase = String.prototype.toUpperCase;
	var $toLowerCase = String.prototype.toLowerCase;
	var $test = RegExp.prototype.test;
	var $concat = Array.prototype.concat;
	var $join = Array.prototype.join;
	var $arrSlice = Array.prototype.slice;
	var $floor = Math.floor;
	var bigIntValueOf = typeof BigInt === "function" ? BigInt.prototype.valueOf : null;
	var gOPS = Object.getOwnPropertySymbols;
	var symToString = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? Symbol.prototype.toString : null;
	var hasShammedSymbols = typeof Symbol === "function" && typeof Symbol.iterator === "object";
	var toStringTag = typeof Symbol === "function" && Symbol.toStringTag && (typeof Symbol.toStringTag === hasShammedSymbols ? "object" : "symbol") ? Symbol.toStringTag : null;
	var isEnumerable = Object.prototype.propertyIsEnumerable;
	var gPO = (typeof Reflect === "function" ? Reflect.getPrototypeOf : Object.getPrototypeOf) || ([].__proto__ === Array.prototype ? function(O) {
		return O.__proto__;
	} : null);
	function addNumericSeparator(num, str) {
		if (num === Infinity || num === -Infinity || num !== num || num && num > -1e3 && num < 1e3 || $test.call(/e/, str)) return str;
		var sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
		if (typeof num === "number") {
			var int = num < 0 ? -$floor(-num) : $floor(num);
			if (int !== num) {
				var intStr = String(int);
				var dec = $slice.call(str, intStr.length + 1);
				return $replace.call(intStr, sepRegex, "$&_") + "." + $replace.call($replace.call(dec, /([0-9]{3})/g, "$&_"), /_$/, "");
			}
		}
		return $replace.call(str, sepRegex, "$&_");
	}
	var utilInspect = require_util_inspect();
	var inspectCustom = utilInspect.custom;
	var inspectSymbol = isSymbol(inspectCustom) ? inspectCustom : null;
	var quotes = {
		__proto__: null,
		"double": "\"",
		single: "'"
	};
	var quoteREs = {
		__proto__: null,
		"double": /(["\\])/g,
		single: /(['\\])/g
	};
	module.exports = function inspect_(obj, options, depth, seen) {
		var opts = options || {};
		if (has(opts, "quoteStyle") && !has(quotes, opts.quoteStyle)) throw new TypeError("option \"quoteStyle\" must be \"single\" or \"double\"");
		if (has(opts, "maxStringLength") && (typeof opts.maxStringLength === "number" ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity : opts.maxStringLength !== null)) throw new TypeError("option \"maxStringLength\", if provided, must be a positive integer, Infinity, or `null`");
		var customInspect = has(opts, "customInspect") ? opts.customInspect : true;
		if (typeof customInspect !== "boolean" && customInspect !== "symbol") throw new TypeError("option \"customInspect\", if provided, must be `true`, `false`, or `'symbol'`");
		if (has(opts, "indent") && opts.indent !== null && opts.indent !== "	" && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)) throw new TypeError("option \"indent\" must be \"\\t\", an integer > 0, or `null`");
		if (has(opts, "numericSeparator") && typeof opts.numericSeparator !== "boolean") throw new TypeError("option \"numericSeparator\", if provided, must be `true` or `false`");
		var numericSeparator = opts.numericSeparator;
		if (typeof obj === "undefined") return "undefined";
		if (obj === null) return "null";
		if (typeof obj === "boolean") return obj ? "true" : "false";
		if (typeof obj === "string") return inspectString(obj, opts);
		if (typeof obj === "number") {
			if (obj === 0) return Infinity / obj > 0 ? "0" : "-0";
			var str = String(obj);
			return numericSeparator ? addNumericSeparator(obj, str) : str;
		}
		if (typeof obj === "bigint") {
			var bigIntStr = String(obj) + "n";
			return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
		}
		var maxDepth = typeof opts.depth === "undefined" ? 5 : opts.depth;
		if (typeof depth === "undefined") depth = 0;
		if (depth >= maxDepth && maxDepth > 0 && typeof obj === "object") return isArray(obj) ? "[Array]" : "[Object]";
		var indent = getIndent(opts, depth);
		if (typeof seen === "undefined") seen = [];
		else if (indexOf(seen, obj) >= 0) return "[Circular]";
		function inspect(value, from, noIndent) {
			if (from) {
				seen = $arrSlice.call(seen);
				seen.push(from);
			}
			if (noIndent) {
				var newOpts = { depth: opts.depth };
				if (has(opts, "quoteStyle")) newOpts.quoteStyle = opts.quoteStyle;
				return inspect_(value, newOpts, depth + 1, seen);
			}
			return inspect_(value, opts, depth + 1, seen);
		}
		if (typeof obj === "function" && !isRegExp(obj)) {
			var name = nameOf(obj);
			var keys = arrObjKeys(obj, inspect);
			return "[Function" + (name ? ": " + name : " (anonymous)") + "]" + (keys.length > 0 ? " { " + $join.call(keys, ", ") + " }" : "");
		}
		if (isSymbol(obj)) {
			var symString = hasShammedSymbols ? $replace.call(String(obj), /^(Symbol\(.*\))_[^)]*$/, "$1") : symToString.call(obj);
			return typeof obj === "object" && !hasShammedSymbols ? markBoxed(symString) : symString;
		}
		if (isElement(obj)) {
			var s = "<" + $toLowerCase.call(String(obj.nodeName));
			var attrs = obj.attributes || [];
			for (var i = 0; i < attrs.length; i++) s += " " + attrs[i].name + "=" + wrapQuotes(quote(attrs[i].value), "double", opts);
			s += ">";
			if (obj.childNodes && obj.childNodes.length) s += "...";
			s += "</" + $toLowerCase.call(String(obj.nodeName)) + ">";
			return s;
		}
		if (isArray(obj)) {
			if (obj.length === 0) return "[]";
			var xs = arrObjKeys(obj, inspect);
			if (indent && !singleLineValues(xs)) return "[" + indentedJoin(xs, indent) + "]";
			return "[ " + $join.call(xs, ", ") + " ]";
		}
		if (isError(obj)) {
			var parts = arrObjKeys(obj, inspect);
			if (!("cause" in Error.prototype) && "cause" in obj && !isEnumerable.call(obj, "cause")) return "{ [" + String(obj) + "] " + $join.call($concat.call("[cause]: " + inspect(obj.cause), parts), ", ") + " }";
			if (parts.length === 0) return "[" + String(obj) + "]";
			return "{ [" + String(obj) + "] " + $join.call(parts, ", ") + " }";
		}
		if (typeof obj === "object" && customInspect) {
			if (inspectSymbol && typeof obj[inspectSymbol] === "function" && utilInspect) return utilInspect(obj, { depth: maxDepth - depth });
			else if (customInspect !== "symbol" && typeof obj.inspect === "function") return obj.inspect();
		}
		if (isMap(obj)) {
			var mapParts = [];
			if (mapForEach) mapForEach.call(obj, function(value, key) {
				mapParts.push(inspect(key, obj, true) + " => " + inspect(value, obj));
			});
			return collectionOf("Map", mapSize.call(obj), mapParts, indent);
		}
		if (isSet(obj)) {
			var setParts = [];
			if (setForEach) setForEach.call(obj, function(value) {
				setParts.push(inspect(value, obj));
			});
			return collectionOf("Set", setSize.call(obj), setParts, indent);
		}
		if (isWeakMap(obj)) return weakCollectionOf("WeakMap");
		if (isWeakSet(obj)) return weakCollectionOf("WeakSet");
		if (isWeakRef(obj)) return weakCollectionOf("WeakRef");
		if (isNumber(obj)) return markBoxed(inspect(Number(obj)));
		if (isBigInt(obj)) return markBoxed(inspect(bigIntValueOf.call(obj)));
		if (isBoolean(obj)) return markBoxed(booleanValueOf.call(obj));
		if (isString(obj)) return markBoxed(inspect(String(obj)));
		if (typeof window !== "undefined" && obj === window) return "{ [object Window] }";
		if (typeof globalThis !== "undefined" && obj === globalThis || typeof global !== "undefined" && obj === global) return "{ [object globalThis] }";
		if (!isDate(obj) && !isRegExp(obj)) {
			var ys = arrObjKeys(obj, inspect);
			var isPlainObject = gPO ? gPO(obj) === Object.prototype : obj instanceof Object || obj.constructor === Object;
			var protoTag = obj instanceof Object ? "" : "null prototype";
			var stringTag = !isPlainObject && toStringTag && Object(obj) === obj && toStringTag in obj ? $slice.call(toStr(obj), 8, -1) : protoTag ? "Object" : "";
			var tag = (isPlainObject || typeof obj.constructor !== "function" ? "" : obj.constructor.name ? obj.constructor.name + " " : "") + (stringTag || protoTag ? "[" + $join.call($concat.call([], stringTag || [], protoTag || []), ": ") + "] " : "");
			if (ys.length === 0) return tag + "{}";
			if (indent) return tag + "{" + indentedJoin(ys, indent) + "}";
			return tag + "{ " + $join.call(ys, ", ") + " }";
		}
		return String(obj);
	};
	function wrapQuotes(s, defaultStyle, opts) {
		var quoteChar = quotes[opts.quoteStyle || defaultStyle];
		return quoteChar + s + quoteChar;
	}
	function quote(s) {
		return $replace.call(String(s), /"/g, "&quot;");
	}
	function canTrustToString(obj) {
		return !toStringTag || !(typeof obj === "object" && (toStringTag in obj || typeof obj[toStringTag] !== "undefined"));
	}
	function isArray(obj) {
		return toStr(obj) === "[object Array]" && canTrustToString(obj);
	}
	function isDate(obj) {
		return toStr(obj) === "[object Date]" && canTrustToString(obj);
	}
	function isRegExp(obj) {
		return toStr(obj) === "[object RegExp]" && canTrustToString(obj);
	}
	function isError(obj) {
		return toStr(obj) === "[object Error]" && canTrustToString(obj);
	}
	function isString(obj) {
		return toStr(obj) === "[object String]" && canTrustToString(obj);
	}
	function isNumber(obj) {
		return toStr(obj) === "[object Number]" && canTrustToString(obj);
	}
	function isBoolean(obj) {
		return toStr(obj) === "[object Boolean]" && canTrustToString(obj);
	}
	function isSymbol(obj) {
		if (hasShammedSymbols) return obj && typeof obj === "object" && obj instanceof Symbol;
		if (typeof obj === "symbol") return true;
		if (!obj || typeof obj !== "object" || !symToString) return false;
		try {
			symToString.call(obj);
			return true;
		} catch (e) {}
		return false;
	}
	function isBigInt(obj) {
		if (!obj || typeof obj !== "object" || !bigIntValueOf) return false;
		try {
			bigIntValueOf.call(obj);
			return true;
		} catch (e) {}
		return false;
	}
	var hasOwn = Object.prototype.hasOwnProperty || function(key) {
		return key in this;
	};
	function has(obj, key) {
		return hasOwn.call(obj, key);
	}
	function toStr(obj) {
		return objectToString.call(obj);
	}
	function nameOf(f) {
		if (f.name) return f.name;
		var m = $match.call(functionToString.call(f), /^function\s*([\w$]+)/);
		if (m) return m[1];
		return null;
	}
	function indexOf(xs, x) {
		if (xs.indexOf) return xs.indexOf(x);
		for (var i = 0, l = xs.length; i < l; i++) if (xs[i] === x) return i;
		return -1;
	}
	function isMap(x) {
		if (!mapSize || !x || typeof x !== "object") return false;
		try {
			mapSize.call(x);
			try {
				setSize.call(x);
			} catch (s) {
				return true;
			}
			return x instanceof Map;
		} catch (e) {}
		return false;
	}
	function isWeakMap(x) {
		if (!weakMapHas || !x || typeof x !== "object") return false;
		try {
			weakMapHas.call(x, weakMapHas);
			try {
				weakSetHas.call(x, weakSetHas);
			} catch (s) {
				return true;
			}
			return x instanceof WeakMap;
		} catch (e) {}
		return false;
	}
	function isWeakRef(x) {
		if (!weakRefDeref || !x || typeof x !== "object") return false;
		try {
			weakRefDeref.call(x);
			return true;
		} catch (e) {}
		return false;
	}
	function isSet(x) {
		if (!setSize || !x || typeof x !== "object") return false;
		try {
			setSize.call(x);
			try {
				mapSize.call(x);
			} catch (m) {
				return true;
			}
			return x instanceof Set;
		} catch (e) {}
		return false;
	}
	function isWeakSet(x) {
		if (!weakSetHas || !x || typeof x !== "object") return false;
		try {
			weakSetHas.call(x, weakSetHas);
			try {
				weakMapHas.call(x, weakMapHas);
			} catch (s) {
				return true;
			}
			return x instanceof WeakSet;
		} catch (e) {}
		return false;
	}
	function isElement(x) {
		if (!x || typeof x !== "object") return false;
		if (typeof HTMLElement !== "undefined" && x instanceof HTMLElement) return true;
		return typeof x.nodeName === "string" && typeof x.getAttribute === "function";
	}
	function inspectString(str, opts) {
		if (str.length > opts.maxStringLength) {
			var remaining = str.length - opts.maxStringLength;
			var trailer = "... " + remaining + " more character" + (remaining > 1 ? "s" : "");
			return inspectString($slice.call(str, 0, opts.maxStringLength), opts) + trailer;
		}
		var quoteRE = quoteREs[opts.quoteStyle || "single"];
		quoteRE.lastIndex = 0;
		return wrapQuotes($replace.call($replace.call(str, quoteRE, "\\$1"), /[\x00-\x1f]/g, lowbyte), "single", opts);
	}
	function lowbyte(c) {
		var n = c.charCodeAt(0);
		var x = {
			8: "b",
			9: "t",
			10: "n",
			12: "f",
			13: "r"
		}[n];
		if (x) return "\\" + x;
		return "\\x" + (n < 16 ? "0" : "") + $toUpperCase.call(n.toString(16));
	}
	function markBoxed(str) {
		return "Object(" + str + ")";
	}
	function weakCollectionOf(type) {
		return type + " { ? }";
	}
	function collectionOf(type, size, entries, indent) {
		var joinedEntries = indent ? indentedJoin(entries, indent) : $join.call(entries, ", ");
		return type + " (" + size + ") {" + joinedEntries + "}";
	}
	function singleLineValues(xs) {
		for (var i = 0; i < xs.length; i++) if (indexOf(xs[i], "\n") >= 0) return false;
		return true;
	}
	function getIndent(opts, depth) {
		var baseIndent;
		if (opts.indent === "	") baseIndent = "	";
		else if (typeof opts.indent === "number" && opts.indent > 0) baseIndent = $join.call(Array(opts.indent + 1), " ");
		else return null;
		return {
			base: baseIndent,
			prev: $join.call(Array(depth + 1), baseIndent)
		};
	}
	function indentedJoin(xs, indent) {
		if (xs.length === 0) return "";
		var lineJoiner = "\n" + indent.prev + indent.base;
		return lineJoiner + $join.call(xs, "," + lineJoiner) + "\n" + indent.prev;
	}
	function arrObjKeys(obj, inspect) {
		var isArr = isArray(obj);
		var xs = [];
		if (isArr) {
			xs.length = obj.length;
			for (var i = 0; i < obj.length; i++) xs[i] = has(obj, i) ? inspect(obj[i], obj) : "";
		}
		var syms = typeof gOPS === "function" ? gOPS(obj) : [];
		var symMap;
		if (hasShammedSymbols) {
			symMap = {};
			for (var k = 0; k < syms.length; k++) symMap["$" + syms[k]] = syms[k];
		}
		for (var key in obj) {
			if (!has(obj, key)) continue;
			if (isArr && String(Number(key)) === key && key < obj.length) continue;
			if (hasShammedSymbols && symMap["$" + key] instanceof Symbol) continue;
			else if ($test.call(/[^\w$]/, key)) xs.push(inspect(key, obj) + ": " + inspect(obj[key], obj));
			else xs.push(key + ": " + inspect(obj[key], obj));
		}
		if (typeof gOPS === "function") {
			for (var j = 0; j < syms.length; j++) if (isEnumerable.call(obj, syms[j])) xs.push("[" + inspect(syms[j]) + "]: " + inspect(obj[syms[j]], obj));
		}
		return xs;
	}
})))(), 1);
/**
* An error originating from code generated by the Compact compiler
*/
var CompactError = class extends Error {
	constructor(msg) {
		super(msg);
		this.name = "CompactError";
	}
};
/**
* Compiler internal for assertions
* @internal
*/
function assert(b, s) {
	if (!b) throw new CompactError(`failed assert: ${s}`);
}
/**
* Compiler internal for type errors
* @internal
*/
function typeError(who, what, where, type, x) {
	throw new CompactError(`type error: ${who} ${what} at ${where}; expected value of type ${type} but received ${(0, import_object_inspect.default)(x)}`);
}
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/constants.js
/**
* The maximum value representable in Compact's `Field` type
*
* One less than the prime modulus of the proof system's scalar field
*/
var MAX_FIELD = ocrt.maxField();
/**
* A valid placeholder contract address
*
* @deprecated Cannot handle {@link NetworkId}s, use
* {@link dummyContractAddress} instead.
*/
var DUMMY_ADDRESS = ocrt.dummyContractAddress();
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/version.js
var versionString = "0.16.0";
var checkRuntimeVersion = (expectedRuntimeVersionString) => {
	const expectedRuntimeVersion = expectedRuntimeVersionString.split("-")[0].split(".").map(Number);
	const actualRuntimeVersion = versionString.split("-")[0].split(".").map(Number);
	if (expectedRuntimeVersion[0] !== actualRuntimeVersion[0] || actualRuntimeVersion[0] === 0 && expectedRuntimeVersion[1] !== actualRuntimeVersion[1] || expectedRuntimeVersion[1] > actualRuntimeVersion[1] || expectedRuntimeVersion[1] === actualRuntimeVersion[1] && expectedRuntimeVersion[2] > actualRuntimeVersion[2]) throw new CompactError(`Version mismatch: compiled code expects ${expectedRuntimeVersionString}, runtime is ${versionString}`);
	const MAX_FIELD$1 = 52435875175126190479447740508185965837690552500527637822603658699938581184512n;
	if (MAX_FIELD$1 !== MAX_FIELD) throw new CompactError(`Maximum field mismatch: compiled code uses ${MAX_FIELD$1}, runtime uses ${MAX_FIELD}`);
};
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/compact-types.js
/**
* Runtime type of {@link JubjubPoint}
*/
var CompactTypeJubjubPoint = {
	alignment() {
		return [{
			tag: "atom",
			value: { tag: "field" }
		}, {
			tag: "atom",
			value: { tag: "field" }
		}];
	},
	fromValue(value) {
		const x = value.shift();
		const y = value.shift();
		if (x == void 0 || y == void 0) throw new CompactError("expected JubjubPoint");
		else return {
			x: ocrt.valueToBigInt([x]),
			y: ocrt.valueToBigInt([y])
		};
	},
	toValue(value) {
		return ocrt.bigIntToValue(value.x).concat(ocrt.bigIntToValue(value.y));
	}
};
/**
* Runtime type of {@link MerkleTreeDigest}
*/
var CompactTypeMerkleTreeDigest = {
	alignment() {
		return [{
			tag: "atom",
			value: { tag: "field" }
		}];
	},
	fromValue(value) {
		const val = value.shift();
		if (val == void 0) throw new CompactError("expected MerkleTreeDigest");
		else return { field: ocrt.valueToBigInt([val]) };
	},
	toValue(value) {
		return ocrt.bigIntToValue(value.field);
	}
};
/**
* Runtime type of {@link MerkleTreePathEntry}
*/
var CompactTypeMerkleTreePathEntry = {
	alignment() {
		return CompactTypeMerkleTreeDigest.alignment().concat(CompactTypeBoolean.alignment());
	},
	fromValue(value) {
		return {
			sibling: CompactTypeMerkleTreeDigest.fromValue(value),
			goes_left: CompactTypeBoolean.fromValue(value)
		};
	},
	toValue(value) {
		return CompactTypeMerkleTreeDigest.toValue(value.sibling).concat(CompactTypeBoolean.toValue(value.goes_left));
	}
};
/**
* Runtime type of {@link MerkleTreePath}
*/
var CompactTypeMerkleTreePath = class {
	leaf;
	path;
	constructor(n, leaf) {
		this.leaf = leaf;
		this.path = new CompactTypeVector(n, CompactTypeMerkleTreePathEntry);
	}
	alignment() {
		return this.leaf.alignment().concat(this.path.alignment());
	}
	fromValue(value) {
		return {
			leaf: this.leaf.fromValue(value),
			path: this.path.fromValue(value)
		};
	}
	toValue(value) {
		return this.leaf.toValue(value.leaf).concat(this.path.toValue(value.path));
	}
};
/**
* Runtime type of the builtin `Field` type
*/
var CompactTypeField = {
	alignment() {
		return [{
			tag: "atom",
			value: { tag: "field" }
		}];
	},
	fromValue(value) {
		const val = value.shift();
		if (val == void 0) throw new CompactError("expected Field");
		else return ocrt.valueToBigInt([val]);
	},
	toValue(value) {
		return ocrt.bigIntToValue(value);
	}
};
/**
* Runtime type of an enum with a given number of entries
*/
var CompactTypeEnum = class {
	maxValue;
	length;
	constructor(maxValue, length) {
		this.maxValue = maxValue;
		this.length = length;
	}
	alignment() {
		return [{
			tag: "atom",
			value: {
				tag: "bytes",
				length: this.length
			}
		}];
	}
	fromValue(value) {
		const val = value.shift();
		if (val == void 0) throw new CompactError(`expected Enum[<=${this.maxValue}]`);
		else {
			let res = 0;
			for (let i = 0; i < val.length; i++) res += (1 << 8 * i) * val[i];
			if (res > this.maxValue) throw new CompactError(`expected UnsignedInteger[<=${this.maxValue}]`);
			return res;
		}
	}
	toValue(value) {
		return CompactTypeField.toValue(BigInt(value));
	}
};
/**
* Runtime type of the builtin `Unsigned Integer` types
*/
var CompactTypeUnsignedInteger = class {
	maxValue;
	length;
	constructor(maxValue, length) {
		this.maxValue = maxValue;
		this.length = length;
	}
	alignment() {
		return [{
			tag: "atom",
			value: {
				tag: "bytes",
				length: this.length
			}
		}];
	}
	fromValue(value) {
		const val = value.shift();
		if (val == void 0) throw new CompactError(`expected UnsignedInteger[<=${this.maxValue}]`);
		else {
			let res = 0n;
			for (let i = 0; i < val.length; i++) res += (1n << 8n * BigInt(i)) * BigInt(val[i]);
			if (res > this.maxValue) throw new CompactError(`expected UnsignedInteger[<=${this.maxValue}]`);
			return res;
		}
	}
	toValue(value) {
		return CompactTypeField.toValue(value);
	}
};
/**
* Runtime type of the builtin `Vector` types
*/
var CompactTypeVector = class {
	length;
	type;
	constructor(length, type) {
		this.length = length;
		this.type = type;
	}
	alignment() {
		const inner = this.type.alignment();
		let res = [];
		for (let i = 0; i < this.length; i++) res = res.concat(inner);
		return res;
	}
	fromValue(value) {
		const res = [];
		for (let i = 0; i < this.length; i++) res.push(this.type.fromValue(value));
		return res;
	}
	toValue(value) {
		if (value.length != this.length) throw new CompactError(`expected ${this.length}-element array`);
		let res = [];
		for (let i = 0; i < this.length; i++) res = res.concat(this.type.toValue(value[i]));
		return res;
	}
};
/**
* Runtime type of the builtin `Boolean` type
*/
var CompactTypeBoolean = {
	alignment() {
		return [{
			tag: "atom",
			value: {
				tag: "bytes",
				length: 1
			}
		}];
	},
	fromValue(value) {
		const val = value.shift();
		if (val == void 0 || val.length > 1 || val.length == 1 && val[0] != 1) throw new CompactError("expected Boolean");
		return val.length == 1;
	},
	toValue(value) {
		if (value) return [new Uint8Array([1])];
		else return [/* @__PURE__ */ new Uint8Array(0)];
	}
};
/**
* Runtime type of the builtin `Bytes` types
*/
var CompactTypeBytes = class {
	length;
	constructor(length) {
		this.length = length;
	}
	alignment() {
		return [{
			tag: "atom",
			value: {
				tag: "bytes",
				length: this.length
			}
		}];
	}
	fromValue(value) {
		const val = value.shift();
		if (val == void 0 || val.length > this.length) throw new CompactError(`expected Bytes[${this.length}]`);
		if (val.length == this.length) return val;
		const res = new Uint8Array(this.length);
		res.set(val, 0);
		return res;
	}
	toValue(value) {
		let end = value.length;
		while (end > 0 && value[end - 1] == 0) end -= 1;
		return [value.slice(0, end)];
	}
};
/**
* Runtime type of `Opaque["Uint8Array"]`
*/
var CompactTypeOpaqueUint8Array = {
	alignment() {
		return [{
			tag: "atom",
			value: { tag: "compress" }
		}];
	},
	fromValue(value) {
		return value.shift();
	},
	toValue(value) {
		return [value];
	}
};
/**
* Runtime type of `Opaque["string"]`
*/
var CompactTypeOpaqueString = {
	alignment() {
		return [{
			tag: "atom",
			value: { tag: "compress" }
		}];
	},
	fromValue(value) {
		return new TextDecoder("utf-8").decode(value.shift());
	},
	toValue(value) {
		return [new TextEncoder().encode(value)];
	}
};
/**
* The following are type descriptors used to implement {@link createCoinCommitment}. They are not intended for direct
* consumption.
*/
var Bytes32Descriptor = new CompactTypeBytes(32);
var MaxUint8Descriptor = new CompactTypeUnsignedInteger(18446744073709551615n, 8);
var ShieldedCoinInfoDescriptor = {
	alignment() {
		return Bytes32Descriptor.alignment().concat(Bytes32Descriptor.alignment().concat(MaxUint8Descriptor.alignment()));
	},
	fromValue(value) {
		return {
			nonce: Bytes32Descriptor.fromValue(value),
			color: Bytes32Descriptor.fromValue(value),
			value: MaxUint8Descriptor.fromValue(value)
		};
	},
	toValue(value) {
		return Bytes32Descriptor.toValue(value.nonce).concat(Bytes32Descriptor.toValue(value.color).concat(MaxUint8Descriptor.toValue(value.value)));
	}
};
var ZswapCoinPublicKeyDescriptor = {
	alignment() {
		return Bytes32Descriptor.alignment();
	},
	fromValue(value) {
		return { bytes: Bytes32Descriptor.fromValue(value) };
	},
	toValue(value) {
		return Bytes32Descriptor.toValue(value.bytes);
	}
};
var ContractAddressDescriptor = {
	alignment() {
		return Bytes32Descriptor.alignment();
	},
	fromValue(value) {
		return { bytes: Bytes32Descriptor.fromValue(value) };
	},
	toValue(value) {
		return Bytes32Descriptor.toValue(value.bytes);
	}
};
var ShieldedCoinRecipientDescriptor = {
	alignment() {
		return CompactTypeBoolean.alignment().concat(ZswapCoinPublicKeyDescriptor.alignment().concat(ContractAddressDescriptor.alignment()));
	},
	fromValue(value) {
		return {
			is_left: CompactTypeBoolean.fromValue(value),
			left: ZswapCoinPublicKeyDescriptor.fromValue(value),
			right: ContractAddressDescriptor.fromValue(value)
		};
	},
	toValue(value) {
		return CompactTypeBoolean.toValue(value.is_left).concat(ZswapCoinPublicKeyDescriptor.toValue(value.left).concat(ContractAddressDescriptor.toValue(value.right)));
	}
};
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/built-ins.js
var FIELD_MODULUS = MAX_FIELD + 1n;
/**
* Field addition
* returns the result of adding x and y, wrapping if necessary
* x and y are assumed to be values in the range [0, FIELD_MODULUS)
*/
function addField(x, y) {
	const t = x + y;
	return t < FIELD_MODULUS ? t : t - FIELD_MODULUS;
}
/**
* Field subtraction
* returns the result of subtracting y from x, wrapping if necessary
* x and y are assumed to be values in the range [0, FIELD_MODULUS)
*/
function subField(x, y) {
	const t = x - y;
	return t >= 0 ? t : t + FIELD_MODULUS;
}
/**
* Field multiplication
* returns the result of multipying x and y, wrapping if necessary
* x and y are assumed to be values in the range [0, FIELD_MODULUS)
*/
function mulField(x, y) {
	return x * y % FIELD_MODULUS;
}
/**
* The Compact builtin `transientHash` function
*
* This function is a circuit-efficient compression function from arbitrary
* data to field elements, which is not guaranteed to persist between upgrades.
* It should not be used to derive state data, but can be used for consistency
* checks.
*/
function transientHash(rtType, value) {
	return ocrt.valueToBigInt(ocrt.transientHash(rtType.alignment(), rtType.toValue(value)));
}
/**
* The Compact builtin `transientCommit` function
*
* This function is a circuit-efficient commitment function from arbitrary
* values representable in Compact, and a field element commitment opening, to
* field elements, which is not guaranteed to persist between
* upgrades. It should not be used to derive state data, but can be used for
* consistency checks.
*
* @throws If `opening` is out of range for field elements
*/
function transientCommit(rtType, value, opening) {
	return ocrt.valueToBigInt(ocrt.transientCommit(rtType.alignment(), rtType.toValue(value), ocrt.bigIntToValue(opening)));
}
/**
* The Compact builtin `persistentHash` function
*
* This function is a non-circuit-optimised hash function for mostly arbitrary
* data. It is guaranteed to persist between upgrades, with the exception of
* devnet. It *should* be used to derive state data, and not for consistency
* checks where avoidable.
*
* Note that data containing `Opaque` elements *may* throw runtime errors, and
* cannot be relied upon as a consistent representation.
*
* @throws If `rtType` encodes a type containing Compact 'Opaque' types
*/
function persistentHash(rtType, value) {
	const wrapped = ocrt.persistentHash(rtType.alignment(), rtType.toValue(value))[0];
	const res = /* @__PURE__ */ new Uint8Array(32);
	res.set(wrapped, 0);
	return res;
}
/**
* The Compact builtin `persistentCommit` function
*
* This function is a non-circuit-optimised commitment function from arbitrary
* values representable in Compact, and a 256-bit bytestring opening, to a
* 256-bit bytestring. It is guaranteed to persist between upgrades. It
* *should* be used to derive state data, and not for consistency checks where
* avoidable.
*
* Note that data containing `Opaque` elements *may* throw runtime errors, and
* cannot be relied upon as a consistent representation.
*
* @throws If `rtType` encodes a type containing Compact 'Opaque' types, or
* `opening` is not 32 bytes long
*/
function persistentCommit(rtType, value, opening) {
	if (opening.length != 32) throw new CompactError("Expected 32-byte string");
	const wrapped = ocrt.persistentCommit(rtType.alignment(), rtType.toValue(value), [opening])[0];
	const res = /* @__PURE__ */ new Uint8Array(32);
	res.set(wrapped, 0);
	return res;
}
/**
* The Compact builtin `degradeToTransient` function
*
* This function "degrades" the output of a {@link persistentHash} or
* {@link persistentCommit} to a field element, which can then be used in
* {@link transientHash} or {@link transientCommit}.
*
* @throws If `x` is not 32 bytes long
*/
function degradeToTransient(x) {
	if (x.length != 32) throw new CompactError("Expected 32-byte string");
	return ocrt.valueToBigInt(ocrt.degradeToTransient([x]));
}
/**
* The Compact builtin `upgradeFromTransient` function
*
* This function "upgrades" the output of a {@link transientHash} or
* {@link transientCommit} to 256-bit byte string, which can then be used in
* {@link persistentHash} or {@link persistentCommit}.
*
* @throws If `x` is not a valid field element
*/
function upgradeFromTransient(x) {
	const wrapped = ocrt.upgradeFromTransient(ocrt.bigIntToValue(x))[0];
	const res = /* @__PURE__ */ new Uint8Array(32);
	res.set(wrapped, 0);
	return res;
}
function jubjubPointX(pt) {
	return pt.x;
}
function jubjubPointY(pt) {
	return pt.y;
}
function constructJubjubPoint(x, y) {
	return {
		x,
		y
	};
}
/**
* The Compact builtin `hashToCurve` function
*
* This function maps arbitrary values representable in Compact to elliptic
* curve points in the proof system's embedded curve.
*
* Outputs are guaranteed to have unknown discrete logarithm with respect to
* the group base, and any other output, but are not guaranteed to be unique (a
* given input can be proven correct for multiple outputs).
*
* Inputs of different types may have the same output, if they have the same
* field-aligned binary representation.
*/
function hashToCurve(rtType, x) {
	return CompactTypeJubjubPoint.fromValue(ocrt.hashToCurve(rtType.alignment(), rtType.toValue(x)));
}
/**
* The Compact builtin `ecAdd` function
*
* This function add two elliptic curve points (in multiplicative notation)
*/
function ecAdd(a, b) {
	return CompactTypeJubjubPoint.fromValue(ocrt.ecAdd(CompactTypeJubjubPoint.toValue(a), CompactTypeJubjubPoint.toValue(b)));
}
/**
* The Compact builtin `ecMul` function
*
* This function multiplies an elliptic curve point by a scalar (in
* multiplicative notation)
*/
function ecMul(a, b) {
	return CompactTypeJubjubPoint.fromValue(ocrt.ecMul(CompactTypeJubjubPoint.toValue(a), ocrt.bigIntToValue(b)));
}
/**
* The Compact builtin `ecMulGenerator` function
*
* This function multiplies the primary group generator of the embedded curve
* by a scalar (in multiplicative notation)
*/
function ecMulGenerator(b) {
	return CompactTypeJubjubPoint.fromValue(ocrt.ecMulGenerator(ocrt.bigIntToValue(b)));
}
/**
* Concatenates multiple {@link AlignedValue}s
* @internal
*/
function alignedConcat(...values) {
	const res = {
		value: [],
		alignment: []
	};
	for (const value of values) {
		res.value = res.value.concat(value.value);
		res.alignment = res.alignment.concat(value.alignment);
	}
	return res;
}
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/casts.js
/**
* Compiler internal for typecasts
* @internal
*/
function convertFieldToBytes(n, x, src) {
	const x_0 = x;
	const a = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		a[i] = Number(x & 255n);
		x = x / 256n;
		if (x == 0n) return a;
	}
	throw new CompactError(`range error at ${src}: Field or Uint value ${x_0} does not fit into ${n} bytes`);
}
/**
* Compiler internal for typecasts
* @internal
*/
function convertBytesToField(n, a, src) {
	let x = 0n;
	for (let i = n - 1; i >= 0; i -= 1) {
		x = x * 256n + BigInt(a[i]);
		if (x > MAX_FIELD) throw new CompactError(`range error at ${src}: byte vector [${Array.from(a.slice(0, n)).join(",")}] exceeds maximum value ${MAX_FIELD} of Field type`);
	}
	return x;
}
/**
* Compiler internal for typecasts
* @internal
*/
function convertBytesToUint(maxval, n, a, src) {
	let x = 0n;
	for (let i = n - 1; i >= 0; i -= 1) {
		x = x * 256n + BigInt(a[i]);
		if (x > maxval) throw new CompactError(`range error at ${src}: byte vector [${Array.from(a.slice(0, n)).join(",")}] exceeds maximum value ${maxval} of target Uint type`);
	}
	return x;
}
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/utils.js
/**
* Regex matching hex strings of even length.
*/
var HEX_REGEX_NO_PREFIX = /^([0-9A-Fa-f]{2})*$/;
/**
* The expected length (in bytes) of a contract address.
*/
var CONTRACT_ADDRESS_BYTE_LENGTH = 32;
/**
* Tests whether the input value is a {@link ContractAddress}, i.e., string.
*
* @param x The value that is tested to be a {@link ContractAddress}.
*/
function isContractAddress(x) {
	return typeof x === "string" && x.length === 64 && HEX_REGEX_NO_PREFIX.test(x);
}
function isEncodedContractAddress(x) {
	return typeof x === "object" && x !== null && x !== void 0 && "bytes" in x && x.bytes instanceof Uint8Array && x.bytes.length == 32;
}
var fromHex = (s) => Buffer.from(s, "hex");
var toHex = (s) => Buffer.from(s).toString("hex");
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/zswap.js
/**
* Constructs a new {@link EncodedZswapLocalState} with the given coin public key. The result can be used to create a
* {@link ConstructorContext}.
*
* @param coinPublicKey The Zswap coin public key of the user executing the circuit.
*/
var emptyZswapLocalState = (coinPublicKey) => ({
	coinPublicKey: typeof coinPublicKey === "string" ? { bytes: ocrt.encodeCoinPublicKey(coinPublicKey) } : coinPublicKey,
	currentIndex: 0n,
	inputs: [],
	outputs: []
});
/**
* Converts an {@link Recipient} to an {@link EncodedRecipient}. Useful for testing.
*/
var encodeRecipient = ({ is_left, left, right }) => ({
	is_left,
	left: { bytes: ocrt.encodeCoinPublicKey(left) },
	right: { bytes: ocrt.encodeContractAddress(right) }
});
/**
* Converts an {@link EncodedRecipient} to a {@link Recipient}.
*/
var decodeRecipient = ({ is_left, left, right }) => ({
	is_left,
	left: ocrt.decodeCoinPublicKey(left.bytes),
	right: ocrt.decodeContractAddress(right.bytes)
});
/**
* Converts a {@link ZswapLocalState} to an {@link EncodedZswapLocalState}. Useful for testing.
*
* @param state The decoded Zswap local state.
*/
var encodeZswapLocalState = (state) => ({
	coinPublicKey: { bytes: ocrt.encodeCoinPublicKey(state.coinPublicKey) },
	currentIndex: state.currentIndex,
	inputs: state.inputs.map(ocrt.encodeQualifiedShieldedCoinInfo),
	outputs: state.outputs.map(({ coinInfo, recipient }) => ({
		coinInfo: ocrt.encodeShieldedCoinInfo(coinInfo),
		recipient: encodeRecipient(recipient)
	}))
});
/**
* Converts an {@link EncodedZswapLocalState} to a {@link ZswapLocalState}. Used when we need to use data from contract
* execution to construct transactions.
*
* @param state The encoded Zswap local state.
*/
var decodeZswapLocalState = (state) => ({
	coinPublicKey: ocrt.decodeCoinPublicKey(state.coinPublicKey.bytes),
	currentIndex: state.currentIndex,
	inputs: state.inputs.map(ocrt.decodeQualifiedShieldedCoinInfo),
	outputs: state.outputs.map(({ coinInfo, recipient }) => ({
		coinInfo: ocrt.decodeShieldedCoinInfo(coinInfo),
		recipient: decodeRecipient(recipient)
	}))
});
/**
* Adds a coin to the list of inputs consumed by the circuit.
*
* @param circuitContext The current circuit context.
* @param qualifiedShieldedCoinInfo The input to consume.
*/
function createZswapInput(circuitContext, qualifiedShieldedCoinInfo) {
	circuitContext.currentZswapLocalState = {
		...circuitContext.currentZswapLocalState,
		inputs: circuitContext.currentZswapLocalState.inputs.concat(qualifiedShieldedCoinInfo)
	};
	return [];
}
/**
* Creates a coin commitment from the given coin information and recipient represented as an Impact value.
*
* @param coinInfo The coin.
* @param recipient The coin recipient.
*
* @internal
*/
function createCoinCommitment(coinInfo, recipient) {
	return ocrt.runtimeCoinCommitment({
		value: ShieldedCoinInfoDescriptor.toValue(coinInfo),
		alignment: ShieldedCoinInfoDescriptor.alignment()
	}, {
		value: ShieldedCoinRecipientDescriptor.toValue(recipient),
		alignment: ShieldedCoinRecipientDescriptor.alignment()
	});
}
/**
* Adds a coin to the list of outputs produced by the circuit.
*
* @param circuitContext The current circuit context.
* @param coinInfo The coin to produce.
* @param recipient The coin recipient - either a coin public key representing an end user or a contract address
*                  representing a contract.
*/
function createZswapOutput(circuitContext, coinInfo, recipient) {
	circuitContext.currentQueryContext = circuitContext.currentQueryContext.insertCommitment(Buffer.from(Bytes32Descriptor.fromValue(createCoinCommitment(coinInfo, recipient).value)).toString("hex"), circuitContext.currentZswapLocalState.currentIndex);
	circuitContext.currentZswapLocalState = {
		...circuitContext.currentZswapLocalState,
		currentIndex: circuitContext.currentZswapLocalState.currentIndex + 1n,
		outputs: circuitContext.currentZswapLocalState.outputs.concat({
			coinInfo,
			recipient
		})
	};
	return [];
}
/**
* Retrieves the Zswap coin public key of the user executing the circuit.
*
* @param circuitContext The current circuit context.
*/
function ownPublicKey(circuitContext) {
	return circuitContext.currentZswapLocalState.coinPublicKey;
}
/**
* Checks whether a coin commitment has already been added to the current query context.
*
* @param context The current circuit context.
* @param coinInfo The coin information to check.
* @param recipient The coin recipient to check.
*/
var hasCoinCommitment = (context, coinInfo, recipient) => context.currentQueryContext.comIndices.has(toHex(Bytes32Descriptor.fromValue(createCoinCommitment(coinInfo, recipient).value)));
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/constructor-context.js
/**
* Creates a new {@link ConstructorContext} with the given initial private state and an empty Zswap local state.
*
* @param initialPrivateState The private state to use to execute the contract's constructor.
* @param coinPublicKey The Zswap coin public key of the user executing the contract.
*/
var createConstructorContext = (initialPrivateState, coinPublicKey) => ({
	initialPrivateState,
	initialZswapLocalState: emptyZswapLocalState(coinPublicKey)
});
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/circuit-context.js
/**
* @internal
*/
var coerceToChargedState = (contractState) => {
	let state;
	if (contractState instanceof ocrt.ChargedState) state = contractState;
	else if (contractState instanceof ocrt.ContractState) state = contractState.data;
	else if (contractState instanceof ocrt.StateValue) state = new ocrt.ChargedState(contractState);
	else throw new CompactError(`'contractState' parameter ${contractState} has unexpected type`);
	return state;
};
/**
* @internal
*/
var createInitialQueryContext = (contractState, contractAddress, time) => {
	const initialQueryContext = new ocrt.QueryContext(coerceToChargedState(contractState), contractAddress);
	const balance = contractState instanceof ocrt.ContractState ? contractState.balance : /* @__PURE__ */ new Map();
	initialQueryContext.block = {
		...initialQueryContext.block,
		balance,
		ownAddress: contractAddress,
		secondsSinceEpoch: BigInt(time ?? Math.floor(Date.now() / 1e3))
	};
	return initialQueryContext;
};
/**
* @internal
*/
var isZswapLocalState = (value) => {
	return typeof value === "object" && value !== null && "coinPublicKey" in value && typeof value.coinPublicKey === "string" && "currentIndex" in value && "inputs" in value && "outputs" in value;
};
/**
* @internal
*/
var isEncodedZswapLocalState = (value) => {
	return typeof value === "object" && value !== null && "coinPublicKey" in value && typeof value.coinPublicKey === "object" && value.coinPublicKey !== null && "bytes" in value.coinPublicKey && "currentIndex" in value && "inputs" in value && "outputs" in value;
};
var createCircuitContext = (contractAddress, coinPublicKeyOrZswapState, contractState, privateState, gasLimit, costModel, time) => {
	const initialQueryContext = createInitialQueryContext(contractState, contractAddress, time);
	let zswapLocalState;
	if (isZswapLocalState(coinPublicKeyOrZswapState)) zswapLocalState = encodeZswapLocalState(coinPublicKeyOrZswapState);
	else if (isEncodedZswapLocalState(coinPublicKeyOrZswapState)) zswapLocalState = coinPublicKeyOrZswapState;
	else zswapLocalState = emptyZswapLocalState(coinPublicKeyOrZswapState);
	return {
		currentPrivateState: privateState,
		currentZswapLocalState: zswapLocalState,
		currentQueryContext: initialQueryContext,
		costModel: costModel ?? ocrt.CostModel.initialCostModel(),
		gasLimit
	};
};
/**
* Function for creating an initial running cost of zero.
*
* @internal
*/
var emptyRunningCost = () => ({
	readTime: 0n,
	computeTime: 0n,
	bytesWritten: 0n,
	bytesDeleted: 0n
});
/**
* Runs a program (query) against the current ledger state in the given circuit context. Records the transcript in the
* given partial proof data.
*
* @param circuitContext The context for the currently executing circuit.
* @param partialProofData The partial proof data to insert the query results into.
* @param program The query to run.
*/
var queryLedgerState = (circuitContext, partialProofData, program) => {
	try {
		const res = circuitContext.currentQueryContext.query(program, circuitContext.costModel, circuitContext.gasLimit);
		circuitContext.currentQueryContext = res.context;
		circuitContext["gasCost"] = res.gasCost;
		const reads = res.events.filter((e) => e.tag === "read");
		let i = 0;
		partialProofData.publicTranscript = partialProofData.publicTranscript.concat(program.map((op) => typeof op === "object" && "popeq" in op ? { popeq: {
			...op.popeq,
			result: reads[i++].content
		} } : op));
		if (res.events.length === 1) {
			const event = res.events[0];
			if (event.tag === "read") return event.content;
		}
		return res.events;
	} catch (err) {
		if (err instanceof Error) throw new CompactError(err.toString());
		throw err;
	}
};
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/witness.js
/**
* Internal constructor for {@link WitnessContext}.
* @internal
*/
function createWitnessContext(ledger, privateState, contractAddress) {
	return {
		ledger,
		privateState,
		contractAddress
	};
}
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-runtime/dist/contract-dependencies.js
/**
* Tests whether the input value is a {@link CompactVector}.
*
* @param x The value that is tested to be a {@link CompactVector}.
*/
function isCompactVector(x) {
	return Array.isArray(x) && x.every((element) => isCompactValue(element));
}
/**
* Tests whether the input value is a {@link CompactStruct}.
*
* @param x The value that is tested to be a {@link CompactStruct}.
*/
function isCompactStruct(x) {
	return typeof x === "object" && x !== null && x !== void 0 && Object.entries(x).every(([key, value]) => typeof key === "string" && isCompactValue(value));
}
/**
* Tests whether the input value is a {@link CompactValue}.
*
* @param x The value that is tested to be a {@link CompactValue}.
*/
function isCompactValue(x) {
	return isEncodedContractAddress(x) || isCompactVector(x) || isCompactStruct(x);
}
var expectedValueError = (expected, actual) => {
	throw new CompactError(`Expected ${expected} but received ${JSON.stringify(actual)}`);
};
/**
* Throws an error if the input value is not a {@link ContractAddress}, i.e., string.
*
* @param value The value that is asserted to be a {@link ContractAddress}.
*/
function assertIsContractAddress(value) {
	if (!isEncodedContractAddress(value)) expectedValueError("contract address", value);
}
/**
* Throws an error if the input value is not a {@link CompactVector}.
*
* @param value The value that is asserted to be a {@link CompactVector}.
*/
function assertIsCompactVector(value) {
	if (!isCompactVector(value)) expectedValueError("vector", value);
}
/**
* Throws an error if the input value is not a {@link CompactStruct}.
*
* @param value The value that is asserted to be a {@link CompactStruct}.
*/
function assertIsCompactStruct(value) {
	if (!isCompactStruct(value)) expectedValueError("struct", value);
}
/**
* Throws an error if the input value is not a {@link CompactValue}.
*
* @param x The value that is asserted to be a {@link CompactValue}.
*/
function assertIsCompactValue(x) {
	if (!isCompactValue(x)) expectedValueError("Compact value", x);
}
/**
* Converts an unknown TypeScript value into a {@link CompactValue}. This conversion __should__ always succeed.
*
* @param x The value to convert.
*/
function toCompactValue(x) {
	assertIsCompactValue(x);
	return x;
}
/**
* Extracts the contract addresses present in the given {@link CompactValue}.
*
* @param sparseCompactType A data structure indicating the locations of all contract references in the given {@link CompactValue}.
* @param compactValue The Compact value containing contract references.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var compactValueDependencies = (sparseCompactType, compactValue, dependencies) => {
	if (sparseCompactType.tag == "contractAddress") {
		assertIsContractAddress(compactValue);
		dependencies.add(ocrt.decodeContractAddress(compactValue.bytes));
	} else if (sparseCompactType.tag == "struct") {
		assertIsCompactStruct(compactValue);
		Object.keys(compactValue).forEach((structElementId) => compactValueDependencies(sparseCompactType.elements[structElementId], compactValue[structElementId], dependencies));
	} else {
		assertIsCompactVector(compactValue);
		compactValue.forEach((vectorElement) => compactValueDependencies(sparseCompactType.sparseType, vectorElement, dependencies));
	}
};
/**
* Converts a Compact value in the on-chain runtime representation ({@link AlignedValue}) into a TypeScript ({@link CompactValue})
* representation.
*
* @param descriptor The descriptor to convert a {@link AlignedValue} into a TypeScript value.
* @param value The value to convert.
*/
var alignedValueToCompactValue = (descriptor, { value }) => toCompactValue(descriptor.fromValue(value));
/**
* Converts a {@link StateValue} into a {@link CompactValue} by treating the state as a `Cell` ADT containing a Compact value.
*
* @param descriptor The descriptor used to convert the {@link AlignedValue} extracted from the `Cell` ADT into a TypeScript
*                   representation of a Compact value containing a contract address.
* @param stateValue Represents a `Cell` ADT.
*/
var stateValueToCompactValue = (descriptor, stateValue) => alignedValueToCompactValue(descriptor, stateValue.asCell());
/**
* Extracts the contract references contained in a Compact `Cell` ADT represented by the given {@link StateValue}.
*
* @param sparseCompactCellADT A data structure pointing to contract references in the Compact `Cell` ADT corresponding
*                             to the given `state` parameter, if any exist.
* @param state A portion of the input ledger state representing a Compact `Cell` ADT.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var compactCellDependencies = (sparseCompactCellADT, state, dependencies) => {
	const { sparseType, descriptor } = sparseCompactCellADT.valueType;
	compactValueDependencies(sparseType, stateValueToCompactValue(descriptor, state), dependencies);
};
/**
* Extracts the contract references contained in a Compact `List` or `Set` ADT represented by the given {@link StateValue} array.
*
* @param sparseCompactArrayLikeADT A data structure pointing to contract references in the Compact `List` or `Set` ADT corresponding
*                                  to the given `states` parameter, if any exist.
* @param states A portion of the input ledger state representing a Compact `List` or `Set` ADT.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var compactArrayLikeADTDependencies = (sparseCompactArrayLikeADT, states, dependencies) => {
	const { sparseType, descriptor } = sparseCompactArrayLikeADT.valueType;
	states.forEach((state) => compactValueDependencies(sparseType, stateValueToCompactValue(descriptor, state), dependencies));
};
/**
* Extracts the contract references contained in a Compact `Map` ADT represented by the given {@link StateMap} object.
*
* @param sparseCompactMapADT A data structure pointing to contract references in the Compact `Map` ADT corresponding
*                            to the given `stateMap` parameter, if any exist.
* @param stateMap A portion of the input ledger state representing a Compact `Map` ADT.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var compactMapADTDependencies = (sparseCompactMapADT, stateMap, dependencies) => {
	const { keyType, valueType } = sparseCompactMapADT;
	stateMap.keys().forEach((key) => {
		if (keyType) compactValueDependencies(keyType.sparseType, alignedValueToCompactValue(keyType.descriptor, key), dependencies);
		if (valueType) {
			const value = stateMap.get(key);
			if (!value) throw new CompactError(`State map ${stateMap.toString(false)} contains key without corresponding value`);
			if (valueType.tag == "compactValue") compactValueDependencies(valueType.sparseType, stateValueToCompactValue(valueType.descriptor, value), dependencies);
			else compactADTDependencies(valueType, value, dependencies);
		}
	});
};
/**
* Throw a {@link CompactError} if the input `s` value is undefined. Called when the input {@link StateValue} could not be
* cast to either a map, array, or boundary Merkle tree representation.
*
* @param s The value that is asserted to be defined.
* @param stateValue The state on which the cast to  a map, array, or boundary Merkle tree representation was attempted.
* @param expectedCastOutput The representation to which the input state __should__ have been cast.
*/
function assertCastSucceeded(s, stateValue, expectedCastOutput) {
	if (!s) throw new CompactError(`State ${stateValue.toString(false)} cannot be cast to a ${expectedCastOutput}`);
}
/**
* Extracts the contract references present in the ADT that the input {@link StateValue} represents. Attempts to cast the
* input state to a different representation indicated by the input {@link SparseCompactADT}.
*
* @param sparseCompactADT A data structure pointing to contract references in the Compact ADT represented by the input state.
* @param stateValue The state representing a Compact ADT.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var compactADTDependencies = (sparseCompactADT, stateValue, dependencies) => {
	if (sparseCompactADT.tag == "cell") compactCellDependencies(sparseCompactADT, stateValue, dependencies);
	else if (sparseCompactADT.tag == "map") {
		const stateMap = stateValue.asMap();
		assertCastSucceeded(stateMap, stateValue, "map");
		compactMapADTDependencies(sparseCompactADT, stateMap, dependencies);
	} else if (sparseCompactADT.tag == "list" || sparseCompactADT.tag == "set") {
		const states = stateValue.asArray();
		assertCastSucceeded(states, stateValue, "array");
		compactArrayLikeADTDependencies(sparseCompactADT, states, dependencies);
	}
};
/**
* Converts a {@link StateValue} into an array of state values by calling `asArray`. Throws an error if the cast fails.
*
* @param state To state to convert.
*/
var castToStateArray = (state) => {
	const ledgerState = state.asArray();
	assertCastSucceeded(ledgerState, state, "array");
	return ledgerState;
};
/**
* Extracts the contract references present in a {@link PublicLedgerSegments} by converting the given state value into
* a state array, iterating over the entries of {@link PublicLedgerSegments.indices}, and either recurring or calling
* {@link compactADTDependencies} with a {@link SparseCompactADT} value.
*
* @param publicLedgerSegments A data structure pointing to contract references in a segment of the ledger state of
*                             the root contract.
* @param state A segment of the ledger state of the root contract.
* @param dependencies The current set of contract addresses extracted from the input ledger state.
*/
var publicLedgerSegmentsDependencies = (publicLedgerSegments, state, dependencies) => {
	const ledgerState = castToStateArray(state);
	Object.keys(publicLedgerSegments.indices).map(parseInt).forEach((idx) => {
		const referenceLocations = publicLedgerSegments.indices[idx];
		if ("tag" in referenceLocations && referenceLocations["tag"] === "publicLedgerArray") publicLedgerSegmentsDependencies(referenceLocations, ledgerState[idx], dependencies);
		else compactADTDependencies(referenceLocations, ledgerState[idx], dependencies);
	});
};
/**
* Given a {@link StateValue} representing the current ledger state of a contract, uses the {@link ContractReferenceLocations}
* object produced by the Compact compiler to extract the current contract addresses present in the given ledger state. The produced
* contract addresses represent the contracts on which the root contract depends. The dependencies are used in a multi-contract
* setting to fetch the ledger states of all contracts on which the root contract depends prior to execution.
*
* NOTE: The given {@link ContractReferenceLocations} must be from the contract executable containing the ledger state constructor
*       that produced the given {@link StateValue}.
*
* @param contractReferenceLocations A data structure pointing to contract references in the ledger state of the root contract.
* @param state The current ledger state of the root contract.
* @returns A list of all contract addresses (references) present in the given ledger state.
*
* @remarks The algorithm has three main stages:
*
*          1. It unwraps the {@link PublicLedgerSegments} in the given {@link ContractReferenceLocations} until a {@link SparseCompactADT} is reached.
*             Each time a {@link PublicLedgerSegments} is unwrapped, it casts the current state value to a state value array and proceeds recursively with each
*             of the state values and unwrapped ledger segments.
*          2. It unwraps each {@link SparseCompactADT} in the current {@link PublicLedgerSegments} until a {@link SparseCompactType} is reached.
*             Each time a {@link SparseCompactADT} is unwrapped, it casts the current state value to a state representation indicated by
*             the {@link SparseCompactADT}.
*          3. Once the current state can no longer be reduced, it must represent a Compact contract address somewhere inside the state,
*             and that contract address is added to the dependency set.
*/
var contractDependencies = (contractReferenceLocations, state) => {
	const dependencies = /* @__PURE__ */ new Set();
	if (contractReferenceLocations.indices) publicLedgerSegmentsDependencies(contractReferenceLocations, state, dependencies);
	return [...dependencies];
};
//#endregion
export { createConstructorContext as $, checkRuntimeVersion as $t, encodeUserAddress as A, persistentHash as At, sampleRawTokenType as B, CompactTypeJubjubPoint as Bt, dummyContractAddress as C, ecMul as Ct, encodeQualifiedShieldedCoinInfo as D, jubjubPointY as Dt, encodeContractAddress as E, jubjubPointX as Et, proofDataIntoSerializedPreimage as F, Bytes32Descriptor as Ft, signingKeyFromBip340 as G, CompactTypeOpaqueUint8Array as Gt, sampleUserAddress as H, CompactTypeMerkleTreePath as Ht, rawTokenType as I, CompactTypeBoolean as It, contractDependencies as J, ContractAddressDescriptor as Jt, valueToBigInt as K, CompactTypeUnsignedInteger as Kt, runProgram as L, CompactTypeBytes as Lt, leafHash as M, transientCommit as Mt, maxAlignedSize as N, transientHash as Nt, encodeRawTokenType as O, mulField as Ot, maxField as P, upgradeFromTransient as Pt, queryLedgerState as Q, ZswapCoinPublicKeyDescriptor as Qt, runtimeCoinCommitment as R, CompactTypeEnum as Rt, decodeUserAddress as S, ecAdd as St, encodeCoinPublicKey as T, hashToCurve as Tt, signData as U, CompactTypeMerkleTreePathEntry as Ut, sampleSigningKey as V, CompactTypeMerkleTreeDigest as Vt, signatureVerifyingKey as W, CompactTypeOpaqueString as Wt, createCircuitContext as X, ShieldedCoinInfoDescriptor as Xt, createWitnessContext as Y, MaxUint8Descriptor as Yt, emptyRunningCost as Z, ShieldedCoinRecipientDescriptor as Zt, decodeCoinPublicKey as _, convertFieldToBytes as _t, CostModel as a, typeError as an, encodeRecipient as at, decodeRawTokenType as b, constructJubjubPoint as bt, StateBoundedMerkleTree as c, ownPublicKey as ct, VmResults as d, fromHex as dt, versionString as en, createZswapInput as et, VmStack as f, isContractAddress as ft, communicationCommitmentRandomness as g, convertBytesToUint as gt, communicationCommitment as h, convertBytesToField as ht, ContractState as i, assert as in, emptyZswapLocalState as it, entryPointHash as j, subField as jt, encodeShieldedCoinInfo as k, persistentCommit as kt, StateMap as l, CONTRACT_ADDRESS_BYTE_LENGTH as lt, bigIntToValue as m, toHex as mt, ContractMaintenanceAuthority as n, MAX_FIELD as nn, decodeRecipient as nt, QueryContext as o, encodeZswapLocalState as ot, bigIntModFr as p, isEncodedContractAddress as pt, verifySignature as q, CompactTypeVector as qt, ContractOperation as r, CompactError as rn, decodeZswapLocalState as rt, QueryResults as s, hasCoinCommitment as st, ChargedState as t, DUMMY_ADDRESS as tn, createZswapOutput as tt, StateValue as u, HEX_REGEX_NO_PREFIX as ut, decodeContractAddress as v, addField as vt, dummyUserAddress as w, ecMulGenerator as wt, decodeShieldedCoinInfo as x, degradeToTransient as xt, decodeQualifiedShieldedCoinInfo as y, alignedConcat as yt, sampleContractAddress as z, CompactTypeField as zt };
