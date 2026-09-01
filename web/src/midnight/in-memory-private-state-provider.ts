// Adapted from midnightntwrk/example-bboard (Apache-2.0).
// SPDX-License-Identifier: Apache-2.0
import type {
  ContractAddress,
  SigningKey,
} from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";

export const inMemoryPrivateStateProvider = <
  PSI extends PrivateStateId,
  PS,
>(): PrivateStateProvider<PSI, PS> => {
  const privateStates = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let activeAddress: ContractAddress | undefined;
  const address = (): ContractAddress => {
    if (activeAddress === undefined) throw new Error("Contract address is not set");
    return activeAddress;
  };
  const scoped = (contractAddress = address()): Map<PSI, PS> => {
    let values = privateStates.get(contractAddress);
    if (values === undefined) {
      values = new Map();
      privateStates.set(contractAddress, values);
    }
    return values;
  };
  const unsupported = (operation: string): Promise<never> =>
    Promise.reject(new Error(`${operation} is unavailable for ephemeral browser private state`));

  return {
    setContractAddress(value) {
      activeAddress = value;
    },
    set(key, value) {
      scoped().set(key, value);
      return Promise.resolve();
    },
    get(key) {
      return Promise.resolve(scoped().get(key) ?? null);
    },
    remove(key) {
      scoped().delete(key);
      return Promise.resolve();
    },
    clear() {
      privateStates.delete(address());
      return Promise.resolve();
    },
    setSigningKey(contractAddress, signingKey) {
      signingKeys.set(contractAddress, signingKey);
      return Promise.resolve();
    },
    getSigningKey(contractAddress) {
      return Promise.resolve(signingKeys.get(contractAddress) ?? null);
    },
    removeSigningKey(contractAddress) {
      signingKeys.delete(contractAddress);
      return Promise.resolve();
    },
    clearSigningKeys() {
      signingKeys.clear();
      return Promise.resolve();
    },
    exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      return unsupported("Private-state export");
    },
    importPrivateStates(
      _data: PrivateStateExport,
      _options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      return unsupported("Private-state import");
    },
    exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      return unsupported("Signing-key export");
    },
    importSigningKeys(
      _data: SigningKeyExport,
      _options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      return unsupported("Signing-key import");
    },
  };
};
