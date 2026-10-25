# Covenant credit service — credit-service.mjs (Node only).
#
# For a Railway service rooted at offchain/. The repo-root deployments/ file
# the service defaults to (../deployments/mezo-testnet.json) is outside this
# build context, so the manifest is mirrored here and pointed at via MANIFEST.
FROM node:20-slim

WORKDIR /app

# Dependency manifests first so layer caching survives source edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY credit-service.mjs ./
COPY mezo-testnet.json ./mezo-testnet.json

ENV MANIFEST=./mezo-testnet.json

CMD ["node", "credit-service.mjs"]
