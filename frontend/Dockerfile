# Build stage: Vite inlines VITE_API_URL at compile time, so it must be present
# here as a build arg rather than only in the runtime environment.
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Runtime stage: nginx serves the static bundle.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# nginx cannot read $PORT from the environment in its config, and the official
# envsubst templating would also clobber nginx's own $uri/$host variables.
# Substituting a distinctive placeholder instead keeps those intact.
CMD ["/bin/sh", "-c", "sed 's/__PORT__/'\"${PORT:-8080}\"'/' /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
