# Frontend — state & live values (webapp-vue)

Composable-owned app state without Pinia, the shared ambient clock, and the
server-authoritative ticking pattern the countdown is built on.
Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-ui.md](frontend-ui.md), [frontend-routing.md](frontend-routing.md),
[frontend-testing.md](frontend-testing.md).

## State — composables + VueUse (no Pinia)

App-global state (e.g. the session) is a module-level singleton: module-scope `ref`s, typically exposed `readonly()` from a composable, mutated only through the composable's functions. Rationale: minimal moving libs; add Pinia later only if state genuinely outgrows this. For unit tests, expose a small `_reset*State()` hook — colocated in the composable's own module, e.g. `_resetAuthState()` in `useAuth.ts`, `_resetCommunitiesState()` in `useCommunities.ts` — to reset the singleton between cases (module state is per-file, not per-test, in Vitest; a previous test's successful load otherwise leaks into the next). Reset by assigning the module-scope ref from inside that hook, not by reaching into the object the composable returns: the latter only compiles as long as the returned ref happens not to be wrapped `readonly()`.

**Derive state from the answer, don't mirror it into flags.** `useRound`'s `stage` is a `computed` over
the last `RoundResponse` — no game → `no-game`, `me == null && game.requiresReveal` → sealed, `me ==
null` otherwise → `no-game` too (a viewer with no row and no game-mandated reveal has nothing to seal —
offering a reveal button there would 404 every time, which is exactly the super-admin-without-membership
case the bypass exists for), `me.guessedAt == null` → playing, else done — not a local "have I guessed
yet" ref set by the submit handler. A local flag can disagree with the server (a second tab, a stale
reload); the response cannot. The same composable turns
a 409 into a reload rather than an error: a guess or reveal rejected as a conflict means the server's
state has already moved past what the UI assumed, so the right response is to fetch that state and
render it, with one explanatory line, not to report a failure the player can retry their way out of.

**Ambient time is shared state; the domain around it is not.** `useCountdown` is instantiated twice
on a community page (the header widget and the fallback card), and two `setInterval`s started at
different moments never resynchronise. So `nowMs` and `skewMs` (the *server's* clock correction, of
which there is exactly one) live at module scope behind **one** interval, while everything
domain-shaped — `round`, the click-cycleable base unit, the load/retry bookkeeping — stays per
instance and reacts via `watch(nowMs, tick)`. What follows from that:

- **Refcount the interval**: start it when the first consumer subscribes, clear it when the last
  unsubscribes. Clearing on the first `onUnmounted` stops the surviving consumer's clock; never
  clearing leaks an interval on every route change. The `_reset*State()` hook must reset the
  refcount *and* clear the interval, or the next test case mounts with a stale count and no clock.
- **A shared clock trades freshness for agreement — don't "fix" it back.** A consumer mounting
  between ticks inherits the last tick's `nowMs`, so its first paint can be up to a second stale.
  That is the point: two displays of the same instant agreeing matters more than either being
  maximally current, and re-anchoring on mount reintroduces exactly the drift the singleton
  removed. Where a stale first paint would be visible, cover it — `FlipDotBoard`'s 400 ms
  switch-on sequence hides it by construction.
- Specs that mount such a component need `enableAutoUnmount(afterEach)` — see
  *Testing → Doubles & lifecycle*.

**A ticking value drives work in a background tab too — animation must opt out of it.** The clock
does not stop when the reader switches tabs, so everything reacting to it keeps running unseen.
That is fine for arithmetic and a DOM patch; it is not fine for `Element.animate()`. Gecko pauses
the refresh driver for a background tab, so an animation created there never advances, never
finishes and is never released — the per-second flip accumulated 2824 live animations in two
minutes of Firefox background time and climbed linearly (Chromium, same page: 58, flat), which over
a working day is hundreds of thousands of animation objects, gigabytes resident, and a crashing
tab. So:

- **Gate every animation on `document.hidden`**, alongside the `prefers-reduced-motion` check that
  is already there — the two are the same kind of bail-out, "nobody is going to see this".
  Skipping costs nothing: the resting state is what the render already shows.
- **Release hand-managed hold state on `visibilitychange`.** A staged reveal that parks DOM
  attributes and resolves them from `requestAnimationFrame` loses its driver the moment the tab
  goes to the background; without an explicit release the reader comes back to a frozen,
  half-flipped surface.
- **Verify in the failing engine *and* the failing state.** Chromium reclaims these animations and
  measures flat — and so does Firefox *in the foreground*. A foreground test would have cleared
  this bug three times over. `document.getAnimations().length`, sampled by the page itself and read
  after the tab returns, is the cheap instrument; `about:memory` (`ghost-windows`, `explicit`
  vs. `resident-peak`) separates a retention leak from an allocation avalanche before any code is
  touched.
- **A component may ask its motion questions once at setup, but must not freeze its own state on
  a setup-time constant.** A component mounted on a value that survives reload (the lab keys a
  game component on the round's seed, and reloading reuses the same seed) stays mounted while its
  props change underneath it — `HueWheelReveal`'s once-computed band width and
  `GuessHueGame`'s once-computed reveal gate both went stale this way, one freezing a moving
  target, the other wedging shut so it could never re-arm. Recompute from props instead, or
  `watch` **without** `immediate`: the default `pre` flush runs the callback and updates the flag
  before the child re-renders, so the child already reads the right value on mount — changing
  `flush` would silently undo that.
- **A refetch behind an entry animation needs its own path that never leaves `'ready'`.** When the
  consumer renders the animated component behind `state === 'ready'`, a `reload()` that resets
  `state` to `'loading'` unmounts it — and a component that measures on mount replays its whole
  entrance for what was only new numbers. Splitting `useRoster` into `reload` (entering: `state`
  may swing) and `refresh` (already on screen: replace the data, touch nothing else) is the shape;
  the mounted list patches values and order in place, keyed by id. A failed *refresh* then keeps
  the last known data instead of swapping the list for an error line — the action that triggered it
  did succeed, and the next visit repairs the numbers.
- **Animating the reorder a refetch brings: one owner per transform, and a way out of the line.**
  An entrance that measured its geometry on mount cannot be re-aimed, so data changing mid-flight
  *ends* it rather than starting a second movement on the same elements — and the rearrangement asks
  `prefers-reduced-motion` and `document.hidden` again at its own moment, not once at setup. Under
  contact physics, note that a row laid out in a single line cannot reorder at all: two bodies on a
  line cannot pass, so whoever overtakes has to leave the line and be back in it on arrival — kept
  in it, they jam and the movement ends on its bail-out timeout instead of arriving.
- **A surface beside a game must not pre-empt that game's reveal — hold the fetch, not the widget.**
  The roster's answer carries the round's points the instant the guess is accepted, so refreshing on
  the `guessed` emit prints the result above a scoreboard still building up to it. `useRoster`'s
  third entrance, `refreshAfterGuess`, waits `SPOILER_HOLD_MS` and then does exactly what `refresh`
  does — holding only the *chip* would leak the new order instead. That constant is the roster's own
  budget, never a copy of a game's timetable: a new game fits inside it or raises it, and nothing
  synchronises with anyone's beats. Skip the hold under `prefers-reduced-motion` — there is no
  choreography left to protect, and lag for that reader is the wrong way round.

## Server-authoritative ticking values (countdown pattern)

For live values that must agree with the backend (the countdown), the backend owns the logic and
emits **absolute instants** (`GET /api/communities/{slug}/countdown` -> current + next `Round` with
`start`/`end` instants + `serverNow`). The SPA never re-derives the rounds — it ticks a local
1 s clock, corrects skew once (`serverNow - Date.now()`), and only **subtracts + formats**
(`src/communities/countdown.ts` is a pure projection; `useCountdown` wires the clock/fetch around
it). At a round boundary it shifts to the pre-fetched `nextRound`, then refetches (~once/day). No
KT/TS parity test is needed because no logic is duplicated. Decompose: pure functions (testable
without mounting, like `resolveLanding`) + a thin composable + a thin component. Guard async loads
with a generation counter (stale-response) and a try/catch (a failed fetch degrades the widget to
hidden, never an unhandled rejection).

**Don't derive "loaded" from the data being null — keep an explicit flag.** `computeView` returns
`'idle'` whenever `round` is null, and a swallowed fetch error also leaves `round` null, so
"not loaded yet" and "load failed" are indistinguishable downstream — and the boundary-driven
refetch can't recover, since `boundaryAction(null, …)` answers `'none'`. Two consequences that
generalise: every consumer must decide what the conflated state means for *its* surface (a header
widget rendering nothing is a fine degradation; a page's most prominent card going permanently blank
is not), and the retry (`FAILED_LOAD_RETRY_MS`, 10 s) must be gated on the explicit flag — the
backend legitimately answers `round: null` for a community without a `startsAt`, and polling that
would be a request every 10 s per open page for nothing.

**App-level header state:** `App.vue` sits above the `[slug]` provider tree, so state it needs from
the active community (title, `startsAt`, `startsAtTimezone`) is published via a module-level ref
`activeCommunity` in `src/communities/context.ts` — not via `provide`/`inject`. `publishCommunity()`
is the single path that *publishes* a loaded community: `registerCommunityDataGuard`'s `afterEach`
(`src/communities/routeData.ts`) calls it once the community is fetched, and the shell's `refresh()`
calls it again on every explicit reload. Clearing is separate and is the guard's own business —
`afterEach` sets `activeCommunity` (and `communityRoute`) to `null` directly when the destination
route carries no slug, rather than going through the helper. `ActiveCommunity` also carries
`viewerIsAdmin` + `pendingCount` for the header's community menu. **Every path that loads the
community must republish it** — publishing only on the initial resolve leaves stale header state
behind (the pending dot would survive an admin clearing the requests). Navigation controls live in
the main header (`nav/NavDrawer.vue`, the app's only menu), never inside the `[slug]` content area.

**Zone-relative time entry:** a `datetime-local` value is a naive wall-clock string; interpret it in
the community's `startsAtTimezone`, not the browser zone — `DateTime.fromISO(local, { zone }).toUTC()`
to store, `DateTime.fromISO(iso, { zone }).toFormat(...)` to display. Test zone-correctness with a
fixture whose zone year/day differs from UTC. Luxon's fallback when `{ zone }` is dropped is the
**system** zone, not UTC — `vitest.config.ts` pins `env: { TZ: 'UTC' }` so that fallback is the same
locally as on CI and a dropped `{ zone }` reliably turns the test red either way. Still choose the
fixture's own zone far from UTC, not merely different from your machine's: the community overview
page's `Pacific/Kiritimati` (UTC+14) is the worked example and stays discriminating under any
plausible host zone, whereas a fixture formatted in `Europe/Berlin` would not.

