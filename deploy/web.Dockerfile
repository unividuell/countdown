# build the SPA
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY webapp-vue/package.json webapp-vue/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY webapp-vue/ ./
RUN pnpm build

# serve it with Caddy (TLS + history-mode fallback + reverse proxy)
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
