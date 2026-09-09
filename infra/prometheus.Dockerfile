# SPDX-License-Identifier: Apache-2.0
# Modified upstream build; preserve the versioned UI and pin both source archives.
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS build
WORKDIR /build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOWORK=off GOMAXPROCS=2
ADD --checksum=sha256:8370fdaecc92d528e181cd263157ecd6950b0b9d965348ddb8e8d62f66a48ca6 https://codeload.github.com/prometheus/prometheus/tar.gz/d7598b7141418fa35be2b5ec5d0fefb634199610 /tmp/source.tar.gz
ADD --checksum=sha256:be18623c5891d32572998070de0d48522c966b737d9204aa41e0e88d6318e029 https://github.com/prometheus/prometheus/releases/download/v3.14.0/prometheus-web-ui-3.14.0.tar.gz /tmp/ui.tar.gz
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 && tar -xzf /tmp/ui.tar.gz -C web/ui
RUN go get golang.org/x/crypto@v0.56.0 google.golang.org/grpc@v1.83.2 && go mod verify
# Generate the same compressed asset embedding without requiring bash in the builder.
RUN cp web/ui/embed.go.tmpl web/ui/embed.go \
 && find web/ui/static -type f ! -name '*.gz' -exec gzip -n -k '{}' \; \
 && cd web/ui && find static -name '*.gz' -type f | sort | xargs echo '//go:embed' >> embed.go \
 && echo 'var EmbedFS embed.FS' >> embed.go
RUN go build -p 2 -mod=readonly -tags netgo,builtinassets -trimpath \
    -ldflags='-s -w -X github.com/prometheus/common/version.Version=3.14.0-vulnseal.1 -X github.com/prometheus/common/version.Revision=d7598b7141418fa35be2b5ec5d0fefb634199610 -X github.com/prometheus/common/version.Branch=vulnseal-dependency-patch' \
    -o /out/ ./cmd/prometheus ./cmd/promtool
RUN go list -mod=readonly -tags netgo,builtinassets -deps ./cmd/prometheus ./cmd/promtool | sort -u > /out/packages.txt

FROM scratch AS build-evidence
COPY --from=build /build/go.mod /build/go.sum /out/packages.txt /

FROM prom/prometheus@sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0
LABEL org.opencontainers.image.version="3.14.0-vulnseal.1" \
      org.opencontainers.image.description="Prometheus with VulnSeal-pinned Go dependency updates; see infra/prometheus.Dockerfile"
COPY --from=build /out/prometheus /bin/prometheus
COPY --from=build /out/promtool /bin/promtool
USER 65534:65534
