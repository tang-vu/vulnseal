#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
for release_id in "${WEB_RELEASE_A:-}" "${WEB_RELEASE_B:-}"; do
  case "$release_id" in
    ''|*[!a-zA-Z0-9_-]*) echo "Release IDs must contain only letters, digits, underscores and hyphens" >&2; exit 1 ;;
  esac
  [ "${#release_id}" -le 64 ] || { echo "Release ID exceeds 64 characters" >&2; exit 1; }
done
[ "$WEB_RELEASE_A" != "$WEB_RELEASE_B" ] || { echo "Release IDs must differ" >&2; exit 1; }
case "${WEB_ACTIVE_RELEASE:-}" in
  "$WEB_RELEASE_A") export WEB_ACTIVE_UPSTREAM=release-a:8080 ;;
  "$WEB_RELEASE_B") export WEB_ACTIVE_UPSTREAM=release-b:8080 ;;
  *) echo "Active release must match a retained release" >&2; exit 1 ;;
esac
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
