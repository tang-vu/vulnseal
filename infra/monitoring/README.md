# Local Prometheus build

The collector uses a modified Prometheus 3.14.0 build, identified as
`3.14.0-vulnseal.1`. `infra/prometheus.Dockerfile` pins the upstream source
revision, source archive SHA-256, published UI archive SHA-256, Go builder
image. The final runtime starts from `scratch` with no inherited OS layers. The UI checksum matches the release's
`sha256sums.txt`.

The Go module updates select `golang.org/x/crypto v0.56.0` and
`google.golang.org/grpc v1.83.2`. Go also updates their required `x/net` and
`x/text` versions. Dependency verification precedes a readonly module build.
Both `prometheus` and `promtool` are rebuilt; no advisory is suppressed. The
versioned upstream UI assets are gzip-compressed with timestamps omitted and
embedded using the upstream template. This is not an unmodified upstream
binary or an upstream-supported security release.

Build and verify from the repository root:

```sh
docker compose -f infra/cipherstore.yml -f infra/cipherstore-monitoring.yml build prometheus
node scripts/test-cipherstore-monitoring.mjs
sh scripts/scan-container.sh vulnseal-prometheus:local
```

Build `vulnseal-cipherstore:local` first for the functional drill. On Windows
with WSL, set `VULNSEAL_DOCKER_WSL_DISTRO=Ubuntu` for the Node drill and run the
scan in the Linux shell. A failed scan remains a release failure even when the
drill passes. The runtime contains the two static binaries, a CA certificate bundle, Go
timezone data, a default configuration, license/notice files and numeric-user
account records. It has no shell, package manager or dynamic loader. The data
directory is owned by UID/GID 65534 before a fresh named volume is mounted.
Existing volumes still need that ownership; this image cannot run a shell to
repair an operator volume. The runtime inventory does not audit the host or
exercise remote TLS scrapes. Functional coverage is the
configured static scrape, query API, UI asset serving, quota readiness and local alert rules;
it does not cover every upstream service-discovery or remote-write integration.

The `build-evidence` Docker target exports the resolved `go.mod`, `go.sum` and
combined package graph without runtime binaries. The September 9
[remediation record](../../docs/evidence/prometheus-remediation.json) hashes
those outputs and retains the package list. It records two remaining UNKNOWN
module findings and a failed gate; the OpenPGP package is absent from that
specific graph. No module-level scanner exclusion is configured.

Sources: [upstream build configuration](https://github.com/prometheus/prometheus/blob/v3.14.0/.promu.yml),
[asset compression](https://github.com/prometheus/prometheus/blob/v3.14.0/scripts/compress_assets.sh),
[release assets and checksums](https://github.com/prometheus/prometheus/releases/tag/v3.14.0).

The [current scratch-runtime evidence](../../docs/evidence/prometheus-scratch-runtime.json)
records the exact image, regular-file inventory and scan result. The earlier
remediation record describes the superseded BusyBox-based runtime.
