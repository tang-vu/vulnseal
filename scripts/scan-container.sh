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
image_id=$(docker image inspect --format '{{.Id}}' "$image")
scan_dir=$(mktemp -d /tmp/vulnseal-image-scan.XXXXXXXX)
cleanup() {
    rm -f "$scan_dir/image.tar"
    rmdir "$scan_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Scanning local image %s (%s)\n' "$image" "$image_id"
docker save --output "$scan_dir/image.tar" "$image_id"
docker run --rm \
    --mount "type=bind,source=$scan_dir,target=/scan,readonly" \
    --mount type=volume,source=vulnseal-trivy-cache,target=/root/.cache/trivy \
    "$scanner" image --input /scan/image.tar --scanners vuln \
    --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
    --exit-code 1 --exit-on-eol 2 --timeout 10m --format table
