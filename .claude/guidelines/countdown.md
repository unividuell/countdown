# Countdown & Rounds (the app's core principle)

The defining USP: each **community** counts down to its event start (`startsAt`). To shorten
the wait, the time before (and during/after) the event is divided into **rounds** that carry
gameplay. This file is the **binding domain model** for the countdown/round mechanics — capture
decisions here, don't re-derive them. (Origin reference: `huettehuette.unividuell.org`
`server/composables/useCurrentGameRound.ts` + its tests; the port deliberately changes a few
conventions — see below.)

Not yet implemented — this is the agreed model to build the `countdown` module against.

## Anchor: `startsAt` + community `startsAtTimezone`

- A community has **`startsAt`** (the event start) stored as Postgres `TIMESTAMPTZ` → mapped to a
  Kotlin **`Instant`** (an absolute moment, **zone-less**).
- **`TIMESTAMPTZ` does NOT store a timezone.** Postgres converts the input to UTC on write and
  **discards the offset/zone**; on read it renders in the session zone. So `startsAt` alone only
  knows *"this instant"*, not *"11:00 in which zone"*. A fixed numeric offset wouldn't help either
  — it can't do DST (winter `+01:00` vs summer `+02:00`).
- Therefore each community also has **`startsAtTimezone`** (DB column `starts_at_timezone`) — an
  **IANA zone id** (e.g. `Europe/Berlin`), **admin-editable**, default `Europe/Berlin`. (New
  `community` column; validate it's a real IANA zone.) The name keeps the explicit relation to the
  field it zones — it is *the zone in which `startsAt`'s wall-clock is anchored*, not a generic
  community timezone.
- The round-anchor **time-of-day (e.g. 11:00) is NOT a separate field** — it falls out of
  `startsAt` rendered in `startsAtTimezone` (`startsAt.atZone(startsAtTimezone)`). So **`startsAt`
  (instant) + `startsAtTimezone` (zone)** together fully define the countdown anchor and the round
  grid.

## A round = an interval + a signed number

- A **round is a half-open time interval `[start, end)` with an integer number** (and a derived
  label). **Start-inclusive, end-exclusive.** Modelling it as an interval (not literally "a day")
  keeps the math clean and lets multiple games **nest inside a day** later (see *fast rounds*). The
  **daily grid is the invariant base** — fast rounds add sub-rounds *within* a day, they don't
  replace it. The daily computation below is the base round generator.
- **Default round = one calendar day** in the community `startsAtTimezone`, anchored to `startsAt`'s
  time-of-day. If `startsAt` is `…T11:00` in `Europe/Berlin`, each round runs
  `[day 11:00, next-day 11:00)` local time.

### Round numbering — count-down with a round 0 (faithful to huettehuette)

The canonical **round number `n` is a signed integer that strictly decreases as time advances**.
Counting *down* before the start it reaches **0 on the last day, then continues negative** once the
event has begun:

- **`n = 0`** is the **last day before the start**: `[startsAt − 1 day, startsAt)`. This is the
  "zero days to go" window — whole-days-until-start is already `0` while up to ~24 h still tick away
  (e.g. *0 Tage, 23 h, 12 s bis Start*). **Round 0 is real and necessary** — an earlier draft of
  this file wrongly tried to remove it; that was the knot-that-isn't-one.
- **`n > 0`** are the earlier countdown days; **`n < 0`** are the days at/after the start.

Uniform interval formula (all integers `n`, zone- and DST-aware day stepping):

```
round n = [ startsAt − (n+1) days , startsAt − n days )
```

- `n =  0` → `[startsAt − 1d, startsAt)`     (last day before start)
- `n = −1` → `[startsAt,       startsAt + 1d)` (first day of the event — `startsAt` starts it)
- `n = 10` → `[startsAt − 11d, startsAt − 10d)`

The **current round for `now`** is the `n` whose interval contains `now` (start-inclusive),
i.e. count zone-aware calendar days between `now` and `startsAt`. Equivalent to huettehuette's
`trunc(daysUntil)` for `now < startsAt` and `floor(daysUntil)` after — but on **start-inclusive**
boundaries (see *Differences* below).

**Display label** flips the sign so the event itself reads as a count-up:

```
n ≥ 0  →  "T−n"     (T−58, … , T−1, T−0)
n < 0  →  "T+|n|"   (T+1, T+2, …)            ← n = −1 shows "T+1"
```

So the sequence over time is `T−58 … T−1 T−0 │ T+1 T+2 …`, where `│` = the **liftoff instant
`startsAt`** (the `T−0 → T+1`, i.e. `n: 0 → −1`, boundary). There is a `T−0` but no `T+0`.

**Mental model — liftoff at the `T−0 → T+1` boundary:** like a rocket count-down the days tick
…3, 2, 1, 0 (`T−0` = the final day before liftoff), and the **liftoff instant is `startsAt`
itself** — the boundary where round `0` ends and round `−1` (displayed `T+1`) begins. The UI may
flash a "T−0 — Start!" around that instant; purely a labelling aid.

> **Differences from huettehuette:** we deliberately **keep** huettehuette's numbering — a
> count-down with a real **round 0** (the last day) that continues negative after the start — and
> its **`T−` / `T+`** display (prefix + absolute value; `T+1` = first event day). The **only**
> deliberate change is boundary inclusivity: huettehuette was **end-inclusive** (the exact
> `11:00:00` instant belonged to the *older* round); per the spec (`[11..11)`) the port is
> **start-inclusive** — `11:00:00` belongs to the round it *starts*.

## DST handling

> **Read this first:** Luxon's *“Math across DSTs”*
> (<https://moment.github.io/luxon/#/zones?id=math-across-dsts>) is the mental model for the whole
> round engine — it splits arithmetic into **calendar units** (days/weeks/months: anchor the
> **wall-clock** — same local time next day, DST or not) and **precise units** (hours/minutes/
> seconds: anchor **elapsed real time**). Java's `java.time` behaves the same: `ZonedDateTime`
> `.plusDays()` is calendar-aware, `.plus(Duration.ofHours/…)` is exact. Worked example
> (`America/New_York`, spring-forward 2017-03-12):
> ```js
> DateTime.local(2017,3,11,10).plus({days:1}).hour    //=> 10  (wall-clock preserved)
> DateTime.local(2017,3,11,10).plus({hours:24}).hour   //=> 11  (24 h of real time → +1 h post-DST)
> ```

- **Round-boundary grid = calendar units.** Day math runs in the community `startsAtTimezone` and is
  **calendar-aware**: a DST-transition day (23 h or 25 h real time) still counts as **exactly one
  round** — the boundary stays glued to the wall-clock time-of-day (11:00). Use `plus({days})` /
  `ZonedDateTime.plusDays`, **never** `instant ± 86400s`.
- **Within-round tick = precise units.** The countdown to the next boundary reflects **real elapsed
  time**, so on DST days the visible "time until next round" is 23 h / 25 h — use a precise
  `diff(…, ["hours","minutes","seconds"])`. The origin splits exactly this way into "higher-order"
  calendar units + "lower-order" precise units — see `huettehuette/stores/useCountdownStore.ts`.

## Computation & placement

- **Server-authoritative.** The current-round computation is a **pure function** of
  `(now, startsAt, startsAtTimezone, roundLength)` — no DB needed for the number itself. Put it in a
  backend Spring Modulith module (working name **`countdown`**, schema-per-module), depending on
  `community` (for `startsAt` + `startsAtTimezone` + `phaseTwoStartRound`). Expose a public query
  (current round for `now`; the round number for any instant; a round's `[start, end)`).
- **Heavily unit-tested**, TDD: port the huettehuette test vectors (same numbering; adjust the
  exact-boundary cases for the **start-inclusive** boundary), and cover the **DST transitions**
  explicitly (spring-forward / fall-back days) and the exact-boundary instants.
- **Frontend** shows the live countdown + current round. If the SPA computes it client-side
  (for a ticking display), keep it in **parity** with the backend function — same rule, parity
  test — exactly like the slug-derivation parity (see `multi-tenancy.md`). Alternatively render
  from a backend value; the origin did both (client store + server composable).

## Related / future

- **`phaseTwoStartRound`** (already a `community` field): a **round threshold** that changes
  **scoring** (tolerance / point curve) at/after that round — a concern of the future *points*
  logic, not the round grid itself. With the signed convention it holds a T-offset value; pin its
  exact meaning when the points module is specced.
- **Fast rounds** (still vague — a *future spec*; capturing the agreed shape only): the **daily
  interval stays the invariant base grid**. Fast rounds do **not** shorten or replace the day —
  instead a day can hold **multiple games (sub-rounds)** of varying length. So a normal day has one
  game; a fast-round day has several. Numbering is **two-level, `T{major}.{minor}`** where `major`
  is the day's T-offset and `minor` the game within that day:
  `T+1.1` (5 min), `T+1.2` (30 min), `T+2.1` (5 min), `T+2.2`, `T+2.3`, …
  Each game is still a half-open `[start, end)` interval, nested inside its day's `[start, end)`.
  The classic single-game-per-day is just `minor = 1` (the `.1` may be hidden in the UI). Don't
  build this yet; just don't model rounds in a way that assumes one-game-per-day or that lets a
  fast round break the daily grid.
