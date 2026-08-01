# Slug-Page Navigation moves into the Main Header

**Status:** Approved design (2026-08-01)
**Builds on:** the community admin UI (2026-06-13) and the countdown display (2026-06-14).
**Depends on:** `activeCommunity` (module ref in `src/communities/context.ts`), `useAuth`, `useCommunities`.
**Scope:** frontend only (`webapp-vue`). No backend change — `CommunityResponse` already carries
`viewerIsAdmin` and `pendingCount`.

## Purpose

Today the `/[slug]` shell renders its own local header inside the main content area: the "Verwalten"
dropdown, the community `<select>` switcher, the username and a logout button. That is a second
navigation bar directly below the real one, and it puts community chrome where the community's
content belongs.

Everything in that local header moves into the app-wide main header (`App.vue`) behind two icon
buttons: a **community icon on the far left**, before the community name, and a **member icon on the
far right**, after the countdown. The content area of the `/[slug]` shell is left with nothing but
`<RouterView />`.

## Decisions (locked during brainstorming)

- **Icon pack: Lucide, bundled at build time** via `unplugin-icons` + `@iconify-json/lucide`, both
  devDependencies. Rejected: `@iconify/vue` (the reference app's choice) — it resolves icon data at
  runtime from `api.iconify.design`, i.e. an external request from every user's browser plus a
  visible pop-in. Rejected: hand-written inline SVG — does not scale past a handful of icons.
  This is the icon pack **for the whole app**, not just for these two icons.
- **No separate "Verwalten" page.** The three admin links (Anfragen · Mitglieder · Einstellungen)
  sit directly in the community menu.
- **The admin block is headed by the community name** (variant A: a quiet section label), not by the
  word "Verwalten". Non-admins get **no heading at all** — the current community is already named
  right next to the icon in the header.
- **Visibility:** the community icon renders only inside a community (`activeCommunity !== null`);
  the member icon renders everywhere the viewer is authenticated. Logout therefore has exactly one
  place in the app.
- **Pending signal: a dot, not a number.** A small coloured dot on the community icon when
  `viewerIsAdmin && pendingCount > 0`; the exact count stays behind "Anfragen" inside the menu.
- **State plumbing: extend `activeCommunity`** with `viewerIsAdmin` + `pendingCount`. Rejected:
  hoisting the community fetch into a shared composable (touches the `provide`/`inject` contract of
  all four `[slug]` child pages for no gain); rejected: `<Teleport>` from the shell into the header
  (the member menu must also render outside `/[slug]`, so it cannot live in the shell).
- **One shared dropdown primitive** (`HeaderMenu.vue`) instead of duplicating open/close logic in
  both menus, using VueUse (already a dependency).

## Architecture

### Icon setup

```
pnpm add -D unplugin-icons @iconify-json/lucide
```

- `Icons({ compiler: 'vue3' })` goes into **`vite.config.ts` and `vitest.config.ts`**. The two
  configs are separate; without the plugin in the Vitest config, `~icons/*` imports do not resolve
  in tests.
- `/// <reference types="unplugin-icons/types/vue" />` goes into `env.d.ts` so `vue-tsc` accepts the
  virtual imports.
- Icons used: `~icons/lucide/users` (community), `~icons/lucide/circle-user` (member),
  `~icons/lucide/plus` (create action). The generated components render with `width/height: 1em`
  and `currentColor`, so size and colour come from Tailwind classes (`class="size-5"`).

### Header layout (`App.vue`)

```
[👥 CommunityMenu] [Brand → /]  ·······  [CountdownDisplay] [👤 MemberMenu]
```

The current `justify-between` header with two children becomes two flex groups: community icon +
brand on the left, countdown + member icon on the right. The brand (`{{ name }}'{{ YY }}`, linking
to `/`) and `CountdownDisplay` are unchanged.

### Components

**`src/ui/HeaderMenu.vue`** — the shared mechanics. First component in a new `src/ui/` directory for
shared UI primitives; the feature folders (`communities/`, `auth/`) stay as they are.

- Slots: `trigger` (button content) and default (panel content). Prop: `label` for `aria-label`.
- Holds `open`; closes on outside click (`onClickOutside`), `Escape` (`onKeyStroke`), route change
  (`watch` on `route.fullPath`) and on any click inside the panel (menu items navigate).
- Trigger carries `aria-haspopup="menu"` + `aria-expanded`; the panel carries `role="menu"`.
- `Escape` returns focus to the trigger.
- Panel: light surface on the dark header, `z-20`, positioned under its trigger — left-aligned for
  the community menu, right-aligned for the member menu.

**`src/communities/CommunityMenu.vue`** — renders only when `activeCommunity !== null`. Trigger is
`~icons/lucide/users` plus the dot (absolutely positioned top-right, in the same blue the current
pending badge uses). Calls `useCommunities().refresh()` on mount to fill the list (same as today's
`CommunitySwitcher`).

**`src/auth/MemberMenu.vue`** — renders only when `useAuth().status === 'authenticated'`. Trigger is
`~icons/lucide/circle-user`.

### Data flow

`ActiveCommunity` in `src/communities/context.ts` gains `viewerIsAdmin: boolean` and
`pendingCount: number`.

The `/[slug]` shell gets a single `publish(c: CommunityResponse)` helper that sets **both**
`community.value` and `activeCommunity.value`; `resolve()` and `refresh()` both go through it.
This matters: `refresh()` currently updates only `community.value`, so without the change the dot
would still be showing after an admin has worked through the pending requests on `/[slug]/requests`.

Navigating to another community: `await setSelection(id)`, then `router.push('/<slug>/')`.
Logout: `await logout()`, then `router.replace('/login')`.

## Menu contents

### Community menu

| Block | Condition | Content |
| --- | --- | --- |
| Heading | `viewerIsAdmin` | the current community's name as a quiet, non-interactive section label (small, muted) |
| Admin links | `viewerIsAdmin` | Anfragen (with the count when `pendingCount > 0`) · Mitglieder · Einstellungen |
| Divider | `viewerIsAdmin` | only when the block above it exists |
| Communities | always | every entry of `active` except the current one; click → `setSelection` + `/<slug>/` |
| Create | always | "Spielgemeinschaft erstellen" → `/communities/new`, prefixed with `~icons/lucide/plus` so it reads as an action rather than as another community |

Edge cases: a non-admin sees neither heading nor divider. A viewer who belongs to exactly one
community gets an empty list, leaving only the create action — the icon still renders, so the header
does not jump. On a deep link to `/<slug>` the module-level `active` list is still empty until the
`onMounted` `refresh()` resolves; the entries simply appear afterwards, no spinner.

### Member menu

The username as a non-interactive row, "Abmelden" below it.

## Error handling

Three paths currently leak unhandled promise rejections out of click handlers; the move fixes them:

- **`setSelection` fails** → logged, and the navigation happens **anyway**. The selection is only a
  "last visited" marker; the click meant the navigation.
- **`useCommunities().refresh()` fails** → logged; the list stays empty while the admin block and
  the create action keep working.
- **`logout()` fails** → `useAuth.logout()` deliberately keeps local auth state (the server session
  may still be alive). The menu stays open and shows an "Abmelden fehlgeschlagen" line instead of a
  silently dead click.

## Accessibility

The dot is `aria-hidden`; instead the community trigger's `aria-label` becomes
"Community-Menü, offene Anfragen" when it shows, so the signal is not lost for screen readers.
Both triggers are focusable buttons with `aria-haspopup`/`aria-expanded`, and `Escape` restores
focus to the trigger.

## Removals

- `src/communities/CommunitySwitcher.vue` — fully absorbed into the community menu; deleted.
- The local header in `src/pages/[slug].vue` (the `v-else` branch) shrinks to `<RouterView />`.
  `adminMenuOpen`, `handleLogout` and the imports of `useAuth`, `useRouter`, `RouterLink` and
  `CommunitySwitcher` go with it.
- The logout button on `src/pages/communities/index.vue` — logout now lives in exactly one place.
- The welcome sentence in `src/pages/[slug]/index.vue` — nothing about the current community belongs
  in the content area. The route stays; its template shrinks to a comment-only placeholder (which
  renders nothing and keeps Vue from warning about a missing template) until the game content ships.

## Testing

Test-driven, as the project's testing guideline requires. Vitest + `@vue/test-utils` + happy-dom,
mocking with `vi`.

- **`src/pages/__tests__/slug-shell.spec.ts`** — the three cases covering the admin menu, logout and
  username move out. Remaining: loading / no-access / error / ready, plus new: `resolve()` **and**
  `refresh()` publish `viewerIsAdmin` + `pendingCount` into `activeCommunity`.
- **`src/communities/__tests__/CommunityMenu.spec.ts`** (new) — admin block only for admins · the
  current community is absent from the list · the dot appears only for `viewerIsAdmin` **and**
  `pendingCount > 0` · a click calls `setSelection` then navigates · **a throwing `setSelection`
  still navigates**.
- **`src/auth/__tests__/MemberMenu.spec.ts`** (new) — username visible · "Abmelden" calls `logout()`
  then `replace('/login')` · a throwing `logout()` surfaces the error line.
- **`src/ui/__tests__/HeaderMenu.spec.ts`** (new) — click opens/closes · `Escape` closes · outside
  click closes · route change closes.
- **`src/__tests__/app-header.spec.ts`** — extended: the community icon renders only with an active
  community, the member icon only when `authenticated`.

## Guideline updates

`.claude/guidelines/frontend.md` gains:

- the icon convention (Lucide via `unplugin-icons`, plugin needed in **both** Vite configs,
  types reference in `env.d.ts`, sizing via Tailwind because of `1em`/`currentColor`), and
- the rule that app-level header state travels through `activeCommunity`, and that every path which
  re-fetches the community (`refresh()`, not just `resolve()`) has to republish it.

## Out of scope

- Content for the community home page (`/[slug]/index.vue`) — its own spec.
- Any redesign of `/communities`, `/communities/new` or the admin sub-pages beyond removing the
  logout button.
- Dark mode, an avatar/profile editor, or a "leave community" action.
