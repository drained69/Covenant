# server.py is a Python process that shells out to `node sign_offer.js` (server.py:113),
# so this image needs both runtimes. Copying Node out of the official image avoids an
# apt/nodesource layer.
FROM node:20-slim AS node

FROM python:3.13-slim

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

WORKDIR /app

# Dependency manifests first so layer caching survives source edits.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# server.py reads PORT (Railway-injected) before falling back to API_PORT.
CMD ["python", "server.py"]
