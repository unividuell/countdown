# Frontend Foundation + Auth — Vue SPA

**Status:** Approved design (2026-06-12)
**Location:** new `webapp-vue/` directory (sibling to `core/`)

## Purpose

First frontend sub-project for `countdown.unividuell.org`: stand up a Vue SPA
foundation and wire it to the existing `core` Spring backend's GitHub OAuth2
login, so we have a running, tested shell that authenticates a user and shows
their profile. The rest of the source app (games, charts, audio, canvas, admin)
is ported later as separate sub-projects.

## Context

We are porting `huettehuette.unividuell.org` (Nuxt 4 + SSR + Firebase/vuefire +
Pinia + ECharts + game libs) to a leaner stack. **Deliberate goal: keep the set
of moving runtime npm libraries small** — Firebase was the worst offender and is
gone (auth now lives in our Spring backend). This sub-project establishes the
foundation only.

The backend (`iam` module) already provides the same-origin SPA contract this
frontend targets: GitHub OAuth2 login at `/oauth2/authorization/github`, session
cookie, `401` (not redirect) for unauthenticated API calls, cookie-based CSRF
(`XSRF-TOKEN` → `X-XSRF-TOKEN`), `GET/PATCH /api/me`, `POST /logout` → 204. See
`docs/superpowers/specs/2026-06-12-user-management-github-login-design.md`.

## Decisions

| Topic | Decision |
|---|---|
| Folder | `webapp-vue/` (sibling to `core/`); the `-vue` suffix leaves room for future `webapp-<tech>` alternatives. |
| Build tool | **Vite 8** (Rolldown-based; stable since 2026-03). Note `build.rolldownOptions` (not `rollupOptions`). |
| Framework | **Vue 3**, Composition API, `<script setup lang="ts">`. |
| Language | **TypeScript, very strict** (see below). |
| Routing | **Vue Router 5** built-in file-based routing (`vue-router/vite` plugin + `vue-router/auto-routes`). `unplugin-vue-router` is archived/absorbed into core — one fewer dependency. |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` (CSS-first config). |
| State | **Composables + VueUse** — no Pinia for now (add later only if state genuinely needs it). |
| HTTP | Native **fetch** via a thin `apiFetch` wrapper. No axios. |
| Package manager | **pnpm**. |
| Lint/format | **ESLint** (flat config, `@vue/eslint-config-typescript` + `eslint-plugin-vue`) + **Prettier**. Dev-only. |
| Tests | **Vitest + Vue Test Utils + happy-dom**, unit level. Mocks via Vitest `vi` (frontend convention; mockk/kotest are Kotlin-only). |
| Auth integration | **Approach A**: eager session bootstrap + global route guard (below). |
| Prod serving | **Deferred** to a later deployment sub-project (same-origin via reverse proxy or backend-served static build). Foundation only needs the dev proxy. |

### TypeScript strictness

`strict: true` plus: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`. `moduleResolution: "bundler"`.
`typed-router.d.ts` and `vite/client` referenced in tsconfig/env types.

## Architecture

### Directory layout (`webapp-vue/`)

```
webapp-vue/
  index.html
  package.json            # pnpm; vue, vue-router(5), @vueuse/core (runtime)
  vite.config.ts          # VueRouter() before vue(); tailwind; dev proxy
  tsconfig.json           # strict + extras; includes typed-router.d.ts
  eslint.config.ts        # flat config
  .prettierrc.json
  src/
    main.ts               # createApp; install router; bootstrap auth; mount
    App.vue               # shell: header + <RouterView> + footer
    pages/                # file-based routes
      index.vue           # authenticated landing — shows current user
      login.vue           # "Login with GitHub" button
    auth/
      useAuth.ts          # reactive session state + actions
      guard.ts            # global beforeEach guard
    api/
      client.ts           # apiFetch wrapper (fetch + credentials + CSRF + 401)
      types.ts            # MeResponse, UpdateProfileRequest (mirror backend DTOs)
    assets/
      main.css            # tailwind entry
  test/ (or *.spec.ts colocated)
```

### Routing (Vue Router 5, file-based)

- `vite.config.ts`: `VueRouter()` plugin **before** `vue()`. Routes come from
  `vue-router/auto-routes`; `createRouter({ history: createWebHistory(), routes })`.
- `src/pages/index.vue` → `/` (auth-required), `src/pages/login.vue` → `/login`
  (public). Auth requirement expressed via route `meta` (e.g. a convention:
  everything requires auth except `/login`, enforced in the guard).

### Auth (Approach A)

`src/auth/useAuth.ts` — a module-level reactive singleton:
- State: `user: Ref<MeResponse | null>`, `status: Ref<'unknown' | 'authenticated' | 'anonymous'>`.
- `bootstrap()`: calls `GET /api/me` once; `200` → `user` + `authenticated`;
  `401` → `anonymous`. Called from `main.ts` before mount (render a minimal
  splash while `status === 'unknown'` if needed).
- `loginWithGitHub()`: **full-page** navigation `window.location.assign('/oauth2/authorization/github')`
  (OAuth needs a real navigation, not fetch). After the round-trip the backend
  returns to the app, which re-bootstraps.
- `logout()`: `POST /logout` (with CSRF) → reset state → route to `/login`.

`src/auth/guard.ts` — `router.beforeEach`: if the target route requires auth and
`status === 'anonymous'`, redirect to `/login`; if `authenticated` and on
`/login`, redirect to `/`.

### API client

`src/api/client.ts` — `apiFetch(path, options)` around native fetch:
- `credentials: 'include'` (send the session cookie).
- For mutating methods (POST/PATCH/PUT/DELETE): read the `XSRF-TOKEN` cookie and
  set the `X-XSRF-TOKEN` header.
- JSON request/response handling; throws a typed `ApiError` on non-2xx.
- On `401`: set `useAuth` to `anonymous` and redirect to `/login` (single global
  place that reacts to session expiry).

`src/api/types.ts` mirrors the backend DTOs:
```ts
interface MeResponse {
  id: string; username: string; githubLogin: string; githubName: string | null;
  email: string | null; bgColorHex: string | null; isSuperAdmin: boolean;
  createdAt: string | null;
}
interface UpdateProfileRequest { displayName: string | null; bgColorHex: string | null }
```
(`UpdateProfileRequest` is defined for readiness; the profile-edit UI is out of scope.)

### App shell

`App.vue`: a header (app name; when authenticated, the user's `username` + a
logout action), `<RouterView />`, and a footer. Tailwind utility classes; no
dark-mode library in this scope.

### Dev setup (same-origin locally)

`vite.config.ts` `server.proxy` forwards `/api`, `/oauth2`, `/login`, `/logout`
to the backend (`http://localhost:8080` by default, overridable via a
`VITE_*` env var), with `changeOrigin` and cookie rewriting so the session cookie
and CSRF flow work same-origin during development.

## Testing (unit)

Vitest + Vue Test Utils + happy-dom. Cover:
- `apiFetch`: injects `X-XSRF-TOKEN` from the cookie on mutating requests, sets
  `credentials: 'include'`, parses JSON, throws `ApiError` on non-2xx, triggers
  the 401 → anonymous/redirect path. `fetch` mocked via `vi.stubGlobal`.
- `useAuth`: `bootstrap()` sets `authenticated` + user from a mocked `GET /api/me`;
  `401` sets `anonymous`; `logout()` resets state.
- A light mount of `login.vue`: renders the GitHub button; clicking it invokes
  `loginWithGitHub` (the `window.location.assign` call stubbed).

## Out of scope (YAGNI / later sub-projects)

- All mini-games, ECharts charts, audio (tone), canvas (roughjs), the admin area.
- Pinia, dark mode, i18n, an icon library.
- Profile-edit UI (`PATCH /api/me`) — types are prepared, UI comes later.
- Production build/serving + deployment (separate sub-project).
- E2E / browser-mode component tests (can be added on top of Vitest later).
