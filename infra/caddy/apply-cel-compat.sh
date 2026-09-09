#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
# Backport the two NewCall argument types used by current upstream Caddy.
# Keep the release source pinned and fail if its expected contents change.
target=/go/pkg/mod/github.com/caddyserver/caddy/v2@v2.11.4/modules/caddyhttp/celmatcher.go
printf '%s  %s\n' e0fb48fde80ea23f7810e0e7f3fb2998032a6bea052deedaaeb02881d6c8cc6b "$target" | sha256sum -c -
test "$(grep -Fc '[]interpreter.Interpretable{reqAttr}' "$target")" = 2
sed -i 's/\[\]interpreter.Interpretable{reqAttr}/[]interpreter.InterpretableV2{reqAttr}/g' "$target"
