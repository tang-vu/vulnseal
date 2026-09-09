# SPDX-License-Identifier: Apache-2.0
FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS build
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
RUN npm run build --workspace @vulnseal/cipherstore

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
ENV NODE_ENV=production CIPHERSTORE_HOST=0.0.0.0 CIPHERSTORE_PORT=8787 CIPHERSTORE_DATA_DIR=/data
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build /build/cipherstore/dist ./dist
COPY cipherstore/package.json ./package.json
COPY LICENSE ./LICENSE
COPY infra/cipherstore-healthcheck.mjs ./healthcheck.mjs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "dist/index.js"]
