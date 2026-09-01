// SPDX-License-Identifier: Apache-2.0
// Adapted from midnightntwrk/example-zkloan at commit
// 5da98549ef62addb72e391332bbcf0bea51e4213. Apache-2.0.
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

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export type LocalWallet = {
  readonly wallet: WalletFacade;
  readonly shieldedSecretKeys: ledger.ZswapSecretKeys;
  readonly dustSecretKey: ledger.DustSecretKey;
  readonly unshieldedKeystore: UnshieldedKeystore;
};

const indexerHttpUrl = "http://127.0.0.1:8088/api/v4/graphql";
const indexerWsUrl = "ws://127.0.0.1:8088/api/v4/graphql/ws";
const provingServerUrl = new URL("http://127.0.0.1:6300");
const relayURL = new URL("ws://127.0.0.1:9944");

export const startLocalGenesisWallet = async (): Promise<LocalWallet> => {
  // Public, deterministic seed funded only by the isolated local dev genesis.
  const seed = Buffer.from("0".repeat(63) + "1", "hex");
  const hd = HDWallet.fromSeed(seed);
  if (hd.type !== "seedOk") throw new Error("Local HD wallet initialization failed");
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error("Local wallet key derivation failed");
  hd.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(derived.keys[Roles.NightExternal], "undeployed");
  const indexerClientConnection = { indexerHttpUrl, indexerWsUrl };
  const history = () => new InMemoryTransactionHistoryStorage(WalletEntrySchema);
  const shieldedConfig = {
    networkId: "undeployed",
    indexerClientConnection,
    provingServerUrl,
    relayURL,
    txHistoryStorage: history(),
  };
  const unshieldedConfig = {
    networkId: "undeployed",
    indexerClientConnection,
    txHistoryStorage: history(),
  };
  const dustConfig = {
    networkId: "undeployed",
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection,
    provingServerUrl,
    relayURL,
    txHistoryStorage: history(),
  };
  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: () => ShieldedWallet(shieldedConfig).startWithSecretKeys(shieldedSecretKeys),
    unshielded: () => UnshieldedWallet(unshieldedConfig).startWithPublicKey(
      UnshieldedPublicKey.fromKeyStore(unshieldedKeystore),
    ),
    dust: () => DustWallet(dustConfig).startWithSecretKey(
      dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  const synced = wallet.state().pipe(
    Rx.filter((state) => state.isSynced),
    Rx.timeout({ first: 120_000 }),
  );
  await Rx.firstValueFrom(synced);
  const funded = wallet.state().pipe(
    Rx.map((state) =>
      (state.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
      (state.shielded?.balances[ledger.nativeToken().raw] ?? 0n)),
    Rx.filter((balance) => balance > 0n),
    Rx.timeout({ first: 120_000 }),
  );
  await Rx.firstValueFrom(funded);

  const state = await Rx.firstValueFrom(wallet.state());
  const unregistered = state.unshielded?.availableCoins.filter(
    (coin) => coin.meta.registeredForDustGeneration === false,
  ) ?? [];
  if (unregistered.length > 0) {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }
  await Rx.firstValueFrom(wallet.state().pipe(
    Rx.filter((value) => (value.dust?.balance(new Date()) ?? 0n) > 0n),
    Rx.timeout({ first: 120_000 }),
  ));
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const walletProvider = async (
  context: LocalWallet,
): Promise<WalletProvider & MidnightProvider> => {
  await Rx.firstValueFrom(context.wallet.state().pipe(Rx.filter((state) => state.isSynced)));
  return {
    getCoinPublicKey: () => context.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => context.shieldedSecretKeys.encryptionPublicKey,
    balanceTx: async (transaction: UnboundTransaction, ttl?: Date) => {
      const recipe = await context.wallet.balanceUnboundTransaction(
        transaction,
        {
          shieldedSecretKeys: context.shieldedSecretKeys,
          dustSecretKey: context.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return context.wallet.finalizeRecipe(recipe);
    },
    submitTx: (transaction) => context.wallet.submitTransaction(transaction),
  };
};
