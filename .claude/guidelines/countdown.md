# Countdown & Rounds (the app's core principle)

The defining USP: each **community** counts down to its target (`targetAt`). To shorten
the wait, the time before (and during/after) the event is divided into **rounds** that carry
gameplay. This file is the **binding domain model** for the countdown/round mechanics — capture
decisions here, don't re-derive them. (Origin reference: `huettehuette.unividuell.org`
`server/composables/useCurrentGameRound.ts` + its tests; the port deliberately changes a few
conventions — see below.)

Implemented in the `countdown` module (`CountdownEngine` is the grid); this file stays the binding
model it is built against.

## Terms: target vs. game start

Two instants, often weeks apart. Never call either "start" or "first round":

| Term | Code | Admin form | Meaning |
|---|---|---|---|
| **Ziel** (target) | `targetAt` | „Ziel-Datum“ | what the countdown runs to; round `1` begins here |
| **Spielstart** (game start) | `gamesFromRound` | „Spielstart“ | the first round with a game, e.g. `-30` |

"Start" alone reads as game start and "first round" as round `1` — both point at the wrong instant.

## Anchor: `targetAt` + community `targetTimezone`

- A community has **`targetAt`** (the target) stored as Postgres `TIMESTAMPTZ` → mapped to a
  Kotlin **`Instant`** (an absolute moment, **zone-less**).
- **`TIMESTAMPTZ` does NOT store a timezone.** Postgres converts the input to UTC on write and
  **discards the offset/zone**; on read it renders in the session zone. So `targetAt` alone only
  knows *"this instant"*, not *"11:00 in which zone"*. A fixed numeric offset wouldn't help either
  — it can't do DST (winter `+01:00` vs summer `+02:00`).
- Therefore each community also has **`targetTimezone`** (DB column `target_timezone`) — an
  **IANA zone id** (e.g. `Europe/Berlin`), **admin-editable**, default `Europe/Berlin`. (New
  `community` column; validate it's a real IANA zone.) The name keeps the explicit relation to the
  field it zones — it is *the zone in which `targetAt`'s wall-clock is anchored*, not a generic
  community timezone.
- The round-anchor **time-of-day (e.g. 11:00) is NOT a separate field** — it falls out of
  `targetAt` rendered in `targetTimezone` (`targetAt.atZone(targetTimezone)`). So **`targetAt`
  (instant) + `targetTimezone` (zone)** together fully define the countdown anchor and the round
  grid.

## A round = an interval + a signed number

- A **round is a half-open time interval `[start, end)` with an integer number**.
  **Start-inclusive, end-exclusive.** Modelling it as an interval (not literally "a day")
  keeps the math clean and lets multiple games **nest inside a day** later (see *fast rounds*). The
  **daily grid is the invariant base** — fast rounds add sub-rounds *within* a day, they don't
  replace it. The daily computation below is the base round generator.
- **Default round = one calendar day** in the community `targetTimezone`, anchored to `targetAt`'s
  time-of-day. If `targetAt` is `…T11:00` in `Europe/Berlin`, each round runs
  `[day 11:00, next-day 11:00)` local time.

### Round numbering — a number line

The canonical **round number `n` is a signed integer that rises with time**, like a number line —
earlier is smaller, later is larger:

```
… −90  −89  …  −1   0 │ 1   2  …  20 …
                      │
                   targetAt (liftoff)
```

- **`n = 0`** is the **last day before the target**: `[targetAt − 1 day, targetAt)`. This is the
  "zero days to go" window — whole-days-until-target is already `0` while up to ~24 h still tick away
  (e.g. *0 Tage, 23 h, 12 s bis Start*). **Round 0 is real and necessary** — an earlier draft of
  this file wrongly tried to remove it; that was the knot-that-isn't-one.
- **`n < 0`** are the earlier countdown days; **`n > 0`** are the days at/after the target — `1` is
  the first event day, and `targetAt` starts it.

Uniform interval formula (all integers `n`, zone- and DST-aware day stepping):

```
round n = [ targetAt + (n−1) days , targetAt + n days )
```

- `n =   0` → `[targetAt − 1d,  targetAt)`       (last day before target)
- `n =   1` → `[targetAt,       targetAt + 1d)`  (first day of the event)
- `n = −89` → `[targetAt − 90d, targetAt − 89d)`

**Anchor** (pinned in `CountdownEngineTest` and `RoundTimelineOracleTest`): `targetAt` 2027-06-24
11:00 `Europe/Berlin`. At 2027-06-24 10:00 round `0` runs and the clock shows 0 days, 0 hours,
60 minutes; 11:00 begins round `1`.

The **current round for `now`** is the `n` whose interval contains `now` (start-inclusive), i.e.
count zone-aware calendar days between `targetAt` and `now`.

**A rule about round order is a comparison on the number line**, never "larger is earlier": the next
round is `n + 1`; history is `round_number < current`, most recent first (`ORDER BY round_number
DESC`); phase two is `n >= phaseTwoStartRound`; the window is `gamesFromRound <= n <= gamesUntilRound`.
The direction lives in many comparisons and an `Int` stays an `Int`, so a missed site compiles and
runs backwards. `RoundTimelineOracleTest` walks a run through dates and asserts dates only — keep it
that way, it is the net for exactly this. Prose drifts the same way: when touching round order, grep
comments and guidelines for `MIN`/`MAX`, above/below, raise/lower and up/back next to round terms.

**Display — the number, no label.** The game header shows the number as is (`-89`, `0`, `1`). The
countdown shows no sign: it counts down before the target (days = `|n|`) and up from it — the
direction is the sign. The link preview says „Noch 58 Tage: Spiel mit!“. There is no `T−`/`T+`.

> **Differences from huettehuette:** huettehuette counted down — `T−58 … T−1, T−0 │ T+1 …`, a larger
> number being earlier. The port negates that onto a number line: same round 0, same grid, mirrored
> numbers, no `T−`/`T+` (2026-11-05 — an admin setting the game start had to be told "a larger
> number is earlier"). Boundary inclusivity differs too: huettehuette was **end-inclusive** (the
> exact `11:00:00` instant belonged to the *older* round); per the spec (`[11..11)`) the port is
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

- **Round-boundary grid = calendar units.** Day math runs in the community `targetTimezone` and is
  **calendar-aware**: a DST-transition day (23 h or 25 h real time) still counts as **exactly one
  round** — the boundary stays glued to the wall-clock time-of-day (11:00). Use `plus({days})` /
  `ZonedDateTime.plusDays`, **never** `instant ± 86400s`.
- **Within-round tick = precise units.** The countdown to the next boundary reflects **real elapsed
  time**, so on DST days the visible "time until next round" is 23 h / 25 h — use a precise
  `diff(…, ["hours","minutes","seconds"])`. The origin splits exactly this way into "higher-order"
  calendar units + "lower-order" precise units — see `huettehuette/stores/useCountdownStore.ts`.

## Computation & placement

- **Server-authoritative.** The current-round computation is a **pure function** of
  `(now, targetAt, targetTimezone, roundLength)` — no DB needed for the number itself. Put it in a
  backend Spring Modulith module (working name **`countdown`**, schema-per-module), depending on
  `community` (for `targetAt` + `targetTimezone` + `phaseTwoStartRound`). Expose a public query
  (current round for `now`; the round number for any instant; a round's `[start, end)`).
- **Heavily unit-tested**, TDD: port the huettehuette test vectors (numbers negated; adjust the
  exact-boundary cases for the **start-inclusive** boundary), and cover the **DST transitions**
  explicitly (spring-forward / fall-back days) and the exact-boundary instants.
- **Frontend** shows the live countdown + current round. If the SPA computes it client-side
  (for a ticking display), keep it in **parity** with the backend function — same rule, parity
  test — exactly like the slug-derivation parity (see `multi-tenancy.md`). Alternatively render
  from a backend value; the origin did both (client store + server composable).

## A grid that is in play is fixed

`targetAt` and `targetTimezone` define the round grid, and a round number is not stored anywhere —
it is recomputed from them. Moving either after rounds have been announced therefore points the grid
at numbers `game.round_games` already holds: the same round a second time, or numbers skipped. Both
are unfair and unexplainable to a player.

A run is therefore **frozen** from the start of round `gamesFromRound - 1` on — the day before its
game start: the daily schedule announces each round a day ahead, so that is the earliest
instant a `round_games` row can exist. From then on the two fields are 409, and the way forward is a
new edition. An unfrozen run may start at once: on create/replace its game start may be the
running round (it is then frozen from the outset — no round is announced yet, and the GET
materialises it), never one that has ended (`firstGameRoundEnd`). The form makes the admin confirm
such an instant start, because target and zone are fixed right away.

The state is **derived, never stored**: `frozenSince(edition)` against the clock. That keeps it
honest without a column, but it makes the freeze point a function of editable fields — so the check
compares the persisted edition with the one the update would produce and rejects **any** update
after which the run would no longer be frozen. A rule on the effect, not on a field, needs no
revisit when the next field enters the computation.

What does **not** freeze: `phaseTwoStartRound` and the game window. Rule and stake are frozen per
round at announcement time (`award_rule`, `award_points`), so moving them only touches rounds not yet
announced — tomorrow's usually is — a game-master decision with visible effect, not a silent rewrite
of history.

## Editions: 0..1 active, always dated

A community has **0..1** active edition; "none" is a normal state (new community, archived run), never
an error — the countdown then shows no date. An edition always has `targetAt` and `gamesFromRound`
(NOT NULL); only `label` is optional (null = called like the community).

Write paths are separate: `PATCH /communities/{slug}` renames only (the slug never changes),
`POST .../editions` creates (409 while one is active), `PUT .../editions/active` **replaces it
completely** — an absent optional field clears it, there is no "null = keep".

Round bounds: `gamesFromRound <= phaseTwoStartRound <= 0` (phase two optional); e.g. games from
`-30`, phase two from `-7`.

## Related / future

- **`phaseTwoStartRound`** (already a `community` field): a **round threshold** that changes
  **scoring** (tolerance / point curve) at/after that round — a concern of the future *points*
  logic, not the round grid itself. It holds a round number: phase two is `n >= phaseTwoStartRound`,
  and the stake grows by one per round from 2 on (`n − phaseTwoStartRound + 2`).
- **Fast rounds** (still vague — a *future spec*; capturing the agreed shape only): the **daily
  interval stays the invariant base grid**. Fast rounds do **not** shorten or replace the day —
  instead a day can hold **multiple games (sub-rounds)** of varying length. So a normal day has one
  game; a fast-round day has several. Numbering is **two-level, `{major}.{minor}`** where `major`
  is the day's round number and `minor` the game within that day:
  `1.1` (5 min), `1.2` (30 min), `2.1` (5 min), `2.2`, `2.3`, …
  Each game is still a half-open `[start, end)` interval, nested inside its day's `[start, end)`.
  The classic single-game-per-day is just `minor = 1` (the `.1` may be hidden in the UI). Don't
  build this yet; just don't model rounds in a way that assumes one-game-per-day or that lets a
  fast round break the daily grid.
  When it is specced: `MaterialisationSchedule` walks day numbers and must then announce every
  sub-round of the next day.
