# SPDX-License-Identifier: Apache-2.0
# Source diagnostic only; this does not replace the exact-runtime Trivy gate.
# Historical standalone recipe. Current CI uses infra/web.Dockerfile --target
# source-check so the diagnostic inherits the actual runtime compiler output.
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS scanner
ENV GOTOOLCHAIN=local
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.8.0

FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125
WORKDIR /build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
COPY infra/caddy/go.mod infra/caddy/go.sum ./
RUN go mod download && go mod verify
COPY infra/caddy/main.go infra/caddy/apply-cel-compat.sh ./
RUN sed -i 's/\r$//' apply-cel-compat.sh && sh apply-cel-compat.sh
COPY --from=scanner /go/bin/govulncheck /usr/local/bin/govulncheck
ENTRYPOINT ["govulncheck", "-show", "verbose,traces"]
CMD ["./..."]
