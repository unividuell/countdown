# Flicker-Free Navigation: Resolve Route Data Before the Commit

**Status:** Approved design (2026-08-02)
**Builds on:** the `[slug]` community shell, the `activeCommunity` header ref
(`src/communities/context.ts`), and the auth guard (`src/auth/guard.ts`).
**Scope:** `webapp-vue` only. No backend change.

## The observed defect

On `https://beta.countdown.unividuell.org`, logged in as a member of exactly one community
(`hhh`):

1. The user sits on `/hhh/`.
2. They click the community name in the header — the brand `RouterLink to="/"`
   (`App.vue`).
3. The landing resolver sends them straight back to `/hhh/`, so they end where they started.
4. Between click and re-render the UI passes through two wrong states: the header reads
   "countdown", and the content reads "Lade deine Spielgemeinschaften…".

## Root cause

The defect is not specific to the same-target case. It is one instance of a general pattern:
**navigation commits before the data the destination needs is available.** Three mechanisms
combine.

**1 · `/` is a page that renders while it decides.** `pages/index.vue` renders
"Lade deine Spielgemeinschaften…" and only *then*, in `onMounted`, calls `landing()` to work out
where to go. Every trip through `/` therefore paints a placeholder — even when the answer is
"you are already there".

**2 · The `[slug]` shell tears down and refetches on every entry.** `pages/[slug].vue` starts in
`state = 'loading'`, renders "Lade…", calls `getCommunity` in `onMounted`, and only then renders
its `RouterView`. This costs a full round-trip of blank content on every community switch, not
just in the reported flow.

**3 · `activeCommunity` is cleared in `onUnmounted`.** Vue mounts the incoming component before
unmounting the outgoing one, so even a correctly ordered fetch would have its result stomped by
the departing shell's `onUnmounted` handler. The header state must not be owned by a component
lifecycle hook.

## Approach

Move data resolution into the router, ahead of the commit, and let the current view stay on
screen until the destination is ready. Two decisions were taken up front:

- **No cache.** Every entry into a community route awaits a fresh `getCommunity`. `pendingCount`
  and `viewerIsAdmin` drive visible header affordances (the pending dot, the admin block), and a
  briefly stale dot is worse than a brief wait. Simpler, less state.
- **Freeze plus a thin progress bar.** During a cold transition the current view stays exactly as
  it is and a slim progress bar appears under the header. No layout shift, but the click is
  visibly acknowledged.

Rejected: Vue Router 5's `DataLoaderPlugin` / `defineBasicLoader` (`vue-router/experimental`,
present in 5.1.0). It solves the same problem framework-side and would give the pending state for
free, but it is an explicitly experimental API and introduces a per-page concept for what is, in
this app, two routes. Also rejected: patching only the reported flow, which leaves the community
switch flickering.

## Architecture

A new module `src/communities/routeData.ts` owns community route resolution and registers two
router hooks, mirroring how `src/auth/guard.ts` registers the auth guard from `main.ts`.

### `beforeResolve` — read

Branches, in this order:

- **`to.path === '/'`** → resolve the landing: `consumePostLoginRedirect()` first, else
  `landing()`; return the redirect target. On failure, return `true` and record the error so the
  page can render it. This must be checked before the no-slug branch, since `/` carries no slug.
- **No slug** (e.g. `/communities`, `/super-admin`) → return `true`, nothing to load.
- **Slug unchanged** from what is already resolved (`/hhh/` → `/hhh/members`) → return `true`.
  Sub-route moves inside one community must not refetch.
- **Otherwise** → `await getCommunity(slug)`, park the outcome in a module-local `pending` slot,
  return `true`.

The guard **always admits the navigation** except when returning a landing redirect. A 404 or a
network error is a render state, not a navigation block — the URL and the header must stay
consistent with what the user sees.

Concurrent navigations are handled with a generation counter, the same technique as `loadSeq` in
`useCountdown.ts`: a superseded fetch discards its result instead of publishing it.

### `afterEach` — write

Once the navigation has actually committed:

- Destination carries a slug matching `pending` → publish into the module state, then clear
  `pending`. A `ready` outcome also publishes into `activeCommunity`; a `no-access` or `error`
  outcome sets `activeCommunity` to `null`, so a failed switch cannot leave the previous
  community's admin links and pending dot in the header.
- Destination carries no slug → clear both the module state and `activeCommunity`.

Reading in `beforeResolve` and writing in `afterEach` is the crux of the design. It yields the
invariant **the header always reflects the community of the currently committed route**: nothing
is cleared speculatively while a fetch is in flight, and an aborted navigation cannot leave the
header pointing at a community the user never reached.

### Consequence for the reported flow

Clicking the brand from `/hhh/` now resolves `/` inside the guard, which returns a redirect to
`/hhh/` — the route already in effect. Vue Router aborts it as a duplicated navigation. No
component unmounts, no state is cleared, no DOM node is touched. The flicker is not shortened; it
does not occur.

## Module state and the shell contract

`routeData.ts` exposes a module-level ref (the project's no-Pinia convention, see
`frontend.md` § State):

```ts
export type CommunityRouteState =
  | { kind: 'ready'; community: CommunityResponse }
  | { kind: 'no-access' }
  | { kind: 'error' }
```

`pages/[slug].vue` becomes a renderer over that state — no `onMounted`, no `watch`, no
`resolve()`, and crucially **no `'loading'` branch**, because the shell only ever mounts once the
data exists. It keeps `provide(communityKey, { community, refresh })` and the
`as unknown as Readonly<Ref<CommunityResponse>>` bridge documented in `frontend.md`, since
children still only render inside the `ready` branch.

`refresh()` keeps its current contract (no internal `try`/`catch`; rejection is the caller's) and
routes its result through the same publish path as the guard, so the header cannot go stale after
an admin clears a request — the rule already stated in `frontend.md` ("every path that loads the
community must republish it") now has exactly two paths instead of two-plus-a-lifecycle-hook.

A `_resetRouteDataState()` hook sits in the same module, per the project's convention for
module-level singletons.

## Pending indicator

A `navigationPending` ref, set in `beforeEach`, cleared in `afterEach` and in `router.onError`.
`App.vue` renders a thin bar under the header, bound to it.

The bar becomes visible only after **~150 ms**. A bar that flashes for 30 ms on a fast transition
would itself be a flicker — the same defect, reintroduced at smaller scale.

## Cold start

Direct entry to `/hhh/` currently paints the header as "countdown" and then swaps it to "hhh"
once the shell's fetch lands. That is the same defect at first paint. `main.ts` already awaits
`bootstrap()` before mounting; it will also `await router.isReady()`, so the initial navigation —
including the guard's `getCommunity` — completes before the app mounts and the first paint is
already correct.

The cost is a slightly longer blank page. A static header/footer skeleton in `index.html`
mitigates it and removes the white-page-then-app flash as well. That skeleton is separable from
the rest of the change.

## Files

| File | Change |
|---|---|
| `src/communities/routeData.ts` | **new** — resolution, module state, `registerCommunityDataGuard(router)`, `navigationPending`, `_resetRouteDataState()` |
| `src/pages/[slug].vue` | drop `onMounted`/`watch`/`resolve()`/the `'loading'` branch/`onUnmounted` clearing; render from the module state; keep `provide` + `refresh` |
| `src/pages/index.vue` | becomes the landing-failure view with a retry; unreachable on the happy path |
| `src/App.vue` | progress bar under the header |
| `src/communities/CommunityMenu.vue` | stop awaiting `setSelection` before `router.push` — the guard persists the selection anyway; removes a round-trip from every switch |
| `src/main.ts` | register the new guard; `await router.isReady()` before mount |
| `index.html` | static header/footer skeleton (separable) |

## Error handling

- **404** → `no-access`, anything else → `error`. Both render the existing copy inside the shell,
  so the URL and header stay consistent with the message.
- **`landing()` fails** → the navigation to `/` is admitted and `index.vue` renders an error with
  a retry, instead of today's behaviour of hanging on "Lade deine Spielgemeinschaften…" forever.
- **`setSelection` fails** → logged, never blocking. It is a "last visited" marker; losing it must
  not affect navigation. Unchanged in intent, moved in location.
- **Superseded navigation** → generation counter, result discarded.

## Testing

TDD, Vitest + `@vue/test-utils`, guard tests against a real `createMemoryHistory` router with the
API module mocked — the pattern `frontend.md` § Testing prescribes ("assert on
`router.currentRoute` after navigation", not on mock echoes).

New — `src/communities/__tests__/routeData.spec.ts`:

- `activeCommunity` is unchanged while the fetch is in flight and flips only after the commit
- a superseded navigation publishes nothing (two rapid switches; the first result is discarded)
- moving between sub-routes of one community (`/a/` → `/a/members`) issues no second
  `getCommunity`
- switching communities (`/a/` → `/b/`) does refetch
- leaving to a non-community route clears `activeCommunity`
- 404 yields `no-access` and the navigation still commits to the slug URL
- **regression for the reported flow:** from `/hhh/`, navigating to `/` leaves `activeCommunity`
  on `hhh` for the whole transition and never mounts `index.vue`

Rewritten — `src/pages/__tests__/slug-shell.spec.ts` and `src/pages/__tests__/index.spec.ts`,
which today assert exactly the logic being moved out. The shell's remaining behaviour (renders
children when ready, renders the two error states, republishes on `refresh`) stays covered; the
resolution assertions move to the guard spec.

`App.vue`'s progress bar gets a case in `src/__tests__/app-header.spec.ts`: hidden below the
delay threshold, visible above it.

## Non-goals

- No caching or stale-while-revalidate. Decided against above.
- No transition animations. The fix is about not showing wrong states, not about decorating the
  change between right ones.
- No change to how children of `[slug]` obtain the community — `useCommunityContext()` stays.
