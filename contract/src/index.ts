// SPDX-License-Identifier: Apache-2.0
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import * as Generated from "./managed/vulnseal/contract/index.js";
import * as Witnesses from "./witnesses.js";

export * from "./managed/vulnseal/contract/index.js";
export * from "./witnesses.js";

export const compiledVulnSealContract = CompiledContract.make<
  Generated.Contract<Witnesses.VulnSealPrivateState>
>("VulnSeal", Generated.Contract<Witnesses.VulnSealPrivateState>).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets("./managed/vulnseal"),
);
