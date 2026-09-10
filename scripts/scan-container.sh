#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu

if [ "$#" -gt 1 ]; then
    echo 'Usage: sh scripts/scan-container.sh [local-image]' >&2
    exit 2
fi
image=${1:-vulnseal-cipherstore:local}
scanner=aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969
# Export only the selected image. The scanner gets no Docker socket or repository mount.
image_id=$(timeout -k 5s 20s docker image inspect --format '{{.Id}}' "$image")
scan_dir=$(mktemp -d /tmp/vulnseal-image-scan.XXXXXXXX)
scan_name="vulnseal-scan-${scan_dir##*/}"
cleanup() {
    status=$?
    trap - EXIT
    set +e
    clean=1
    remaining=$(timeout -k 5s 15s docker container ls -aq --filter "name=^${scan_name}$")
    if [ "$?" -ne 0 ]; then
        clean=0
    elif [ -n "$remaining" ]; then
        ownership=$(timeout -k 5s 15s docker inspect --format '{{index .Config.Labels "vulnseal.image-scan"}} {{.State.Status}}' "$scan_name")
        if [ "$?" -ne 0 ] || [ "$ownership" = "$scan_name removing" ]; then
            clean=0
        elif [ "${ownership% *}" = "$scan_name" ]; then
            timeout -k 5s 30s docker rm --force --volumes "$scan_name" >/dev/null || clean=0
        else
            printf 'Refusing cleanup of a scanner with a different ownership label: %s\n' "$scan_name" >&2
            clean=0
        fi
    fi
    if [ "$clean" -eq 1 ]; then
        rm -f "$scan_dir/image.tar" && rmdir "$scan_dir" || clean=0
    fi
    if [ "$clean" -ne 1 ]; then
        printf 'Scanner cleanup incomplete; inspect %s. Retained private export directory: %s\n' "$scan_name" "$scan_dir" >&2
        [ "$status" -ne 0 ] || status=1
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Scanning local image %s (%s)\n' "$image" "$image_id"
timeout -k 5s 120s docker save --output "$scan_dir/image.tar" "$image_id"
timeout -k 5s 720s docker run --rm --name "$scan_name" --label "vulnseal.image-scan=$scan_name" \
    --mount "type=bind,source=$scan_dir,target=/scan,readonly" \
    --mount type=volume,source=vulnseal-trivy-cache,target=/root/.cache/trivy \
    "$scanner" image --input /scan/image.tar --scanners vuln \
    --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
    --exit-code 1 --exit-on-eol 2 --timeout 10m --format table
