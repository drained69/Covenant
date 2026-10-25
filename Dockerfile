# Covenant credit service image for Railway's repository-root service.
#
# covenant-api builds from `/`, so this file (not offchain/Dockerfile) is what
# `railway up` selects. covenant-web builds from /frontend and never sees it.
FROM node:20-slim

WORKDIR /app/offchain

COPY offchain/package.json offchain/package-lock.json ./
RUN npm ci --omit=dev

COPY offchain/credit-service.mjs ./credit-service.mjs
COPY deployments/mezo-testnet.json ./mezo-testnet.json

ENV MANIFEST=./mezo-testnet.json

CMD ["node", "credit-service.mjs"]
