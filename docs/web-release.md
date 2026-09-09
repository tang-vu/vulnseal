# Prepare and check a network-capable web artifact

The normal web build supports development and guided-demo CI without proving keys. Its optional artifact copy is not a release completeness gate. A network-capable release must include the compiler outputs used by the browser's `FetchZkConfigProvider`: a prover key, verifier key and binary ZKIR for every proving circuit.

Generate the contract outputs using the configured Compact toolchain, then build and inventory the release:

```text
npm ci
npm run compact
npm run release:build
npm run release:check
```

`compact` needs the supported compiler/prover toolchain described in the main setup guide. `compact:skip-zk` alone is insufficient for this release gate. `release:build` rebuilds the workspaces and writes `web/dist/release-manifest.json`; it does not itself regenerate or establish the freshness of compiler outputs. Compile from the intended source first, in a controlled checkout, and do not change source/artifacts during packaging.

The checker reads the proving-circuit inventory from `contract-info.json`, requires every corresponding `.prover`, `.verifier` and `.bzkir`, and compares each packaged file byte-for-byte by size and SHA-256 with its local compiler output. Files must be nonempty regular files. The release root may contain `index.html`, assets, keys, ZKIR and the generated manifest; unrecognized files/directories and symlinks are rejected. The existing textual `.zkir` files may also be included. HTML entrypoints and static relative JS/WASM/CSS references emitted by the current bundler must exist. WASM import-object property names are not mistaken for fetched modules.

The manifest records source/metadata digests, compiler version, circuit names and every packaged file's size/hash, excluding the manifest itself. Paths sort consistently and the manifest has no timestamp, so identical inputs produce identical inventory content. `release:check` is read-only and rejects a stale or altered existing manifest. `release:build` explicitly regenerates it after a clean Vite build. The checker bounds metadata to 1 MiB, a manifest to 16 MiB, scripts/stylesheets to 16 MiB each, other files to 256 MiB each, inventory to 5,000 files and total artifact size to 1 GiB.

For this contract, the current inventory contains eight proving circuits and 24 required network files. Publish the complete `web/dist` artifact, including its `keys/` and `zkir/` directories; preserve paths relative to the site's origin. The current browser provider fetches these paths from the origin root. Retain a trusted copy/hash of the manifest outside the serving directory for later deployment comparison.

## What this gate does not establish

This is a packaging check against local outputs, not a signed compiler attestation or proof that keys correspond to the latest Compact source. It records a source digest but cannot prove compilation provenance. It does not validate proving-key semantics, deployed code identity, arbitrary computed runtime URLs, environment endpoint correctness, public HTTP headers/availability, native Lace transactions or production readiness. A manifest served alongside files can be replaced together with them; it is not an independent trust anchor. Source maps remain part of the current build and inventory; this checker is not a secret scanner.

After packaging, retain normal build/test/audit results, verify all required assets through the actual public endpoint, and execute the native-wallet release ceremony against the intended deployment. Hosting and that ceremony remain separate gates. No publish, upload or wallet call is performed by these commands.

`npm run test:release` exercises rejection of absent/empty/mismatched prover data, missing HTML/lazy asset references, unexpected files and stale manifests using isolated synthetic fixtures. CI runs this test even when its normal compiler step skips key generation. That test is not evidence that CI generated a network-complete release artifact.
