# webapp-vue

Vue 3 SPA frontend for countdown.unividuell.org. Talks to the `core` Spring
backend (GitHub OAuth2 login, session cookie, CSRF) same-origin.

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:5173 ; proxies /api,/oauth2,/login,/logout to the backend
```

Run the backend (`core`) on :8080 first (see `core/README.md`). Override the
proxy target with `VITE_API_PROXY_TARGET` if the backend runs elsewhere. Visit
`/` → redirected to `/login` → "Login with GitHub" → back to `/` showing your
profile.

**GitHub OAuth App (dev):** the browser only ever talks to the SPA origin; the
Vite proxy forwards to the backend transparently (`changeOrigin: false`), so the
backend builds OAuth URLs on the SPA origin. Set the OAuth App's **Authorization
callback URL** to `http://localhost:5173/login/oauth2/code/github` (the SPA origin,
**not** `:8080`) — otherwise GitHub sends you to `:8080` after login and you land
on the backend's raw JSON instead of the app.

## Scripts

- `pnpm test` — unit tests (Vitest + Vue Test Utils + happy-dom)
- `pnpm typecheck` — strict `vue-tsc`
- `pnpm lint` / `pnpm format` — ESLint (flat) / Prettier
- `pnpm build` — type-check + production build

## Stack

Vite 8 · Vue 3 (Composition API) · TypeScript (strict) · Vue Router 5 (file-based
routing) · Tailwind CSS v4 · VueUse · native fetch. State via composables (no Pinia).
