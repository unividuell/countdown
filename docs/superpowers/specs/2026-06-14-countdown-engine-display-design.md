# Countdown Engine + Display

**Status:** Approved design (2026-06-14)
**Builds on:** the `community` module (`startsAt`, `phaseTwoStartRound`, `/[slug]/` shell) and the
auth/header foundation. First implementation of the app's core principle.
**Depends on:** `community` module (`startsAt` + the new `startsAtTimezone`), `iam` (`AuthenticatedUser`).
**Domain facts:** [`.claude/guidelines/countdown.md`](../../../.claude/guidelines/countdown.md) — the
binding round/numbering/DST model. This spec implements it; it does not re-derive it.

## Purpose

Each community counts down to its event `startsAt`. This feature delivers the **first sub-spec of
the countdown module — "Engine + Anzeige"**: a server-authoritative round/countdown engine plus a
live, ticking header display. Games, points, round navigation/history and fast rounds are explicitly
later sub-specs.

## Decisions (locked during brainstorming)

- **Scope = Engine + Anzeige only.** The round/countdown engine (backend), the
  `community.startsAtTimezone` field (+ admin editing), and the ticking header display. No
  games/points/navigation/fast-rounds.
- **Round model = `countdown.md` verbatim.** Round `n` is a signed integer that **strictly
  decreases** over time; **round 0 is the last day before start** (`[startsAt−1d, startsAt)` — the
  "0 days, 23 h … to go" window); `n>0` earlier, `n<0` at/after start. Uniform interval
  `round n = [startsAt−(n+1)d, startsAt−n d)`, **start-inclusive**, zone-/DST-aware. Display label
  flips the sign: `n≥0 → "T-n"`, `n<0 → "T+|n|"` (so `T-0`, then `T+1` = first event day; no `T+0`).
- **Single source of truth = the backend Kotlin engine. No duplicated round logic in TS.** The
  hard, DST-sensitive part — *which round `now` is in*, *the round's boundary instants*, *round →
  label* — lives **only** in Kotlin. The backend emits **absolute `Instant`s** + the round number/
  label; the client only does pure `targetInstant − now` subtraction and `Duration` formatting
  (universal arithmetic + presentation, not domain logic).
- **Delivery = one fetch per page-load / community-switch.** The payload carries the **current round
  and the next round** (both with absolute boundary instants) + `serverNow`. The client ticks
  locally off that for a whole round (~24 h); it only refetches after it has advanced *past*
  `nextRound.end` (≈ once/day). DST 23/25 h "feel" falls out for free because the boundaries are
  already DST-correct absolute instants and `end − now` is real elapsed time.
- **SSE later is a drop-in; offline-tolerant by construction.** A future SSE push replaces only the
  "when do I get a fresh round" trigger — the local tick is unchanged. Because the client holds
  absolute boundary instants it keeps ticking correctly offline; it just can't learn of a new round
  or an admin edit until it reconnects. No fallback logic needed now.
- **Display = ported `huettehuette/components/header/MainHeader.vue` widget.** `T-`/`T+` prefix +
  unit chips `…d 11h 23m 47s` (h/m/s zero-padded, seconds live), mono. **Click-to-cycle base unit**
  (`d` → `w d` → `M w d`), ephemeral (not persisted). The h/m/s count to the **next round boundary**
  (`round.end`); the higher-order calendar units (d/w/M) express the **total to `startsAt`**. Both
  are client-side presentation of backend-provided absolute instants — *not* re-derived rounds.
- **Placement = the App-level main header** (`App.vue`), not the `/[slug]/` shell sub-header.
  Top-left, the literal `countdown` is **replaced by the active community's title + a `'YY` year
  suffix**; the countdown widget sits in the same header. Shown **only for the community currently
  viewed** (`/[slug]/…`); hidden on `/communities`, `/login`, etc.
- **Year suffix = always `startsAt.year`** (no `+1` after start — it stays the same edition,
  identified by its start year). Differs deliberately from huettehuette's rollover.
- **Admin entry = local wall-time in the chosen zone.** Admin picks the IANA `startsAtTimezone`
  (default `Europe/Berlin`) and enters `startsAt` as the local date/time **of that zone**; the
  conversion to the stored `Instant` uses that zone.

## Architecture

### Backend

**A. `community` module — add `startsAtTimezone`.**
- Flyway `community/V2__add_starts_at_timezone.sql`: `ALTER TABLE community.communities ADD COLUMN
  starts_at_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';`
- `Community` entity: `val startsAtTimezone: String = "Europe/Berlin"`.
- `UpdateCommunityRequest` + `CommunityResponse` (+ `toResponse`) gain `startsAtTimezone`. On update,
  **validate** it is a real IANA zone (`ZoneId.of` / `ZoneId.getAvailableZoneIds()`); reject with
  the existing validation-error path otherwise.
- `CommunityQuery` already returns the `Community`, so the new field is automatically available to
  the countdown module.

**B. NEW `countdown` Spring Modulith module** (`org.unividuell.countdown.core.countdown`),
schema-per-module convention but **no tables yet** (the engine is a pure function) → **no
`countdown` Flyway migration in this sub-spec**; note this in `package-info`/module docs.

- **`Round`** (public): `data class Round(val number: Int, val label: String, val start: Instant,
  val end: Instant)`.
- **`CountdownEngine`** (public, pure, no DB): the authority.
  - `roundAt(now, startsAt, zone, roundLength = Period.ofDays(1)): Round`
  - `intervalOf(number, startsAt, zone, roundLength = Period.ofDays(1)): Round`
  - `labelOf(number): String` (`n≥0 → "T-$n"`, `n<0 → "T+${-n}"`).
  - **Calendar-aware** day stepping (`ZonedDateTime.plus(Period)` / `minusDays`), **never**
    `instant ± 86400s`. `roundLength` is a `Period` (kept parametric for future fast rounds; only
    `ofDays(1)` is used now).
- **`CountdownQuery`** (public named interface, for future scoring): `currentRound(communityId,
  now): Round?` (null when `startsAt` unset).
- **`internal/CountdownController`** — `GET /api/communities/{slug}/countdown`, **active-member
  gated** (same access rule as `GET /api/communities/{slug}`; reuse `MembershipQuery` /
  `CommunityQuery`). Returns `CountdownResponse`:
  ```jsonc
  { "serverNow": "<instant>", "startsAt": "<instant|null>", "startsAtTimezone": "Europe/Berlin",
    "round":     { "number": 10, "label": "T-10", "start": "<instant>", "end": "<instant>" },
    "nextRound": { "number":  9, "label": "T-9",  "start": "<instant>", "end": "<instant>" } }
  ```
  When `startsAt` is null (community not yet configured), `round`/`nextRound` are `null` (200, not an
  error) so the client can render "noch kein Start gesetzt".

**Backend tests** (mockk · kotest · MockMvc DSL · Testcontainers; TDD):
- `CountdownEngine` unit tests — port the huettehuette vectors with the **start-inclusive** boundary:
  exactly `startsAt−1d` → round 0; 1 s later → still round 0; `startsAt` exactly → round −1 (T+1);
  1 s before `startsAt` → round 0; a far-out day → the right `T-n`. **Round 0 exists.** Label
  mapping (`T-0`, `T+1`). **DST**: a spring-forward day and a fall-back day each count as exactly one
  round (boundary glued to the wall-clock time-of-day); `end − start` is 23 h / 25 h real time.
- Community `startsAtTimezone`: PATCH accepts a valid zone, rejects an invalid one; default applied.
- `CountdownController`: active member gets the payload (round + nextRound + serverNow); non-member
  404; null `startsAt` → null rounds.

### Frontend (`webapp-vue`)

**C. Cross-cutting active-community context** (`src/communities/context.ts`): widen the module-level
`activeCommunityName` ref to **`activeCommunity = ref<ActiveCommunity | null>`** where
`ActiveCommunity = { slug; name; startsAt: string | null; startsAtTimezone: string }`. `App.vue` lives
*above* the `[slug]` provider tree, so this module ref (not `inject`) is how it reads the current
community. `[slug].vue` sets it on resolve, clears on unmount. `useTitle` uses
`activeCommunity?.name ?? 'countdown'`.

**D. API + types**: `getCountdown(slug): CountdownResponse` (`GET …/countdown`); add
`CountdownResponse` + `Round` types; add `startsAtTimezone` to `CommunityResponse` and the
`updateCommunity` body.

**E. `App.vue` main header**:
- Top-left `RouterLink to="/"`: `activeCommunity ? `${name} '${YY}`` : 'countdown'`, where `YY` is the
  last two digits of `startsAt`'s year (omitted if `startsAt` null). Drop the old hut-icon/year badge
  idea entirely.
- Render `<CountdownDisplay>` when `activeCommunity?.startsAt` is set; nothing otherwise.

**F. `CountdownDisplay.vue` + `useCountdown` composable**:
- `useCountdown(slug)` fetches `getCountdown` once on mount and on slug change; stores
  `round`, `nextRound`, and `skew = serverNow − clientNow` (one-time clock-skew correction). A shared
  1 s clock (VueUse `useNow`/interval) drives `now = clientClock + skew`.
- Derives the display **purely by subtraction** (no round re-derivation), faithfully reproducing the
  origin's higher/lower-order split on backend-supplied absolute instants:
  - **prefix `T-`/`T+`** and the canonical tag come from `round.number`/`round.label` (backend).
  - **base day unit `d` = `|round.number|`**; **`h:m:s` = `round.end − now`** (precise → DST-correct
    23/25 h). These are consistent by construction: `d` days + the live `h:m:s` always sum to the
    time-to-`startsAt`, and `d` flips exactly when `h:m:s` wraps at the wall-clock boundary (no
    off-by-one — `d` is the round number, not a separate `startsAt` diff).
  - **weeks/months** (when toggled) are a **cosmetic** longer-horizon re-expression via Luxon
    `diff(now → startsAt, units)` in `startsAtTimezone` (presentation only; a ≤1-boundary discrepancy with
    the precise base unit at the exact boundary instant is acceptable and invisible in practice).
- When `now ≥ round.end`: advance `round ← nextRound` if present; once past `nextRound.end`,
  refetch `getCountdown`. (≈ one request/day.)
- Base-unit toggle state is local + ephemeral (`nextBaseUnit`-style cycle), exactly as the origin.

**G. `settings.vue`**: add an **IANA zone select** (`Intl.supportedValuesOf('timeZone')`, default
`Europe/Berlin`), bound to the new `startsAtTimezone`. Change the `startsAt` `datetime-local`
handling to interpret the entered wall-time **in the selected zone**: `toLocalInput` uses
`DateTime.fromISO(iso).setZone(startsAtTimezone)`, `toInstant` uses `DateTime.fromISO(local, { zone:
startsAtTimezone }).toUTC().toISO()`. Save sends `startsAtTimezone` too.

**H. `[slug].vue`**: set the full `activeCommunity` object on resolve (slug, name, startsAt,
startsAtTimezone); **remove the now-duplicated community-name link** from the shell sub-header (the title
moved to the main header) — keep the admin ⚙ menu, switcher, user, logout.

**Frontend tests** (Vitest + `vi`):
- `useCountdown`: given a fixed payload + a controlled clock, renders the correct label and ticking
  `h:m:s`; advances `round ← nextRound` at the boundary and refetches past it; skew correction; a
  DST round shows 23/25 h (driven purely by the absolute `end` instant).
- `CountdownDisplay`: renders prefix + label + chips; base-unit toggle cycles `d → w d → M w d`.
- `App.vue` header: shows `name + 'YY` when a community is active, `countdown` fallback otherwise;
  the widget is hidden when no active community / no `startsAt`.
- `settings.vue`: zone select present; `startsAt` round-trips through the **selected zone** (enter
  `11:00` in `Europe/Berlin` → stored `09:00Z` in summer); sends `startsAtTimezone`.

> **Note — no KT/TS parity test needed.** Parity tests exist where the same *logic* runs twice
> (e.g. slug derivation). Here the round logic runs **only** in Kotlin; the client merely renders
> backend-supplied absolute instants. That is the whole point of the single-source design.

## Out of scope / follow-ups

- Round **navigation/history**, the **game framework**, individual games, **points/scoring**
  (incl. activating `phaseTwoStartRound`), and **fast rounds** (`T{major}.{minor}`) — later sub-specs.
- **SSE** push of round changes + admin edits (drop-in later); offline-reconnect UX polish.
- Surfacing the countdown anywhere beyond the header (e.g. a dedicated `/[slug]/` hero).

## Feed knowledge back

After implementation, capture:
- **`frontend.md`** — the **server-authoritative-instant + local-tick** pattern (backend emits
  absolute round-boundary instants + label; client ticks via pure subtraction, no duplicated round
  logic; skew-corrected clock; advance-then-refetch at the boundary). Plus the **module-level
  `activeCommunity` ref** pattern for state the App-level header needs from *above* the `[slug]`
  provider tree.
- **`countdown.md`** — confirm the final `CountdownEngine` public API shape (`Round`, `roundAt`,
  `intervalOf`, `labelOf`, `CountdownQuery.currentRound`) and the `/countdown` payload contract.
- **`modules-and-migrations.md`** — a module can ship with **no Flyway migration** when it owns no
  tables (pure-function module); the schema is created later when state is added.
