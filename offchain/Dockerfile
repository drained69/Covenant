# Covenant Somnia credit service — somnia-service.mjs (Node only).
#
# The image previously ran server.py (the retired compliance API),
# so the production frontend's calls to /api/ethos-score and /api/offer 404'd.
# The Somnia service is pure Node (ethers + the http module); no Python runtime
# is needed anymore.
FROM node:20-slim

WORKDIR /app

# Dependency manifests first so layer caching survives source edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Service source + the deployment manifest. The Railway service builds from
# this directory as its root, so the repo-root deployments/ file the service
# defaults to (../deployments/somnia-testnet.json) is OUT of the build context
# — the manifest is mirrored here at build time and pointed at via MANIFEST.
COPY somnia-service.mjs ./
COPY somnia-testnet.json ./somnia-testnet.json

ENV MANIFEST=./somnia-testnet.json

CMD ["node", "somnia-service.mjs"]
