# SPDX-License-Identifier: Apache-2.0
# Diagnostic tool only; not a production runtime or a replacement for Trivy.
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125
ENV GOTOOLCHAIN=local
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.8.0
ENTRYPOINT ["/go/bin/govulncheck"]
