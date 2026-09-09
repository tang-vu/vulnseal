# Retain two web releases during promotion and rollback

`infra/web-rollout.yml` runs two static release images and a small HTTP ingress. Each image keeps its own `/releases/<id>/` route. Only the redirect at `/` changes when a release is promoted. The backends have no published ports; the ingress publishes localhost port 8080 by default. The existing [web image](web-hosting.md) must be built from a release that supports subdirectory URLs.

## Prepare and start

Build and retain each artifact with its local compiler outputs and manifest. Build `infra/web.Dockerfile` with distinct image tags, and obtain each immutable image reference using `docker image inspect --format '{{.Id}}' <tag>`. Registry deployments should use full repository/digest references. Do not change the contents behind an existing release ID.

Copy `infra/web-rollout.env.example` to your deployment env file. Set both image references, distinct release IDs and the active ID. IDs accept 1–64 letters, digits, hyphens or underscores. The startup script rejects duplicate IDs, malformed IDs and an active ID that does not match either slot. Compose requires both image values; operators must supply immutable references, since Compose itself does not reject mutable tags.

```text
docker compose --env-file infra/web-rollout.local.env -p vulnseal-rollout -f infra/web-rollout.yml config --quiet
docker compose --env-file infra/web-rollout.local.env -p vulnseal-rollout -f infra/web-rollout.yml up --build --wait
```

Check each exact release URL with its matching local artifact and `npm run release:check-host -- http://127.0.0.1:8080/releases/<id>/`. The root URL intentionally redirects and is not an artifact-check target. `/healthz` fetches the active backend's index, while each backend has its own index healthcheck. Healthy status is not a full file/hash or downstream-wallet check. Runtime containers use a read-only root, non-root user, dropped capabilities, no-new-privileges, bounded logs, and individual memory/process limits.

## Promote or roll back

Keep both release IDs and image references fixed. Change only `WEB_ACTIVE_RELEASE` in the env file, then recreate the ingress:

```text
docker compose --env-file infra/web-rollout.local.env -p vulnseal-rollout -f infra/web-rollout.yml up --no-build --no-deps --wait ingress
```

New visits to `/` receive a non-cacheable redirect to the selected release. Existing tabs and bookmarks at either release path retain that path and backend. Rollback uses the same command with the previous active ID. Recreating this single ingress may briefly interrupt requests; this is not a zero-downtime or high-availability ingress. Keep a fixed published port in deployment. The drill uses a random initial port, then pins that assigned port before switching.

This configuration retains two releases. To introduce a third, retire a slot only after your retention/drain policy permits its old path to disappear, or expand the routing topology. Changing a slot's image or ID breaks the old path's retention guarantee. Do not use `down` to promote: that removes both serving backends. Removing the project is an explicit service shutdown, not rollback. No automatic expiry, pruning or deletion is performed.

A public site still needs TLS/DNS/ingress configuration and verification at its actual HTTPS URL. Paths on the same origin share browser storage and wallet authorization. Retaining old files does not prove new/old application schema compatibility or make concurrent old/new writes safe beyond the existing revision checks. Test those migrations separately and retain encrypted backups. The proxy does not operate wallets, ciphertext retention or private data stores.

## Repeat the local drill

The script expects `vulnseal-web:rollout-a`, `vulnseal-web:local`, `vulnseal-web-rollout:local`, A's inventory at `docs/evidence/web-rollout-a-manifest.json` and B's checked artifact in `web/dist`. Both images must differ and have different JavaScript content. The recorded drill builds A from the same application source with `VITE_CIPHERSTORE_URL=http://127.0.0.1:8898`, saves its manifest and image, then builds B with the normal configuration. This intentionally creates distinct compiled chunks without claiming an application-schema upgrade. That synthetic ciphertext endpoint is not contacted by the drill.

Run `node scripts/test-web-rollout.mjs` from the repository root, with Chrome installed for Playwright. On this Windows/WSL host, set `VULNSEAL_DOCKER_WSL_DISTRO=Ubuntu`. The script pins the two local image IDs, creates a uniquely named Compose project and temporary env file, validates failure cases, checks both complete artifacts, opens A in Chrome, promotes B, opens A's retained role-workspace chunk from the old page, verifies new visits use B, rolls back to A and rechecks both artifacts. It verifies that the backend container IDs never changed. External browser requests are blocked and no wallet is used. `--write-evidence` writes `docs/evidence/web-rollout-drill.json`.

Cleanup verifies the project's container labels, removes its own Compose resources and temporary env file, and retains the built images. Interrupted cleanup may leave that uniquely named project for inspection; do not remove unrelated Docker resources. The drill currently runs locally, since ordinary CI does not generate the full prover artifacts required by these images.

The root-redirect readiness probe retries transport errors for up to 15 seconds after ingress creation/recreation, with a per-request timeout and closed connections. This accommodates transient localhost forwarding/reset behavior; unexpected HTTP status or redirect content still fails immediately. Artifact checks and wallet operations are not retried by this probe. The successful local result is retained in [web-rollout-drill.json](evidence/web-rollout-drill.json).
