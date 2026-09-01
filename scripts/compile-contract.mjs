// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractDir = path.resolve(scriptDir, "..", "contract");
const customZkir = process.env.VULNSEAL_ZKIR_BINARY;
const skipZk = process.argv.includes("--skip-zk") || Boolean(customZkir);
const compileArgs = [
  "compile",
  ...(skipZk ? ["--skip-zk"] : []),
  "src/vulnseal.compact",
  "src/managed/vulnseal",
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: contractDir,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  return result;
};

if (process.platform !== "win32") {
  const result = run("compact", compileArgs);
  if (result.status === 0 && customZkir && !process.argv.includes("--skip-zk")) {
    run(customZkir, [
      "compile-many",
      "src/managed/vulnseal/zkir",
      "src/managed/vulnseal/keys",
    ]);
  }
} else {
  const driveMatch = /^([A-Za-z]):\\(.*)$/.exec(contractDir);
  if (!driveMatch) throw new Error(`Cannot translate Windows path for WSL: ${contractDir}`);
  const [, drive, remainder] = driveMatch;
  const wslDir = `/mnt/${drive.toLowerCase()}/${remainder.replaceAll("\\", "/")}`;
  const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
  const commands = [`compact ${compileArgs.map(quote).join(" ")}`];
  if (customZkir && !process.argv.includes("--skip-zk")) {
    commands.push(
      `${quote(customZkir)} compile-many src/managed/vulnseal/zkir src/managed/vulnseal/keys`,
    );
  }
  run("wsl.exe", [
    "bash",
    "-lc",
    `cd ${quote(wslDir)} && ${commands.join(" && ")}`,
  ]);
}
