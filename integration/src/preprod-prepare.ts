// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preprodConfig } from "./preprod-config.js";
import { preprodAddressForSeed } from "./preprod-wallet.js";

const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(integrationRoot, ".env.preprod");

let seed = process.env.MIDNIGHT_PREPROD_SEED;
if (seed === undefined) {
  try {
    await access(envPath);
    throw new Error(".env.preprod exists but was not loaded; use npm run preprod:prepare");
  } catch (error) {
    if (error instanceof Error && !error.message.includes("was not loaded")) {
      seed = randomBytes(32).toString("hex");
      const storagePassword = randomBytes(32).toString("base64url");
      const content = [
        "# Local-only VulnSeal Preprod test wallet. Never commit or share this file.",
        `MIDNIGHT_PREPROD_SEED=${seed}`,
        `MIDNIGHT_STORAGE_PASSWORD=${storagePassword}`,
        "MIDNIGHT_SYNC_TIMEOUT_MS=3600000",
        "",
      ].join("\n");
      await writeFile(envPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } else {
      throw error;
    }
  }
}

if (seed === undefined) throw new Error("Unable to initialize the Preprod wallet seed");
process.stdout.write(`${JSON.stringify({
  network: preprodConfig.networkId,
  address: preprodAddressForSeed(seed),
  faucet: preprodConfig.faucetUrl,
  secretStorage: "integration/.env.preprod (gitignored; seed not printed)",
}, null, 2)}\n`);
