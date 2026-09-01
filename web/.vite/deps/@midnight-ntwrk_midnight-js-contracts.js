import { n as __exportAll, r as __reExport } from "./rolldown-runtime-CoDluQUr.js";
import { V as sampleSigningKey, i as ContractState } from "./dist-lrxkyrfs.js";
import { c as ProvableCircuitId, l as VerifierKey } from "./ZKConfiguration-D8OU2fUI.js";
import { C as toHex, S as parseEncPublicKeyToHex, _ as assertDefined, b as assertUndefined, c as asContractAddress, g as ContractAddress, l as asEffectOption, m as makeContractExecutableRuntime, p as exitResultOrError, v as assertIsContractAddress, w as ttlOneHour, x as parseCoinPublicKeyToHex } from "./dist-sP9ktYvK.js";
import { n as make } from "./compact-js-9Ap6A9-e.js";
import { $ as Transaction, _t as ZswapOutput, bt as ZswapTransient, c as ContractDeploy, fi as coinCommitment, gt as ZswapOffer, hi as communicationCommitmentRandomness, k as Intent, p as ContractState$1, pt as ZswapInput, rt as UnshieldedOffer, s as ContractCallPrototype } from "./midnight_ledger_wasm-DY-mCxaE.js";
import { t as getNetworkId } from "./dist-HqXgcb0A.js";
//#region ../node_modules/@midnight-ntwrk/midnight-js-protocol/dist/onchain-runtime.mjs
var onchain_runtime_exports = /* @__PURE__ */ __exportAll({});
import * as import__midnight_ntwrk_onchain_runtime_v3 from "@midnight-ntwrk/onchain-runtime-v3";
__reExport(onchain_runtime_exports, import__midnight_ntwrk_onchain_runtime_v3);
//#endregion
//#region ../node_modules/@midnight-ntwrk/midnight-js-contracts/dist/index.mjs
async function submitTxCore(providers, options) {
	const provenTx = await providers.proofProvider.proveTx(options.unprovenTx);
	const toSubmit = await providers.walletProvider.balanceTx(provenTx);
	return providers.midnightProvider.submitTx(toSubmit);
}
/**
* Proves, balances, and submits an unproven deployment or call transaction using
* the given providers, according to the given options.
*
* ## Blocking Behavior
*
* This method **waits indefinitely** for the transaction to appear on the blockchain via
* `providers.publicDataProvider.watchForTxData(txId)`. It will not return until:
* - The transaction is successfully included in the blockchain, OR
* - An error occurs during proving, balancing, or submission
*
* ## Conditions When Transaction May Not Appear
*
* A submitted transaction may fail to appear on-chain if:
* - Transaction is invalid in ways not detected during local validation
* - Network issues prevent propagation to validators
* - Transaction is rejected by validator consensus
* - Insufficient fees or resources
* - Contract state has changed making the transaction invalid
*
* ## Implications of Aborting This Method
*
* If the application terminates this method before it returns:
* - Transaction may still be pending/processing on-chain
* - **Private state updates are NOT stored** (even if transaction later succeeds on-chain)
* - **Signing keys are NOT updated** (for deploy/replace authority transactions)
* - Application state will be out of sync with blockchain state
* - Manual recovery may be required to reconcile state
*
* **Recommendation**: Use {@link submitTxAsync} for non-blocking submission with manual
* finalization handling and timeout control.
*
* @param providers The providers used to manage the transaction lifecycle.
* @param options Configuration.
*
* @returns A promise that resolves with the finalized transaction data for the invocation,
*          or rejects if an error occurs along the way.
*/
var submitTx = async (providers, options) => {
	const txId = await submitTxCore(providers, options);
	return providers.publicDataProvider.watchForTxData(txId);
};
/**
* Proves, balances, and submits an unproven deployment or call transaction using
* the given providers, according to the given options. Unlike {@link submitTx},
* this function returns immediately after submission without waiting for finalization.
*
* @param providers The providers used to manage the transaction lifecycle.
* @param options Configuration.
*
* @returns A promise that resolves with the transaction ID immediately after submission,
*          or rejects if an error occurs during preparation or submission.
*          To watch for finalization, use providers.publicDataProvider.watchForTxData(txId).
*/
var submitTxAsync = async (providers, options) => {
	return submitTxCore(providers, options);
};
var isEffectContractError = (error) => typeof error === "object" && error !== null && "_tag" in error && "cause" in error && typeof error.cause === "object" && error.cause !== null && "name" in error.cause && "message" in error.cause;
/**
* An error indicating that a transaction submitted to a consensus node failed.
*/
var TxFailedError = class extends Error {
	finalizedTxData;
	circuitId;
	/**
	* @param finalizedTxData The finalization data of the transaction that failed.
	* @param circuitId The name of the circuit that was called to create the call
	*                  transaction that failed. Only defined if a call transaction
	*                  failed.
	*/
	constructor(finalizedTxData, circuitId) {
		super("Transaction failed");
		this.finalizedTxData = finalizedTxData;
		this.circuitId = circuitId;
		this.message = JSON.stringify({
			...circuitId && { circuitId },
			...finalizedTxData
		}, (_key, value) => {
			if (typeof value === "bigint") return value.toString();
			if (value instanceof Map) return Object.fromEntries(value);
			return value;
		}, "	");
	}
};
/**
* An error indicating that a deploy transaction was not successfully applied by the consensus node.
*/
var DeployTxFailedError = class extends TxFailedError {
	/**
	* @param finalizedTxData The finalization data of the deployment transaction that failed.
	*/
	constructor(finalizedTxData) {
		super(finalizedTxData);
		this.name = "DeployTxFailedError";
	}
};
/**
* An error indicating that a call transaction was not successfully applied by the consensus node.
*/
var CallTxFailedError = class extends TxFailedError {
	/**
	* @param finalizedTxData The finalization data of the call transaction that failed.
	* @param circuitId The name of the circuit that was called to build the transaction.
	*/
	constructor(finalizedTxData, circuitId) {
		super(finalizedTxData, circuitId);
		this.name = "CallTxFailedError";
	}
};
/**
* The error that is thrown when there is a contract type mismatch between a given contract type,
* and the initial state that is deployed at a given contract address.
*
* @remarks
* This error is typically thrown during calls to {@link findDeployedContract} where the supplied contract
* address represents a different type of contract to the contract type given.
*/
var ContractTypeError = class extends TypeError {
	contractState;
	circuitIds;
	/**
	* Initializes a new {@link ContractTypeError}.
	*
	* @param contractState The initial deployed contract state.
	* @param circuitIds The circuits that are undefined, or have a verifier key mismatch with the
	*                   key present in `contractState`.
	*/
	constructor(contractState, circuitIds) {
		super(`Following operations: ${circuitIds.join(", ")}, are undefined or have mismatched verifier keys for contract state ${contractState.toString(false)}`);
		this.contractState = contractState;
		this.circuitIds = circuitIds;
	}
};
/**
* An error indicating that a private state ID was specified for a call transaction while a private
* state provider was not. We want to let the user know so that they aren't under the impression the
* private state of a contract was updated when it wasn't.
*/
var IncompleteCallTxPrivateStateConfig = class extends Error {
	constructor() {
		super("Incorrect call transaction configuration");
		this.message = "'privateStateId' was defined for call transaction while 'privateStateProvider' was undefined";
	}
};
/**
* An error indicating that an initial private state was specified for a contract find while a
* private state ID was not. We can't store the initial private state if we don't have a private state ID,
* and we need to let the user know that.
*/
var IncompleteFindContractPrivateStateConfig = class extends Error {
	constructor() {
		super("Incorrect find contract configuration");
		this.message = "'initialPrivateState' was defined for contract find while 'privateStateId' was undefined";
	}
};
/**
* An error indicating that a scoped transaction attempted to use cached states
* with a different contract address or private state ID than the one originally cached.
* This prevents silent state mismatches when batching calls to different contracts.
*/
var ScopedTransactionIdentityMismatchError = class extends Error {
	cached;
	requested;
	constructor(cached, requested) {
		super("Scoped transaction identity mismatch");
		this.cached = cached;
		this.requested = requested;
		this.name = "ScopedTransactionIdentityMismatchError";
		this.message = `Cannot use cached states from contract '${cached.contractAddress}'` + (cached.privateStateId ? ` (privateStateId: '${cached.privateStateId}')` : "") + ` for contract '${requested.contractAddress}'` + (requested.privateStateId ? ` (privateStateId: '${requested.privateStateId}')` : "") + ". Scoped transactions must target the same contract and private state identity.";
	}
};
/**
* An error indicating that a contract maintenance authority replacement transaction failed.
*/
var ReplaceMaintenanceAuthorityTxFailedError = class extends TxFailedError {
	constructor(finalizedTxData) {
		super(finalizedTxData);
		this.name = "ReplaceMaintenanceAuthorityTxFailedError";
	}
};
/**
* An error indicating that a verifier key removal transaction failed.
*/
var RemoveVerifierKeyTxFailedError = class extends TxFailedError {
	constructor(finalizedTxData) {
		super(finalizedTxData);
		this.name = "RemoveVerifierKeyTxFailedError";
	}
};
/**
* An error indicating that a verifier key insertion transaction failed.
*/
var InsertVerifierKeyTxFailedError = class extends TxFailedError {
	constructor(finalizedTxData) {
		super(finalizedTxData);
		this.name = "InsertVerifierKeyTxFailedError";
	}
};
var unprovenTxFromContractUpdates = async (updateAndSignFn) => {
	return Transaction.fromParts(getNetworkId(), void 0, void 0, Intent.new(ttlOneHour()).addMaintenanceUpdate(await updateAndSignFn()));
};
var createUnprovenReplaceAuthorityTx = (zkConfigProvider, compiledContract, contractAddress, newAuthority, contractState, currentAuthority, coinPublicKey) => {
	const contractExec = make(compiledContract);
	const contractRuntime = makeContractExecutableRuntime(zkConfigProvider, {
		coinPublicKey,
		signingKey: currentAuthority
	});
	return unprovenTxFromContractUpdates(async () => {
		return (await contractRuntime.runPromise(contractExec.replaceContractMaintenanceAuthority(asEffectOption(newAuthority), {
			address: asContractAddress(contractAddress),
			contractState
		}))).public.maintenanceUpdate;
	});
};
var createUnprovenRemoveVerifierKeyTx = (zkConfigProvider, compiledContract, contractAddress, operation, contractState, currentAuthority, coinPublicKey) => {
	const contractExec = make(compiledContract);
	const contractRuntime = makeContractExecutableRuntime(zkConfigProvider, {
		coinPublicKey,
		signingKey: currentAuthority
	});
	return unprovenTxFromContractUpdates(async () => {
		return (await contractRuntime.runPromise(contractExec.removeContractOperation(ProvableCircuitId(operation), {
			address: asContractAddress(contractAddress),
			contractState
		}))).public.maintenanceUpdate;
	});
};
var createUnprovenInsertVerifierKeyTx = (zkConfigProvider, compiledContract, contractAddress, operation, newVk, contractState, currentAuthority, coinPublicKey) => {
	const contractExec = make(compiledContract);
	const contractRuntime = makeContractExecutableRuntime(zkConfigProvider, {
		coinPublicKey,
		signingKey: currentAuthority
	});
	return unprovenTxFromContractUpdates(async () => {
		return (await contractRuntime.runPromise(contractExec.addOrReplaceContractOperation(ProvableCircuitId(operation), VerifierKey(newVk), {
			address: asContractAddress(contractAddress),
			contractState
		}))).public.maintenanceUpdate;
	});
};
/**
* Constructs and submits a transaction that adds a new verifier key to the
* blockchain for the given circuit ID at the given contract address.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Failure Behavior
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `InsertVerifierKeyTxFailedError` is thrown with transaction data
* - Verifier key is NOT added to the contract
* - No on-chain record of the failed transaction
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `InsertVerifierKeyTxFailedError` is thrown with transaction data
* - Verifier key may be partially added but not usable
* - Transaction appears in blockchain history as partial success
*
* @param providers The providers to use to manage the transaction lifecycle.
* @param compiledContract The compiled contract for which the maintenance authority
*                         should be updated.
* @param contractAddress The address of the contract containing the circuit for which
*                        the verifier key should be inserted.
* @param circuitId The circuit for which the verifier key should be inserted.
* @param newVk The new verifier key for the circuit.
*
* @returns A promise that resolves with the finalized transaction data, or rejects if
*          an error occurs along the way.
*
* @throws {InsertVerifierKeyTxFailedError} When transaction fails in either guaranteed or fallible phase.
*         The error contains the finalized transaction data for debugging.
*
* TODO: We'll likely want to modify ZKConfigProvider provider so that the verifier keys are
*       automatically rotated in this function. This likely involves storing key versions
*       along with keys in ZKConfigProvider. By default, artifacts for the latest version
*       would be fetched to build transactions.
*/
var submitInsertVerifierKeyTx = async (providers, compiledContract, contractAddress, circuitId, newVk) => {
	assertIsContractAddress(contractAddress);
	const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
	assertDefined(contractState, `No contract state found on chain for contract address '${contractAddress}'`);
	assertUndefined(contractState.operation(circuitId), `Circuit '${circuitId}' is already defined for contract at address '${contractAddress}'`);
	const signingKey = await providers.privateStateProvider.getSigningKey(contractAddress);
	assertDefined(signingKey, `Signing key for contract address '${contractAddress}' not found`);
	const submitTxResult = await submitTx(providers, { unprovenTx: await createUnprovenInsertVerifierKeyTx(providers.zkConfigProvider, compiledContract, contractAddress, circuitId, newVk, contractState, signingKey, providers.walletProvider.getCoinPublicKey()) });
	if (submitTxResult.status !== "SucceedEntirely") throw new InsertVerifierKeyTxFailedError(submitTxResult);
	return submitTxResult;
};
/**
* Constructs and submits a transaction that removes the current verifier key stored
* on the blockchain for the given circuit ID at the given contract address.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Failure Behavior
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `RemoveVerifierKeyTxFailedError` is thrown with transaction data
* - Verifier key remains on the contract (unchanged)
* - No on-chain record of the failed transaction
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `RemoveVerifierKeyTxFailedError` is thrown with transaction data
* - Verifier key may be partially removed but contract state is inconsistent
* - Transaction appears in blockchain history as partial success
*
* @param providers The providers to use to manage the transaction lifecycle.
* @param compiledContract The compiled contract for which the maintenance authority
*                         should be updated.
* @param contractAddress The address of the contract containing the circuit for which
*                        the verifier key should be removed.
* @param circuitId The circuit for which the verifier key should be removed.
*
* @returns A promise that resolves with the finalized transaction data, or rejects if
*          an error occurs along the way.
*
* @throws {RemoveVerifierKeyTxFailedError} When transaction fails in either guaranteed or fallible phase.
*         The error contains the finalized transaction data for debugging.
*
* TODO: We'll likely want to modify ZKConfigProvider provider so that the verifier keys are
*       automatically rotated in this function. This likely involves storing key versions
*       along with keys in ZKConfigProvider. By default, artifacts for the latest version
*       would be fetched to build transactions.
*/
var submitRemoveVerifierKeyTx = async (providers, compiledContract, contractAddress, circuitId) => {
	assertIsContractAddress(contractAddress);
	const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
	assertDefined(contractState, `No contract state found on chain for contract address '${contractAddress}'`);
	assertDefined(contractState.operation(circuitId), `Circuit '${circuitId}' not found for contract at address '${contractAddress}'`);
	const signingKey = await providers.privateStateProvider.getSigningKey(contractAddress);
	assertDefined(signingKey, `Signing key for contract address '${contractAddress}' not found`);
	const submitTxResult = await submitTx(providers, { unprovenTx: await createUnprovenRemoveVerifierKeyTx(providers.zkConfigProvider, compiledContract, contractAddress, circuitId, contractState, signingKey, providers.walletProvider.getCoinPublicKey()) });
	if (submitTxResult.status !== "SucceedEntirely") throw new RemoveVerifierKeyTxFailedError(submitTxResult);
	return submitTxResult;
};
/**
* Constructs and submits a transaction that replaces the maintenance
* authority stored on the blockchain for this contract. After the transaction is
* finalized, the current signing key stored in the given private state provider
* is overwritten with the given new authority key.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Failure Behavior
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `ReplaceMaintenanceAuthorityTxFailedError` is thrown with transaction data
* - Signing key in private state provider is NOT updated (remains as current authority)
* - Contract authority on-chain remains unchanged
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `ReplaceMaintenanceAuthorityTxFailedError` is thrown with transaction data
* - Signing key in private state provider is NOT updated (remains as current authority)
* - Contract authority on-chain may be partially updated but inconsistent
* - Transaction appears in blockchain history as partial success
*
* @param providers The providers to use to manage the transaction lifecycle.
* @param compiledContract The compiled contract for which the maintenance authority
*                         should be updated.
* @param contractAddress The address of the contract for which the maintenance
*                        authority should be updated.
*
* TODO: There are at least three options we should support in the future:
*       1. Replace authority and maintain key (current).
*       2. Replace authority and do not maintain key.
*       3. Add additional authorities and maintain original key.
*/
var submitReplaceAuthorityTx = (providers, compiledContract, contractAddress) => async (newAuthority) => {
	assertIsContractAddress(contractAddress);
	const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
	assertDefined(contractState, `No contract state found on chain for contract address '${contractAddress}'`);
	const currentAuthority = await providers.privateStateProvider.getSigningKey(contractAddress);
	assertDefined(currentAuthority, `Signing key for contract address '${contractAddress}' not found`);
	const submitTxResult = await submitTx(providers, { unprovenTx: await createUnprovenReplaceAuthorityTx(providers.zkConfigProvider, compiledContract, contractAddress, newAuthority, contractState, currentAuthority, providers.walletProvider.getCoinPublicKey()) });
	if (submitTxResult.status !== "SucceedEntirely") throw new ReplaceMaintenanceAuthorityTxFailedError(submitTxResult);
	await providers.privateStateProvider.setSigningKey(contractAddress, newAuthority);
	return submitTxResult;
};
/**
* Creates a {@link CircuitMaintenanceTxInterface}.
*
* @param providers The providers to use to create and submit transactions.
* @param circuitId The circuit ID the interface is for.
* @param contractAddress The address of the deployed contract for which this
*                        interface is being created.
*/
var createCircuitMaintenanceTxInterface = (providers, circuitId, compiledContract, contractAddress) => {
	assertIsContractAddress(contractAddress);
	return {
		removeVerifierKey() {
			return submitRemoveVerifierKeyTx(providers, compiledContract, contractAddress, circuitId);
		},
		insertVerifierKey(newVk) {
			return submitInsertVerifierKeyTx(providers, compiledContract, contractAddress, circuitId, newVk);
		}
	};
};
/**
* Creates a {@link CircuitMaintenanceTxInterfaces}.
*
* @param providers The providers to use to build transactions.
* @param compiledContract The contract to use to execute circuits.
* @param contractAddress The ledger address of the contract.
*/
var createCircuitMaintenanceTxInterfaces = (providers, compiledContract, contractAddress) => {
	assertIsContractAddress(contractAddress);
	return make(compiledContract).getProvableCircuitIds().reduce((acc, circuitId) => ({
		...acc,
		[circuitId]: createCircuitMaintenanceTxInterface(providers, circuitId, compiledContract, contractAddress)
	}), {});
};
/**
* Creates a {@link ContractMaintenanceTxInterface}.
*
* @param providers The providers to use to build transactions.
* @param contractAddress The ledger address of the contract.
*/
var createContractMaintenanceTxInterface = (providers, compiledContract, contractAddress) => {
	assertIsContractAddress(contractAddress);
	return { replaceAuthority: submitReplaceAuthorityTx(providers, compiledContract, contractAddress) };
};
/** Zero-initialized CoinPublicKey — the well-known shielded burn address from Compact's `shieldedBurnAddress()`. */
var SHIELDED_BURN_COIN_PUBLIC_KEY = "0".repeat(64);
/**
* Encryption key for burn outputs. Coins sent here are unspendable (null coin secret key),
* so the specific key doesn't matter — but it must be a valid Jubjub curve point.
* Derived via SHA-256("midnight:burn-encryption-key:{i}") with i=9 (first valid point).
*/
var BURN_ENCRYPTION_PUBLIC_KEY = "f5b9fa49d3c4f06582dab6ba45c85f6b1927873105b4c8cf363b9b57ca910f65";
/**
* Creates a resolver that maps CoinPublicKey to EncPublicKey for output encryption.
* Handles the wallet's own key, the well-known burn address, and optional additional mappings.
*/
var createEncryptionPublicKeyResolver = (walletCoinPublicKey, walletEncryptionPublicKey, additionalCoinEncPublicKeyMappings) => {
	const networkId = getNetworkId();
	const normalizedWalletCpk = parseCoinPublicKeyToHex(walletCoinPublicKey, networkId);
	const normalizedWalletEpk = parseEncPublicKeyToHex(walletEncryptionPublicKey, networkId);
	const normalizedAdditionalMappings = additionalCoinEncPublicKeyMappings ? new Map(Array.from(additionalCoinEncPublicKeyMappings, ([k, v]) => [parseCoinPublicKeyToHex(k, networkId), parseEncPublicKeyToHex(v, networkId)])) : void 0;
	return (coinPublicKey) => {
		const normalizedCpk = parseCoinPublicKeyToHex(coinPublicKey, networkId);
		if (normalizedCpk === normalizedWalletCpk) return normalizedWalletEpk;
		if (normalizedCpk === SHIELDED_BURN_COIN_PUBLIC_KEY) return BURN_ENCRYPTION_PUBLIC_KEY;
		return normalizedAdditionalMappings?.get(normalizedCpk);
	};
};
var checkKeys = (coinInfo) => Object.keys(coinInfo).forEach((key) => {
	if (key !== "value" && key !== "type" && key !== "nonce") throw new TypeError(`Key '${key}' should not be present in output data ${coinInfo}`);
});
var serializeCoinInfo = (coinInfo) => {
	checkKeys(coinInfo);
	return JSON.stringify({
		...coinInfo,
		value: { __big_int_val__: coinInfo.value.toString() }
	});
};
var serializeQualifiedShieldedCoinInfo = (coinInfo) => {
	const { mt_index: _, ...rest } = coinInfo;
	return serializeCoinInfo(rest);
};
var deserializeCoinInfo = (coinInfo) => {
	const res = JSON.parse(coinInfo, (key, value) => {
		if (key === "value" && value != null && typeof value === "object" && "__big_int_val__" in value && typeof value.__big_int_val__ === "string") return BigInt(value.__big_int_val__);
		return value;
	});
	checkKeys(res);
	return res;
};
var createZswapOutput = ({ coinInfo, recipient }, encryptionPublicKeyResolver, segmentNumber = 0) => {
	if (!recipient.is_left) return ZswapOutput.newContractOwned(coinInfo, segmentNumber, recipient.right);
	const encryptionPublicKey = encryptionPublicKeyResolver(recipient.left);
	if (!encryptionPublicKey) throw new Error(`Unable to resolve encryption public key for recipient ${recipient.left}. Provide a mapping via the encryptionPublicKeyResolver.`);
	return ZswapOutput.new(coinInfo, segmentNumber, recipient.left, encryptionPublicKey);
};
var unprovenOfferFromCoinInfo = ([coinInfo, unproven], f) => {
	const { type, value } = deserializeCoinInfo(coinInfo);
	return f(unproven, type, value);
};
var unprovenOfferFromMap = (map, f) => {
	if (map.size === 0) return;
	return Array.from(map, (entry) => unprovenOfferFromCoinInfo(entry, f)).reduce((acc, curr) => acc.merge(curr));
};
var zswapStateToNewCoins = (receiverCoinPublicKey, zswapState) => zswapState.outputs.filter((output) => output.recipient.left === receiverCoinPublicKey).map(({ coinInfo }) => coinInfo);
/**
* Creates an EncryptionPublicKeyResolver for a ZswapLocalState, validating that the
* state's coin public key matches the wallet's. Handles the burn address and optional
* additional recipient mappings.
*/
var encryptionPublicKeyResolverForZswapState = (zswapState, walletCoinPublicKey, walletEncryptionPublicKey, additionalCoinEncPublicKeyMappings) => {
	const networkId = getNetworkId();
	const walletCpkHex = parseCoinPublicKeyToHex(walletCoinPublicKey, networkId);
	if (parseCoinPublicKeyToHex(zswapState.coinPublicKey, networkId) !== walletCpkHex) throw new Error("Unable to lookup encryption public key (Unsupported coin)");
	return createEncryptionPublicKeyResolver(walletCoinPublicKey, walletEncryptionPublicKey, additionalCoinEncPublicKeyMappings);
};
var GUARANTEED_SEGMENT_NUMBER = 0;
var FALLIBLE_SEGMENT_NUMBER = 1;
var emptyBucket = () => ({
	outputs: /* @__PURE__ */ new Map(),
	inputs: /* @__PURE__ */ new Map(),
	transients: /* @__PURE__ */ new Map()
});
var segmentForMatch = (matches, partitionedTranscript, errorContext) => {
	const [guaranteed, fallible] = partitionedTranscript;
	if (guaranteed !== void 0 && matches(guaranteed)) return GUARANTEED_SEGMENT_NUMBER;
	if (fallible !== void 0 && matches(fallible)) return FALLIBLE_SEGMENT_NUMBER;
	if (guaranteed !== void 0 && fallible !== void 0) throw new Error(`${errorContext} not present in either segment of the partitioned transcript. Local zswap state does not match the contract's declared effects.`);
	return GUARANTEED_SEGMENT_NUMBER;
};
var segmentForCommitment = (commitment, partitionedTranscript) => segmentForMatch((t) => t.effects.claimedShieldedReceives.includes(commitment) || t.effects.claimedShieldedSpends.includes(commitment), partitionedTranscript, `Shielded commitment ${commitment}`);
var segmentForNullifier = (nullifier, partitionedTranscript) => segmentForMatch((t) => t.effects.claimedNullifiers.includes(nullifier), partitionedTranscript, `Shielded nullifier ${nullifier}`);
var mergeOffers = (...offers) => {
	const defined = offers.filter((o) => o != null);
	if (defined.length === 0) return void 0;
	return defined.reduce((acc, curr) => acc.merge(curr));
};
var bucketToOffer = (bucket) => mergeOffers(unprovenOfferFromMap(bucket.inputs, ZswapOffer.fromInput), unprovenOfferFromMap(bucket.outputs, ZswapOffer.fromOutput), unprovenOfferFromMap(bucket.transients, ZswapOffer.fromTransient));
/**
* Builds segment-aware {@link UnprovenOffer}s from a {@link ZswapLocalState}.
*
* Routing matches the ledger's reference implementation
* (`midnight-ledger/ledger/src/construct.rs`):
* - Outputs: commitment ∈ `claimedShieldedReceives ∪ claimedShieldedSpends`.
* - Inputs: nullifier ∈ `claimedNullifiers`.
* - Transients: input and matching output must agree on segment; cross-segment
*   pairing is rejected as a local-state / transcript inconsistency.
*
* When both transcript halves are provided and an item matches neither, this
* function throws. When the transcript (or a half) is `undefined`, unmatched
* items fall back to the guaranteed segment for backwards compatibility —
* see {@link zswapStateToOffer}.
*/
var zswapStateToSegmentedOffer = (zswapLocalState, encryptionPublicKeyOrResolver, addressAndChainStateTuple, partitionedTranscript = [void 0, void 0]) => {
	const resolver = typeof encryptionPublicKeyOrResolver === "function" ? encryptionPublicKeyOrResolver : () => encryptionPublicKeyOrResolver;
	const buckets = {
		[GUARANTEED_SEGMENT_NUMBER]: emptyBucket(),
		[FALLIBLE_SEGMENT_NUMBER]: emptyBucket()
	};
	const rehashedChainState = addressAndChainStateTuple?.zswapChainState.postBlockUpdate(/* @__PURE__ */ new Date());
	for (const output of zswapLocalState.outputs) if (output.recipient.is_left) {
		const segment = segmentForCommitment(coinCommitment(output.coinInfo, output.recipient.left), partitionedTranscript);
		buckets[segment].outputs.set(serializeCoinInfo(output.coinInfo), createZswapOutput(output, resolver, segment));
	} else {
		const contractAddress = output.recipient.right;
		const probe = ZswapOutput.newContractOwned(output.coinInfo, GUARANTEED_SEGMENT_NUMBER, contractAddress);
		const segment = segmentForCommitment(probe.commitment, partitionedTranscript);
		const finalOutput = segment === GUARANTEED_SEGMENT_NUMBER ? probe : ZswapOutput.newContractOwned(output.coinInfo, segment, contractAddress);
		buckets[segment].outputs.set(serializeCoinInfo(output.coinInfo), finalOutput);
	}
	for (const qualifiedCoinInfo of zswapLocalState.inputs) {
		const serializedCoinInfo = serializeQualifiedShieldedCoinInfo(qualifiedCoinInfo);
		const guaranteedCandidate = buckets[GUARANTEED_SEGMENT_NUMBER].outputs.get(serializedCoinInfo);
		const fallibleCandidate = buckets[FALLIBLE_SEGMENT_NUMBER].outputs.get(serializedCoinInfo);
		if (guaranteedCandidate !== void 0 && fallibleCandidate !== void 0) throw new Error(`Ambiguous transient: outputs with serialized coin info ${serializedCoinInfo} exist in both segments — wallet-owned input cannot pair unambiguously.`);
		if (guaranteedCandidate !== void 0 || fallibleCandidate !== void 0) {
			const transientSegment = guaranteedCandidate !== void 0 ? GUARANTEED_SEGMENT_NUMBER : FALLIBLE_SEGMENT_NUMBER;
			const candidateOutput = guaranteedCandidate ?? fallibleCandidate;
			buckets[transientSegment].transients.set(serializedCoinInfo, ZswapTransient.newFromContractOwnedOutput(qualifiedCoinInfo, transientSegment, candidateOutput));
			buckets[transientSegment].outputs.delete(serializedCoinInfo);
			continue;
		}
		assertDefined(addressAndChainStateTuple, `Wallet-owned input requires a chain state for ZswapInput.newContractOwned`);
		assertDefined(rehashedChainState, `Wallet-owned input requires a chain state for ZswapInput.newContractOwned`);
		assertIsContractAddress(addressAndChainStateTuple.contractAddress);
		const probeInput = ZswapInput.newContractOwned(qualifiedCoinInfo, GUARANTEED_SEGMENT_NUMBER, addressAndChainStateTuple.contractAddress, rehashedChainState);
		const segment = segmentForNullifier(probeInput.nullifier, partitionedTranscript);
		buckets[segment].inputs.set(serializedCoinInfo, segment === GUARANTEED_SEGMENT_NUMBER ? probeInput : ZswapInput.newContractOwned(qualifiedCoinInfo, segment, addressAndChainStateTuple.contractAddress, rehashedChainState));
	}
	return {
		guaranteed: bucketToOffer(buckets[GUARANTEED_SEGMENT_NUMBER]),
		fallible: bucketToOffer(buckets[FALLIBLE_SEGMENT_NUMBER])
	};
};
/**
* Builds a single guaranteed-segment {@link UnprovenOffer} from a
* {@link ZswapLocalState} for callers with no partitioned transcript (deploy
* path and pre-segmentation tests). Thin wrapper over
* {@link zswapStateToSegmentedOffer}; contract-call paths must pass a
* transcript to the segmented function directly.
*/
var zswapStateToOffer = (zswapLocalState, encryptionPublicKeyOrResolver, addressAndChainStateTuple) => zswapStateToSegmentedOffer(zswapLocalState, encryptionPublicKeyOrResolver, addressAndChainStateTuple).guaranteed;
var toLedgerContractState = (contractState) => ContractState$1.deserialize(contractState.serialize());
var fromLedgerContractState = (contractState) => ContractState.deserialize(contractState.serialize());
var createUnprovenLedgerDeployTx = (contractState, zswapLocalState, encryptionPublicKey) => {
	const contractDeploy = new ContractDeploy(toLedgerContractState(contractState));
	return [
		contractDeploy.address,
		fromLedgerContractState(contractDeploy.initialState),
		Transaction.fromParts(getNetworkId(), zswapStateToOffer(zswapLocalState, encryptionPublicKey), void 0, Intent.new(ttlOneHour()).addDeploy(contractDeploy))
	];
};
var extractUserAddressedOutputs = (transcript) => {
	if (!transcript) return [];
	const outputs = [];
	for (const [[tokenType, publicAddress], value] of transcript.effects.claimedUnshieldedSpends) if (publicAddress.tag === "user" && tokenType.tag !== "dust") outputs.push({
		value,
		owner: publicAddress.address,
		type: tokenType.raw
	});
	return outputs;
};
var createUnprovenLedgerCallTx = (circuitId, contractAddress, initialContractState, zswapChainState, partitionedTranscript, privateTranscriptOutputs, input, output, nextZswapLocalState, encryptionPublicKey) => {
	const op = toLedgerContractState(initialContractState).operation(circuitId);
	assertDefined(op, `Operation '${circuitId}' is undefined for contract state ${initialContractState.toString(false)}`);
	const intent = Intent.new(ttlOneHour()).addCall(new ContractCallPrototype(contractAddress, circuitId, op, partitionedTranscript[0], partitionedTranscript[1], privateTranscriptOutputs, input, output, communicationCommitmentRandomness(), circuitId));
	const guaranteedOutputs = extractUserAddressedOutputs(partitionedTranscript[0]);
	if (guaranteedOutputs.length > 0) intent.guaranteedUnshieldedOffer = UnshieldedOffer.new([], guaranteedOutputs, []);
	const fallibleOutputs = extractUserAddressedOutputs(partitionedTranscript[1]);
	if (fallibleOutputs.length > 0) intent.fallibleUnshieldedOffer = UnshieldedOffer.new([], fallibleOutputs, []);
	const segmentedOffers = zswapStateToSegmentedOffer(nextZswapLocalState, encryptionPublicKey, {
		contractAddress,
		zswapChainState
	}, partitionedTranscript);
	return Transaction.fromPartsRandomized(getNetworkId(), segmentedOffers.guaranteed, segmentedOffers.fallible, intent);
};
/**
* Calls a contract constructor and creates an unbalanced, unproven, unsubmitted, deploy transaction
* from the constructor results.
*
* @param verifierKeys The verifier keys for the contract being deployed.
* @param coinPublicKey The Zswap coin public key of the current user.
* @param options Configuration.
* @param encryptionPublicKey
* @returns Data produced by the contract constructor call and an unproven deployment transaction
*          assembled from the contract constructor result.
*
* @remarks
* The returned {@link UnsubmittedDeployTxData} is privacy-sensitive and
* carries the unproven transaction, signing key, initial private state, and
* initial Zswap state. See that type for handling guidance before logging,
* serializing, or transmitting the result.
*/
async function createUnprovenDeployTxFromVerifierKeys(zkConfigProvider, coinPublicKey, options, encryptionPublicKey) {
	const contractExec = make(options.compiledContract);
	const contractRuntime = makeContractExecutableRuntime(zkConfigProvider, {
		coinPublicKey,
		signingKey: options.signingKey
	});
	const initialPrivateState = "initialPrivateState" in options ? options.initialPrivateState : void 0;
	const args = "args" in options ? options.args : [];
	const exitResult = await contractRuntime.runPromiseExit(contractExec.initialize(initialPrivateState, ...args));
	try {
		const { public: { contractState }, private: { privateState, signingKey, zswapLocalState } } = exitResultOrError(exitResult);
		const [contractAddress, initialContractState, unprovenTx] = createUnprovenLedgerDeployTx(contractState, zswapLocalState, createEncryptionPublicKeyResolver(coinPublicKey, encryptionPublicKey, options.additionalCoinEncPublicKeyMappings));
		return {
			public: {
				contractAddress,
				initialContractState
			},
			private: {
				signingKey,
				initialPrivateState: privateState,
				initialZswapState: zswapLocalState,
				unprovenTx,
				newCoins: zswapStateToNewCoins(coinPublicKey, zswapLocalState)
			}
		};
	} catch (error) {
		if (!isEffectContractError(error)) throw error;
		if (error._tag !== "ContractRuntimeError" && error._tag !== "ContractConfigurationError") throw error;
		if (error.cause.name !== "CompactError") throw error;
		throw new Error(error.cause.message, { cause: error });
	}
}
/**
* Calls a contract constructor and creates an unbalanced, unproven, unsubmitted, deploy transaction
* from the constructor results.
*
* @param providers The providers to use to create the deploy transaction.
* @param options Configuration.
*
* @returns A promise that contains all data produced by the constructor call and an unproven
*          transaction assembled from the constructor result.
*
* @remarks
* The returned {@link UnsubmittedDeployTxData} is privacy-sensitive and
* carries the unproven transaction, signing key, initial private state, and
* initial Zswap state. See that type for handling guidance before logging,
* serializing, or transmitting the result.
*/
async function createUnprovenDeployTx(providers, options) {
	return createUnprovenDeployTxFromVerifierKeys(providers.zkConfigProvider, parseCoinPublicKeyToHex(providers.walletProvider.getCoinPublicKey(), getNetworkId()), options, providers.walletProvider.getEncryptionPublicKey());
}
/**
* Creates and submits a deploy transaction for the given contract.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Failure Behavior
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `DeployTxFailedError` is thrown with transaction data
* - Private state (if `privateStateId` provided) is NOT stored
* - Contract signing key is NOT stored in private state provider
* - Contract is NOT deployed
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `DeployTxFailedError` is thrown with transaction data
* - Private state (if `privateStateId` provided) is NOT stored
* - Contract signing key is NOT stored in private state provider
* - Transaction appears in blockchain history as partial success
* - Contract may be partially deployed but not functional
*
* @param providers The providers used to manage the deploy lifecycle.
* @param options Configuration.
*
* @returns A `Promise` that resolves with the finalized deployment transaction data;
*          or rejects with an error if the deployment fails.
*
* @throws {DeployTxFailedError} When transaction fails in either guaranteed or fallible phase.
*         The error contains the finalized transaction data for debugging.
*
* @remarks
* The returned {@link FinalizedDeployTxData} is privacy-sensitive and carries
* the unproven transaction, signing key, and initial private state. See that
* type for handling guidance before logging, serializing, or transmitting the
* result.
*/
async function submitDeployTx(providers, options) {
	const unprovenDeployTxData = await createUnprovenDeployTx(providers, options);
	const finalizedTxData = await submitTx(providers, { unprovenTx: unprovenDeployTxData.private.unprovenTx });
	if (finalizedTxData.status !== "SucceedEntirely") throw new DeployTxFailedError(finalizedTxData);
	providers.privateStateProvider.setContractAddress(unprovenDeployTxData.public.contractAddress);
	if ("privateStateId" in options) await providers.privateStateProvider.set(options.privateStateId, unprovenDeployTxData.private.initialPrivateState);
	await providers.privateStateProvider.setSigningKey(unprovenDeployTxData.public.contractAddress, unprovenDeployTxData.private.signingKey);
	return {
		private: unprovenDeployTxData.private,
		public: {
			...finalizedTxData,
			...unprovenDeployTxData.public
		}
	};
}
/** @internal */
var TypeId = Symbol.for("@midnight-ntwrk/midnight-js#Transaction");
/** @internal */
var Submit = Symbol.for("@midnight-ntwrk/midnight-js#Transaction/Submit");
/** @internal */
var MergeUnsubmittedCallTxData = Symbol.for("@midnight-ntwrk/midnight-js#Transaction/MergeUnsubmittedCallTxData");
/** @internal */
var CacheStates = Symbol.for("@midnight-ntwrk/midnight-js#Transaction/CacheStates");
/** @internal */
var GetCurrentStatesForIdentity = Symbol.for("@midnight-ntwrk/midnight-js#Transaction/GetCurrentStatesForIdentity");
var mergeSubmitTxOptions = (current, next) => {
	if (!current) return next;
	const circuitIds = /* @__PURE__ */ new Set([...Array.isArray(current.circuitId) ? current.circuitId : [current.circuitId], ...Array.isArray(next.circuitId) ? next.circuitId : [next.circuitId]]);
	return {
		unprovenTx: current.unprovenTx.merge(next.unprovenTx),
		circuitId: Array.from(circuitIds)
	};
};
/** @internal */
var TransactionContextImpl = class {
	[TypeId] = TypeId;
	providers;
	options;
	cachedStates = void 0;
	currentUnsubmittedCall;
	submitTxOptions = void 0;
	constructor(providers, options) {
		this.providers = providers;
		this.options = options;
	}
	getAdditionalMappings() {
		return this.options?.additionalCoinEncPublicKeyMappings;
	}
	/**
	* @deprecated This method bypasses identity validation and may return states from a different
	* contract or private state ID than expected. Use {@link GetCurrentStatesForIdentity} instead
	* for validated access to cached states within scoped transactions.
	*/
	getCurrentStates() {
		return this.cachedStates?.states;
	}
	[GetCurrentStatesForIdentity](identity) {
		if (!this.cachedStates) return;
		const cached = this.cachedStates.identity;
		if (cached.contractAddress !== identity.contractAddress || cached.privateStateId !== identity.privateStateId) throw new ScopedTransactionIdentityMismatchError({
			contractAddress: cached.contractAddress,
			privateStateId: cached.privateStateId
		}, {
			contractAddress: identity.contractAddress,
			privateStateId: identity.privateStateId
		});
		return this.cachedStates.states;
	}
	getLastUnsubmittedCallTxDataToTransact() {
		return this.currentUnsubmittedCall;
	}
	async [Submit]() {
		const [unprovenCallTxData, privateStateId] = this.getLastUnsubmittedCallTxDataToTransact() ?? [];
		if (!unprovenCallTxData) throw new Error("No calls were submitted.");
		const finalizedTxData = await submitTx(this.providers, this.submitTxOptions);
		if (finalizedTxData.status !== "SucceedEntirely") throw new CallTxFailedError(finalizedTxData, this.submitTxOptions.circuitId);
		if (privateStateId) await this.providers.privateStateProvider.set(privateStateId, unprovenCallTxData.private.nextPrivateState);
		return {
			private: unprovenCallTxData.private,
			public: {
				...unprovenCallTxData.public,
				...finalizedTxData
			}
		};
	}
	[CacheStates](states, identity) {
		this.cachedStates = {
			states,
			identity
		};
	}
	[MergeUnsubmittedCallTxData](circuitId, callData, privateStateId) {
		this.currentUnsubmittedCall = [callData, privateStateId];
		this.submitTxOptions = mergeSubmitTxOptions(this.submitTxOptions, {
			unprovenTx: callData.private.unprovenTx,
			circuitId
		});
		if (!this.cachedStates) return;
		const privateState = callData.private.nextPrivateState;
		const contractState = this.cachedStates.states.contractState;
		const zswapChainState = this.cachedStates.states.zswapChainState;
		const ledgerParameters = this.cachedStates.states.ledgerParameters;
		contractState.data = new onchain_runtime_exports.ChargedState(callData.public.nextContractState);
		this[CacheStates]({
			contractState,
			zswapChainState,
			ledgerParameters,
			privateState
		}, this.cachedStates.identity);
	}
};
/** @internal */
var mergeUnsubmittedCallTxData = (txCtx, circuitId, callData, privateStateId) => {
	txCtx[MergeUnsubmittedCallTxData](circuitId, callData, privateStateId);
};
/** @internal */
var isTransactionContext$1 = (u) => typeof u === "object" && u != null && TypeId in u;
/** @internal */
var scoped = async (providers, fn, txCtxOrOptions, options) => {
	const outerTxCtx = isTransactionContext$1(txCtxOrOptions) ? txCtxOrOptions : void 0;
	const txOptions = isTransactionContext$1(txCtxOrOptions) ? options : txCtxOrOptions;
	const innerTxCtx = outerTxCtx ?? new TransactionContextImpl(providers, txOptions);
	try {
		await fn(innerTxCtx);
	} catch (err) {
		if (outerTxCtx) throw err;
		const execErr = new Error(`Unexpected error executing scoped transaction '${txOptions?.scopeName ?? "<unnamed>"}': ${String(err)}`, { cause: err });
		providers?.loggerProvider?.error?.call(providers.loggerProvider, execErr.message);
		throw execErr;
	}
	try {
		if (!outerTxCtx) return await innerTxCtx[Submit]();
		const [unprovenCallTxData] = innerTxCtx.getLastUnsubmittedCallTxDataToTransact() ?? [];
		if (!unprovenCallTxData) throw new Error("No calls were submitted.");
		return {
			public: {
				nextContractState: unprovenCallTxData.public.nextContractState,
				partitionedTranscript: unprovenCallTxData.public.partitionedTranscript,
				publicTranscript: unprovenCallTxData.public.publicTranscript
			},
			private: {
				input: unprovenCallTxData.private.input,
				output: unprovenCallTxData.private.output,
				privateTranscriptOutputs: unprovenCallTxData.private.privateTranscriptOutputs,
				result: unprovenCallTxData.private.result,
				nextPrivateState: unprovenCallTxData.private.nextPrivateState,
				nextZswapLocalState: unprovenCallTxData.private.nextZswapLocalState
			}
		};
	} catch (err) {
		if (err instanceof CallTxFailedError || outerTxCtx) throw err;
		const submitErr = new Error(`Unexpected error submitting scoped transaction '${txOptions?.scopeName ?? "<unnamed>"}': ${String(err)}`, { cause: err });
		providers?.loggerProvider?.error?.call(providers.loggerProvider, submitErr.message);
		throw submitErr;
	}
};
/**
* Fetches only the public visible (Zswap and ledger) states of a contract.
*
* @param publicDataProvider The provider to use to fetch the public states (Zswap and ledger)
*                           from the blockchain.
* @param contractAddress The ledger address of the contract.
*/
var getPublicStates = async (publicDataProvider, contractAddress) => {
	assertIsContractAddress(contractAddress);
	const zswapAndContractState = await publicDataProvider.queryZSwapAndContractState(contractAddress);
	assertDefined(zswapAndContractState, `No public state found at contract address '${contractAddress}'`);
	const [zswapChainState, contractState, ledgerParameters] = zswapAndContractState;
	return {
		contractState,
		zswapChainState,
		ledgerParameters
	};
};
/**
* Retrieves the Zswap, ledger, and private states of the contract corresponding
* to the given identifier using the given providers.
*
* @param publicDataProvider The provider to use to fetch the public states (Zswap and ledger)
*                           from the blockchain.
* @param privateStateProvider The provider to use to fetch the private state.
* @param contractAddress The ledger address of the contract.
* @param privateStateId The identifier for the private state of the contract.
*/
var getStates = async (publicDataProvider, privateStateProvider, contractAddress, privateStateId) => {
	const publicContractStates = await getPublicStates(publicDataProvider, contractAddress);
	const privateState = await privateStateProvider.get(privateStateId);
	assertDefined(privateState, `No private state found at private state ID '${privateStateId}'`);
	return {
		...publicContractStates,
		privateState
	};
};
/**
* Calls a circuit using the provided initial `states` and creates an unbalanced,
* unproven, unsubmitted, call transaction.
*
* @param zkConfigProvider
* @param options Configuration.
*
* @param walletEncryptionPublicKey
* @returns Data produced by the circuit call and an unproven transaction assembled from the call result.
*
* @remarks
* The returned {@link UnsubmittedCallTxData} is privacy-sensitive and carries
* the unproven transaction, ZK inputs/outputs, and next private state. See
* that type for handling guidance before logging, serializing, or
* transmitting the result.
*/
async function createUnprovenCallTxFromInitialStates(zkConfigProvider, options, walletEncryptionPublicKey) {
	const { compiledContract, contractAddress, coinPublicKey, initialContractState, initialZswapChainState, ledgerParameters } = options;
	assertIsContractAddress(contractAddress);
	assertDefined(make(options.compiledContract).getProvableCircuitIds().find((circuitId) => circuitId === options.circuitId), `Circuit '${options.circuitId}' is undefined`);
	const contractExec = make(compiledContract);
	const contractRuntime = makeContractExecutableRuntime(zkConfigProvider, { coinPublicKey: options.coinPublicKey });
	const initialPrivateState = "initialPrivateState" in options ? options.initialPrivateState : void 0;
	const args = "args" in options ? options.args : [];
	const exitResult = await contractRuntime.runPromiseExit(contractExec.circuit(ProvableCircuitId(options.circuitId), {
		address: ContractAddress(contractAddress),
		contractState: initialContractState,
		privateState: initialPrivateState,
		ledgerParameters
	}, ...args));
	try {
		const { public: { contractState, partitionedTranscript, publicTranscript }, private: { input, output, privateState, privateTranscriptOutputs, result, zswapLocalState } } = exitResultOrError(exitResult);
		return {
			public: {
				nextContractState: contractState,
				partitionedTranscript,
				publicTranscript
			},
			private: {
				input,
				output,
				result,
				nextPrivateState: privateState,
				nextZswapLocalState: zswapLocalState,
				privateTranscriptOutputs,
				unprovenTx: createUnprovenLedgerCallTx(options.circuitId, contractAddress, initialContractState, initialZswapChainState, partitionedTranscript, privateTranscriptOutputs, input, output, zswapLocalState, encryptionPublicKeyResolverForZswapState(zswapLocalState, options.coinPublicKey, walletEncryptionPublicKey, options.additionalCoinEncPublicKeyMappings)),
				newCoins: zswapStateToNewCoins(parseCoinPublicKeyToHex(coinPublicKey, getNetworkId()), zswapLocalState)
			}
		};
	} catch (error) {
		if (!isEffectContractError(error) || error._tag !== "ContractRuntimeError") throw error;
		if (error.cause.name !== "CompactError") throw error;
		throw new Error(error.cause.message, { cause: error });
	}
}
var createCallOptions = (callTxOptions, coinPublicKey, ledgerParameters, initialContractState, initialZswapChainState, initialPrivateState) => {
	const callOptionsBase = {
		additionalCoinEncPublicKeyMappings: callTxOptions.additionalCoinEncPublicKeyMappings,
		compiledContract: callTxOptions.compiledContract,
		contractAddress: callTxOptions.contractAddress,
		circuitId: callTxOptions.circuitId
	};
	const callOptionsBaseWithProviderDataDependencies = {
		..."args" in callTxOptions ? {
			...callOptionsBase,
			args: callTxOptions.args
		} : callOptionsBase,
		coinPublicKey: parseCoinPublicKeyToHex(coinPublicKey, getNetworkId()),
		initialContractState,
		initialZswapChainState,
		ledgerParameters
	};
	return initialPrivateState ? {
		...callOptionsBaseWithProviderDataDependencies,
		initialPrivateState
	} : callOptionsBaseWithProviderDataDependencies;
};
var getContractStates = async (providers, options, transactionContext) => {
	const identity = {
		contractAddress: options.contractAddress,
		privateStateId: options.privateStateId
	};
	const txCtxStates = transactionContext?.[GetCurrentStatesForIdentity](identity);
	if (txCtxStates) return txCtxStates;
	const states = await getStates(providers.publicDataProvider, providers.privateStateProvider, options.contractAddress, options.privateStateId);
	if (transactionContext) transactionContext[CacheStates](states, identity);
	return states;
};
var getContractPublicStates = async (providers, options, transactionContext) => {
	const identity = { contractAddress: options.contractAddress };
	const txCtxStates = transactionContext?.[GetCurrentStatesForIdentity](identity);
	if (txCtxStates) return txCtxStates;
	const states = await getPublicStates(providers.publicDataProvider, options.contractAddress);
	if (transactionContext) transactionContext[CacheStates]({
		...states,
		privateState: void 0
	}, identity);
	return states;
};
/**
* Calls a circuit using states fetched from the public data provider and private state
* provider, then creates an unbalanced, unproven, unsubmitted, call transaction.
*
* @param providers The providers to use to create the call transaction.
* @param options Configuration.
* @param transactionContext Optional scoped transaction context to participate in an
*        existing transaction scope.
*
* @returns A promise that contains all data produced by the circuit call and an unproven
*          transaction assembled from the call result.
*
* @throws IncompleteCallTxPrivateStateConfig If a `privateStateId` was given but a `privateStateProvider`
*                                           was not. We assume that when a user gives a `privateStateId`,
*                                           they want to update the private state store.
*
* @remarks
* The returned {@link UnsubmittedCallTxData} is privacy-sensitive and carries
* the unproven transaction, ZK inputs/outputs, and next private state. See
* that type for handling guidance before logging, serializing, or
* transmitting the result.
*/
async function createUnprovenCallTx(providers, options, transactionContext) {
	assertIsContractAddress(options.contractAddress);
	assertDefined(make(options.compiledContract).getProvableCircuitIds().find((a) => a === options.circuitId), `Circuit '${options.circuitId}' is undefined`);
	const hasPrivateStateProvider = "privateStateProvider" in providers;
	const hasPrivateStateId = "privateStateId" in options;
	if (hasPrivateStateId && !hasPrivateStateProvider) throw new IncompleteCallTxPrivateStateConfig();
	if (hasPrivateStateId && hasPrivateStateProvider) {
		const { zswapChainState, contractState, privateState, ledgerParameters } = await getContractStates(providers, options, transactionContext);
		return createUnprovenCallTxFromInitialStates(providers.zkConfigProvider, createCallOptions(options, parseCoinPublicKeyToHex(providers.walletProvider.getCoinPublicKey(), getNetworkId()), ledgerParameters, contractState, zswapChainState, privateState), providers.walletProvider.getEncryptionPublicKey());
	}
	const { zswapChainState, contractState, ledgerParameters } = await getContractPublicStates(providers, options, transactionContext);
	return createUnprovenCallTxFromInitialStates(providers.zkConfigProvider, createCallOptions(options, parseCoinPublicKeyToHex(providers.walletProvider.getCoinPublicKey(), getNetworkId()), ledgerParameters, contractState, zswapChainState), providers.walletProvider.getEncryptionPublicKey());
}
/**
* Creates and submits a transaction for the invocation of a circuit on a given contract.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Failure Behavior
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `CallTxFailedError` is thrown with transaction data and circuit ID
* - Private state updates are NOT stored (state remains unchanged)
* - No on-chain record of the failed transaction
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `CallTxFailedError` is thrown with transaction data and circuit ID
* - Private state updates are NOT stored (state remains unchanged)
* - Transaction appears in blockchain history as partial success
*
* @param providers The providers used to manage the invocation lifecycle.
* @param options Configuration.
* @param transactionContext Optional scoped transaction context to participate in an
*        existing transaction scope.
*
* @returns A `Promise` that resolves with the finalized transaction data for the invocation of
*         `circuitId` on `contract` with the given `args`; or rejects with an error if the invocation fails.
*
* @throws {CallTxFailedError} When transaction fails in either guaranteed or fallible phase.
*         The error contains the finalized transaction data and circuit ID for debugging.
*
* @remarks
* The returned {@link FinalizedCallTxData} (and the {@link CallResult} variant)
* is privacy-sensitive and carries the unproven transaction and private
* state. See those types for handling guidance before logging, serializing,
* or transmitting the result.
*/
async function submitCallTx(providers, options, transactionContext) {
	assertIsContractAddress(options.contractAddress);
	assertDefined(make(options.compiledContract).getProvableCircuitIds().find((circuitId) => circuitId === options.circuitId), `Circuit '${options.circuitId}' is undefined`);
	const hasPrivateStateProvider = "privateStateProvider" in providers;
	const hasPrivateStateId = "privateStateId" in options;
	if (hasPrivateStateId && !hasPrivateStateProvider) throw new IncompleteCallTxPrivateStateConfig();
	if (hasPrivateStateProvider) providers.privateStateProvider.setContractAddress(options.contractAddress);
	const callTxFn = async (txCtx) => {
		mergeUnsubmittedCallTxData(txCtx, options.circuitId, await createUnprovenCallTx(providers, options, txCtx), hasPrivateStateId ? options.privateStateId : void 0);
	};
	return transactionContext ? scoped(providers, callTxFn, transactionContext) : scoped(providers, callTxFn);
}
/**
* Creates and submits a transaction for the invocation of a circuit on a given contract,
* returning immediately after submission without waiting for finalization.
*
* Unlike {@link submitCallTx}, this function does not wait for transaction finalization,
* check transaction status, or update private state. The caller must handle these steps manually.
*
* ## Transaction Execution Phases
*
* Midnight transactions execute in two phases:
* 1. **Guaranteed phase**: If failure occurs, the transaction is NOT included in the blockchain
* 2. **Fallible phase**: If failure occurs, the transaction IS recorded on-chain as a partial success
*
* ## Manual Post-Submission Steps
*
* After calling this function, you must manually:
* 1. Watch for transaction finalization using `providers.publicDataProvider.watchForTxData(txId)`
* 2. Check transaction status (compare against `SucceedEntirely`)
* 3. Handle failures appropriately (throw errors, log, etc.)
* 4. Update private state if transaction succeeded and `privateStateId` was provided
*
* ## Failure Behavior (Manual Handling Required)
*
* **Guaranteed Phase Failure:**
* - Transaction is rejected and not included in the blockchain
* - `watchForTxData` may reject or return error status
* - You must NOT store private state updates
*
* **Fallible Phase Failure:**
* - Transaction is recorded on-chain with non-`SucceedEntirely` status
* - `watchForTxData` returns transaction data with failed status
* - You must NOT store private state updates
* - Transaction appears in blockchain history as partial success
*
* @param providers The providers used to manage the invocation lifecycle.
* @param options Configuration.
*
* @returns A `Promise` that resolves with the transaction ID and call transaction data immediately after submission;
*         or rejects with an error if the submission fails.
*
* @remarks
* The returned {@link SubmittedCallTx} is privacy-sensitive and carries the
* unproven transaction and private state via `callTxData`. See that type for
* handling guidance before logging, serializing, or transmitting the result.
*
* @example
* ```typescript
* // 1. Submit
* const { txId, callTxData } = await submitCallTxAsync(providers, options);
*
* // 2. Watch (when ready)
* const finalizedData = await providers.publicDataProvider.watchForTxData(txId);
*
* // 3. Check status
* if (finalizedData.status !== SucceedEntirely) {
*   throw new CallTxFailedError(finalizedData, options.circuitId);
* }
*
* // 4. Update private state manually if needed
* if (options.privateStateId) {
*   await providers.privateStateProvider.set(
*     privateStateId,
*     callTxData.private.nextPrivateState
*   );
* }
* ```
*/
async function submitCallTxAsync(providers, options) {
	assertIsContractAddress(options.contractAddress);
	assertDefined(make(options.compiledContract).getProvableCircuitIds().find((circuitId) => circuitId === options.circuitId), `Circuit '${options.circuitId}' is undefined`);
	const hasPrivateStateProvider = "privateStateProvider" in providers;
	if ("privateStateId" in options && !hasPrivateStateProvider) throw new IncompleteCallTxPrivateStateConfig();
	if (hasPrivateStateProvider) providers.privateStateProvider.setContractAddress(options.contractAddress);
	const unprovenCallTxData = await createUnprovenCallTx(providers, options);
	return {
		txId: await submitTxAsync(providers, {
			unprovenTx: unprovenCallTxData.private.unprovenTx,
			circuitId: options.circuitId
		}),
		callTxData: unprovenCallTxData
	};
}
/**
* Type guard to determine if a value is a TransactionContext.
*
* @param u The value to check.
* @returns `true` if `u` is a {@link TransactionContext}, otherwise `false`.
*/
var isTransactionContext = isTransactionContext$1;
/**
* Executes a function within the context of a contract-scoped transaction.
*
* @param providers The contract providers to use within the transaction.
* @param fn The function to execute within the transaction context.
* @param options Optional transaction scope options.
* @returns A `Promise` that resolves with the finalized transaction data of the single transaction
* created for all circuit calls made within `fn`.
*
* @remarks
* Where `fn` make circuit calls, these are batched together and submitted as a single transaction when
* the function completes successfully. If `fn` throws an error, any unsubmitted circuit calls are discarded.
*/
var withContractScopedTransaction = async (providers, fn, options) => scoped(providers, fn, options);
/**
* Creates a {@link CallTxOptions} object from various data.
*/
var createCallTxOptions = (compiledContract, circuitId, contractAddress, privateStateId, additionalCoinEncPublicKeyMappings, args) => {
	const callOptionsBase = {
		additionalCoinEncPublicKeyMappings,
		compiledContract,
		circuitId,
		contractAddress
	};
	const callTxOptionsBase = args.length !== 0 ? {
		...callOptionsBase,
		args
	} : callOptionsBase;
	return privateStateId ? {
		...callTxOptionsBase,
		privateStateId
	} : callTxOptionsBase;
};
/**
* Creates a circuit call transaction interface for a contract.
*
* @param providers The providers to use to build transactions.
* @param compiledContract The contract to use to execute circuits.
* @param contractAddress The ledger address of the contract.
* @param privateStateId The identifier of the state of the witnesses of the contract.
*/
var createCircuitCallTxInterface = (providers, compiledContract, contractAddress, privateStateId) => {
	assertIsContractAddress(contractAddress);
	providers.privateStateProvider.setContractAddress(contractAddress);
	return make(compiledContract).getProvableCircuitIds().reduce((acc, circuitId) => ({
		...acc,
		[circuitId]: (...args) => {
			const txCtx = args.length > 0 && isTransactionContext(args[0]) ? args[0] : void 0;
			const callArgs = txCtx ? args.slice(1) : args;
			const callOptions = createCallTxOptions(compiledContract, circuitId, contractAddress, privateStateId, txCtx?.getAdditionalMappings(), callArgs);
			return txCtx ? submitCallTx(providers, callOptions, txCtx) : submitCallTx(providers, callOptions);
		}
	}), {});
};
var createDeployTxOptions = (deployContractOptions) => {
	const deployTxOptionsBase = {
		...deployContractOptions,
		signingKey: deployContractOptions.signingKey ?? sampleSigningKey()
	};
	return "privateStateId" in deployContractOptions ? {
		...deployTxOptionsBase,
		privateStateId: deployContractOptions.privateStateId,
		initialPrivateState: deployContractOptions.initialPrivateState
	} : deployTxOptionsBase;
};
/**
* Creates and submits a contract deployment transaction. This function is the entry point for the transaction
* construction workflow and is used to create a {@link DeployedContract} instance.
*
* @param providers The providers used to manage the transaction lifecycle.
* @param options Configuration.
*
* @throws DeployTxFailedError If the transaction is submitted successfully but produces an error
*                             when executed by the node.
*/
async function deployContract(providers, options) {
	const deployTxData = await submitDeployTx(providers, createDeployTxOptions(options));
	return {
		deployTxData,
		callTx: createCircuitCallTxInterface(providers, options.compiledContract, deployTxData.public.contractAddress, "privateStateId" in options ? options.privateStateId : void 0),
		circuitMaintenanceTx: createCircuitMaintenanceTxInterfaces(providers, options.compiledContract, deployTxData.public.contractAddress),
		contractMaintenanceTx: createContractMaintenanceTxInterface(providers, options.compiledContract, deployTxData.public.contractAddress)
	};
}
var setOrGetInitialSigningKey = async (privateStateProvider, options) => {
	if (options.signingKey) {
		await privateStateProvider.setSigningKey(options.contractAddress, options.signingKey);
		return options.signingKey;
	}
	const existingSigningKey = await privateStateProvider.getSigningKey(options.contractAddress);
	if (existingSigningKey) return existingSigningKey;
	const freshSigningKey = sampleSigningKey();
	await privateStateProvider.setSigningKey(options.contractAddress, freshSigningKey);
	return freshSigningKey;
};
var setOrGetInitialPrivateState = async (privateStateProvider, options) => {
	/**
	* If both 'privateStateId' and 'initialPrivateState' are defined,
	* then 'initialPrivateState' is stored in private state provider at 'privateStateId'.
	*
	* If 'privateStateId' is defined and 'initialPrivateState' is undefined,
	* and the private state provider has an entry at 'privateStateId',
	* then the find reports the stored private state as the initialPrivateState.
	*
	* If 'privateStateId' is defined and 'initialPrivateState' is undefined,
	* and the private state provider does not have an entry at 'privateStateId',
	* then an error is returned.
	*
	* If 'privateStateId' is undefined and 'initialPrivateState' is defined,
	* then an error is returned.
	*
	* If 'privateStateId' is undefined and 'initialPrivateState' is undefined,
	* then no private state is stored.
	*/
	const hasPrivateStateId = "privateStateId" in options;
	const hasInitialPrivateState = "initialPrivateState" in options;
	if (hasPrivateStateId) {
		if (hasInitialPrivateState) {
			await privateStateProvider.set(options.privateStateId, options.initialPrivateState);
			return options.initialPrivateState;
		}
		const currentPrivateState = await privateStateProvider.get(options.privateStateId);
		assertDefined(currentPrivateState, `No private state found at private state ID '${options.privateStateId}'`);
		return currentPrivateState;
	}
	if (hasInitialPrivateState) throw new IncompleteFindContractPrivateStateConfig();
};
/**
* Checks that two verifier keys are equal. Does initial length check match for efficiency.
*
* @param a First verifier key.
* @param b Second verifier key.
*/
var verifierKeysEqual = (a, b) => a.length === b.length && toHex(a) === toHex(b);
/**
* Checks that the given `contractState` contains the given `verifierKeys`.
*
* @param verifierKeys The verifier keys the client has for the deployed contract we're checking.
* @param contractState The (typically already deployed) contract state containing verifier keys.
*
* @throws ContractTypeError When one or more of the local and deployed verifier keys do not match.
*/
var verifyContractState = (verifierKeys, contractState) => {
	const mismatchedCircuitIds = verifierKeys.reduce((acc, [circuitId, localVk]) => !contractState.operation(circuitId) || !verifierKeysEqual(localVk, contractState.operation(circuitId).verifierKey) ? [...acc, circuitId] : acc, []);
	if (mismatchedCircuitIds.length > 0) throw new ContractTypeError(contractState, mismatchedCircuitIds);
};
/**
* Creates an instance of {@link FoundContract} given the address of a deployed contract and an
* optional private state ID at which an existing private state is stored. When given, the current value
* at the private state ID is used as the `initialPrivateState` value in the `finalizedDeployTxData`
* property of the returned `FoundContract`.
*
* @param providers The providers used to manage transaction lifecycles.
* @param options Configuration.
*
* @throws Error Improper `privateStateId` and `initialPrivateState` configuration.
* @throws Error No contract state could be found at `contractAddress`.
* @throws TypeError Thrown if `contractAddress` is not correctly formatted as a contract address.
* @throws ContractTypeError One or more circuits defined on `contract` are undefined on the contract
*                           state found at `contractAddress`, or have mis-matched verifier keys.
* @throws IncompleteFindContractPrivateStateConfig If an `initialPrivateState` is given but no
*                                                  `privateStateId` is given to store it under.
*/
async function findDeployedContract(providers, options) {
	const { compiledContract, contractAddress } = options;
	assertIsContractAddress(contractAddress);
	providers.privateStateProvider.setContractAddress(contractAddress);
	const finalizedTxData = await providers.publicDataProvider.watchForDeployTxData(contractAddress);
	const initialContractState = await providers.publicDataProvider.queryDeployContractState(contractAddress);
	assertDefined(initialContractState, `No contract deployed at contract address '${contractAddress}'`);
	const currentContractState = await providers.publicDataProvider.queryContractState(contractAddress);
	assertDefined(currentContractState, `No contract deployed at contract address '${contractAddress}'`);
	verifyContractState(await providers.zkConfigProvider.getVerifierKeys(make(compiledContract).getProvableCircuitIds()), currentContractState);
	return {
		deployTxData: {
			private: {
				signingKey: await setOrGetInitialSigningKey(providers.privateStateProvider, options),
				initialPrivateState: await setOrGetInitialPrivateState(providers.privateStateProvider, options)
			},
			public: {
				...finalizedTxData,
				contractAddress,
				initialContractState
			}
		},
		callTx: createCircuitCallTxInterface(providers, compiledContract, contractAddress, "privateStateId" in options ? options.privateStateId : void 0),
		circuitMaintenanceTx: createCircuitMaintenanceTxInterfaces(providers, compiledContract, contractAddress),
		contractMaintenanceTx: createContractMaintenanceTxInterface(providers, compiledContract, contractAddress)
	};
}
/**
* Fetches the unshielded balances associated with a specific contract address.
*
* @param publicDataProvider The provider to use to fetch the unshielded balances from the blockchain.
* @param contractAddress The ledger address of the contract.
*/
var getUnshieldedBalances = async (publicDataProvider, contractAddress) => {
	assertIsContractAddress(contractAddress);
	const unshieldedBalances = await publicDataProvider.queryUnshieldedBalances(contractAddress);
	assertDefined(unshieldedBalances, `No unshielded balances found at contract address '${contractAddress}'`);
	return unshieldedBalances;
};
//#endregion
export { CallTxFailedError, ContractTypeError, DeployTxFailedError, IncompleteCallTxPrivateStateConfig, IncompleteFindContractPrivateStateConfig, InsertVerifierKeyTxFailedError, RemoveVerifierKeyTxFailedError, ReplaceMaintenanceAuthorityTxFailedError, TxFailedError, createCallTxOptions, createCircuitCallTxInterface, createCircuitMaintenanceTxInterface, createCircuitMaintenanceTxInterfaces, createContractMaintenanceTxInterface, createUnprovenCallTx, createUnprovenCallTxFromInitialStates, createUnprovenDeployTx, createUnprovenDeployTxFromVerifierKeys, deployContract, findDeployedContract, getPublicStates, getStates, getUnshieldedBalances, submitCallTx, submitCallTxAsync, submitDeployTx, submitInsertVerifierKeyTx, submitRemoveVerifierKeyTx, submitReplaceAuthorityTx, submitTx, submitTxAsync, verifierKeysEqual, verifyContractState, withContractScopedTransaction };
