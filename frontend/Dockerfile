# Build stage: Vite inlines VITE_* vars at compile time, so they must be
# present here as build args rather than only in the runtime environment.
# NOTE: Railway injects service variables into Docker builds ONLY through
# declared ARGs — an undeclared variable silently compiles to its fallback
# (this is exactly how the credit-service URL shipped as localhost:3001).
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_CREDIT_SERVICE_URL
ENV VITE_CREDIT_SERVICE_URL=$VITE_CREDIT_SERVICE_URL
ARG VITE_TELEGRAM_API_URL
ENV VITE_TELEGRAM_API_URL=$VITE_TELEGRAM_API_URL
RUN npm run build

# Runtime stage: nginx serves the static bundle.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# nginx cannot read $PORT from the environment in its config, and the official
# envsubst templating would also clobber nginx's own $uri/$host variables.
# Substituting a distinctive placeholder instead keeps those intact.
CMD ["/bin/sh", "-c", "sed 's/__PORT__/'\"${PORT:-8080}\"'/' /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
