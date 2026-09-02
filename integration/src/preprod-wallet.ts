// SPDX-License-Identifier: Apache-2.0
// Wallet construction follows midnightntwrk/example-hello-world at commit
// 67b8c9a0c76eebadfcc6d2de638dae21a20fb2fc (Apache-2.0).
import { Buffer } from "node:buffer";
import {
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  PublicKey as UnshieldedPublicKey,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
  createKeystore,
  type FacadeState,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk";
import * as ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type {
  MidnightProvider,
  UnboundTransaction,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import { preprodConfig } from "./preprod-config.js";

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export type PreprodWallet = {
  readonly wallet: WalletFacade;
  readonly shieldedSecretKeys: ledger.ZswapSecretKeys;
  readonly dustSecretKey: ledger.DustSecretKey;
  readonly unshieldedKeystore: UnshieldedKeystore;
};

type WalletMaterial = Omit<PreprodWallet, "wallet">;

const parsePositiveMilliseconds = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("MIDNIGHT_SYNC_TIMEOUT_MS must be a positive integer");
  }
  return parsed;
};

const isStrictlyComplete = (progress: unknown): boolean => {
  if (progress === null || typeof progress !== "object") return false;
  const value = progress as { isStrictlyComplete?: () => boolean };
  return typeof value.isStrictlyComplete === "function" && value.isStrictlyComplete();
};

const isSynced = (state: FacadeState): boolean =>
  isStrictlyComplete(state.shielded.state.progress) &&
  isStrictlyComplete(state.unshielded.progress) &&
  isStrictlyComplete(state.dust.state.progress);

const deriveMaterial = (seedHex: string): WalletMaterial => {
  if (!/^[0-9a-f]{64}$/iu.test(seedHex)) {
    throw new Error("MIDNIGHT_PREPROD_SEED must contain exactly 64 hexadecimal characters");
  }
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, "hex"));
  if (hd.type !== "seedOk") throw new Error("Preprod HD wallet initialization failed");
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error("Preprod wallet key derivation failed");
  hd.hdWallet.clear();
  return {
    shieldedSecretKeys: ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]),
    dustSecretKey: ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]),
    unshieldedKeystore: createKeystore(derived.keys[Roles.NightExternal], "preprod"),
  };
};

export const preprodAddressForSeed = (seedHex: string): string =>
  deriveMaterial(seedHex).unshieldedKeystore.getBech32Address().asString();

export const startPreprodWallet = async (seedHex: string): Promise<PreprodWallet> => {
  const material = deriveMaterial(seedHex);
  const indexerClientConnection = {
    indexerHttpUrl: preprodConfig.indexerHttpUrl,
    indexerWsUrl: preprodConfig.indexerWsUrl,
  };
  const provingServerUrl = new URL(preprodConfig.proofServerUrl);
  const relayURL = new URL(preprodConfig.relayUrl);
  const history = () => new InMemoryTransactionHistoryStorage(WalletEntrySchema);
  const shieldedConfig = {
    networkId: preprodConfig.networkId,
    indexerClientConnection,
    provingServerUrl,
    relayURL,
    txHistoryStorage: history(),
  };
  const unshieldedConfig = {
    networkId: preprodConfig.networkId,
    indexerClientConnection,
    txHistoryStorage: history(),
  };
  const dustConfig = {
    networkId: preprodConfig.networkId,
    costParameters: { additionalFeeOverhead: 1_000n, feeBlocksMargin: 5 },
    indexerClientConnection,
    provingServerUrl,
    relayURL,
    txHistoryStorage: history(),
  };
  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: () => ShieldedWallet(shieldedConfig).startWithSecretKeys(material.shieldedSecretKeys),
    unshielded: () => UnshieldedWallet(unshieldedConfig).startWithPublicKey(
      UnshieldedPublicKey.fromKeyStore(material.unshieldedKeystore),
    ),
    dust: () => DustWallet(dustConfig).startWithSecretKey(
      material.dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
  });
  await wallet.start(material.shieldedSecretKeys, material.dustSecretKey);

  const syncTimeout = parsePositiveMilliseconds(
    process.env.MIDNIGHT_SYNC_TIMEOUT_MS,
    60 * 60_000,
  );
  await Rx.firstValueFrom(wallet.state().pipe(
    Rx.filter(isSynced),
    Rx.timeout({ first: syncTimeout }),
  ));

  const fundedState = await Rx.firstValueFrom(wallet.state().pipe(
    Rx.filter((state) =>
      isSynced(state) &&
      ((state.unshielded.balances[ledger.nativeToken().raw] ?? 0n) +
        (state.shielded.balances[ledger.nativeToken().raw] ?? 0n)) > 0n,
    ),
    Rx.timeout({ first: syncTimeout }),
  ));
  const unregistered = fundedState.unshielded.availableCoins.filter(
    (coin) => coin.meta.registeredForDustGeneration === false,
  );
  if (unregistered.length > 0) {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      material.unshieldedKeystore.getPublicKey(),
      (payload) => material.unshieldedKeystore.signData(payload),
      fundedState.dust.address,
    );
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }
  await Rx.firstValueFrom(wallet.state().pipe(
    Rx.filter((state) => isSynced(state) && state.dust.balance(new Date()) > 0n),
    Rx.timeout({ first: syncTimeout }),
  ));

  return { wallet, ...material };
};

export const preprodWalletProvider = async (
  context: PreprodWallet,
): Promise<WalletProvider & MidnightProvider> => ({
  getCoinPublicKey: () => context.shieldedSecretKeys.coinPublicKey,
  getEncryptionPublicKey: () => context.shieldedSecretKeys.encryptionPublicKey,
  balanceTx: async (transaction: UnboundTransaction, ttl?: Date) => {
    const recipe = await context.wallet.balanceUnboundTransaction(
      transaction,
      {
        shieldedSecretKeys: context.shieldedSecretKeys,
        dustSecretKey: context.dustSecretKey,
      },
      { ttl: ttl ?? new Date(Date.now() + 60 * 60 * 1000) },
    );
    const signedRecipe = await context.wallet.signRecipe(
      recipe,
      (payload) => context.unshieldedKeystore.signData(payload),
    );
    return context.wallet.finalizeRecipe(signedRecipe);
  },
  submitTx: (transaction) => context.wallet.submitTransaction(transaction),
});
