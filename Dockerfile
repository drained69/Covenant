# Covenant service image for Railway's repository-root services.
#
# Both covenant-api and covenant-telegram-bot currently build from `/`, so a
# service-local Dockerfile is not selected by `railway up`. Keep one image that
# contains both workers and choose the process at runtime using Railway's
# injected RAILWAY_SERVICE_NAME. covenant-web builds from /frontend and never
# sees this file.
FROM node:20-slim

WORKDIR /app

COPY offchain/package.json offchain/package-lock.json ./
RUN mkdir -p /app/offchain && mv package.json package-lock.json /app/offchain/ \
  && cd /app/offchain && npm ci --omit=dev

COPY telegram-bot/package.json telegram-bot/package-lock.json ./
RUN mkdir -p /app/telegram-bot && mv package.json package-lock.json /app/telegram-bot/ \
  && cd /app/telegram-bot && npm ci

COPY offchain/somnia-service.mjs ./offchain/somnia-service.mjs
COPY deployments/somnia-testnet.json ./offchain/somnia-testnet.json
COPY telegram-bot ./telegram-bot

ENV MANIFEST=./somnia-testnet.json

CMD ["/bin/sh", "-c", "if [ \"$RAILWAY_SERVICE_NAME\" = \"covenant-telegram-bot\" ]; then cd /app/telegram-bot && npm start; else cd /app/offchain && node somnia-service.mjs; fi"]
