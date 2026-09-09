# SPDX-License-Identifier: Apache-2.0
FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648
RUN setcap -r /usr/bin/caddy
COPY infra/web-rollout.Caddyfile /etc/caddy/Caddyfile
COPY infra/web-rollout-start.sh /usr/local/bin/web-rollout-start.sh
# Windows checkouts can supply CRLF; normalize the copied script inside the image.
RUN sed -i 's/\r$//' /usr/local/bin/web-rollout-start.sh && chmod 755 /usr/local/bin/web-rollout-start.sh
USER 65532:65532
RUN WEB_RELEASE_A=sample-a WEB_RELEASE_B=sample-b WEB_ACTIVE_UPSTREAM=release-a:8080 WEB_ACTIVE_RELEASE=sample-a caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["/bin/sh", "/usr/local/bin/web-rollout-start.sh"]
