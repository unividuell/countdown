# Navigations-Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die beiden Overflow-Menüs im Header durch **einen** Drawer ersetzen, der von rechts hereinfährt und dessen einziger Schalter der Avatar oben rechts ist.

**Architecture:** Eine Komponente `nav/NavDrawer.vue` besitzt den Auf/Zu-Zustand und rendert *beides* — den Avatar-Schalter im Header und den nach `body` teleportierten Drawer. Zusammen, weil Fahrt und Drehung sonst über eine Komponentengrenze synchron gehalten werden müssten. Alles Rechenbare liegt daneben in `nav/drawer.ts` als reine Funktionen, alles Gezeichnete in `ui/BrandMark.vue`.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Tailwind v4, VueUse (`useWindowSize`, `useScrollLock`, `usePreferredReducedMotion`, `onKeyStroke`, `useEventListener`), Vue Router 5, Vitest + `@vue/test-utils` + happy-dom, unplugin-icons (Lucide).

**Spec:** [2026-08-07-nav-drawer-design.md](../specs/2026-08-07-nav-drawer-design.md) — bei jeder Unklarheit dort nachsehen, insbesondere Bereichs-Tabelle, Ziel-Tabelle und Farb-Tabelle.

## Global Constraints

- **Arbeitsverzeichnis ist `webapp-vue/`.** Alle Pfade unten sind relativ dazu, alle Kommandos werden dort ausgeführt.
- **Sprache:** UI-Texte deutsch. Code-Kommentare, Commit-Messages und PR-Beschreibung **englisch** (siehe [git-workflow.md](../../../.claude/guidelines/git-workflow.md)).
- **TypeScript sehr streng:** `noUncheckedIndexedAccess` ist an — jeder Array-Index liefert `T | undefined`. `exactOptionalPropertyTypes`, `noUnusedLocals`, `verbatimModuleSyntax` ebenfalls. `import type` für reine Typ-Importe.
- **Typecheck ist `pnpm vue-tsc -b`**, nicht `--noEmit` (die `tsconfig.json` ist eine Solution-Datei mit `"files": []`; `--noEmit` prüft null Dateien und ist immer grün).
- **Kein neues npm-Paket.** Das Projekt hält die Zahl laufender Runtime-Abhängigkeiten bewusst klein.
- **Tailwind v4 scannt Quelltext**: eine Klasse muss **wörtlich** im Code stehen. Ein zusammengesetztes `` `w-[${x}px]` `` erzeugt keine Regel. Wo ein Wert variiert, gehört er in einen Inline-`:style`.
- **Icons:** `import IconFoo from '~icons/lucide/foo'`, Größe ausschließlich über Tailwind (`class="size-4"`).
- **Navigation gibt Promises zurück:** an jedes `router.push`/`.replace` außerhalb eines `await` gehört ein `.catch((e) => console.error('navigation failed', e))`. In Tests müssen die Doubles `vi.fn().mockResolvedValue(undefined)` sein — ein nacktes `vi.fn()` liefert `undefined`, und `.catch` darauf wirft synchron.
- **Kein `data-test`-Attribut ohne Verwender**, aber jede im Plan genannte `data-test`-Marke ist verbindlich: spätere Tasks und fremde Specs greifen darauf zu.
- **Commit nach jedem Task**, Conventional Commits (`feat(webapp): …`, `refactor(webapp): …`, `docs: …`).

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/nav/drawer.ts` | **Rein.** Sortier-/Markier-Regel der Community-Liste und die Rad-Formel. Kein Vue, kein DOM. |
| `src/ui/BrandMark.vue` | **Rein zeichnend.** Die 36×36-Bitmap als SVG-Punkte im Raster von `flipdot/board.ts`. Keine Props, keine Größe — die setzt der Aufrufer. |
| `src/nav/NavDrawer.vue` | **Zustand + Verdrahtung.** Avatar-Schalter, Teleport-Drawer, Mechanik (öffnen/schließen/Fokus/Scroll-Sperre/Drehung) und die vier Inhaltsbereiche. |
| `src/App.vue` | Nur noch Header-Layout: `NavDrawer` statt der beiden Menüs, Header angehoben. |

Task 3 und 4 arbeiten beide an `NavDrawer.vue` — 3 baut die Hülle samt Mechanik, 4 füllt sie. Getrennt, weil ein Reviewer die Mechanik abnehmen kann, ohne über die Bereichsregeln zu entscheiden, und weil Task 3 die Datei allein lauffähig hinterlässt.

---

### Task 1: Reine Funktionen — Sortierung und Rad-Formel

**Files:**
- Create: `src/nav/drawer.ts`
- Test: `src/nav/__tests__/drawer.spec.ts`

**Interfaces:**
- Consumes: `CommunitySummary` aus `@/api/types` (`{ id: string; name: string; slug: string }`).
- Produces:
  - `interface CommunityEntry { id: string; name: string; slug: string; current: boolean }`
  - `communityEntries(list: readonly CommunitySummary[], activeSlug: string | null): CommunityEntry[]`
  - `spinDegrees(travelPx: number, wheelPx: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/nav/__tests__/drawer.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { communityEntries, spinDegrees } from '@/nav/drawer'
import type { CommunitySummary } from '@/api/types'

const c = (id: string, name: string, slug: string): CommunitySummary => ({ id, name, slug })

describe('communityEntries', () => {
  it('sorts by German collation, not by code point', () => {
    // 'Ä' is U+00C4 — after 'Z' by code point, next to 'A' under German collation.
    // A plain `a.name < b.name` would put Älpler last and pass every other assertion here.
    const entries = communityEntries(
      [c('3', 'Zugspitze', 'zug'), c('1', 'Älpler', 'aelpler'), c('2', 'Berghütte', 'berg')],
      null,
    )
    expect(entries.map((e) => e.name)).toEqual(['Älpler', 'Berghütte', 'Zugspitze'])
  })

  it('keeps the community in context in the list and flags it', () => {
    const entries = communityEntries([c('1', 'Alpha', 'alpha'), c('2', 'Beta', 'beta')], 'beta')
    expect(entries.map((e) => e.slug)).toEqual(['alpha', 'beta'])
    expect(entries.map((e) => e.current)).toEqual([false, true])
  })

  it('flags nothing when no community is in context', () => {
    const entries = communityEntries([c('1', 'Alpha', 'alpha')], null)
    expect(entries.every((e) => !e.current)).toBe(true)
  })

  it('does not mutate its input', () => {
    const list = [c('2', 'Beta', 'beta'), c('1', 'Alpha', 'alpha')]
    communityEntries(list, null)
    expect(list.map((x) => x.slug)).toEqual(['beta', 'alpha'])
  })

  it('answers an empty list with an empty list', () => {
    expect(communityEntries([], null)).toEqual([])
  })
})

describe('spinDegrees', () => {
  it('turns 319px of travel into 1142.33° for the 32px avatar', () => {
    // 319 / 16 rad = 19.9375 rad = 1142.3346…° — 3.17 full turns.
    expect(spinDegrees(319, 32)).toBeCloseTo(1142.33, 1)
  })

  it('is linear in the travel', () => {
    expect(spinDegrees(640, 32)).toBeCloseTo(2 * spinDegrees(320, 32), 6)
  })

  it('is 0 before anything has a width', () => {
    expect(spinDegrees(0, 32)).toBe(0)
    expect(spinDegrees(319, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nav/__tests__/drawer.spec.ts`
Expected: FAIL — `Failed to resolve import "@/nav/drawer"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/nav/drawer.ts`:

```ts
import type { CommunitySummary } from '@/api/types'

export interface CommunityEntry {
  id: string
  name: string
  slug: string
  /** The community in context: shown, greyed out, not navigable. */
  current: boolean
}

/**
 * The switcher's rows. The community in context stays in the list rather than being filtered
 * out — greyed out it answers "where am I" without the reader having to count.
 *
 * localeCompare('de'), not `<`: 'Ä' sits after 'Z' by code point, so a naive comparison sorts
 * every umlaut community to the end.
 */
export function communityEntries(
  list: readonly CommunitySummary[],
  activeSlug: string | null,
): CommunityEntry[] {
  return [...list]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, current: c.slug === activeSlug }))
}

/**
 * How far a wheel of diameter `wheelPx` turns while rolling `travelPx`, in degrees.
 *
 * The avatar drives the drawer like a wheel on a rail, so the angle has to follow the drawer's
 * actual width — a constant would only be right on the viewport it was written for.
 */
export function spinDegrees(travelPx: number, wheelPx: number): number {
  if (wheelPx <= 0) return 0
  return (travelPx / (wheelPx / 2)) * (180 / Math.PI)
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run src/nav/__tests__/drawer.spec.ts && pnpm vue-tsc -b`
Expected: 8 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/nav/drawer.ts src/nav/__tests__/drawer.spec.ts
git commit -m "feat(webapp): add the drawer's sorting rule and wheel formula

The avatar drives the drawer like a wheel on a rail, so the spin angle
follows the drawer's actual width rather than a constant that is only
right on one viewport.

Community names sort by localeCompare('de'): under a plain comparison
every umlaut name lands after Z."
```

---

### Task 2: `BrandMark.vue` — das Logo im Flip-Dot-Raster

**Files:**
- Create: `src/ui/BrandMark.vue`
- Test: `src/ui/__tests__/BrandMark.spec.ts`

**Interfaces:**
- Consumes: `PITCH` (4) und `RADIUS` (1.5) aus `@/ui/flipdot/board`.
- Produces: `<BrandMark />` — ein `<svg>` ohne Props, ohne eigene Größe, `fill="currentColor"`, `aria-hidden="true"`, `viewBox="0 0 143 143"`, 720 `<circle>`.

**Warum die Geometrie so:** `board.ts` rechnet die Brettbreite als `cols * PITCH - (PITCH - 2 * RADIUS)`. Punkt *i* liegt also von `i * PITCH` bis `i * PITCH + 2 * RADIUS`, sein Mittelpunkt bei `i * PITCH + RADIUS`. Bei 36 Reihen: `35 * 4 + 3 = 143`. Diese Formel muss übernommen werden, nicht neu erfunden — sonst sitzt das Zeichen auf einem anderen Raster als die Tafel im Header.

- [ ] **Step 1: Write the failing test**

Create `src/ui/__tests__/BrandMark.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '@/ui/BrandMark.vue'
import { PITCH, RADIUS } from '@/ui/flipdot/board'

describe('BrandMark', () => {
  it('renders one circle per lit dot of the 36x36 bitmap', () => {
    expect(mount(BrandMark).findAll('circle')).toHaveLength(720)
  })

  it('spans the same metric the flip-dot board uses', () => {
    // board.ts: width = cols * PITCH - (PITCH - 2 * RADIUS) => (36 - 1) * 4 + 3 = 143.
    // Hard-coding 143 here would pass even if the mark drifted onto its own grid.
    const side = (36 - 1) * PITCH + 2 * RADIUS
    expect(mount(BrandMark).attributes('viewBox')).toBe(`0 0 ${side} ${side}`)
  })

  it('places dots on the grid, offset by the radius like the board does', () => {
    // Row 0's first lit dot is at column 14 of the bitmap.
    const first = mount(BrandMark).findAll('circle')[0]!
    expect(Number(first.attributes('cx'))).toBeCloseTo(14 * PITCH + RADIUS, 6)
    expect(Number(first.attributes('cy'))).toBeCloseTo(0 * PITCH + RADIUS, 6)
    expect(Number(first.attributes('r'))).toBeCloseTo(RADIUS, 6)
  })

  it('inherits colour and says nothing to assistive technology', () => {
    const w = mount(BrandMark)
    expect(w.attributes('fill')).toBe('currentColor')
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('states no size of its own, so the caller decides', () => {
    const w = mount(BrandMark)
    expect(w.attributes('width')).toBeUndefined()
    expect(w.attributes('height')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/BrandMark.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/BrandMark.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/BrandMark.vue`:

```vue
<script setup lang="ts">
/**
 * The unividuell mark, punched out of the same dot grid the flip-dot board uses — PITCH and
 * RADIUS are imported rather than restated, so a change to the board's geometry carries over
 * instead of silently drifting apart from it.
 *
 * Derived from unividuell_logo_circle_wb.png (1042², 16-bit RGBA) by sampling each of 36×36
 * cells and lighting a dot where at least half the cell is opaque AND dark
 * (alpha > 127 && red < 128). The white letterform inside the disc is opaque white, not a hole,
 * so that rule is what turns it back into a cut-out. Nothing reads the PNG at runtime: the
 * image ships zero bytes and costs no request. A new logo has to be re-rastered by that rule.
 */
import { PITCH, RADIUS } from '@/ui/flipdot/board'

const BITMAP = [
  '..............##.....#..............',
  '...........#####.....####...........',
  '.........#######.....######.........',
  '.......#########......#######.......',
  '......##########......########......',
  '.....###########......#########.....',
  '....############.......#########....',
  '...#############.......##########...',
  '...#############.......##########...',
  '..##############........##########..',
  '..##############........##########..',
  '.###############.........##########.',
  '.###############....#....##########.',
  '.###############....#....##########.',
  '################....##....#########.',
  '################....##....#########.',
  '################....##....#########.',
  '################....###....#######..',
  '################....###....#######..',
  '################....###.....######..',
  '################....####....#####...',
  '################....####....#####...',
  '.###############....#####....####...',
  '.###############....#####....###....',
  '.##############.....#####....###....',
  '..#############.....######....##....',
  '..#############....#######....#.....',
  '...###########.....########...#.....',
  '...##########.....#########.........',
  '....#######.......#########.........',
  '.................###########........',
  '................############........',
  '..............##############........',
  '...........################.........',
  '...........##############...........',
  '..............########..............',
]

// Same metric as board.ts: dot i spans [i*PITCH, i*PITCH + 2*RADIUS], so the last dot's right
// edge — and the box — ends at (n-1)*PITCH + 2*RADIUS rather than n*PITCH.
const SIDE = (BITMAP.length - 1) * PITCH + 2 * RADIUS

const dots = BITMAP.flatMap((row, r) =>
  [...row].flatMap((ch, c) =>
    ch === '#' ? [{ cx: c * PITCH + RADIUS, cy: r * PITCH + RADIUS }] : [],
  ),
)
</script>

<template>
  <svg :viewBox="`0 0 ${SIDE} ${SIDE}`" fill="currentColor" aria-hidden="true">
    <circle v-for="(d, i) in dots" :key="i" :cx="d.cx" :cy="d.cy" :r="RADIUS" />
  </svg>
</template>
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run src/ui/__tests__/BrandMark.spec.ts && pnpm vue-tsc -b`
Expected: 5 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/BrandMark.vue src/ui/__tests__/BrandMark.spec.ts
git commit -m "feat(webapp): draw the brand mark on the flip-dot grid

Rastering the logo instead of fading it is what keeps it visible on a
flat display: the damping comes from dots covering only part of the
area, not from opacity, so it never washes out into white.

PITCH and RADIUS are imported from board.ts rather than restated, and
the box uses the board's own metric — (n-1)*PITCH + 2*RADIUS — so the
mark cannot drift onto a grid of its own."
```

---

### Task 3: `NavDrawer.vue` — Hülle und Mechanik

Der Drawer öffnet, schließt, fährt, dreht und sperrt — aber ist noch leer. Am Ende dieses Tasks ist die Komponente allein montierbar und getestet; noch nicht in `App.vue` verdrahtet.

**Files:**
- Create: `src/nav/NavDrawer.vue`
- Test: `src/nav/__tests__/NavDrawer.spec.ts`

**Interfaces:**
- Consumes: `spinDegrees` aus `./drawer` (Task 1); `Avatar` aus `@/ui/Avatar.vue` (Props `shortName`, `bgColorHex`, `size`); `MeResponse` aus `@/api/types`; `activeCommunity` aus `@/communities/context`.
- Produces: `<NavDrawer :user="user" />` mit `defineProps<{ user: MeResponse }>()`.
- Verbindliche Marken für spätere Tasks und fremde Specs:
  - `data-test="nav-toggle"` — der Avatar-Schalter (`<button>`)
  - `data-test="nav-spinner"` — der drehende Wrapper um den Avatar (`<span>` im Schalter)
  - `data-test="nav-drawer"` — die Drawer-Fläche (`<aside>`)
  - `data-test="nav-scrim"` — der Scrim
  - `data-test="pending-dot"` — der blaue Punkt am Avatar

**Zwei Testtechniken, ohne die dieser Task nicht läuft:**

1. **`stubs: { teleport: true }`.** Der Drawer wird nach `body` teleportiert und liegt damit
   *außerhalb* von `wrapper.element` — `wrapper.find()` durchsucht nur den eigenen Teilbaum und
   fände ihn nie. Der Teleport-Stub rendert den Inhalt an Ort und Stelle.
2. **`attachTo` auf ein echtes `<header>`.** Die Komponente liest ihre Oberkante über
   `trigger.closest('header')`. Ohne einen `<header>`-Vorfahren gibt es nichts zu messen, und
   `getBoundingClientRect` lässt sich nur an einem Element stubben, das man selbst angelegt hat.
   Zugleich ist `attachTo` die Voraussetzung dafür, dass `document.activeElement` überhaupt etwas
   Sinnvolles liefert.

**Warum die Breite im Skript liegt:** siehe Spec. `useWindowSize()` statt einer Tailwind-Klasse, damit Winkel und Breite dieselbe Zahl benutzen — und damit ein Test `window.innerWidth` setzen und den Winkel prüfen kann. Eine aus dem Layout gelesene Breite wäre unter happy-dom immer 0.

- [ ] **Step 1: Write the failing test**

Create `src/nav/__tests__/NavDrawer.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import NavDrawer from '@/nav/NavDrawer.vue'
import { activeCommunity } from '@/communities/context'
import { _resetCommunitiesState } from '@/communities/useCommunities'
import { useAuth } from '@/auth/useAuth'
import * as api from '@/api/communities'
import type { MeResponse } from '@/api/types'

enableAutoUnmount(afterEach)

vi.mock('@/api/communities', () => ({ listCommunities: vi.fn(), getSelection: vi.fn() }))
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn() }))

// push/replace must resolve: NavDrawer attaches .catch() to every navigation, and .catch on a
// bare vi.fn()'s undefined return throws synchronously.
const { pushMock, replaceMock, route, logoutMock } = vi.hoisted(() => ({
  pushMock: vi.fn().mockResolvedValue(undefined),
  replaceMock: vi.fn().mockResolvedValue(undefined),
  logoutMock: vi.fn().mockResolvedValue(undefined),
  route: { fullPath: '/' },
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const reactiveRoute = reactive(route)
  return {
    useRoute: () => reactiveRoute,
    useRouter: () => ({ push: pushMock, replace: replaceMock }),
    RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  }
})

const viewer: MeResponse = {
  id: 'u1',
  username: 'octo',
  githubLogin: 'octo',
  githubName: null,
  email: null,
  bgColorHex: null,
  avatar: { shortName: 'OCTO', bgColorHex: '#8e44ad' },
  isSuperAdmin: false,
  mayCreateCommunities: false,
  createdAt: null,
}

/**
 * Mounts inside a real <header>, because the drawer reads its top edge from
 * `trigger.closest('header')`. `headerBottom` stubs that edge — happy-dom's own
 * getBoundingClientRect answers 0 for everything.
 *
 * teleport: true renders the drawer in place; teleported to <body> it would sit outside
 * wrapper.element, where wrapper.find() cannot reach it.
 */
function render(user: MeResponse = viewer, headerBottom = 0) {
  const host = document.createElement('header')
  host.getBoundingClientRect = () => ({ bottom: headerBottom }) as DOMRect
  document.body.appendChild(host)
  return mount(NavDrawer, {
    props: { user },
    attachTo: host,
    global: { stubs: { teleport: true } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    user: ref(viewer) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: logoutMock,
    markAnonymous: vi.fn(),
  })
  vi.mocked(api.listCommunities).mockResolvedValue([])
  _resetCommunitiesState()
  activeCommunity.value = null
  route.fullPath = '/'
  window.innerWidth = 375
})

describe('NavDrawer mechanics', () => {
  it('starts closed: the drawer is inert and hidden from assistive tech', () => {
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('inert')).toBeDefined()
    expect(drawer.attributes('aria-hidden')).toBe('true')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('opens on the toggle and drops inert', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('inert')).toBeUndefined()
    expect(drawer.attributes('aria-hidden')).toBeUndefined()
  })

  it('names the toggle for its current action', async () => {
    const w = render()
    const toggle = w.get('[data-test=nav-toggle]')
    // The label sits on the button, not on the avatar inside it: name-from-content does not
    // pull a child's aria-label up into a button's accessible name in Chromium.
    expect(toggle.attributes('aria-label')).toBe('Menü öffnen')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-label')).toBe('Menü schließen')
  })

  it('mentions open requests in the toggle name while the dot shows', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: true,
      pendingCount: 2,
    }
    const w = render()
    await nextTick()
    expect(w.find('[data-test=pending-dot]').exists()).toBe(true)
    expect(w.get('[data-test=nav-toggle]').attributes('aria-label')).toBe(
      'Menü öffnen, offene Anfragen',
    )
  })

  it('shows no dot for a non-admin, however many requests are pending', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 7,
    }
    const w = render()
    await nextTick()
    expect(w.find('[data-test=pending-dot]').exists()).toBe(false)
  })

  it('spins the avatar by the drawer travel, and unwinds it exactly on close', async () => {
    window.innerWidth = 375 // min(320, 0.85 * 375 = 318.75 -> 319)
    const w = render()
    const spinner = w.get('[data-test=nav-spinner]')
    expect(spinner.attributes('style')).toContain('rotate(0deg)')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(spinner.attributes('style')).toContain('rotate(1142.33')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(spinner.attributes('style')).toContain('rotate(0deg)')
  })

  it('caps the drawer at 320px on a wide viewport', async () => {
    window.innerWidth = 1440
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('width: 320px')
  })

  it('keeps the avatar still under prefers-reduced-motion', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-spinner]').attributes('style')).toContain('rotate(0deg)')
  })

  it('drives travel and spin off one duration and one curve', async () => {
    // Congruence cannot be measured here — happy-dom computes no styles. What a unit test can
    // pin is that both carry the same transition, which is what makes them congruent.
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]').attributes('class') ?? ''
    const spinner = w.get('[data-test=nav-spinner]').attributes('class') ?? ''
    for (const cls of ['duration-300', 'ease-[cubic-bezier(.4,0,.2,1)]']) {
      expect(drawer).toContain(cls)
      expect(spinner).toContain(cls)
    }
  })

  it('hangs the drawer off the header bottom edge', async () => {
    const w = render(viewer, 116)
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 116px')
  })

  it('takes the full height once the header has scrolled away', async () => {
    // A scrolled-past header has a negative bottom edge. Clamped to 0 the drawer covers
    // everything — right, because there is no header left to stay below.
    const w = render(viewer, -40)
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-drawer]').attributes('style')).toContain('top: 0px')
  })

  it('keeps the scrim out of the way while closed', async () => {
    // pointer-events-none matters as much as the opacity: a fully transparent scrim that still
    // takes clicks would swallow every click on the page without anything to see.
    const w = render()
    expect(w.get('[data-test=nav-scrim]').classes()).toEqual(
      expect.arrayContaining(['opacity-0', 'pointer-events-none']),
    )
    await w.get('[data-test=nav-toggle]').trigger('click')
    const scrim = w.get('[data-test=nav-scrim]')
    expect(scrim.classes()).toContain('opacity-100')
    expect(scrim.classes()).not.toContain('pointer-events-none')
  })

  it('locks the page behind it while open', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(document.body.style.overflow).toBe('hidden')
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('closes on Escape and gives the focus back to the toggle', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(w.get('[data-test=nav-toggle]').element)
  })

  it('closes on a click outside, but not on one inside', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')

    await w.get('[data-test=nav-drawer]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('closes on navigation', async () => {
    const w = render()
    await w.get('[data-test=nav-toggle]').trigger('click')
    route.fullPath = '/c/team/'
    await nextTick()
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('false')
  })

  it('is a dialog while open', async () => {
    const w = render()
    const drawer = w.get('[data-test=nav-drawer]')
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.attributes('aria-modal')).toBe('true')
    expect(drawer.attributes('aria-label')).toBe('Menü')
  })

  it('carries a 32px avatar, which is what the spin angle assumes', () => {
    // AVATAR_PX is a constant in NavDrawer; this is the assertion that ties it to Avatar's
    // actual `sm` size, so shrinking the avatar cannot silently falsify the rotation.
    expect(render().get('[data-test=nav-toggle]').html()).toContain('size-8')
  })

  it('loads the community list once on mount and again on every open', async () => {
    const w = render()
    await flushPromises()
    expect(api.listCommunities).toHaveBeenCalledTimes(1)
    await w.get('[data-test=nav-toggle]').trigger('click')
    await flushPromises()
    expect(api.listCommunities).toHaveBeenCalledTimes(2)
  })

  it('survives a failing community list', async () => {
    vi.mocked(api.listCommunities).mockRejectedValue(new Error('nope'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = render()
    await flushPromises()
    await w.get('[data-test=nav-toggle]').trigger('click')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nav/__tests__/NavDrawer.spec.ts`
Expected: FAIL — `Failed to resolve import "@/nav/NavDrawer.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/nav/NavDrawer.vue`:

```vue
<script setup lang="ts">
/**
 * The app's only menu. Owns the open state and renders BOTH halves of it — the avatar toggle
 * that sits in the header, and the drawer teleported to <body>.
 *
 * Together in one component on purpose: the avatar drives the drawer like a wheel on a rail,
 * and travel and spin have to share one duration, one curve and one width. Split across two
 * components that agreement would have to be maintained by hand across a seam.
 */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import {
  onKeyStroke,
  useEventListener,
  usePreferredReducedMotion,
  useScrollLock,
  useWindowSize,
} from '@vueuse/core'
import { useRoute } from 'vue-router'
import Avatar from '@/ui/Avatar.vue'
import { activeCommunity } from '@/communities/context'
import { useCommunities } from '@/communities/useCommunities'
import { spinDegrees } from './drawer'
import type { MeResponse } from '@/api/types'

defineProps<{ user: MeResponse }>()

/** Material's nav drawer: screen width minus 56dp, never wider than 320. */
const DRAWER_MAX_PX = 320
const DRAWER_VW = 0.85
/** Avatar.vue's `sm` is `size-8`. Pinned by a test, because the spin angle depends on it. */
const AVATAR_PX = 32

const open = ref(false)
const drawerTop = ref(0)
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const drawer = useTemplateRef<HTMLElement>('drawer')
const route = useRoute()
const { width: viewport } = useWindowSize()
const reduced = usePreferredReducedMotion()
const bodyLocked = useScrollLock(document.body)
const { active, refresh } = useCommunities()

// The width lives here rather than in a Tailwind class: the spin angle needs the same number,
// and two sources for one width drift the moment somebody edits one of them.
const drawerWidth = computed(() => Math.min(DRAWER_MAX_PX, Math.round(viewport.value * DRAWER_VW)))

const spin = computed(() =>
  open.value && reduced.value !== 'reduce' ? spinDegrees(drawerWidth.value, AVATAR_PX) : 0,
)

const showDot = computed(
  () => Boolean(activeCommunity.value?.viewerIsAdmin) && (activeCommunity.value?.pendingCount ?? 0) > 0,
)
const toggleLabel = computed(() => {
  const base = open.value ? 'Menü schließen' : 'Menü öffnen'
  return showDot.value ? `${base}, offene Anfragen` : base
})

function loadCommunities(): void {
  // A failed list leaves every other block of the drawer working.
  refresh().catch((e) => console.error('could not load the community list', e))
}
onMounted(loadCommunities)

/**
 * The header scrolls away with the page, so its bottom edge is read at open time rather than
 * assumed. Scrolled past, the edge is negative and the clamp gives the drawer the full height —
 * which is right: there is no header left to stay below. The scroll lock is what keeps the
 * measured value from going stale while the drawer is up.
 */
function measureTop(): void {
  const header = trigger.value?.closest('header')
  drawerTop.value = Math.max(0, header?.getBoundingClientRect().bottom ?? 0)
}

async function setOpen(next: boolean): Promise<void> {
  if (next) {
    measureTop()
    loadCommunities()
    open.value = true
    await nextTick()
    drawer.value?.focus()
  } else {
    open.value = false
    trigger.value?.focus()
  }
}

watch(open, (v) => {
  bodyLocked.value = v
})

// Every navigating entry closes the drawer this way, which is why a click inside is NOT wired
// to close: a failed logout has to keep it open to show its message.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

onKeyStroke('Escape', () => {
  if (open.value) void setOpen(false)
})

// onClickOutside is not used: happy-dom's event shim does not satisfy it, so a test written
// against it cannot pass. This listens directly and checks containment itself.
useEventListener(document, 'click', (e: Event) => {
  if (!open.value) return
  const target = e.target as Node
  if (drawer.value?.contains(target) || trigger.value?.contains(target)) return
  void setOpen(false)
})

// A minimal focus cycle rather than a focus-trap dependency. The toggle is part of the cycle
// because it is also the close button.
onKeyStroke('Tab', (e) => {
  if (!open.value) return
  const inDrawer = Array.from(
    drawer.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
  )
  const items = [trigger.value, ...inDrawer].filter((el): el is HTMLElement => Boolean(el))
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
})
</script>

<template>
  <button
    ref="trigger"
    data-test="nav-toggle"
    type="button"
    :aria-label="toggleLabel"
    aria-haspopup="dialog"
    :aria-expanded="open"
    aria-controls="nav-drawer"
    class="flex cursor-pointer items-center rounded p-1 hover:bg-stone-800"
    @click="setOpen(!open)"
  >
    <!-- The spin lives on this wrapper, not on Avatar itself, so the rotation cannot fight
         whatever transform the avatar uses for its own label. -->
    <span
      data-test="nav-spinner"
      class="relative flex transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none"
      :style="{ transform: `rotate(${spin}deg)` }"
    >
      <Avatar v-bind="user.avatar" size="sm" />
      <span
        v-if="showDot"
        data-test="pending-dot"
        aria-hidden="true"
        class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-stone-900 bg-blue-600"
      />
    </span>
  </button>

  <Teleport to="body">
    <div
      data-test="nav-scrim"
      aria-hidden="true"
      class="fixed inset-0 z-10 bg-black/45 transition-opacity duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:duration-150"
      :class="open ? 'opacity-100' : 'pointer-events-none opacity-0'"
    />
    <aside
      id="nav-drawer"
      ref="drawer"
      data-test="nav-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Menü"
      tabindex="-1"
      :inert="!open || undefined"
      :aria-hidden="!open || undefined"
      :style="{ width: `${drawerWidth}px`, top: `${drawerTop}px` }"
      class="fixed right-0 bottom-0 z-20 flex flex-col bg-white text-neutral-900 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] outline-none motion-reduce:transition-none"
      :class="open ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Content lands here in the next task. -->
    </aside>
  </Teleport>
</template>
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run src/nav/__tests__/NavDrawer.spec.ts && pnpm vue-tsc -b`
Expected: all passing, typecheck clean.

If `inert` reaches the DOM as `inert="false"` rather than being absent, the `|| undefined` is missing — Vue only omits an attribute for `null`/`undefined`/`false`, and `false` is omitted only for genuine boolean attributes.

- [ ] **Step 5: Commit**

```bash
git add src/nav/NavDrawer.vue src/nav/__tests__/NavDrawer.spec.ts
git commit -m "feat(webapp): add the nav drawer's shell and mechanics

The toggle and the drawer live in one component because the avatar
drives the drawer like a wheel on a rail: travel and spin share one
duration, one curve and one width, and across a component seam that
agreement would have to be maintained by hand.

The width is owned by script rather than a Tailwind class for the same
reason — the spin angle needs the same number.

The header scrolls away with the page, so its bottom edge is read at
open time and clamped: scrolled past, the drawer correctly takes the
full height, because there is no header left to stay below."
```

---

### Task 4: `NavDrawer.vue` — Inhalt, Wasserzeichen und Scroll-Verhalten

**Files:**
- Modify: `src/nav/NavDrawer.vue` (nur das `<aside>`-Innere und die dafür nötigen Imports/Computeds)
- Modify: `src/nav/__tests__/NavDrawer.spec.ts` (neuer `describe`-Block, bestehende Tests unverändert)

**Interfaces:**
- Consumes: `communityEntries` aus `./drawer` (Task 1), `BrandMark` aus `@/ui/BrandMark.vue` (Task 2), `communityPath` aus `@/communities/routes`, `useAuth().logout` aus `@/auth/useAuth`.
- Produces: Marken `data-test="switch-community"`, `"current-community"`, `"create-community"`, `"admin-heading"`, `"pending-count"`, `"super-admin"`, `"logout"`, `"logout-error"`, `"nav-scroll"`, `"nav-mark"`, `"nav-foot"`.

**Layout-Regel, die den Kern trägt** (siehe Spec): `<aside>` ist eine Flex-Spalte aus **zwei** Kindern — der Scroll-Fläche und dem Fußblock. Das Wasserzeichen ist das letzte Element *innerhalb* der Scroll-Fläche mit `grow shrink-0 basis-auto`: `grow` nimmt freien Platz auf, `shrink-0` gibt die 200px nie her. Bei langer Liste wächst dadurch die Scroll-Höhe und man scrollt zum Logo. Weil der Fußblock ein Geschwister der Scroll-Fläche ist, ist „Abmelden“ nie wegscrollbar.

**Nicht** `max-height: 100%` am SVG versuchen: die Höhe eines Flex-Kindes gilt für die Prozentauflösung als unbestimmt, das SVG bliebe auf 200px und sprengte die Fläche.

- [ ] **Step 1: Write the failing test**

Zuerst zwei Zeilen **zu den Imports oben** in `src/nav/__tests__/NavDrawer.spec.ts` ergänzen (ESLint
verlangt Imports am Dateianfang, nicht mitten im File):

```ts
import { communityPath } from '@/communities/routes'
import type { CommunitySummary, MeResponse } from '@/api/types'
```

Dann den folgenden Block **ans Dateiende** anhängen — die Helfer `render`, `viewer`, `api`,
`pushMock`, `replaceMock`, `logoutMock` und `activeCommunity` stammen unverändert aus Task 3:

```ts
const community = (id: string, name: string, slug: string): CommunitySummary => ({ id, name, slug })

const THREE = [
  community('2', 'Berghütte', 'berg'),
  community('1', 'Almhütte', 'alm'),
  community('3', 'Chalet', 'chalet'),
]

function asAdminOf(slug: string, name: string, pendingCount = 0) {
  activeCommunity.value = {
    slug,
    name,
    startsAt: null,
    startsAtTimezone: 'UTC',
    viewerIsAdmin: true,
    pendingCount,
  }
}

async function opened(user: MeResponse = viewer) {
  const w = render(user)
  await flushPromises()
  await w.get('[data-test=nav-toggle]').trigger('click')
  await flushPromises()
  return w
}

describe('NavDrawer content', () => {
  it('lists every community alphabetically, the current one greyed and not clickable', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    activeCommunity.value = {
      slug: 'berg',
      name: 'Berghütte',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const w = await opened()

    const rows = w.findAll('[data-test=switch-community], [data-test=current-community]')
    expect(rows.map((r) => r.text().replace(/\s+/g, ' ').trim())).toEqual([
      'Almhütte',
      'Berghütte',
      'Chalet',
    ])

    const current = w.get('[data-test=current-community]')
    expect(current.element.tagName).toBe('DIV')
    expect(current.attributes('aria-current')).toBe('true')
    expect(current.classes()).toContain('text-neutral-400')
  })

  it('navigates to a community that is not the current one', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue(THREE)
    const w = await opened()
    await w.findAll('[data-test=switch-community]')[0]!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith(communityPath('alm'))
  })

  it('drops the switcher when the viewer is in exactly one community', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue([community('1', 'Almhütte', 'alm')])
    const w = await opened()
    expect(w.find('[data-test=switch-community]').exists()).toBe(false)
    expect(w.find('[data-test=current-community]').exists()).toBe(false)
  })

  it('offers creating a community only to someone allowed to', async () => {
    vi.mocked(api.listCommunities).mockResolvedValue([community('1', 'Almhütte', 'alm')])
    expect((await opened()).find('[data-test=create-community]').exists()).toBe(false)
    expect(
      (await opened({ ...viewer, mayCreateCommunities: true }))
        .get('[data-test=create-community]')
        .attributes('href'),
    ).toBe('/communities/new')
  })

  it('shows the admin block under the community name, with the pending count', async () => {
    asAdminOf('team', 'Team Süd', 3)
    const w = await opened()
    expect(w.get('[data-test=admin-heading]').text()).toBe('Team Süd')
    expect(w.get('[data-test=pending-count]').text()).toBe('3')
    expect(w.findAll('[data-test=nav-scroll] a').map((a) => a.attributes('href'))).toEqual([
      communityPath('team', 'requests'),
      communityPath('team', 'members'),
      communityPath('team', 'settings'),
    ])
  })

  it('hides the count when nothing is pending, but keeps the entry', async () => {
    asAdminOf('team', 'Team Süd', 0)
    const w = await opened()
    expect(w.find('[data-test=pending-count]').exists()).toBe(false)
    expect(w.get('[data-test=admin-heading]').exists()).toBe(true)
  })

  it('shows no admin block to a plain member', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team Süd',
      startsAt: null,
      startsAtTimezone: 'UTC',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    expect((await opened()).find('[data-test=admin-heading]').exists()).toBe(false)
  })

  it('keeps the super-admin entry out of sight for everyone else', async () => {
    expect((await opened()).find('[data-test=super-admin]').exists()).toBe(false)
    expect(
      (await opened({ ...viewer, isSuperAdmin: true })).get('[data-test=super-admin]').attributes('href'),
    ).toBe('/super-admin')
  })

  it('always shows the mark and the logout entry', async () => {
    const w = await opened()
    expect(w.find('[data-test=nav-mark]').exists()).toBe(true)
    expect(w.get('[data-test=nav-foot]').text()).toContain('Abmelden')
  })

  it('keeps the foot outside the scrolling area so it cannot scroll away', async () => {
    const w = await opened()
    const scroll = w.get('[data-test=nav-scroll]')
    expect(scroll.classes()).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']))
    expect(scroll.find('[data-test=nav-foot]').exists()).toBe(false)
    // grow + shrink-0: takes the slack, but never gives its own height back.
    expect(w.get('[data-test=nav-mark]').classes()).toEqual(
      expect.arrayContaining(['grow', 'shrink-0', 'basis-auto']),
    )
  })

  it('signs out and goes to the login page', async () => {
    const w = await opened()
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(logoutMock).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith('/login')
  })

  it('stays open with a message when signing out fails', async () => {
    logoutMock.mockRejectedValueOnce(new Error('offline'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await opened()
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(replaceMock).not.toHaveBeenCalled()
    expect(w.get('[data-test=logout-error]').text()).toContain('fehlgeschlagen')
    expect(w.get('[data-test=nav-toggle]').attributes('aria-expanded')).toBe('true')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/nav/__tests__/NavDrawer.spec.ts`
Expected: FAIL — die neuen `data-test`-Marken existieren nicht; die Tests aus Task 3 bleiben grün.

- [ ] **Step 3: Write minimal implementation**

In `src/nav/NavDrawer.vue` die bestehende `useRoute`-Zeile erweitern und die übrigen Imports
ergänzen (alle **oben**, zu den vorhandenen):

```ts
import { RouterLink, useRoute, useRouter } from 'vue-router'
import IconCheck from '~icons/lucide/check'
import IconPlus from '~icons/lucide/plus'
import BrandMark from '@/ui/BrandMark.vue'
import { useAuth } from '@/auth/useAuth'
import { communityPath } from '@/communities/routes'
import { communityEntries, spinDegrees } from './drawer'
```

`defineProps` an eine Variable binden, weil das Template `props.user.mayCreateCommunities` braucht:

```ts
const props = defineProps<{ user: MeResponse }>()
```

Und im Skript ergänzen:

```ts
const router = useRouter()
const { logout } = useAuth()
const logoutFailed = ref(false)

const entries = computed(() => communityEntries(active.value, activeCommunity.value?.slug ?? null))
// The list only earns its rows when there is somewhere to switch to; the create entry shares
// the block, so the block itself outlives the list.
const showSwitcher = computed(() => entries.value.length > 1)
const mayCreate = computed(() => props.user.mayCreateCommunities)
const showCommunityBlock = computed(() => showSwitcher.value || mayCreate.value)
const admin = computed(() => (activeCommunity.value?.viewerIsAdmin ? activeCommunity.value : null))

/** One row's geometry, stated once: 44px is the touch-target floor. */
const ROW = 'flex h-11 w-full items-center gap-2.5 px-5 text-left text-sm'
const LINK = `${ROW} cursor-pointer hover:bg-neutral-100`

function go(slug: string): void {
  router.push(communityPath(slug)).catch((e) => console.error('navigation failed', e))
}

async function handleLogout(): Promise<void> {
  logoutFailed.value = false
  try {
    await logout()
  } catch (e) {
    // useAuth keeps local auth state on failure — the session may still be alive.
    console.error('logout failed', e)
    logoutFailed.value = true
    return
  }
  router.replace('/login').catch((e) => console.error('navigation failed', e))
}
```

Das leere `<aside>`-Innere ersetzen:

```vue
      <div
        data-test="nav-scroll"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1.5"
      >
        <template v-if="showCommunityBlock">
          <template v-for="e in showSwitcher ? entries : []" :key="e.id">
            <div
              v-if="e.current"
              data-test="current-community"
              aria-current="true"
              :class="`${ROW} text-neutral-400`"
            >
              {{ e.name }}
              <IconCheck class="ml-auto size-4" aria-hidden="true" />
            </div>
            <button
              v-else
              type="button"
              data-test="switch-community"
              :class="LINK"
              @click="go(e.slug)"
            >
              {{ e.name }}
            </button>
          </template>

          <!-- No divider above this: creating a community is the same thought as switching. -->
          <RouterLink
            v-if="mayCreate"
            to="/communities/new"
            data-test="create-community"
            :class="`${LINK} text-neutral-600`"
          >
            <IconPlus class="size-4" aria-hidden="true" />
            Spielgemeinschaft
          </RouterLink>
        </template>

        <template v-if="admin">
          <div class="mt-1.5 border-t border-neutral-200" />
          <div
            data-test="admin-heading"
            class="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase"
          >
            {{ admin.name }}
          </div>
          <RouterLink :to="communityPath(admin.slug, 'requests')" :class="LINK">
            Anfragen
            <span
              v-if="admin.pendingCount > 0"
              data-test="pending-count"
              class="ml-auto rounded-full bg-blue-600 px-1.5 text-xs text-white"
              >{{ admin.pendingCount }}</span
            >
          </RouterLink>
          <RouterLink :to="communityPath(admin.slug, 'members')" :class="LINK">Mitglieder</RouterLink>
          <RouterLink :to="communityPath(admin.slug, 'settings')" :class="LINK"
            >Einstellungen</RouterLink
          >
        </template>

        <!-- grow takes the slack and centres the mark in it; shrink-0 means a long list grows
             the scroll height instead of squeezing the mark away. -->
        <div
          data-test="nav-mark"
          class="grid shrink-0 grow basis-auto place-items-center px-3 py-6 text-neutral-300"
        >
          <BrandMark class="w-[200px] max-w-full" />
        </div>
      </div>

      <div data-test="nav-foot" class="flex-none pb-1.5">
        <div class="border-t border-neutral-200" />
        <RouterLink v-if="user.isSuperAdmin" to="/super-admin" data-test="super-admin" :class="LINK">
          Super-Admin
        </RouterLink>
        <button type="button" data-test="logout" :class="LINK" @click="handleLogout">
          Abmelden
        </button>
        <p v-if="logoutFailed" data-test="logout-error" class="px-5 py-1 text-xs text-red-600">
          Abmelden fehlgeschlagen
        </p>
      </div>
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `pnpm vitest run src/nav && pnpm vue-tsc -b && pnpm lint`
Expected: alle Tests aus Task 3 und 4 grün, typecheck und lint sauber.

- [ ] **Step 5: Commit**

```bash
git add src/nav/NavDrawer.vue src/nav/__tests__/NavDrawer.spec.ts
git commit -m "feat(webapp): fill the nav drawer with its four blocks

The mark is the last element in the scroll flow rather than an empty
state: grow takes the slack, shrink-0 means a long list grows the scroll
height instead of squeezing the mark away, so it is always reachable.

The foot is a sibling of the scrolling area, not a child — that is what
keeps Abmelden from ever scrolling out of reach.

The admin heading carries the community name rather than the word
'Verwaltung': with several communities in the list above, which one
these three entries act on is the actual question."
```

---

### Task 5: `App.vue` verdrahten und die alten Menüs löschen

**Files:**
- Modify: `src/App.vue`
- Modify: `src/__tests__/app-header.spec.ts`
- Delete: `src/ui/HeaderMenu.vue`, `src/ui/__tests__/HeaderMenu.spec.ts`
- Delete: `src/auth/MemberMenu.vue`, `src/auth/__tests__/MemberMenu.spec.ts`
- Delete: `src/communities/CommunityMenu.vue`, `src/communities/__tests__/CommunityMenu.spec.ts`

**Interfaces:**
- Consumes: `<NavDrawer :user="user" />` aus Task 3/4 mit der Marke `data-test="nav-toggle"`.

- [ ] **Step 1: Write the failing test**

In `src/__tests__/app-header.spec.ts` die Stubs ersetzen:

```ts
const stubs = {
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  RouterView: { template: '<div />' },
  CountdownDisplay: { template: '<div data-test="countdown-widget" />', props: ['slug'] },
  NavDrawer: { template: '<div data-test="nav-toggle" />', props: ['user'] },
}
```

Die beiden Tests, die auf `[data-test=community-menu]` prüfen (Zeilen um 101 und 112), ersatzlos löschen — das Community-Icon gibt es nicht mehr. Die beiden `member-menu`-Tests auf die neue Marke umschreiben:

```ts
  it('shows no menu for an anonymous visitor', () => {
    expect(mount(App, { global: { stubs } }).find('[data-test=nav-toggle]').exists()).toBe(false)
  })

  it('shows the menu once someone is signed in', () => {
    mockStatus('authenticated')
    expect(mount(App, { global: { stubs } }).find('[data-test=nav-toggle]').exists()).toBe(true)
  })

  it('lifts the header above the drawer that slides in under it', () => {
    // The drawer is z-20 and hangs off the header's bottom edge; without z-30 and a shadow the
    // header would be overrun by it instead of sitting on top with an edge you can see.
    const header = mount(App, { global: { stubs } }).get('header')
    expect(header.classes()).toEqual(expect.arrayContaining(['relative', 'z-30', 'shadow-lg']))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/app-header.spec.ts`
Expected: FAIL — `nav-toggle` existiert nicht, `header` hat kein `z-30`.

- [ ] **Step 3: Write minimal implementation**

In `src/App.vue`:

1. Die beiden Menü-Imports durch einen ersetzen:

```ts
import NavDrawer from '@/nav/NavDrawer.vue'
```

2. Am `<header>` `relative z-30 shadow-lg` ergänzen:

```html
      <header
        class="relative z-30 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-stone-900 px-4 py-3 text-stone-50 shadow-lg md:grid-cols-[1fr_auto_auto]"
      >
```

3. Im Titel-Cell die `<CommunityMenu …>`-Zeile ersatzlos löschen.

4. `<MemberMenu v-if="user" :user="user" />` ersetzen durch `<NavDrawer v-if="user" :user="user" />`.

5. Die beiden Kommentare in `App.vue`, die `MemberMenu` namentlich nennen (im Block über dem `<header>`), auf die neue Komponente umschreiben — die Geometrie stimmt weiter, nur der Name nicht:

```
           Both cells of row 1 state their 40px: a grid track is as tall as its tallest item, and
           NavDrawer's toggle is 40px (a 32px avatar in a p-1 button). Stating it on the title cell
           alone would leave the login page, which has no NavDrawer, 8px shorter than every other
           page.
```

6. Die alten Dateien löschen:

```bash
git rm src/ui/HeaderMenu.vue src/ui/__tests__/HeaderMenu.spec.ts \
       src/auth/MemberMenu.vue src/auth/__tests__/MemberMenu.spec.ts \
       src/communities/CommunityMenu.vue src/communities/__tests__/CommunityMenu.spec.ts
```

- [ ] **Step 4: Run the whole suite + typecheck**

Run: `pnpm vitest run && pnpm vue-tsc -b && pnpm lint`
Expected: alles grün. Schlägt hier etwas an einer *anderen* Stelle fehl, ist das Task 6 — notieren, nicht hier reparieren, außer der Typecheck bricht (dann gehört die Reparatur hierher, weil der Branch sonst nicht baut).

- [ ] **Step 5: Commit**

```bash
git add -A src/App.vue src/__tests__/app-header.spec.ts src/ui src/auth src/communities
git commit -m "feat(webapp): replace both header menus with the nav drawer

Closes the design question in #32 by removing HeaderMenu.vue and both
its consumers rather than restyling them: the split between them was
arbitrary, since both were navigation for the same person.

The header gains z-30 and a shadow so it sits on top of the drawer that
hangs off its bottom edge, rather than being overrun by it."
```

---

### Task 6: Den Rattenschwanz aufräumen

Verweise, die nach Task 5 auf gelöschte Dateien zeigen. Zwei davon brechen nicht, sondern **verrotten still** — sie bleiben grün und beweisen nichts mehr. Genau die sind der Grund für diesen Task.

**Files:**
- Modify: `src/pages/c/__tests__/slug-shell.spec.ts:89`
- Modify: `src/__tests__/icons.spec.ts`
- Modify: `src/pages/super-admin.vue` (Kommentar, Zeile ~10)

- [ ] **Step 1: Repoint the vacuous assertion in `slug-shell.spec.ts`**

Zeile 89 prüft, dass `[data-test=community-menu]` im Inhaltsbereich fehlt. Nach dem Löschen kann dieses Attribut nirgends mehr existieren — die Zeile ist unfälschbar wahr. Der Test soll weiter beweisen, dass die Shell keine Navigation in den Inhaltsbereich malt, also muss er auf etwas zeigen, das es gibt:

```ts
    expect(w.find('[data-test=nav-toggle]').exists()).toBe(false)
```

- [ ] **Step 2: Repoint the icon-bundling test**

`src/__tests__/icons.spec.ts` importiert `~icons/lucide/users`, dessen einziger Verwender `CommunityMenu` war. Der Test würde sonst das Bündeln eines Icons prüfen, das die App gar nicht mehr ausliefert. Auf ein Icon umstellen, das der Drawer wirklich benutzt — alle drei Vorkommen von `IconUsers`:

```ts
import IconCheck from '~icons/lucide/check'
```

und in beiden `mount(IconUsers)` → `mount(IconCheck)`.

- [ ] **Step 3: Repoint the comment in `super-admin.vue`**

```
// The shell renders no chrome of its own: App.vue already supplies the header, and the way back
// into the area is the drawer's foot block, which is present on every page.
```

- [ ] **Step 4: Prove nothing else points at the deleted files**

Run:
```bash
grep -rn "HeaderMenu\|MemberMenu\|CommunityMenu\|lucide/users\|community-menu\|member-menu" src
```
Expected: **keine Treffer.** Gibt es welche, hier beheben.

Dann: `pnpm vitest run && pnpm vue-tsc -b && pnpm lint` — alles grün.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(webapp): clear the references the old menus left behind

Two of these were silent rot rather than breakage. slug-shell.spec
asserted a data-test attribute that can no longer exist anywhere, so the
line had become unfalsifiable; it now points at the drawer's toggle and
proves what it was written to prove. icons.spec bundled lucide/users,
whose only consumer was CommunityMenu — it now covers an icon the app
actually ships."
```

---

### Task 7: Im Browser nachmessen, was Tests nicht können

happy-dom rechnet keine Boxen und kein CSS. Weder der Winkel, noch die Deckungsgleichheit von Fahrt und Drehung, noch der Rest-Raum-Mechanismus sind im Unit-Test beweisbar. Dieser Task misst sie am laufenden Dev-Server. **Nichts hier wird behauptet, ohne dass die Zahl im Terminal stand.**

**Files:** keine — außer Reparaturen, die aus den Messungen folgen.

- [ ] **Step 1: Dev-Server starten**

`.claude/launch.json` prüfen; fehlt der Eintrag, anlegen:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "webapp", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "port": 5173 }
  ]
}
```

Dann `preview_start` mit `{"name": "webapp"}`. **Niemals `pnpm dev` über Bash starten.**

Anmelden (das Backend muss laufen, siehe `core/README.md`), auf eine Community-Seite gehen, Viewport auf 375×812 (`resize_window` preset `mobile`).

- [ ] **Step 2: Geometrie messen**

Drawer öffnen, dann per `javascript_tool`:

```js
const d = document.querySelector('[data-test=nav-drawer]')
const h = document.querySelector('header')
JSON.stringify({
  drawerWidth: d.getBoundingClientRect().width,
  drawerTop: d.getBoundingClientRect().top,
  headerBottom: h.getBoundingClientRect().bottom,
  spin: getComputedStyle(document.querySelector('[data-test=nav-spinner]')).transform,
  bodyOverflow: getComputedStyle(document.body).overflow,
})
```

Erwartet: `drawerWidth` **319**, `drawerTop === headerBottom` (**116** auf dem Handy), `bodyOverflow` `hidden`, `spin` eine 2×3-Matrix (nicht `none`).

- [ ] **Step 3: Synchronität prüfen**

Beide Elemente müssen dieselbe Dauer und Kurve tragen — hier zählt der *berechnete* Wert, nicht die Klasse:

```js
const g = (s) => {
  const c = getComputedStyle(document.querySelector(s))
  return { dur: c.transitionDuration, fn: c.transitionTimingFunction, prop: c.transitionProperty }
}
JSON.stringify({ drawer: g('[data-test=nav-drawer]'), spinner: g('[data-test=nav-spinner]') })
```

Erwartet: beide `0.3s` und dieselbe `cubic-bezier(0.4, 0, 0.2, 1)`.

- [ ] **Step 4: Rest-Raum und Scrollen prüfen**

```js
const s = document.querySelector('[data-test=nav-scroll]')
const m = document.querySelector('[data-test=nav-mark]')
const f = document.querySelector('[data-test=nav-foot]')
s.scrollTop = s.scrollHeight
JSON.stringify({
  markH: m.getBoundingClientRect().height,
  svgH: m.querySelector('svg').getBoundingClientRect().height,
  overhang: s.scrollHeight - s.clientHeight,
  markReachable: m.getBoundingClientRect().top < s.getBoundingClientRect().bottom,
  footInsideScroll: s.contains(f),
})
```

Erwartet: `svgH` **200** (nie kleiner — das ist die Zusage von `shrink-0`), `markReachable` `true`, `footInsideScroll` `false`. Mit nur einer Community ist `overhang` 0, mit vielen > 0.

- [ ] **Step 5: Reduced Motion und Screenshot**

Systemweit „Bewegung reduzieren“ aktivieren (oder in DevTools emulieren), Drawer öffnen: der Avatar darf sich **nicht** drehen, der Drawer steht sofort. Danach zurückstellen.

Screenshot des geöffneten Drawers als Beleg an den Menschen schicken. Weicht eine Zahl ab, hier reparieren und neu messen — **nicht** die Erwartung anpassen.

- [ ] **Step 6: Commit (nur falls Reparaturen nötig waren)**

```bash
git add -A src
git commit -m "fix(webapp): correct what the browser measurement caught

<welche Zahl abwich und warum>"
```

---

### Task 8: Guidelines nachziehen

Sechs Lektionen in den Guidelines haben ihr Beispiel in den gelöschten Dateien. Die Lektionen bleiben richtig — ihre Zeiger nicht. Dazu kommen die neuen Lektionen dieser Arbeit, mit den in Task 7 **gemessenen** Zahlen.

**Files:**
- Modify: `../.claude/guidelines/frontend.md`
- Modify: `../.claude/guidelines/multi-tenancy.md`

- [ ] **Step 1: Alle acht Zeiger umhängen**

| Datei | Zeile(n) | Änderung |
|---|---|---|
| `multi-tenancy.md` | 120 | `src/auth/MemberMenu.vue` → `src/nav/NavDrawer.vue` |
| `frontend.md` | 60 | „wherever `MemberMenu` rendered (a `size-8` avatar inside `HeaderMenu`'s `p-1` trigger)“ → `NavDrawer`s Schalter, gleiche Geometrie |
| `frontend.md` | 109–110 | `CommunityMenu.vue` und `MemberMenu.vue` → `NavDrawer.vue` |
| `frontend.md` | 173 | „already used in `HeaderMenu.spec.ts`“ → `NavDrawer.spec.ts` |
| `frontend.md` | 206–209 | `src/ui/HeaderMenu.vue`'s outside-click → `src/nav/NavDrawer.vue`'s |
| `frontend.md` | 219–224 | `MemberMenu.vue` / `MemberMenu.spec.ts` → `NavDrawer.vue` / `NavDrawer.spec.ts` |
| `frontend.md` | 350–351 | „(`CommunityMenu`, `MemberMenu` on top of the shared `src/ui/HeaderMenu.vue`)“ → „(`nav/NavDrawer.vue`, the app's only menu)“ |
| `frontend.md` | 367 | „a `MemberMenu` item“ → „an entry in the drawer's foot block“ |

Danach zur Kontrolle: `grep -rn "HeaderMenu\|MemberMenu\|CommunityMenu" ../.claude/guidelines/` → keine Treffer.

- [ ] **Step 2: Die neuen Lektionen in `frontend.md` unter „Mobile-first“ ergänzen**

Wörtlich, mit den Zahlen aus Task 7 (die unten stehenden stammen aus dem Mockup — durch die gemessenen ersetzen, falls sie abweichen):

```markdown
- **`max-height: 100%` bändigt kein Kind eines Flex-Items.** Die Höhe eines Flex-Kindes gilt für
  die Prozentauflösung als *unbestimmt*, also greift die Regel nicht und das Kind behält seine
  Wunschgröße. Gemessen im Drawer-Mockup: Rest-Raum 166px, SVG stur 200px, Scroll-Fläche 47px im
  Überhang — im Bild fast unsichtbar, in `getBoundingClientRect()` sofort. Wer *doch* mitschrumpfen
  will, braucht Container-Query-Einheiten gegenüber `container-type: size`
  (`width: min(200px, 100cqw, 100cqh)`) — die sind definit. Wer es nicht braucht, umgeht das
  Problem mit `shrink-0` und lässt stattdessen die Scroll-Höhe wachsen; das ist die einfachere
  Lösung und die, für die sich der Drawer entschieden hat.
- **Ein Panel, das dauerhaft im DOM steht, braucht `inert` — nicht nur `aria-hidden`.**
  `NavDrawer` bleibt geschlossen gemountet (damit die Breite jederzeit bekannt ist und die
  Transition ohne Enter/Leave-Maschinerie auskommt). `aria-hidden` allein nimmt es nur aus dem
  Accessibility-Baum; fokussierbar bleibt es trotzdem, und Tab landet dann in einem unsichtbaren
  Menü. Beides setzen. Und beides als `:inert="!open || undefined"` binden: Vue lässt ein Attribut
  nur bei `null`/`undefined`/`false` weg, und `false` nur bei echten Boolean-Attributen — sonst
  steht `inert="false"` im DOM und ist trotzdem wirksam.
- **Eine Breite, die auch das Skript braucht, gehört ins Skript.** Der Drawer rechnet
  `min(320px, 85vw)` aus `useWindowSize()` und setzt sie als Inline-Style; es gibt keine
  Tailwind-Breitenklasse daneben. Grund: der Drehwinkel des Avatars leitet sich aus derselben Zahl
  ab, und zwei Quellen für eine Breite driften, sobald jemand eine anfasst. Nebeneffekt, ohne den
  es keinen Test gäbe: ein Test kann `window.innerWidth` setzen und den Winkel prüfen — eine aus
  dem Layout gelesene Breite ist unter happy-dom immer 0.
```

- [ ] **Step 3: Prüfen, ob die Guidelines noch stimmen**

Run: `grep -rn "HeaderMenu\|MemberMenu\|CommunityMenu" ../.claude/guidelines/ src`
Expected: keine Treffer.

- [ ] **Step 4: Commit**

```bash
git add ../.claude/guidelines/frontend.md ../.claude/guidelines/multi-tenancy.md
git commit -m "docs: repoint the guidelines at the drawer, and record what it taught

Six lessons had their worked example in the deleted menu components. The
lessons still hold; only their pointers had to move.

Three are new. The costly one: max-height: 100% does not constrain a
child of a flex item, because a flex item's height counts as indefinite
for percentage resolution — measured as a 47px overhang that was nearly
invisible on screen and immediate in getBoundingClientRect()."
```

---

### Task 9: PR öffnen

- [ ] **Step 1: Ganze Suite ein letztes Mal**

Run: `pnpm vitest run && pnpm vue-tsc -b && pnpm lint && pnpm build`
Expected: alles grün. `pnpm build` gehört dazu, weil Tailwind erst beim Build erzeugt und ein nie wörtlich vorkommender Klassenname nur hier auffällt.

- [ ] **Step 2: PR gegen `develop`**

**Titel und Beschreibung auf Englisch** — GitHub speist die Merge-Commit-Message daraus (siehe [git-workflow.md](../../../.claude/guidelines/git-workflow.md)).

```bash
git push -u origin HEAD
gh pr create --base develop \
  --title "Consolidate both header menus into one navigation drawer" \
  --body "..."
```

Der Body nennt: Bezug auf `Closes #32`, die vier Bereiche, die Rad-Metapher samt gemessenem Winkel, die gelöschten Dateien, und den bewusst akzeptierten Nachteil (der Scrollbalken verspricht durch die Logo-Fläche mehr Inhalt, als kommt). Screenshot aus Task 7 anhängen.

---

## Self-Review

**Spec coverage**

| Spec-Abschnitt | Task |
|---|---|
| Aufbau, vier Bereiche + Sichtbarkeitsregeln | 4 |
| Ziele der Einträge | 4 |
| Farben | 3 (Hülle), 4 (Inhalt) |
| Geometrie: Breite, Oben, Ebenen | 3, 5 (Header `z-30`), 7 (gemessen) |
| Animation: Dauer, Kurve, Winkel, Reduced Motion | 1 (Formel), 3 (Bindung), 7 (gemessen) |
| Drawer bleibt im DOM, `inert` | 3 |
| Rest-Raum, Logo, Scrollen | 4 (Layout), 7 (gemessen) |
| Wasserzeichen, Bitmap, Herleitung | 2 |
| Bedienung/A11y: Labels, Dialog, Escape, Fokus-Käfig, Außenklick, Routenwechsel | 3 |
| Daten: Laden bei Mount + bei Öffnen, Fehlerfall | 3 |
| Dateien neu/geändert/gelöscht | 1–5 |
| Aufräumen: Rattenschwanz (4 Code-Stellen) | 5 (App.vue-Kommentare), 6 (Rest) |
| Aufräumen: 8 Guideline-Zeiger | 8 |
| Tests + „was Tests nicht können“ | 1–4 (Unit), 7 (Browser) |

Keine Lücke.

**Placeholder scan:** Der einzige nicht ausgeschriebene Text ist der PR-Body in Task 9, dessen Inhalt stichpunktweise vorgegeben ist — er hängt von den in Task 7 gemessenen Zahlen ab und lässt sich vorher nicht wörtlich schreiben. Ebenso die Commit-Message in Task 7, die es nur bei einer Abweichung gibt.

**Type consistency:** `communityEntries`/`spinDegrees`/`CommunityEntry` (Task 1) heißen in Task 3 und 4 identisch. `PITCH`/`RADIUS` (Task 2) stammen aus `board.ts` und werden nirgends neu definiert. Die `data-test`-Marken aus Task 3 (`nav-toggle`, `nav-spinner`, `nav-drawer`, `nav-scrim`, `pending-dot`) und Task 4 (`nav-scroll`, `nav-mark`, `nav-foot`, `switch-community`, `current-community`, `create-community`, `admin-heading`, `pending-count`, `super-admin`, `logout`, `logout-error`) werden in Task 5–7 unverändert benutzt.

**Beim Self-Review gefunden und behoben** — alle fünf hätten den Umsetzenden Zeit gekostet:

1. **Der Teleport hätte jeden Drawer-Test scheitern lassen.** `wrapper.find()` durchsucht nur `wrapper.element`; nach `body` teleportierter Inhalt liegt außerhalb. Ohne `stubs: { teleport: true }` findet kein einziger Test den Drawer. Jetzt in `render()` und im Interfaces-Block begründet.
2. **Die Header-Messung war unhaltbar konstruiert.** Der ursprüngliche Test verschob das Trigger-Element in ein neu angelegtes `<header>` — womit es aus dem Wrapper-Teilbaum fällt und `w.get()` es danach nicht mehr findet. Jetzt mountet `render()` per `attachTo` direkt in ein `<header>`, dessen `getBoundingClientRect` gestubbt ist, und die beiden Fälle sind zwei Tests statt einer Kette.
3. **`import { useAuth }` stand nach den `vi.mock`-Aufrufen mitten im File** — `vi.mock` wird zwar gehoistet, aber ESLint verlangt Imports am Anfang. Alle Imports jetzt oben, `logoutMock` in `vi.hoisted` gezogen, wo es hingehört.
4. **`reactive` war im Top-Level-Import ungenutzt** (es wird nur im Mock-Factory gebraucht) — unter `noUnusedLocals` ein Fehler, kein Hinweis. Entfernt.
5. **`defineExpose({ active })` im Bauplan war tot** — keine Zeile im Plan liest es. Entfernt, bevor es als API missverstanden wird.
