# Run the checked web release in a container

The static web image packages an already built release. Its Node build stage reruns the packaging gate against copied compiler outputs; only `web/dist` enters the Caddy runtime. It does not compile Compact or bake runtime environment variables into the client. Configure public `VITE_*` endpoints before `release:build`, as described in the main setup guide. Never place private credentials in client build variables.

From the repository root, with generated proving assets present:

```text
npm run release:build
docker compose -p vulnseal-web -f infra/web.yml config --quiet
docker compose -p vulnseal-web -f infra/web.yml up --build -d
npm run release:check-host -- http://127.0.0.1:8080
docker compose -p vulnseal-web -f infra/web.yml ps
docker compose -p vulnseal-web -f infra/web.yml logs --tail 100 web
```

The default listener is localhost port 8080. Set `WEB_PUBLISHED_PORT` or pass a Compose env file to change it. With a Windows Docker wrapper that invokes WSL, host shell environment variables may not reach Compose; use `--env-file` or set the variable explicitly inside WSL. Keep the project name stable. `docker compose -p vulnseal-web -f infra/web.yml down` stops this web deployment; it has no ciphertext volume or role-backup storage.

The image pins Caddy 2.11.4 and the Node validation stage by digest. Runtime UID/GID is 65532, the filesystem is read-only under Compose, capabilities are dropped and privilege escalation is disabled. The upstream binary's low-port binding capability is removed because port 8080 needs none; retaining that file capability prevents execution with all capabilities dropped. Compose limits memory to 256 MiB, processes to 64 and container log rotation to three 10 MiB files. Caddy's admin API, automatic HTTPS and config persistence are disabled for this internal HTTP listener. The healthcheck fetches the index page; it does not rehash all keys or test downstream services. Runtime logs are available through Docker; request access logging is not enabled by this configuration.

Both Caddy Dockerfiles also pin patched Alpine packages: c-ares 1.34.8-r0, curl/libcurl 8.22.0-r0 and libcrypto3/libssl3 3.5.8-r0. These versions must remain available in the Alpine 3.23 repository for a fresh build. The September 9 Trivy scan found no remaining Alpine findings after these upgrades, but **24 Go dependency findings remain in the Caddy binary, including one critical**. They have not been assessed for reachability or remediated; the image is not cleared for public production on the strength of the functional drill. See [scan evidence](evidence/web-image-vulnerabilities.json). The official current Caddy image resolved to the same base digest during this check, so pulling its moving tag alone did not address them.

Files are served from `/srv` without directory browsing or an SPA fallback. VulnSeal uses URL fragments for its workspaces, so missing JS/key paths remain 404. Prover/verifier/binary-ZKIR responses explicitly use `application/octet-stream`; the HTTP release check also enforces browser-compatible HTML/JS/CSS/WASM MIME types. All successful files use `Cache-Control: no-cache`, permitting storage with revalidation rather than long-lived reuse of mutable key paths. Responses disable MIME sniffing, referrer sending and framing. The limited CSP sets frame ancestors, base URI and object restrictions; it is not a full script/style/connect allowlist. These behaviors use Caddy's documented [file server](https://caddyserver.com/docs/caddyfile/directives/file_server) and [response header](https://caddyserver.com/docs/caddyfile/directives/header) directives.

For a public deployment, configure a TLS reverse proxy or managed HTTPS ingress to the localhost service and run `release:check-host` against the actual final HTTPS origin. Configure and verify the ciphertext origin/CORS, indexer, RPC and proof provider for that browser environment. The internal image does not provision DNS, certificates, a proxy, CDN settings, authentication, rate limits or monitoring. Do not expose this HTTP listener as the public site: browser wallet/crypto flows require a suitable secure origin. Validate proxy headers, caching, wallet extension behavior and the native-wallet ceremony separately.

Deploy a complete versioned image rather than modifying individual served files. Retain the previous image digest for rollback, but account for open tabs: an old tab may still request old chunks after an upgrade. This single-image setup does not retain old build assets or prove mixed-version compatibility. Arrange release drain/asset retention and test upgrade recovery for your host. Never clear users' browser storage to perform an upgrade. Compiler provenance and actual public deployment remain separate from local image evidence.

## Mount a release below a stable path

For a runnable two-backend configuration and promotion/rollback drill, see [retained web releases](web-rollout.md).

The web build now uses relative asset URLs. Its proving-key provider resolves `keys/` and `zkir/` beside the loaded index document, and demo/role links retain that directory. A complete release can therefore be served at `/releases/v1/` or at the origin root. Always use a trailing slash for a directory URL, or the explicit `index.html` URL; browsers resolve relative paths against that directory. Do not redirect an old release path to newly compiled keys or a different release.

For a host-installed Caddy ingress, the following route illustrates mounting a retained release container on localhost port 8081. Add it inside the existing HTTPS site configuration; substitute the actual release path and backend. Caddy's [handle_path](https://caddyserver.com/docs/caddyfile/directives/handle_path) strips the prefix before [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) forwards the request to the container's root:

```caddyfile
handle_path /releases/v1/* {
    reverse_proxy 127.0.0.1:8081
}
```

Run `npm run release:check-host -- https://your-deployment.example/releases/v1/` with the matching local artifact. Check each retained release separately. To keep old tabs functional, retain each path's complete image and route for the required lifetime while publishing a new path for new sessions. The default single-container Compose file does not automate multi-release retention, traffic switching or expiry. The local browser test verifies one mounted artifact through a real prefix-stripping HTTP proxy; it does not establish an operational multi-version rollout.

Release paths on the same origin share browser storage and wallet authorization. A path is not a security boundary or a separate identity store. Concurrent revisions retain the existing storage conflict rules; older code may not understand newer backup schemas. Test upgrade/rollback compatibility and export encrypted backups before adopting a retention policy. Removing a release still breaks its remaining tabs even though its asset URLs are relative.

## Repeat the disposable container drill

```text
npx playwright install --with-deps chrome
node scripts/test-web-container.mjs
```

The drill expects the `vulnseal-web:local` image and matching local release/compiler files. Set `VULNSEAL_DOCKER_WSL_DISTRO=Ubuntu` when Node must invoke Docker through WSL. It creates a uniquely labelled container on a random localhost port, verifies the artifact over HTTP, non-root/read-only configuration, headers, missing-file responses, captured-state public lookup in desktop/mobile Chrome and graceful restart. It removes only its own labelled container and attached anonymous volumes. Browser service responses are captured fixtures, external requests are intercepted, and no wallet or live chain is used. `--write-evidence` retains the result in `docs/evidence/web-container-drill.json`.

This drill is currently a local release procedure. Ordinary CI skips prover-key generation and therefore cannot build this network-capable image from that artifact; the packaging/HTTP rejection tests remain in CI. No remote image build or production image vulnerability scan is implied.
