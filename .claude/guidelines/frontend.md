# Frontend (webapp-vue)

Conventions for the `webapp-vue/` Vue SPA. **Deliberate goal: keep the set of
moving runtime npm libraries small** (Firebase was the worst offender in the
source app and is gone). The auth/session foundation is the reference
implementation.

## Stack

- **Vite 8** (Rolldown-based). Note: build options are `build.rolldownOptions`, not `rollupOptions`.
- **Vue 3**, Composition API, `<script setup lang="ts">`. **pnpm**.
- **TypeScript, very strict**: `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; `moduleResolution: "bundler"`. (TypeScript 6 deprecated `baseUrl` used only for path mapping — we keep the `@/*`→`src/*` alias with `"ignoreDeprecations": "6.0"` until a paths-only migration.)
- **Tailwind CSS v4** via `@tailwindcss/vite` (CSS-first: `@import 'tailwindcss';`). No dark-mode lib unless needed.
- **Date/time: Luxon** (`luxon` + `@types/luxon`) — the project's date-time lib (also used by the
  origin huettehuette app). Don't reach for native `Date` math. For a wall-clock UI field use
  `<input type="datetime-local">` (combined date+time picker, browser-local, no tz) and convert
  with Luxon in the browser's zone: instant→input `DateTime.fromISO(iso).toFormat("yyyy-MM-dd'T'HH:mm")`,
  input→instant `DateTime.fromISO(local).toUTC().toISO()` (returns `string | null` under strict TS — guard it).

## Routing — Vue Router 5 built-in file-based routing

`unplugin-vue-router` is **archived/absorbed into Vue Router 5 core** — use the built-in:
- `import VueRouter from 'vue-router/vite'` as a Vite plugin, placed **before** `vue()`.
- `import { routes } from 'vue-router/auto-routes'`; pages live in `src/pages/` (`index.vue`, `[id].vue`, …).
- The plugin generates `typed-router.d.ts` (committed; the plugin recommends committing it). Add it to `tsconfig`.
- Per-route meta via the **`definePage({ meta: { ... } })`** macro (compile-time; the call vanishes in the build).
- **Gotcha:** `definePage` is a build-time macro processed by the VueRouter plugin. Unit tests run Vitest with only `@vitejs/plugin-vue` (not the VueRouter plugin), so stub it in a setup file: `globalThis.definePage = (r) => r` (mirrors `vue-router/experimental`'s runtime no-op).
- **Typed route params (strict TS):** Use the typed `useRoute('/[slug]')` overload (the route name string from `typed-router.d.ts`) rather than plain `useRoute()`. Plain `useRoute()` returns a union of all routes; accessing `.params.slug` on it fails under `strict` + vue-tsc. Dynamic-segment pages (`[slug].vue`, `[slug]/members.vue`, etc.) all need the specific route name. See also `multi-tenancy.md`.

## State — composables + VueUse (no Pinia)

App-global state (e.g. the session) is a module-level singleton: module-scope `ref`s exposed `readonly()` from a composable, mutated only through the composable's functions. Rationale: minimal moving libs; add Pinia later only if state genuinely outgrows this. For unit tests, expose a small `_resetAuthState()` hook to reset the singleton between cases (module state is per-file, not per-test, in Vitest).

## HTTP + auth (the same-origin SPA contract)

The backend (`iam`) serves a same-origin SPA contract: session cookie, `401` (not redirect) for unauthenticated API, cookie CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`).

- **`apiFetch`** (`src/api/client.ts`) wraps native **fetch**: `credentials: 'include'`; adds `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie on **mutating** methods only; JSON-only (body typed `string | null`); throws a typed `ApiError(status, message, body?)` on non-2xx **and on a non-JSON 200** (catches proxy/error pages); on `401` invokes a globally-registered handler then throws. The 401 handler is injected via `setUnauthorizedHandler(...)` to decouple the client from the router/auth (avoids a circular import).
- **`useAuth`** (`src/auth/useAuth.ts`): eager `bootstrap()` (`GET /api/me`) resolves the session **before the app mounts** (so the guard never sees `'unknown'`); `loginWithGitHub()` does a **full-page navigation** `window.location.assign('/oauth2/authorization/github')` (OAuth needs a real navigation, not fetch); `logout()` POSTs `/logout` then resets — it intentionally does NOT reset local state if the server call fails (session may still be alive).
- **Route guard** (`src/auth/guard.ts`): **fail-closed** — only `status === 'authenticated'` may enter a non-public route; everything else redirects to `/login`. Routes are auth-required unless they set `meta.public = true`. The redirect target `/login` **must** be `meta.public` or anonymous users loop.
- **Dev proxy:** Vite `server.proxy` forwards `/api`, `/oauth2`, `/login`, `/logout` to the backend (`VITE_API_PROXY_TARGET`, default `http://localhost:8080`) so same-origin holds locally. **Use `changeOrigin: false`** (transparent proxy): the backend must see the browser's `Host` (`localhost:5173`) so it builds OAuth2 `redirect_uri` + post-login redirects on the SPA origin. With `changeOrigin: true` the backend sees `:8080`, GitHub redirects the browser to `:8080`, and the user lands on the backend (raw JSON / `/error`) instead of the SPA after login. The **GitHub OAuth App callback must be the SPA origin** in dev: `http://localhost:5173/login/oauth2/code/github`.
- **UX:** surface API failures to the user; never leave a promise rejection unhandled in a click handler; log bootstrap failures rather than swallowing them.

## Testing

- **Vitest + @vue/test-utils + happy-dom**, unit level. JUnit-style; kotest is NOT used here.
- **Mocking uses Vitest `vi`** (`vi.stubGlobal` for `fetch`/`location`, `vi.mock` for modules) — **NOT mockk/kotest** (those are the Kotlin backend's convention).
- Test **real behavior**, not mock echoes: assert on the actual `RequestInit` sent to `fetch`, on `router.currentRoute` after navigation (guard tests use a `createMemoryHistory` router), etc.

## Community context + admin gating

Pages nested under `[slug]/` receive the loaded community via Vue's `provide`/`inject`, keyed on `communityKey` from `src/communities/context.ts`.

- The shell (`src/pages/[slug].vue`) fetches the community, provides `{ community: Readonly<Ref<CommunityResponse>>, refresh }`, then renders `<RouterView />` only in the `state === 'ready'` branch — so children can safely read `community.value` as non-null.
- The type mismatch (`Ref<CommunityResponse | null>` vs `Readonly<Ref<CommunityResponse>>`) is bridged with `community as unknown as Readonly<Ref<CommunityResponse>>`. This is intentional: the null case is excluded structurally (children only mount after ready), and `unknown` is necessary because TypeScript cannot widen through a `Readonly` wrapper.
- Child pages call `useCommunityContext()` (throws if context is missing) instead of `useRoute()` — they never need to re-fetch the slug from the router.
- `useAdminGuard()` (in `src/communities/useAdminGuard.ts`) redirects to `/${slug}/` on `onMounted` if `viewerIsAdmin` is false. This is a UX guard only — the backend `@RequireAdmin` annotation is the real gate.
- Admin-only pages (`members.vue`, `settings.vue`, `requests.vue`) all call `useAdminGuard()` at the top of `<script setup>`.
- In tests, mock the entire context module: `vi.mock('@/communities/context', () => ({ useCommunityContext: () => ({ community: { value: { ...fields } }, refresh: vi.fn() }) }))`. This avoids the `inject` dependency on a real Vue app wrapping.
- `CommunityResponse` includes `viewerIsAdmin: boolean` and `pendingCount: number` returned by the backend. The shell shows the admin ⚙ menu and pending badge only when `viewerIsAdmin` is true.

## Lint / format

- **ESLint flat config** in `eslint.config.mjs` (ESLint 10 needs an extra flag to load a `.ts` config, so use `.mjs`) + **Prettier**.
- Disable `vue/multi-word-component-names` for `src/pages/**` — file-based route components are idiomatically single-word (`index.vue`, `login.vue`).
