# build the SPA
FROM node:24-trixie-slim AS build
RUN corepack enable
WORKDIR /app
COPY webapp-vue/package.json webapp-vue/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY webapp-vue/ ./
RUN pnpm build

# /etc/mime.types: Go's built-in table lacks e.g. .mp3, .m4a
FROM debian:trixie-slim AS mime
RUN apt-get update && apt-get install -y --no-install-recommends media-types

# serve it with Caddy (TLS + history-mode fallback + reverse proxy).
# Official Caddy images are Alpine-only; take their static binary, mirror their config.
FROM gcr.io/distroless/static-debian13
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY --from=mime /etc/mime.types /etc/mime.types
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
WORKDIR /srv
EXPOSE 80 443 443/udp 2019
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
