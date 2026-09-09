# Prepare and check a network-capable web artifact

The normal web build supports development and guided-demo CI without proving keys. Its optional artifact copy is not a release completeness gate. A network-capable release must include the compiler outputs used by the browser's `FetchZkConfigProvider`: a prover key, verifier key and binary ZKIR for every proving circuit.

Generate the contract outputs using the configured Compact toolchain, then build and inventory the release:

```text
npm ci
npm run compact
npm run release:build
npm run release:check
```

The manually triggered [Release verification workflow](../.github/workflows/release-verification.yml) runs this complete path on Ubuntu from a clean GitHub checkout, including `npm run compact` without `--skip-zk`, all workspace validation and the web container's HTTP/browser/restart drill. Select the intended branch or tag when starting the workflow in GitHub Actions. Check every step and the logged artifact inventory/image identifier; configuration in the repository is not evidence of a successful remote run. The runner-local artifact/image is disposable and is not uploaded, pushed or deployed. Ordinary pull-request CI remains the faster skip-ZK path. Native wallet proof/transaction execution and release publication are separate work.

`compact` needs the supported compiler/prover toolchain described in the main setup guide. `compact:skip-zk` alone is insufficient for this release gate. `release:build` first checks compiler-source freshness, then rebuilds the workspaces and writes `web/dist/release-manifest.json`. It does not regenerate proving keys. Compile from the intended source first, in a controlled checkout, and do not change source/artifacts during packaging.

`npm run compact:check-source` compiles the current source with `--skip-zk` into a unique temporary directory under `.compact`, leaving the retained managed outputs and keys untouched. It requires byte-identical compiler metadata, generated JavaScript/declarations and textual ZKIR for every proving circuit. Source maps must match except for the output-directory-dependent `sourceRoot`. A source change during the check fails. The command prints the compared hashes, removes its own scratch directory, and has a two-minute compiler deadline. Windows uses WSL; `VULNSEAL_COMPACT_WSL_DISTRO` optionally selects the distribution. It requires the Compact toolchain even when existing generated files are present. CI also runs this comparison and its rejection tests.

This freshness check detects stale retained bindings/circuit input. It does not regenerate or semantically validate `.bzkir`, prover or verifier files, authenticate the compiler installation or attest the deployment. Full key generation and network proof execution remain separate requirements. `release:check` alone remains a read-only packaging comparison and does not invoke the compiler.

The checker reads the proving-circuit inventory from `contract-info.json`, requires every corresponding `.prover`, `.verifier` and `.bzkir`, and compares each packaged file byte-for-byte by size and SHA-256 with its local compiler output. Files must be nonempty regular files. The release root may contain `index.html`, assets, keys, ZKIR and the generated manifest; unrecognized files/directories and symlinks are rejected. The existing textual `.zkir` files may also be included. HTML entrypoints and static relative JS/WASM/CSS references emitted by the current bundler must exist. WASM import-object property names are not mistaken for fetched modules.

The manifest records source/metadata digests, compiler version, circuit names and every packaged file's size/hash, excluding the manifest itself. Paths sort consistently and the manifest has no timestamp, so identical inputs produce identical inventory content. `release:check` is read-only and rejects a stale or altered existing manifest. `release:build` explicitly regenerates it after a clean Vite build. The checker bounds metadata to 1 MiB, a manifest to 16 MiB, scripts/stylesheets to 16 MiB each, other files to 256 MiB each, inventory to 5,000 files and total artifact size to 1 GiB.

For this contract, the current inventory contains eight proving circuits and 24 required network files. Publish the complete `web/dist` artifact, including its `keys/` and `zkir/` directories; preserve paths relative to the deployed release directory. The browser provider fetches these paths beside the release index, and the build uses relative JS/WASM asset paths. Retain a trusted copy/hash of the manifest outside the serving directory for later deployment comparison.

## What this gate does not establish

This is a packaging check against local outputs, not a signed compiler attestation or proof that keys correspond to the latest Compact source. It records a source digest but cannot prove compilation provenance. It does not validate proving-key semantics, deployed code identity, arbitrary computed runtime URLs, environment endpoint correctness, public HTTP headers/availability, native Lace transactions or production readiness. A manifest served alongside files can be replaced together with them; it is not an independent trust anchor. Source maps remain part of the current build and inventory; this checker is not a secret scanner.

After packaging, retain normal build/test/audit results, verify all required assets through the actual public endpoint, and execute the native-wallet release ceremony against the intended deployment. Hosting and that ceremony remain separate gates. No publish, upload or wallet call is performed by these commands.

`npm run test:release` exercises rejection of absent/empty/mismatched prover data, missing HTML/lazy asset references, unexpected files and stale manifests using isolated synthetic fixtures. CI runs this test even when its normal compiler step skips key generation. That test is not evidence that CI generated a network-complete release artifact.

## Verify files through the serving origin

For the checked container packaging and local hosting procedure, see [web hosting](web-hosting.md).

After uploading the complete artifact to your chosen host, retain the matching local compiler outputs and `web/dist`, then run:

```text
npm run release:check-host -- https://your-deployment.example
```

Replace the example with the actual HTTPS base URL. A release subdirectory is supported, for example `https://your-deployment.example/releases/v1/`; include its trailing slash. The command first runs the local packaging check, then downloads every inventoried file and the release directory's index page. It requires HTTP 200, the expected byte length and SHA-256, and browser-compatible MIME types for HTML, JavaScript, CSS and WASM. The directory URL must serve the same content as `index.html`. A missing key replaced by an HTML fallback therefore fails even if the host responds with 200. Redirects fail: supply the final serving URL directly. Credentials, query strings and fragments are rejected; release path segments accept letters, digits, dots, hyphens and underscores with no leading dot; plain HTTP is accepted only for loopback testing.

Requests run sequentially, omit credentials, request cache revalidation and have a 30-second deadline each, including the body. Hashing is streamed and aborts above the expected file size. Fetch-decoded bytes are compared, so transport compression does not change the required file contents. The reported byte total includes fetching `index.html` again at the release directory URL. The served manifest is not trusted or fetched as an authority: comparisons use the locally checked inventory. The complete current artifact requires approximately 62.5 MB per check. Stop or rerun explicitly after fixing a failed deployment; the checker does not retry, upload, publish or mutate the host.

For a local smoke check, start `npm run preview -w @vulnseal/web -- --port 4186 --strictPort` in a separate terminal and use `http://127.0.0.1:4186` as the origin. Vite preview is a local validation tool; choose and configure a production host separately.

Passing proves the bytes served to this client at check time. It does not establish CDN-wide consistency, browser execution, cache policy correctness, security headers, TLS configuration beyond normal client certificate validation, endpoint availability or a successful wallet ceremony. Browser privacy/extension behavior also requires browser validation. Keep these deployment checks alongside the HTTP result.

## Runtime security in manual release verification

The manual `release-verification.yml` workflow scans the built web runtime after hosting verification and independently builds/scans the collector image selected by the monitoring Compose overlay. Both use `scripts/scan-container.sh` with all severities and no ignored findings. The September 9 local scans currently fail: one UNKNOWN finding in the web runtime and two UNKNOWN occurrences in the rebuilt collector. See [web evidence](evidence/web-current-runtime-scan.json) and [collector evidence](evidence/prometheus-scratch-runtime.json). These are unresolved release gates; functional tests cannot override them. The workflow is configured locally and has not been executed on GitHub. The ciphertext runtime has its own scan in ordinary CI; its latest local evidence is recorded separately.
