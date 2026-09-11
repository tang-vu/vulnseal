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

FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS caddy-build
WORKDIR /build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
COPY infra/caddy/go.mod infra/caddy/go.sum ./
RUN go mod download && go mod verify
COPY infra/caddy/main.go infra/caddy/apply-cel-compat.sh ./
RUN sed -i 's/\r$//' apply-cel-compat.sh && sh apply-cel-compat.sh
RUN go test -mod=readonly github.com/caddyserver/caddy/v2/modules/caddyhttp -run 'TestCEL|TestMatchExpression' -count=1
RUN go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/caddy .

# Optional diagnostic target inherits the exact runtime compiler output and inputs.
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS govulncheck
ENV GOTOOLCHAIN=local
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.8.0

FROM caddy-build AS source-check
COPY --from=govulncheck /go/bin/govulncheck /usr/local/bin/govulncheck
RUN go list -mod=readonly -deps . > /out/caddy-packages.txt
ENTRYPOINT ["govulncheck", "-show", "verbose,traces"]
CMD ["./..."]

FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
RUN apk add --no-cache c-ares=1.34.8-r0 curl=8.22.0-r0 libcurl=8.22.0-r0 libcrypto3=3.5.8-r0 libssl3=3.5.8-r0
# The replacement binary has no file capability; port 8080 needs none.
COPY --from=caddy-build /out/caddy /usr/bin/caddy
COPY --from=gate /workspace/web/dist /srv
COPY infra/web.Caddyfile /etc/caddy/Caddyfile
USER 65532:65532
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
