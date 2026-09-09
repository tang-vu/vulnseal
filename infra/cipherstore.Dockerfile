# SPDX-License-Identifier: Apache-2.0
FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS build
WORKDIR /build
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY contract/package.json ./contract/package.json
COPY api/package.json ./api/package.json
COPY cipherstore/package.json cipherstore/tsconfig.json ./cipherstore/
COPY integration/package.json ./integration/package.json
COPY web/package.json ./web/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY cipherstore/src ./cipherstore/src
RUN npm run build --workspace @vulnseal/cipherstore && npm run test:run --workspace @vulnseal/cipherstore

FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
ENV NODE_ENV=production CIPHERSTORE_HOST=0.0.0.0 CIPHERSTORE_PORT=8787 CIPHERSTORE_DATA_DIR=/data
WORKDIR /app
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir /data && chown node:node /data
COPY --from=build /build/cipherstore/dist ./dist
COPY cipherstore/package.json ./package.json
COPY LICENSE ./LICENSE
COPY infra/cipherstore-healthcheck.mjs ./healthcheck.mjs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "dist/index.js"]
