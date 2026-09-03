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

## Game lab (non-production only)

Play a mini-game against a seed you control, inside a real community. Start at the index — it
lists every game the lab can draw:

```
/c/<slug>/lab              # the index
/c/<slug>/lab/sample       # a game; the page rolls a seed and writes it into the URL
/c/<slug>/lab/guess-hue    # Farbausmalung — the first real game
/c/<slug>/lab/sample?seed=42   # a specific round
```

Reloading replays the same round; change `seed` for a different one. Following a link from the
index has no seed, so it starts a fresh round every time. Guesses live in the backend's memory,
one round per (community, game) — a different seed discards the previous one.

The controls (seed, reset, switch player) live in the **nav drawer**, not in the content column,
because a game review judges the look of the page as much as the game. Nothing is linked from
anywhere: you type the URL. The lab answers "not available" wherever `app.game-lab.enabled` is off
(always in production). "Spieler wechseln" goes through the test-user picker and returns to the
same seed.

Guess Hue reads its descriptions from the encrypted dataset. Without `app.guess-hue.dataset-path`
the backend falls back to the bundled six-entry sample and says so in the startup log — the game is
playable either way, but the texts are placeholders and nothing about the *content* can be judged
from them. See [game-content.md](../.claude/guidelines/game-content.md) and `core/README.md`.

Adding a game: one entry in `src/gamelab/games.ts` plus its component, and a `LabGame`
implementation in the backend's `gamelab` module. See
`docs/superpowers/specs/2026-08-08-game-lab-design.md`.

## Scripts

- `pnpm test` — unit tests (Vitest + Vue Test Utils + happy-dom)
- `pnpm typecheck` — strict `vue-tsc`
- `pnpm lint` / `pnpm format` — ESLint (flat) / Prettier
- `pnpm build` — type-check + production build

## Stack

Vite 8 · Vue 3 (Composition API) · TypeScript (strict) · Vue Router 5 (file-based
routing) · Tailwind CSS v4 · VueUse · native fetch. State via composables (no Pinia).
