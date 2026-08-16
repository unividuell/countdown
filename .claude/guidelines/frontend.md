# Frontend (webapp-vue)

Conventions for the `webapp-vue/` Vue SPA. **Deliberate goal: keep the set of
moving runtime npm libraries small** (Firebase was the worst offender in the
source app and is gone). The auth/session foundation is the reference
implementation.

This file holds the stack, the HTTP/auth contract and the tooling gates. The rest
of the frontend conventions live beside it:

| File | Covers |
|---|---|
| [frontend-ui.md](frontend-ui.md) | Mobile-first, sizing traps, accessibility |
| [frontend-routing.md](frontend-routing.md) | Routes, guard-owned navigation data, the `[slug]` shell, role gating |
| [frontend-state.md](frontend-state.md) | Composables (no Pinia), the shared clock, server-authoritative ticking |
| [frontend-testing.md](frontend-testing.md) | Vitest, @vue/test-utils, happy-dom limits, doubles |

## Stack

- **Vite 8** (Rolldown-based). Note: build options are `build.rolldownOptions`, not `rollupOptions`.
- **Vue 3**, Composition API, `<script setup lang="ts">`. **pnpm**.
- **TypeScript, very strict**: `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; `moduleResolution: "bundler"`. (TypeScript 6 deprecated `baseUrl` used only for path mapping — we keep the `@/*`→`src/*` alias with `"ignoreDeprecations": "6.0"` until a paths-only migration.) **Stay on the `~6.0.x` line — TypeScript 7 breaks `vue-tsc`**; see [dependency-updates.md](dependency-updates.md).
  - **`exactOptionalPropertyTypes` + optional body fields:** never pass `prop: x || undefined`.
    Build a partial request body with explicit conditional assignment instead —
    `const body: Partial<{ name: string; startsAt: string }> = { name: name.value.trim() }`,
    then `if (startsAt.value) body.startsAt = startsAt.value`.
- **Tailwind CSS v4** via `@tailwindcss/vite` (CSS-first: `@import 'tailwindcss';`). No dark-mode lib unless needed.
- **Date/time: Luxon** (`luxon` + `@types/luxon`) — the project's date-time lib (also used by the
  origin huettehuette app). Don't reach for native `Date` math. For a wall-clock UI field use
  `<input type="datetime-local">` (combined date+time picker, naive string, no tz) and convert
  with Luxon **in the relevant IANA zone** (pass `{ zone }`, do NOT rely on the browser zone):
  instant→input `DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")`,
  input→instant `DateTime.fromISO(local, { zone }).toUTC().toISO()` (returns `string | null` under
  strict TS — guard it). See the **Zone-relative time entry** note in [frontend-state.md](frontend-state.md).
- **Icons: Lucide, bundled at build time** — `unplugin-icons` + `@iconify-json/lucide`, both
  **devDependencies**; import as `~icons/lucide/<name>`. Deliberately *not* `@iconify/vue` (the
  origin huettehuette app's choice): its `<Icon>` resolves icon data at runtime from
  `api.iconify.design`, i.e. an external request from every user's browser plus visible pop-in.
  Register as `Icons({ compiler: 'vue3', scale: 1 })` — the explicit `scale: 1` matters, since the
  plugin defaults to `1.2` and would silently break the "1em, inherits from the surrounding text"
  contract; size icons purely with Tailwind (`class="size-5"`). `vue-tsc` needs
  `/// <reference types="unplugin-icons/types/vue" />` in `env.d.ts`.

## HTTP + auth (the same-origin SPA contract)

The backend (`iam`) serves a same-origin SPA contract: session cookie, `401` (not redirect) for unauthenticated API, cookie CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`).

- **`apiFetch`** (`src/api/client.ts`) wraps native **fetch**: `credentials: 'include'`; adds `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie on **mutating** methods only; JSON-only (body typed `string | null`); throws a typed `ApiError(status, message, body?)` on non-2xx **and on a non-JSON 200** (catches proxy/error pages); on `401` invokes a globally-registered handler then throws. The 401 handler is injected via `setUnauthorizedHandler(...)` to decouple the client from the router/auth (avoids a circular import).
- **`apiFetch` request timeout:** every call gets a 10s `AbortSignal.timeout(...)` so a *hung*
  request (vs. a failed one) can't hang a caller forever — 10s tolerates normal latency and a cold
  single-instance backend while still bounding a stuck navigation guard or `bootstrap()` to a
  UX-relevant time. A caller-supplied `signal` is composed in via `AbortSignal.any([...])` rather
  than replaced; both `.timeout` and `.any` are Baseline-widely-available, which is safe here since
  the project targets only evergreen browsers. A timeout surfaces as `ApiError(0, ...)` —
  status `0` = no HTTP response was ever received, the convention `XMLHttpRequest.status` uses for
  network-level failures, whereas `504` would wrongly imply a server responded. A caller's own
  abort is deliberately **not** wrapped: it rethrows the native `AbortError` as-is (checked via
  `options.signal?.aborted` before the timeout check), so a deliberate cancel is never misreported
  as a server timeout.
- **`useAuth`** (`src/auth/useAuth.ts`): eager `bootstrap()` (`GET /api/me`) resolves the session **before the app mounts** (so the guard never sees `'unknown'`); `loginWithGitHub()` does a **full-page navigation** `window.location.assign('/login/github')` (the server redirects on to `/oauth2/authorization/github` or the test-user picker, by profile — see [security-and-auth.md](security-and-auth.md); OAuth needs a real navigation, not fetch); `logout()` POSTs `/logout` then resets — it intentionally does NOT reset local state if the server call fails (session may still be alive).
- **Route guard** (`src/auth/guard.ts`): **fail-closed** — only `status === 'authenticated'` may enter a non-public route; everything else redirects to `/login`. Routes are auth-required unless they set `meta.public = true`. The redirect target `/login` **must** be `meta.public` or anonymous users loop.
- **Dev proxy:** Vite `server.proxy` forwards `/api`, `/oauth2`, `/login/`, `/logout` to the backend (prefixes live in `webapp-vue/dev-proxy.ts`, target `VITE_API_PROXY_TARGET`, default `http://localhost:8080`) so same-origin holds locally.
  - **A string proxy key is a plain prefix** (`url.startsWith(key)`) — so **`/login/` needs its trailing slash**: `/login` itself is the SPA's sign-in *page*, only its sub-paths (`/login/github`, `/login/oauth2/code/*`) are backend. Without the slash, a direct load of `http://localhost:5173/login` is proxied away and never reaches the router (prod is unaffected — the edge already scopes it to `path /login/*`, see `deploy/Caddyfile`). Keep dev and the edge in sync; `src/__tests__/dev-proxy.spec.ts` guards the split.
  - **Use `changeOrigin: false`** (transparent proxy): the backend must see the browser's `Host` (`localhost:5173`) so it builds OAuth2 `redirect_uri` + post-login redirects on the SPA origin. With `changeOrigin: true` the backend sees `:8080`, GitHub redirects the browser to `:8080`, and the user lands on the backend (raw JSON / `/error`) instead of the SPA after login. The **GitHub OAuth App callback must be the SPA origin** in dev: `http://localhost:5173/login/oauth2/code/github`.
- **UX:** surface API failures to the user; never leave a promise rejection unhandled in a click handler; log bootstrap failures rather than swallowing them.
- **An optional number renders on presence, never on truthiness.** `v-if="points.live"` swallows a
  `0` that the server sent on purpose, and no strict-TS setting catches it — the attribute reads
  correctly. Test on `=== undefined`, and where the value carries a qualifier („may still change“),
  give it a **nested object** rather than a sibling field: `live?: { points, provisional }` makes
  presence structural and the illegal pair unbuildable on both sides of the wire.

## Lint / format

- **ESLint flat config** in `eslint.config.mjs` (ESLint 10 needs an extra flag to load a `.ts` config, so use `.mjs`) + **Prettier**.
- Disable `vue/multi-word-component-names` for `src/pages/**` — file-based route components are idiomatically single-word (`index.vue`, `login.vue`).
- **Tailwind v4 scans source text, so a class name must appear literally.** A computed
  `` `w-[${pct}%]` `` is never generated — no rule ends up in the CSS and the element simply has no
  width. Where a value varies, map it to literal class strings
  (`if (n <= 2) return 'w-[72%]'`), as `communities/fallbacks/CountdownCard.vue` does for the
  hero width.

## Typecheck must be `vue-tsc -b` — `--noEmit` checks nothing here

`tsconfig.json` is a **solution file**: `"files": []` plus project references. `vue-tsc --noEmit` on
it therefore type-checks **zero files** and always exits 0 — which is how the CI gate in
`build-web.yml` once passed vacuously while the image build failed. Use **`vue-tsc -b`** (build mode
walks the references; ~1000 files). If you ever change the script, verify it with a deliberate type
error rather than trusting a green run.

Three projects, deliberately:

| Project | Checks | Why separate |
|---|---|---|
| `tsconfig.app.json` | `src/**` **minus** tests | App code must NOT get `@types/node` — `process.env` would typecheck and then fail in the browser |
| `tsconfig.vitest.json` | `src/**/__tests__/**` | Tests run in Node and legitimately use `node:fs` (e.g. reading `shared/rng/golden-vectors.json`) |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs` | Config files are Node, not browser |

