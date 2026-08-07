# Deployment — edge, TLS & the SPA/API router

Everything HTTP-facing: the two Caddys, how a request reaches `core`, and the
forwarded-header chain that makes OAuth work. Sibling: [deployment.md](deployment.md)
(images, CI, the stacks, ops).

## Two Caddys, one chain

A request crosses **edge-caddy → countdown-web → core**.

- **`edge-caddy`** is a separate project (`unividuell/edge-caddy`, its own guideline: shared-edge).
  This server hosts several `unividuell.org` sites and only one process can bind 80/443, so TLS and
  host-based routing live there. It routes `countdown.unividuell.org` → `countdown-web:80` and
  `beta.countdown.unividuell.org` → `countdown-staging-web:80` (staging logs in via the test-user
  picker — see [security-and-auth.md](security-and-auth.md); there is no separate staging GitHub
  OAuth App).
- **`countdown-web`'s Caddy** is baked into the image and is the SPA+API router. It listens on plain
  **`:80`** — the Caddyfile address is `:80`, **not** the domain — and does no TLS. The same image
  runs both stacks, told apart by `container_name` (`countdown-web` / `countdown-staging-web`).
- countdown **publishes no host ports**. `countdown-web` joins the external **`edge`** network under
  a stable `container_name`, plus an `internal` network for `core`/`postgres`.

## Routing inside `countdown-web`

Serve the SPA with HTML5 history-mode fallback and reverse-proxy `/api`, `/oauth2`, `/login`
(incl. `/login/github`) and `/logout` to `core:8080`.

- **Use two mutually-exclusive `handle` blocks** —
  `handle @backend { reverse_proxy core:8080 }` then `handle { root; try_files {path} /index.html; file_server }`.
  A bare `reverse_proxy @backend` plus a catch-all `handle` compiles the SPA `file_server` *first*
  (it matches everything, including `/api/*`), so API requests 404 into `index.html` instead of
  proxying. Verify route order with `caddy adapt`.
- **Exact-path matcher gotcha:** `path /logout/*` (slash before `*`) matches `/logout/` and
  `/logout/x` but **not** the bare `/logout`. The SPA POSTs to exactly `/logout`, so list it exact
  *and* as `/logout/*`. **Do the opposite for `/login`:** `/login` is the SPA's sign-in *page*, so
  listing it exact in `@backend` proxies it to core (→ 401, page unreachable on a direct URL or
  refresh); only its sub-paths are backend. The matcher is therefore
  `path /api/* /oauth2/* /login/* /logout /logout/*`. Only shows up in prod/staging — dev reaches
  the backend directly through the Vite proxy, which needs the same split (see
  [frontend.md](frontend.md)).

## Cache headers are the Caddyfile's job

`file_server` sets **no `Cache-Control` at all** — it sends `ETag`/`Last-Modified` but no freshness,
which is exactly the case RFC 9111 §4.2.2 hands to the browser's *heuristic* freshness. The cached
`index.html` is then reused **without revalidating**, and since it names the old content-hashed
assets, a tab open across a deploy keeps the entire old app until a hard reload (issue #15; a
full-page OAuth navigation does not help — navigations come from the HTTP cache like anything else).
Vite cannot fix this: it hashes `/assets/*` but cannot set HTTP headers, and
`<meta http-equiv="Cache-Control">` is ignored for HTTP caching.

So, same two-block idiom as `@backend`:
`handle /assets/* { header Cache-Control "public, max-age=31536000, immutable"; file_server }`,
then the catch-all with `header Cache-Control "no-cache"` + `try_files`.

- **Two blocks rather than `@assets`/`@html` matchers in one block**, deliberately: one header per
  block makes a double header structurally impossible.
- **No `try_files` in the assets block, on purpose.** A missing hashed asset must `404` — a fallback
  would serve `index.html` under an asset URL carrying `immutable`, pinning an HTML document there
  for a year.
- `no-cache` means "revalidate before use", not "don't store" → a cheap `304`.
- `caddy adapt` confirms Caddy orders the `headers` handler **before** `rewrite`, so the deep-link
  fallback (`/countdowns/42` → `/index.html`) still carries `no-cache`. Verify against a **real
  response**, not just the config: `curl -sSI` both a page and an asset. Locally, build
  `caddy:2-alpine` + the repo Caddyfile + a fake `dist` into a throwaway image and curl that — no
  bind mounts (see the Docker Desktop gotcha in [deployment.md](deployment.md)).

## `X-Forwarded-*` across the two hops

`core` sets `server.forward-headers-strategy=framework` so it builds correct `https://<domain>/...`
URLs (OAuth `redirect_uri`) and marks cookies `Secure`. That only works if the scheme survives both
hops — and by default it does **not**.

The inner `countdown-web` Caddy receives the edge hop on plaintext `:80` and **overwrites**
`X-Forwarded-Proto` with `http`, so `core` builds an `http://` `redirect_uri`, which GitHub rejects
(and which would be insecure anyway). Fix it in `countdown-web`'s Caddyfile with a global
`servers { trusted_proxies static private_ranges }` block: the edge reaches it over the private
`edge` network, so trusting private ranges makes Caddy **preserve** the edge's
`X-Forwarded-Proto=https` and `-Host`.

That Caddyfile is baked into the image, so changing it needs a `build-web` rebuild plus
`docker compose pull && up -d` on the server.
