# Frontend Foundation + Auth (Vue SPA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a lean Vue 3 SPA in `webapp-vue/` that authenticates against the `core` Spring backend's GitHub OAuth2 login (same-origin, session cookie, CSRF, 401-not-redirect) and shows the current user — a running, unit-tested foundation. Games/charts/admin come later.

**Architecture:** Vite 8 + Vue 3 (Composition API) + TypeScript (very strict) + Vue Router 5 file-based routing. Auth = eager `useAuth` bootstrap (`GET /api/me`) + global route guard + an `apiFetch` wrapper (native fetch, `credentials:'include'`, `X-XSRF-TOKEN` from cookie, global 401 handling). State via composables + VueUse (no Pinia). Tailwind v4. Dev runs against the backend through a Vite proxy so same-origin holds locally.

**Tech Stack:** pnpm · Vite 8 (Rolldown) · Vue 3 · Vue Router 5 (built-in file-based routing, `vue-router/vite` + `vue-router/auto-routes`) · TypeScript strict · Tailwind CSS v4 (`@tailwindcss/vite`) · @vueuse/core · Vitest + @vue/test-utils + happy-dom · ESLint (flat) + Prettier.

> **Bleeding-edge note:** Vite 8, Vue Router 5, and Tailwind v4 are recent. If an exact API/option differs from a snippet below, adapt minimally to make it build/test while preserving the intended behavior, and report it. Frontend mocking uses Vitest `vi` — NOT mockk/kotest (those are the Kotlin backend's convention).

---

## File Structure (`webapp-vue/`)

```
webapp-vue/
  index.html
  package.json
  pnpm-lock.yaml
  vite.config.ts          # VueRouter() before vue(); tailwind plugin; dev proxy; @ alias
  tsconfig.json           # strict + extras; includes typed-router.d.ts
  tsconfig.node.json
  env.d.ts                # vite/client + vue-router types
  eslint.config.ts
  .prettierrc.json
  vitest.config.ts        # or test block in vite.config; happy-dom env
  README.md
  src/
    main.ts               # router + auth bootstrap + mount
    App.vue               # shell: header + <RouterView/> + footer
    assets/main.css       # tailwind entry
    pages/
      index.vue           # auth-required landing: shows current user + logout
      login.vue           # public: "Login with GitHub" button
    auth/
      useAuth.ts
      guard.ts
    api/
      client.ts           # apiFetch + ApiError + setUnauthorizedHandler
      types.ts            # MeResponse, UpdateProfileRequest
  src/**/__tests__ or *.spec.ts (colocated)
```

Tasks build up in dependency order: scaffold → styling+routing+shell → API client → auth → pages/wiring → docs/verify → guidelines.

---

## Task 1: Scaffold `webapp-vue/` (Vite 8 + Vue 3 + strict TS + Vitest + lint)

**Files:** the `webapp-vue/` project skeleton + a trivial smoke test.

- [ ] **Step 1: Scaffold with create-vite, then pin our config**

From the repo root:
```bash
pnpm create vite@latest webapp-vue --template vue-ts
cd webapp-vue
```
Then ensure major versions and add deps:
```bash
pnpm add vue-router@^5 @vueuse/core
pnpm add -D vitest @vue/test-utils happy-dom @tailwindcss/vite tailwindcss \
  eslint @vue/eslint-config-typescript eslint-plugin-vue prettier @vue/eslint-config-prettier \
  vue-tsc
# ensure Vite 8 + plugin-vue current majors:
pnpm add -D vite@^8 @vitejs/plugin-vue
```
(Exact patch versions resolve to latest; keep the listed majors.)

- [ ] **Step 2: Strict `tsconfig.json`**

Replace `tsconfig.json` (app config) with strict settings:
```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "useDefineForClassFields": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts", "typed-router.d.ts"]
}
```
`env.d.ts`:
```ts
/// <reference types="vite/client" />
/// <reference types="vue-router/auto-routes" />
```

- [ ] **Step 3: Path alias + scripts**

In `vite.config.ts` add the `@` → `src` alias (full config lands in Task 2). In `package.json` scripts:
```jsonc
"scripts": {
  "dev": "vite",
  "build": "vue-tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "vue-tsc --noEmit",
  "lint": "eslint .",
  "format": "prettier --write src"
}
```

- [ ] **Step 4: ESLint flat config + Prettier**

`eslint.config.ts`:
```ts
import vue from 'eslint-plugin-vue'
import vueTsConfig from '@vue/eslint-config-typescript'
import prettier from '@vue/eslint-config-prettier'

export default [
  ...vue.configs['flat/recommended'],
  ...vueTsConfig(),
  prettier,
  { ignores: ['dist/', 'node_modules/', '*.d.ts'] },
]
```
`.prettierrc.json`:
```json
{ "semi": false, "singleQuote": true, "printWidth": 100 }
```
(Adapt to the exact flat-config export shape these packages ship; the goal is `pnpm lint` and `pnpm format` working.)

- [ ] **Step 5: Vitest config (happy-dom)**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'happy-dom', globals: true },
})
```

- [ ] **Step 6: Trivial smoke test**

`src/__tests__/smoke.spec.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 7: Verify toolchain**

```bash
pnpm install
pnpm test       # smoke test passes
pnpm lint       # no errors
pnpm build      # type-checks + builds
```
Expected: all three succeed. Remove the default `HelloWorld.vue`/demo assets create-vite added that we won't use (keep `App.vue`, `main.ts`, which Task 2/5 rewrite).

- [ ] **Step 8: Commit**

```bash
git add webapp-vue
git commit -m "feat(webapp-vue): scaffold Vite 8 + Vue 3 + strict TS + Vitest + ESLint/Prettier"
```

---

## Task 2: Tailwind v4 + Vue Router 5 file-based routing + app shell + dev proxy

**Files:** `vite.config.ts`, `src/assets/main.css`, `src/App.vue`, `src/pages/index.vue` (placeholder), `src/main.ts` (minimal), router wiring.

- [ ] **Step 1: Full `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const backend = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
const proxy = Object.fromEntries(
  ['/api', '/oauth2', '/login', '/logout'].map((p) => [
    p,
    { target: backend, changeOrigin: true },
  ]),
)

export default defineConfig({
  plugins: [
    VueRouter(), // ⚠️ must come before vue()
    vue(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy },
})
```

- [ ] **Step 2: Tailwind entry**

`src/assets/main.css`:
```css
@import 'tailwindcss';
```

- [ ] **Step 3: Minimal router + mount (placeholder; auth wiring added in Task 5)**

`src/main.ts`:
```ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import './assets/main.css'

const router = createRouter({ history: createWebHistory(), routes })
createApp(App).use(router).mount('#app')
```

- [ ] **Step 4: App shell**

`src/App.vue`:
```vue
<script setup lang="ts"></script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-100 text-neutral-900">
    <header class="bg-stone-900 px-4 py-3 text-stone-50">
      <span class="font-semibold">countdown</span>
    </header>
    <main class="flex-1 p-4">
      <RouterView />
    </main>
    <footer class="bg-stone-900 px-4 py-3 text-sm text-stone-300">countdown.unividuell.org</footer>
  </div>
</template>
```

- [ ] **Step 5: Placeholder index page (replaced in Task 5)**

`src/pages/index.vue`:
```vue
<template>
  <p>Home</p>
</template>
```

- [ ] **Step 6: Verify routing + build**

```bash
pnpm build      # vue-tsc sees typed-router.d.ts (generated on first dev/build), routing compiles
pnpm dev        # visit http://localhost:5173/ → shell + "Home"; stop after confirming
```
Expected: build succeeds; `typed-router.d.ts` is generated; `/` renders. If `typed-router.d.ts` isn't generated before typecheck, run `pnpm dev` once (or the plugin's prepare step) so it exists, and ensure it's in `tsconfig.json` `include` and git-ignored is NOT required (commit it or ignore it — match the plugin's recommendation; if ignored, generate in CI before typecheck).

- [ ] **Step 7: Commit**

```bash
git add webapp-vue
git commit -m "feat(webapp-vue): tailwind v4, file-based routing, app shell, dev proxy"
```

---

## Task 3: API client (`apiFetch`) + backend contract types — TDD

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Test: `src/api/__tests__/client.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/api/__tests__/client.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, setUnauthorizedHandler } from '@/api/client'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const res = new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
  const spy = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('apiFetch', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=tok123'
    setUnauthorizedHandler(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GET sends credentials and parses JSON, no CSRF header', async () => {
    const spy = mockFetch(200, { id: '1' })
    const out = await apiFetch<{ id: string }>('/api/me')
    expect(out).toEqual({ id: '1' })
    const [, init] = spy.mock.calls[0]!
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('mutating request sends X-XSRF-TOKEN from cookie + JSON content-type', async () => {
    const spy = mockFetch(204, undefined)
    await apiFetch<void>('/logout', { method: 'POST' })
    const [, init] = spy.mock.calls[0]!
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('tok123')
    expect(init.credentials).toBe('include')
  })

  it('401 invokes the unauthorized handler and throws ApiError', async () => {
    mockFetch(401, { error: 'unauthorized' })
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    await expect(apiFetch('/api/me')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('non-2xx throws ApiError with status', async () => {
    mockFetch(500, { error: 'boom' })
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 500 })
  })
})
```

- [ ] **Step 2: Run test → fails (unresolved import)**

`cd webapp-vue && pnpm test -- client.spec`
Expected: FAIL — `@/api/client` doesn't exist.

- [ ] **Step 3: Types**

`src/api/types.ts`:
```ts
export interface MeResponse {
  id: string
  username: string
  githubLogin: string
  githubName: string | null
  email: string | null
  bgColorHex: string | null
  isSuperAdmin: boolean
  createdAt: string | null
}

export interface UpdateProfileRequest {
  displayName: string | null
  bgColorHex: string | null
}
```

- [ ] **Step 4: Client**

`src/api/client.ts`:
```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (MUTATING.has(method)) {
    const token = readCookie('XSRF-TOKEN')
    if (token) headers.set('X-XSRF-TOKEN', token)
  }
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, { ...options, method, headers, credentials: 'include' })

  if (res.status === 401) {
    onUnauthorized()
    throw new ApiError(401, 'unauthorized')
  }
  if (!res.ok) {
    throw new ApiError(res.status, `request to ${path} failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type')
  return (contentType?.includes('application/json') ? await res.json() : undefined) as T
}
```

- [ ] **Step 5: Run test → passes**

`cd webapp-vue && pnpm test -- client.spec`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/api
git commit -m "feat(webapp-vue): apiFetch client (credentials, CSRF header, 401 handling) + types"
```

---

## Task 4: `useAuth` composable + route guard — TDD

**Files:**
- Create: `src/auth/useAuth.ts`
- Create: `src/auth/guard.ts`
- Test: `src/auth/__tests__/useAuth.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/auth/__tests__/useAuth.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'

vi.mock('@/api/client', async (orig) => {
  const actual = await orig<typeof import('@/api/client')>()
  return { ...actual, apiFetch: vi.fn() }
})
import { apiFetch } from '@/api/client'
import { useAuth } from '@/auth/useAuth'

const me = {
  id: 'u1', username: 'octo', githubLogin: 'octo', githubName: null, email: null,
  bgColorHex: null, isSuperAdmin: false, createdAt: null,
}

describe('useAuth', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('bootstrap sets authenticated + user on 200', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me)
    const auth = useAuth()
    await auth.bootstrap()
    expect(auth.status.value).toBe('authenticated')
    expect(auth.user.value).toEqual(me)
  })

  it('bootstrap sets anonymous on 401', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, 'unauthorized'))
    const auth = useAuth()
    await auth.bootstrap()
    expect(auth.status.value).toBe('anonymous')
    expect(auth.user.value).toBeNull()
  })

  it('logout posts and resets to anonymous', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(me) // bootstrap
    const auth = useAuth()
    await auth.bootstrap()
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined) // logout
    await auth.logout()
    expect(apiFetch).toHaveBeenLastCalledWith('/logout', { method: 'POST' })
    expect(auth.status.value).toBe('anonymous')
    expect(auth.user.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run test → fails**

`cd webapp-vue && pnpm test -- useAuth.spec`
Expected: FAIL — `@/auth/useAuth` doesn't exist.

- [ ] **Step 3: `useAuth`**

`src/auth/useAuth.ts`:
```ts
import { readonly, ref } from 'vue'
import { ApiError, apiFetch } from '@/api/client'
import type { MeResponse } from '@/api/types'

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

const user = ref<MeResponse | null>(null)
const status = ref<AuthStatus>('unknown')

export function useAuth() {
  async function bootstrap(): Promise<void> {
    try {
      user.value = await apiFetch<MeResponse>('/api/me')
      status.value = 'authenticated'
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        user.value = null
        status.value = 'anonymous'
        return
      }
      throw error
    }
  }

  function loginWithGitHub(): void {
    window.location.assign('/oauth2/authorization/github')
  }

  async function logout(): Promise<void> {
    await apiFetch<void>('/logout', { method: 'POST' })
    user.value = null
    status.value = 'anonymous'
  }

  return { user: readonly(user), status: readonly(status), bootstrap, loginWithGitHub, logout }
}
```

- [ ] **Step 4: Route guard**

`src/auth/guard.ts`:
```ts
import type { Router } from 'vue-router'
import { useAuth } from '@/auth/useAuth'

// Convention: routes are auth-required unless they set `meta.public = true`.
export function registerAuthGuard(router: Router): void {
  router.beforeEach((to) => {
    const { status } = useAuth()
    const isPublic = to.meta.public === true
    if (!isPublic && status.value === 'anonymous') return { path: '/login' }
    if (to.path === '/login' && status.value === 'authenticated') return { path: '/' }
    return true
  })
}
```

- [ ] **Step 5: Run test → passes**

`cd webapp-vue && pnpm test -- useAuth.spec`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/auth
git commit -m "feat(webapp-vue): useAuth session composable + global route guard"
```

---

## Task 5: Pages + wiring (login, index, main bootstrap) — TDD on the login page

**Files:**
- Modify: `src/main.ts` (add guard + bootstrap + 401 handler)
- Create/replace: `src/pages/login.vue`, `src/pages/index.vue`
- Test: `src/pages/__tests__/login.spec.ts`

- [ ] **Step 1: Write the failing login-page test**

`src/pages/__tests__/login.spec.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Login from '@/pages/login.vue'

describe('login.vue', () => {
  afterEach(() => vi.restoreAllMocks())

  it('navigates to the GitHub OAuth endpoint on click', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    const wrapper = mount(Login)
    await wrapper.get('[data-test="login-github"]').trigger('click')
    expect(assign).toHaveBeenCalledWith('/oauth2/authorization/github')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test → fails**

`cd webapp-vue && pnpm test -- login.spec`
Expected: FAIL — `@/pages/login.vue` not in its final form.

- [ ] **Step 3: `login.vue` (public route)**

`src/pages/login.vue`:
```vue
<script setup lang="ts">
import { useAuth } from '@/auth/useAuth'

definePage({ meta: { public: true } })

const { loginWithGitHub } = useAuth()
</script>

<template>
  <section class="mx-auto max-w-sm py-16 text-center">
    <h1 class="mb-6 text-xl font-semibold">Sign in</h1>
    <button
      data-test="login-github"
      class="rounded bg-stone-900 px-4 py-2 text-stone-50 hover:bg-stone-700"
      @click="loginWithGitHub"
    >
      Login with GitHub
    </button>
  </section>
</template>
```
(`definePage` is the Vue Router 5 file-based macro for per-route meta. If unavailable in this version, set the route meta via the plugin's supported mechanism.)

- [ ] **Step 4: `index.vue` (auth-required landing)**

`src/pages/index.vue`:
```vue
<script setup lang="ts">
import { useAuth } from '@/auth/useAuth'

const { user, logout } = useAuth()
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-4 text-xl font-semibold">Welcome, {{ user?.username }}</h1>
    <dl class="mb-6 text-sm">
      <div class="flex gap-2"><dt class="font-medium">GitHub:</dt><dd>{{ user?.githubLogin }}</dd></div>
      <div class="flex gap-2"><dt class="font-medium">Email:</dt><dd>{{ user?.email ?? '—' }}</dd></div>
      <div class="flex gap-2"><dt class="font-medium">Super-admin:</dt><dd>{{ user?.isSuperAdmin }}</dd></div>
    </dl>
    <button class="rounded border px-3 py-1.5 hover:bg-neutral-200" @click="logout">Log out</button>
  </section>
</template>
```

- [ ] **Step 5: Wire `main.ts`**

`src/main.ts`:
```ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { useAuth } from '@/auth/useAuth'
import { registerAuthGuard } from '@/auth/guard'
import { setUnauthorizedHandler } from '@/api/client'
import './assets/main.css'

const router = createRouter({ history: createWebHistory(), routes })
registerAuthGuard(router)
setUnauthorizedHandler(() => void router.push('/login'))

const { bootstrap } = useAuth()
// Resolve the session before mount so the guard sees a definite status.
bootstrap().finally(() => {
  createApp(App).use(router).mount('#app')
})
```

- [ ] **Step 6: Run login test → passes; then full suite + typecheck + build**

```bash
cd webapp-vue
pnpm test            # all unit tests green (client, useAuth, login, smoke)
pnpm typecheck       # strict TS clean
pnpm build           # builds
```
Expected: all green. If `definePage`/meta typing trips strict TS, fix the typing per the plugin's types (don't loosen tsconfig).

- [ ] **Step 7: Commit**

```bash
git add webapp-vue
git commit -m "feat(webapp-vue): login + landing pages wired to auth bootstrap and guard"
```

---

## Task 6: README + full verification

**Files:** `webapp-vue/README.md`.

- [ ] **Step 1: README**

Create `webapp-vue/README.md`:
```markdown
# webapp-vue

Vue 3 SPA frontend for countdown.unividuell.org. Talks to the `core` Spring
backend (GitHub OAuth2 login, session cookie, CSRF) same-origin.

## Develop
```bash
pnpm install
pnpm dev            # http://localhost:5173 ; proxies /api,/oauth2,/login,/logout to the backend
```
Run the backend (`core`) on :8080 first (see `core/README.md`). Override the
target with `VITE_API_PROXY_TARGET` if needed. Visit `/` → redirected to `/login`
→ "Login with GitHub" → back to `/` showing your profile.

## Scripts
`pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build`
```

- [ ] **Step 2: Full verification**

```bash
cd webapp-vue
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: all succeed.

- [ ] **Step 3: Commit**

```bash
git add webapp-vue/README.md
git commit -m "docs(webapp-vue): readme and run instructions"
```

---

## Task 7: Feed knowledge back into `.claude/guidelines/` (required final task)

Per `.claude/guidelines/feeding-knowledge-back.md` and the spec's post-implementation requirement.

**Files:** `.claude/guidelines/frontend.md` (new), `.claude/guidelines/README.md` (link), `CLAUDE.md` (link).

- [ ] **Step 1: Write `frontend.md`**

Create `.claude/guidelines/frontend.md` capturing the **conventions actually used**, with rationale and short snippets:
- Stack: Vite 8 (Rolldown; `build.rolldownOptions`), Vue 3 Composition API, pnpm, very-strict TS (list the flags), Tailwind v4 via `@tailwindcss/vite`.
- Routing: **Vue Router 5 built-in file-based routing** (`vue-router/vite` before `vue()`, `vue-router/auto-routes`, `typed-router.d.ts`, `definePage` for meta) — note `unplugin-vue-router` is archived/absorbed (use core).
- State: composables + VueUse, no Pinia (rationale: minimal moving libs).
- HTTP/auth: the `apiFetch` pattern (`credentials:'include'`, `X-XSRF-TOKEN` from cookie on mutations, global 401 handler via `setUnauthorizedHandler`), the `useAuth` eager-bootstrap + global guard, login via **full-page nav** to `/oauth2/authorization/github` (not fetch). The same-origin Vite dev proxy.
- Testing: **Vitest + @vue/test-utils + happy-dom**, unit level; mocking via **Vitest `vi`** (NOT mockk/kotest — that's Kotlin). `vi.stubGlobal` for `fetch`/`location`, `vi.mock` for module mocks.
- Lint/format: ESLint flat + Prettier.

- [ ] **Step 2: Link it**

Add a row to the table in `.claude/guidelines/README.md` and a bullet in `CLAUDE.md` (under the guidelines list) pointing to `frontend.md`. Update the README intro if it currently says "backend" only, to cover the frontend too.

- [ ] **Step 3: Commit**

```bash
git add .claude CLAUDE.md
git commit -m "docs: add frontend coding guidelines from webapp-vue implementation"
```

---

## Self-Review

**Spec coverage:**
- `webapp-vue/` folder, Vite 8, Vue 3 Composition API, strict TS, pnpm → Task 1. ✓
- Vue Router 5 built-in file-based routing → Task 2 (vite plugin + auto-routes), Task 5 (`definePage` meta). ✓
- Tailwind v4 → Task 2. ✓
- Composables + VueUse, no Pinia → Tasks 3-5 (composables; VueUse available, used as needed). ✓
- Native fetch `apiFetch` (credentials, CSRF, 401) → Task 3. ✓
- Auth approach A (eager bootstrap + guard + full-page OAuth nav) → Tasks 4-5. ✓
- Backend contract types (MeResponse / UpdateProfileRequest) → Task 3. ✓
- App shell, login + landing pages, logout → Tasks 2 & 5. ✓
- Dev proxy same-origin → Task 2. ✓
- Vitest + VTU + happy-dom, vi mocks → Tasks 1,3,4,5. ✓
- ESLint + Prettier → Task 1. ✓
- Feed knowledge into `.claude/guidelines/frontend.md` → Task 7. ✓
- Out of scope (games/charts/audio/canvas/admin/Pinia/dark-mode/profile-edit-UI/prod-serving) → not built. ✓

**Placeholder scan:** No TBD/TODO; each code step has full content; each verify step has an expected outcome. The bleeding-edge note authorizes minimal API adaptation, not behavior changes.

**Type consistency:** `MeResponse` shape matches the backend `MeResponse` DTO and is used identically in `useAuth`/`index.vue`. `apiFetch<T>(path, options)` signature and `setUnauthorizedHandler` are used consistently across client/useAuth/main. `useAuth()` returns `{ user, status, bootstrap, loginWithGitHub, logout }` — call sites (guard, pages, main) match. Route-meta convention (`meta.public`) is defined in `login.vue` and read in `guard.ts`.
