import { n as __exportAll } from "./rolldown-runtime-CoDluQUr.js";
import { $ as createConstructorContext, V as sampleSigningKey, W as signatureVerifyingKey, X as createCircuitContext, it as emptyZswapLocalState, n as ContractMaintenanceAuthority, ot as encodeZswapLocalState, rn as CompactError, rt as decodeZswapLocalState } from "./dist-lrxkyrfs.js";
import { C as mapError, E as sync, O as try_, T as runSync, _ as andThen, _t as right, a as asHex, bt as identity, d as getProvableCircuitIds, dt as isNone, ft as match, g as all, gt as left, ht as isLeft, i as SigningKey, mt as getOrThrow, n as Keys, s as TypeIdError, t as ZKConfiguration, ut as getOrThrow$1, v as cached, vt as pipeArguments, w as provide$1, x as gen, y as flatMap, yt as dual } from "./ZKConfiguration-D8OU2fUI.js";
import { F as MaintenanceUpdate, H as PreTranscript, K as ReplaceAuthority, N as LedgerParameters, W as QueryContext, Z as StateValue, Zi as partitionTranscripts, ct as VerifierKeyRemove, d as ContractOperationVersion, f as ContractOperationVersionedVerifierKey, l as ContractMaintenanceAuthority$1, ma as signData, r as ChargedState, st as VerifierKeyInsert } from "./midnight_ledger_wasm-DY-mCxaE.js";
//#region ../node_modules/@midnight-ntwrk/compact-js/dist/esm/effect/internal/compactContext.js
/** @internal */
var TypeId$3 = Symbol();
/** @internal */
var getContractContext = (compiledContract) => compiledContract[TypeId$3];
/** @internal */
var createContract = (compiledContract) => sync(() => {
	const context = getContractContext(compiledContract);
	if (!context.ctor) throw new Error("Invalid CompactContext (missing constructor)");
	return new context.ctor(context.witnesses);
});
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-js/dist/esm/effect/CompiledContract.js
var CompiledContract_exports = /* @__PURE__ */ __exportAll({
	TypeId: () => TypeId$2,
	getCompiledAssetsPath: () => getCompiledAssetsPath,
	make: () => make$3,
	withCompiledFileAssets: () => withCompiledFileAssets,
	withVacantWitnesses: () => withVacantWitnesses,
	withWitnesses: () => withWitnesses
});
var TypeId$2 = Symbol.for("compact-js/CompiledContract");
var CompiledContractProto = {
	[TypeId$2]: {
		_C: (_) => _,
		_PS: (_) => _,
		_R: (_) => _
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/**
* Initializes an object that represents a binding to a Compact compiled contract.
*
* @param tag A unique identifier that represents this type of contract.
* @param ctor The contract constructor, as imported from the compiled Compact output.
* @returns A {@link CompiledContract}.
*
* @category constructors
*/
var make$3 = (tag, ctor) => {
	const self = Object.create(CompiledContractProto);
	self.tag = tag;
	self[TypeId$3] = { ctor };
	return self;
};
/**
* Associates an object that implements the contract witnesses for the Compact compiled contract.
*
* @category combinators
*/
var withWitnesses = dual(2, (self, witnesses) => {
	return {
		...self,
		[TypeId$3]: {
			...self[TypeId$3],
			witnesses
		}
	};
});
/**
* Associates _vacant_ witnesses with a Compact compiled contract that specifies no witnesses.
*
* @param self The {@link CompiledContract} for which no witnesses are required.
*
* @category combinators
*/
var withVacantWitnesses = (self) => {
	return {
		...self,
		[TypeId$3]: {
			...self[TypeId$3],
			witnesses: {}
		}
	};
};
/**
* Associates a file path of where to find the compiled assets for the Compact compiled contract.
*
* @remarks
* Relative file paths will be resolved relative to the base paths provided to each service that accesses
* the compiled file assets.
*
* @category combinators
*/
var withCompiledFileAssets = dual(2, (self, compiledAssetsPath) => {
	return {
		...self,
		[TypeId$3]: {
			...self[TypeId$3],
			compiledAssetsPath
		}
	};
});
/**
* Retrieves a path to file based assets associated with a compiled contract.
*
* @param self The {@link CompiledContract} from which the assets path should be retrieved.
* @returns A string representing a path to the file assets configured for `self`.
*/
var getCompiledAssetsPath = (self) => {
	return getContractContext(self).compiledAssetsPath;
};
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-js/dist/esm/effect/ContractConfigurationError.js
var TypeId$1 = Symbol.for("compact-js/effect/ContractConfigurationError");
/**
* An error occurred while executing a constructor, or a circuit, of an executable contract with regards to
* its configuration.
*
* @category errors
*/
var ContractConfigurationError = class extends TypeIdError(TypeId$1, "ContractConfigurationError") {};
/**
* Creates a new {@link ContractConfigurationError}.
*
* @category constructors
*/
var make$2 = (message, contractState, cause) => new ContractConfigurationError({
	message,
	contractState,
	cause
});
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-js/dist/esm/effect/ContractRuntimeError.js
var TypeId = Symbol.for("compact-js/effect/ContractRuntimeError");
/**
* A runtime error occurred while executing a constructor, or a circuit, of an executable contract.
*
* @category errors
*/
var ContractRuntimeError = class extends TypeIdError(TypeId, "ContractRuntimeError") {};
/**
* Creates a new {@link ContractRuntimeError}.
*
* @category constructors
*/
var make$1 = (message, cause) => new ContractRuntimeError({
	message,
	cause
});
//#endregion
//#region ../node_modules/@midnight-ntwrk/compact-js/dist/esm/effect/ContractExecutable.js
var ContractExecutable_exports = /* @__PURE__ */ __exportAll({
	make: () => make,
	provide: () => provide
});
var DEFAULT_CMA_THRESHOLD = 1;
var DEFAULT_SIGNATURE_INDEX = 0n;
var asLedgerQueryContext = (queryContext) => {
	const stateValue = StateValue.decode(queryContext.state.state.encode());
	const ledgerQueryContext = new QueryContext(new ChargedState(stateValue), queryContext.address);
	ledgerQueryContext.block = queryContext.block;
	ledgerQueryContext.effects = queryContext.effects;
	return ledgerQueryContext;
};
var partitionTranscript = (txContext, finalTxContext, publicTranscript, ledgerParameters) => {
	const partitionedTranscripts = partitionTranscripts([new PreTranscript(Array.from(finalTxContext.comIndices).reduce((queryContext, entry) => queryContext.insertCommitment(...entry), asLedgerQueryContext(txContext)), publicTranscript)], ledgerParameters ?? LedgerParameters.initialParameters());
	return partitionedTranscripts.length === 1 ? right(partitionedTranscripts[0]) : left(/* @__PURE__ */ new Error(`Expected one transcript partition pair, received: ${partitionedTranscripts.length}`));
};
var ContractExecutableImpl = class {
	compiledContract;
	transform;
	constructor(compiledContract, transform = identity) {
		this.compiledContract = compiledContract;
		this.transform = transform;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	initialize(initialPrivateState, ...args) {
		return all({
			zkConfigReader: ZKConfiguration.pipe(andThen((zkConfig) => zkConfig.createReader(this.compiledContract))),
			keyConfig: Keys,
			contract: this.createContract()
		}).pipe(flatMap(({ zkConfigReader, keyConfig, contract }) => try_({
			try: () => {
				const { currentContractState, currentPrivateState, currentZswapLocalState } = contract.initialState(createConstructorContext(initialPrivateState, asHex(keyConfig.coinPublicKey)), ...args);
				return {
					contractState: currentContractState,
					privateState: currentPrivateState,
					zswapLocalState: decodeZswapLocalState(currentZswapLocalState)
				};
			},
			catch: (err) => err instanceof CompactError ? make$1("Failed to initialize contract", err) : make$2("Failed to configure constructor context with coin public key", void 0, err)
		}).pipe(flatMap(({ contractState, privateState, zswapLocalState }) => gen(this, function* () {
			const verifierKeys = yield* zkConfigReader.getVerifierKeys(getProvableCircuitIds(contract));
			for (const [provableCircuitId, verifierKey] of verifierKeys) {
				if (isNone(verifierKey)) return yield* make$2(`Failed to find a verifier key for circuit '${provableCircuitId}'`, contractState);
				const operation = contractState.operation(provableCircuitId);
				if (!operation) return yield* make$2(`Circuit '${provableCircuitId}' is undefined for the given contract state`, contractState);
				try {
					operation.verifierKey = verifierKey.value;
					contractState.setOperation(provableCircuitId, operation);
				} catch (err) {
					return yield* make$2(`Failed to configure verifier key for circuit '${provableCircuitId}' for the given contract state`, contractState, err);
				}
			}
			const [cma, signingKey] = yield* this.createMaintenanceAuthority(keyConfig.getSigningKey());
			contractState.maintenanceAuthority = cma;
			return {
				public: { contractState },
				private: {
					signingKey,
					privateState,
					zswapLocalState
				}
			};
		})))), this.transform);
	}
	circuit(provableCircuitId, circuitContext, ...args) {
		return all({
			keyConfig: Keys,
			contract: this.createContract()
		}).pipe(flatMap(({ keyConfig, contract }) => try_({
			try: () => {
				const circuit = contract.provableCircuits[provableCircuitId];
				if (!circuit) throw new Error(`Circuit ${this.compiledContract.tag}#${provableCircuitId} could not be found.`);
				const zswapLocalState = circuitContext.zswapLocalState ? encodeZswapLocalState(circuitContext.zswapLocalState) : emptyZswapLocalState(asHex(keyConfig.coinPublicKey));
				const runtimeContext = createCircuitContext(circuitContext.address, zswapLocalState, circuitContext.contractState, circuitContext.privateState);
				const initialTxContext = runtimeContext.currentQueryContext;
				return {
					...circuit(runtimeContext, ...args),
					initialTxContext
				};
			},
			catch: identity
		}).pipe(flatMap(({ initialTxContext, result, context, proofData }) => gen(function* () {
			return {
				public: {
					contractState: context.currentQueryContext.state.state,
					publicTranscript: proofData.publicTranscript,
					partitionedTranscript: yield* partitionTranscript(initialTxContext, context.currentQueryContext, proofData.publicTranscript, circuitContext.ledgerParameters)
				},
				private: {
					result,
					input: proofData.input,
					output: proofData.output,
					privateTranscriptOutputs: proofData.privateTranscriptOutputs,
					privateState: context.currentPrivateState,
					zswapLocalState: decodeZswapLocalState(context.currentZswapLocalState)
				}
			};
		})), mapError((err) => make$1(`Error executing circuit '${provableCircuitId}'`, err)))), this.transform);
	}
	getProvableCircuitIds() {
		return getProvableCircuitIds(runSync(this.createContract()));
	}
	replaceContractMaintenanceAuthority(newSigningKey, contractContext) {
		return all({ keyConfig: Keys }).pipe(flatMap(({ keyConfig }) => gen(this, function* () {
			const { contractState } = contractContext;
			const [cma, signingKey] = yield* this.createMaintenanceAuthority(newSigningKey, contractState);
			const ledger_cma = ContractMaintenanceAuthority$1.deserialize(cma.serialize());
			const update = yield* this.createSignedMaintenanceUpdate(() => {
				return right([new ReplaceAuthority(ledger_cma)]);
			}, keyConfig, contractContext);
			return {
				...update,
				private: {
					...update.private,
					signingKey
				}
			};
		})), this.transform);
	}
	removeContractOperation(provableCircuitId, contractContext) {
		return all({ keyConfig: Keys }).pipe(flatMap(({ keyConfig }) => gen(this, function* () {
			return yield* this.createSignedMaintenanceUpdate(() => {
				return right([new VerifierKeyRemove(provableCircuitId, new ContractOperationVersion("v3"))]);
			}, keyConfig, contractContext);
		})), this.transform);
	}
	addOrReplaceContractOperation(provableCircuitId, verifierKey, contractContext) {
		return all({ keyConfig: Keys }).pipe(flatMap(({ keyConfig }) => gen(this, function* () {
			return yield* this.createSignedMaintenanceUpdate(() => {
				return right([new VerifierKeyInsert(provableCircuitId, new ContractOperationVersionedVerifierKey("v3", verifierKey))]);
			}, keyConfig, contractContext);
		})), this.transform);
	}
	createSignedMaintenanceUpdate(createUpdateFn, keyConfig, contractContext) {
		const { address, contractState } = contractContext;
		const currentSigningKey = keyConfig.getSigningKey();
		if (isNone(currentSigningKey)) return left(make$2("Signing key required to authorize contract maintenance update", contractState));
		const update = createUpdateFn();
		if (isLeft(update)) return left(update.left);
		const maintenanceUpdate = new MaintenanceUpdate(address, getOrThrow(update), contractState.maintenanceAuthority.counter);
		return right({
			public: { maintenanceUpdate: maintenanceUpdate.addSignature(DEFAULT_SIGNATURE_INDEX, signData(getOrThrow$1(currentSigningKey), maintenanceUpdate.dataToSign)) },
			private: { signingKey: getOrThrow$1(currentSigningKey) }
		});
	}
	createMaintenanceAuthority(key, contractState) {
		const signingKey = match(key, {
			onSome: identity,
			onNone: () => SigningKey(sampleSigningKey())
		});
		try {
			return right([new ContractMaintenanceAuthority([signatureVerifyingKey(signingKey)], DEFAULT_CMA_THRESHOLD, contractState ? contractState.maintenanceAuthority.counter + 1n : 0n), signingKey]);
		} catch (err) {
			return left(make$2(`Failed to create a signature verifying key for signing key '${signingKey}'`, contractState, err));
		}
	}
	createContract() {
		return this.contract ??= createContract(this.compiledContract).pipe(mapError((err) => make$1(String(err), err)), cached, runSync);
	}
	contract;
};
/**
* Takes a Compact compiled contract, and makes it executable.
*
* @param compiledContract A {@link CompiledContract}
* @returns A {@link ContractExecutable} for `compiledContract`.
*
* @category constructors
*/
var make = (compiledContract) => new ContractExecutableImpl(compiledContract);
/**
* Provides a layer to the executable contract.
*
* @category combinators
*/
var provide = dual(2, (self, layer) => new ContractExecutableImpl(self.compiledContract, (e) => provide$1(e, layer)));
//#endregion
export { make as n, CompiledContract_exports as r, ContractExecutable_exports as t };
