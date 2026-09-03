FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY DREAMDEX_BOT_KIT_LICENSE THIRD_PARTY_NOTICES.md ./
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/DREAMDEX_BOT_KIT_LICENSE /app/THIRD_PARTY_NOTICES.md ./

CMD ["node", "dist/src/index.js"]
