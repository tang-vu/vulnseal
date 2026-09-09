# SPDX-License-Identifier: Apache-2.0
# Compile/build on the host first; validate the exact copied artifact inside the image build.
FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS gate
WORKDIR /workspace
COPY scripts/check-web-release.mjs ./scripts/check-web-release.mjs
COPY contract/src/vulnseal.compact ./contract/src/vulnseal.compact
COPY contract/src/managed/vulnseal/compiler/contract-info.json ./contract/src/managed/vulnseal/compiler/contract-info.json
COPY contract/src/managed/vulnseal/keys ./contract/src/managed/vulnseal/keys
COPY contract/src/managed/vulnseal/zkir ./contract/src/managed/vulnseal/zkir
COPY web/dist ./web/dist
RUN test -s web/dist/release-manifest.json && node scripts/check-web-release.mjs

FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
# Port 8080 needs no file capability; upstream's binding capability prevents exec with cap_drop ALL.
RUN setcap -r /usr/bin/caddy
COPY --from=gate /workspace/web/dist /srv
COPY infra/web.Caddyfile /etc/caddy/Caddyfile
USER 65532:65532
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
