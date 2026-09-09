// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { hasRetainedKeys } from "./retained-keys.mjs";
import { checkContractSource } from "./check-contract-source.mjs";
import { stageCompilation } from "./staged-compiler.mjs";

const contractDir = fileURLToPath(new URL("../contract/", import.meta.url));
const skip = process.argv.includes("--skip-zk");
const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const wslPath = (value) => {
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) throw new Error(`Cannot translate Windows path for WSL: ${value}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
};
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: contractDir, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Compiler exited with ${result.signal ?? result.status ?? "unknown status"}`);
};

try {
  if (process.argv.slice(2).some((argument) => argument !== "--skip-zk") || process.argv.slice(2).length > 1) throw new Error("Usage: compile-contract.mjs [--skip-zk]");
  if (skip && await hasRetainedKeys(path.join(contractDir, "src/managed/vulnseal"))) {
    await checkContractSource();
    process.stdout.write("Retained proving keys detected. Fresh bindings and ZKIR match; existing managed artifacts were preserved.\n");
  } else {
    const custom = process.env.VULNSEAL_ZKIR_BINARY;
    const result = await stageCompilation(contractDir, async (output) => {
      process.stdout.write(`Compiler staging directory: ${path.dirname(output)}\n`);
      const destination = process.platform === "win32" ? wslPath(output) : output;
      const args = ["compile", ...(skip || custom ? ["--skip-zk"] : []), "src/vulnseal.compact", destination];
      const keyArgs = ["compile-many", `${destination}/zkir`, `${destination}/keys`];
      if (process.platform === "win32") {
        const commands = [`compact ${args.map(quote).join(" ")}`];
        if (custom && !skip) commands.push(`${quote(custom)} ${keyArgs.map(quote).join(" ")}`);
        run("wsl.exe", [...(process.env.VULNSEAL_COMPACT_WSL_DISTRO ? ["--distribution", process.env.VULNSEAL_COMPACT_WSL_DISTRO] : []), "--exec", "bash", "-lc", `cd ${quote(wslPath(contractDir))} && ${commands.join(" && ")}`]);
      } else {
        run("compact", args);
        if (custom && !skip) run(custom, keyArgs);
      }
    }, !skip);
    process.stdout.write(`Installed ${result.circuits} circuits from staged compilation. Previous artifacts: ${result.previous ?? "none"}.\n`);
  }
} catch (error) {
  process.stderr.write(`Compact compilation failed: ${error.message}\n`);
  process.exitCode = 1;
}
