# Frontend (webapp-vue)

Conventions for the `webapp-vue/` Vue SPA. **Deliberate goal: keep the set of
moving runtime npm libraries small.** The auth/session foundation is the reference
implementation.

This file holds the stack, the HTTP/auth contract and the tooling gates. The rest
of the frontend conventions live beside it:

| File | Covers |
|---|---|
| [frontend-ui.md](frontend-ui.md) | Mobile-first, sizing traps, accessibility |
| [frontend-routing.md](frontend-routing.md) | Routes, guard-owned navigation data, the `[slug]` shell, role gating |
| [frontend-state.md](frontend-state.md) | Composables (no Pinia), the shared clock, server-authoritative ticking, sound |
| [frontend-testing.md](frontend-testing.md) | Vitest, @vue/test-utils, happy-dom limits, doubles |

## Stack

- **Vite 8** (Rolldown-based): build options are `build.rolldownOptions`, not `rollupOptions`.
- **Vue 3**, Composition API, `<script setup lang="ts">`. **pnpm**.
- **TypeScript, very strict**: `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`; `moduleResolution: "bundler"`. The `@/*`→`src/*` alias keeps `baseUrl`
  under `"ignoreDeprecations": "6.0"`. **Stay on `~6.0.x`** — see
  [dependency-updates.md](dependency-updates.md).
  - **`exactOptionalPropertyTypes` + optional body fields:** never pass `prop: x || undefined`.
    Build a partial request body with explicit conditional assignment instead —
    `const body: Partial<{ name: string; targetAt: string }> = { name: name.value.trim() }`,
    then `if (targetAt.value) body.targetAt = targetAt.value`.
- **Tailwind CSS v4** via `@tailwindcss/vite` (CSS-first: `@import 'tailwindcss';`).
  - **Colours are Material 3 roles, defined once in `main.css`'s `@theme`** (`bg-surface`,
    `text-on-surface-variant`, `border-outline`, `bg-inverse-surface`, `text-primary`, `text-error`,
    …). App UI names a role, never a Tailwind shade, so a palette change touches one file. Only
    roles the app wears exist; add an M3 role when something needs it, not ahead. No extra shades
    for states: hover and pressed are the role at an opacity (`hover:bg-inverse-surface/80`),
    disabled text is `text-on-surface/40`. Text on a role fill takes its `on-` role (`bg-primary
    text-on-primary`). On `inverse-surface` the base colours fall to ~2:1 — use an `inverse-`
    twin (`inverse-phase-two`; M3's `inverse-primary` when needed). A meaning that may part from its
    colour later gets its own name even while it borrows one (`--color-live` →
    `--color-phase-two`, `--color-phase-one` → `--color-primary`). Game artwork (crosshairs,
    glass over photos, chart fills) is not app UI and may keep literal colours. It still keeps red for
    wrong: a red on a right state reads as an error (Verrohrung's hot plates glow amber, not red;
    `scripts/turn-pipes-tiles.mts`).
  - **Dark mode lives in the role values, not in components.** Each role is
    `light-dark(light, dark)`; the browser picks by `color-scheme` — the system's, or the user's
    pick pinned as `data-color-scheme` on `<html>` by `ui/colorScheme.ts` (and before first paint
    by `index.html`). Never set `color-scheme` from JS: the build polyfills `light-dark()` with
    Lightning CSS variables that only stylesheet `color-scheme` rules set — an inline style works
    in dev and does nothing in the build. So no `dark:` classes, and a literal colour in app UI
    (`text-white`, `ring-white`) is a bug that only shows in the dark: pair a fill with its `on-`
    role, ring with the ground's role (`ring-surface`). `inverse-surface` flips with the mode.
    What must look the same in both — the game band and the flip-dot board — takes the fixed
    `board` roles (`bg-board`, `text-on-board`, `text-board-phase-two`). Colours painted from TS
    that must follow the mode read `useDarkScheme()`; flip dots straight on the page (header
    countdown) take `ground="surface"`, flip dots on `inverse-surface` (the countdown card: dark
    in the light, light in the dark) `ground="inverse"`. A surface over the scrim (the menu) must be lighter than
    the page in the dark: it wears `bg-surface-container-high raised`, and `raised` redefines the
    text and fill roles for its subtree, so its content keeps the plain role names.
  - **`src/assets/main.css` holds only what is app-wide:** theme tokens with a cross-cutting
    meaning (`--color-live`, the phase colours), layout utilities several areas share
    (`round-bleed`), base rules. A style one component needs goes into its `<style scoped>`; a
    measurement two components of one game share goes into a CSS file beside them, pulled in by
    each as `<style scoped src="./x.css">` (`song-cover.css`, `hue-wheel.css`). Need a theme value
    there (`theme(--breakpoint-sm)`)? Start the file with `@reference '…/assets/main.css'` —
    it lends the theme and emits nothing.
  - **A scoped rule beats every Tailwind utility on the same element**, because Tailwind's
    output is layered and scoped CSS is not. So `motion-reduce:animate-none` cannot stop a scoped
    animation: write the animation under `@media (prefers-reduced-motion: no-preference)` instead
    (`App.vue`'s `nav-shuttle`, `PlayButton`'s `song-loading`). Name scoped classes without
    Tailwind's prefixes (`animate-…`), or they read like utilities a variant could take.
  - **Tailwind scans source text, so a class name must appear literally.** A computed
    `` `w-[${pct}%]` `` is never generated. Map a varying value to literal class strings
    (`if (n <= 2) return 'w-[72%]'`, `CountdownCard.vue`).
- **Date/time: Luxon**, no native `Date` math. A wall-clock field is
  `<input type="datetime-local">`, converted **in the relevant IANA zone** — see *Zone-relative
  time entry* in [frontend-state.md](frontend-state.md). `toISO()` returns `string | null` under
  strict TS: guard it.
- **Icons: Lucide, bundled at build time** — `unplugin-icons` + `@iconify-json/lucide`, both
  devDependencies; import as `~icons/lucide/<name>`. Not `@iconify/vue`: its `<Icon>` fetches icon
  data at runtime from `api.iconify.design`. Register as `Icons({ compiler: 'vue3', scale: 1 })` —
  the plugin's default `1.2` breaks "1em, inherits from the text"; size icons with Tailwind
  (`size-5`). `vue-tsc` needs `/// <reference types="unplugin-icons/types/vue" />` in `env.d.ts`.
- **A game with a heavy dependency (three.js) registers in `games/registry.ts` through
  `asyncGame`** — `defineAsyncComponent` with a loading and an error component. The dependency
  stays out of everyone else's bundle, and a tab open across a deploy that asks for a vanished
  chunk says „Lade die Seite neu.“ instead of showing an empty card. Blockierung.
- **Never measure from a canvas — it only displays.** Whatever is counted or stored is model data
  (Anmaßung: strokes in fixed canvas units, counted on the server). Edge pixels are anti-aliased
  per `devicePixelRatio` and anti-fingerprinting adds noise to `getImageData`, so the same
  painting scores differently per device.
- **Fonts ship from the app's own origin.** Take one as an npm package
  (`@fontsource-variable/…`) and import it where it is used; never a Google Fonts link or any
  third-party font URL — the player's IP must not go to a third party for a font
  (`src/__tests__/ownFonts.spec.ts`). The app sets no font itself; the system face is deliberate,
  a font of its own is a separate decision.

## HTTP + auth (the same-origin SPA contract)

The backend serves a same-origin SPA contract: session cookie, `401` (not a redirect) for an
unauthenticated API call, cookie CSRF (`XSRF-TOKEN` → `X-XSRF-TOKEN`).

- **`apiFetch`** (`src/api/client.ts`) wraps native `fetch`: `credentials: 'include'`, the CSRF
  header on mutating methods only, JSON-only. It throws a typed `ApiError(status, message, body?)`
  on non-2xx **and on a non-JSON 200** (proxy and error pages). On `401` it invokes the handler
  registered through `setUnauthorizedHandler(...)` — injected, so the client imports neither router
  nor auth.
- **Every call has a 10 s timeout, surfaced as `ApiError(0, …)`** — status `0` means no HTTP
  response was received. A caller's `signal` is composed in, and a caller's own abort rethrows the
  native `AbortError`: a deliberate cancel is never reported as a timeout. The project targets
  evergreen browsers only, so Baseline-widely-available APIs (`AbortSignal.any`) are fine.
- **`useAuth`** (`src/auth/useAuth.ts`): eager `bootstrap()` (`GET /api/me`) resolves the session
  **before the app mounts**, so the guard never sees `'unknown'`. `loginWithGitHub()` is a
  **full-page navigation** to `/login/start` ([security-and-auth.md](security-and-auth.md)) —
  OAuth needs a real navigation. `logout()` POSTs `/logout` and does **not** reset local state if
  that call fails: the session may still be alive.
- **Route guard** (`src/auth/guard.ts`) is **fail-closed:** only `status === 'authenticated'`
  enters a route without `meta.public = true`; everything else redirects to `/login`, which
  **must** be `meta.public` or anonymous users loop.
- **Dev proxy:** Vite forwards `/api`, `/oauth2`, `/login/`, `/logout` to the backend
  (`webapp-vue/dev-proxy.ts`, target `VITE_API_PROXY_TARGET`), so same-origin holds locally.
  - **A string proxy key is a plain prefix, so `/login/` needs its trailing slash:** `/login`
    itself is the SPA's sign-in *page*, only its sub-paths are backend. Keep dev and the edge
    ([deployment-edge.md](deployment-edge.md)) in sync; `src/__tests__/dev-proxy.spec.ts` guards
    the split.
  - **`changeOrigin: false`:** the backend must see the browser's `Host` (`localhost:5173`) to
    build the OAuth2 `redirect_uri` and post-login redirects on the SPA origin. The GitHub App
    lists `http://localhost:5173/login/oauth2/code/github` for dev.
- **UX:** surface API failures to the user; never leave a promise rejection unhandled in a click
  handler; log bootstrap failures rather than swallowing them.
- **`ApiError.body` carries a ProblemDetail — show its `detail` where the user can act on it.**
  The app's `@RestControllerAdvice` handlers answer 4xx as `application/problem+json`, and
  `apiFetch` parses any `application/…+json`. A validation failure the user can fix (a rejected
  colour, a name over the limit) shows the server's sentence; everything else keeps the constant
  „… fehlgeschlagen.“.
- **`apiFetch` stays JSON-only — binary responses are the asset helpers' business.**
  `src/api/assets.ts` does a credentialed `fetch`. A game receives `assets: RoundAssets`
  (`url(name)`, `key(name)`) and never builds a URL or reads a key itself. A plain asset (`Scene`,
  `AfterGuess`) is a URL, usable as `<img src>`, or `fetchAssetBlob` for the bytes; a sealed one
  is `useSealedAsset` (fetched under the cover, opened once its key arrives, `retry()`) or, on
  demand, `loadSealed`.
- **Revoke an object URL whenever it is replaced or the component unmounts,** and where responses
  for one slot can race (rapid stage advances), guard the assignment with a generation counter.
- **The first sealed opening on a page runs cold — warm it up before it lands on a scored clock.**
  `warmUpOpening` (`src/api/assets.ts`) belongs where time is free, under the cover.
  `useSealedAsset` calls it when bytes arrive before their key; `loadSealed` does not, so a game
  that opens through it on a clock warms up itself.
- **Binary uploads go through `uploadFile(base, blob, fileName, onProgress)`** (`src/api/upload.ts`):
  XHR, because fetch has no upload progress; bounded by a 4 min timeout, not `apiFetch`'s 10 s.
- **A file picker's `accept` is a platform filter, not just a hint.** iOS Safari maps a bare
  `audio/*` to video and greys out every audio file in Files; list the extensions beside it
  (`AudioPool.vue`). Android's picker filters by the MIME type Android assigns, so `.webm` and
  `.3gp` (filed as video) and `.caf` (no type) stay unpickable whatever the list says; iOS in
  turn greys out `.ogg`, `.opus`, `.caf` and `.wma` despite the list. For images, the list decides
  whether HEIC arrives converted (`ImagePool.vue`).
- **No API that needs a secure context without a way around it.** The app is also opened on a
  phone over plain HTTP on the LAN IP, where `crypto.subtle`, `navigator.clipboard` and service
  workers do not exist. Decrypting is `@noble/ciphers` (pure JS) — one path everywhere. WebCrypto
  may only sit *beside* it as an upgrade (unividuell/countdown#106), never instead of it.
- **A reload after a phone's file picker is Vite, not the app.** Android Chrome closes the HMR
  WebSocket once the tab sits in the background (an open picker counts), and Vite's client reloads
  on return — wiping e.g. an upload queue. Dev only. For phone tests that leave the tab, start the
  `frontend-build` launch config: a production build behind `vite preview` on :4173, with the dev
  proxy.
- **An optional number renders on presence, never on truthiness.** `v-if="points.live"` swallows a
  `0` the server sent on purpose. Test on `=== undefined`, and where the value carries a qualifier
  („may still change“), give it a **nested object** rather than a sibling field:
  `live?: { points, provisional }` makes presence structural and the illegal pair unbuildable.

## Lint / format

- **ESLint flat config** in `eslint.config.mjs` (ESLint 10 needs an extra flag to load a `.ts`
  config) + **Prettier**.
- `vue/multi-word-component-names` is off for `src/pages/**` — file-based route components are
  single-word (`index.vue`, `login.vue`).

## Typecheck must be `vue-tsc -b` — `--noEmit` checks nothing here

`tsconfig.json` is a **solution file**: `"files": []` plus project references. `vue-tsc --noEmit`
on it type-checks **zero files** and exits 0. Use **`vue-tsc -b`**. If you change the script,
verify it with a deliberate type error rather than trusting a green run.

Three projects, deliberately:

| Project | Checks | Why separate |
|---|---|---|
| `tsconfig.app.json` | `src/**` **minus** tests | App code must NOT get `@types/node` — `process.env` would typecheck and then fail in the browser |
| `tsconfig.vitest.json` | `src/**/__tests__/**` | Tests run in Node and legitimately use `node:fs` (e.g. reading `shared/rng/golden-vectors.json`) |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs` | Config files are Node, not browser |
