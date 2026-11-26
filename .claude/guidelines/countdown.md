# Countdown & Rounds (the app's core principle)

Each **community** counts down to its target (`targetAt`); the time before, during and after is
divided into **rounds** that carry gameplay. This file is the **binding domain model**, implemented
in the `countdown` module (`CountdownEngine` is the grid). Origin: `huettehuette.unividuell.org`.

## Terms: target vs. game start

Two instants, often weeks apart. Never call either "start" or "first round":

| Term | Code | Admin form | Meaning |
|---|---|---|---|
| **Ziel** (target) | `targetAt` | „Ziel-Datum“ | what the countdown runs to; round `1` begins here |
| **Spielstart** (game start) | `gamesFromRound` | „Spielstart“ | the first round with a game, e.g. `-30` |

"Start" alone reads as game start and "first round" as round `1` — both point at the wrong instant.

## Anchor: `targetAt` + `targetTimezone`

- **`targetAt` is a `TIMESTAMPTZ` → Kotlin `Instant`, and `TIMESTAMPTZ` stores no timezone.**
  Postgres converts to UTC and discards the offset; a numeric offset could not do DST anyway.
- **So each edition also has `targetTimezone`** (`target_timezone`): an IANA zone id,
  admin-editable, default `Europe/Berlin`, validated. It is the zone `targetAt`'s wall-clock is
  anchored in, not a generic community timezone.
- **The round-anchor time of day is not a field:** it is `targetAt.atZone(targetTimezone)`.

## A round = an interval + a signed number

- **A round is a half-open interval `[start, end)` with an integer number** — start-inclusive: the
  exact boundary instant belongs to the round it starts.
- **Default round = one calendar day** in `targetTimezone`, anchored to `targetAt`'s time of day.
- **The daily grid is the invariant base.** Don't model rounds in a way that assumes one game per
  day (see *Fast rounds*).

### Round numbering — a number line

The round number `n` is a signed integer that **rises with time**:

```
… −90  −89  …  −1   0 │ 1   2  …  20 …
                      │
                   targetAt
```

```
round n = [ targetAt + (n−1) days , targetAt + n days )
```

- **`n = 0` is the last day before the target** — "zero days to go" while up to 24 h still tick.
  Round 0 is real; don't remove it.
- `n < 0` are the earlier countdown days; `n = 1` is the first event day and starts at `targetAt`.
- The current round is the `n` whose interval contains `now`.

**Anchor** (pinned in `CountdownEngineTest` and `RoundTimelineOracleTest`): `targetAt` 2027-06-24
11:00 `Europe/Berlin`. At 10:00 that day round `0` runs and the clock shows 0 days, 0 hours,
60 minutes; 11:00 begins round `1`.

**A rule about round order is a comparison on the number line**, never "larger is earlier": the
next round is `n + 1`; history is `round_number < current`, most recent first; phase two is
`n >= phaseTwoStartRound`; the window is `gamesFromRound <= n <= gamesUntilRound`. A missed site
compiles and runs backwards. `RoundTimelineOracleTest` walks a run through dates and asserts dates
only — keep it that way. When touching round order, grep comments and guidelines for `MIN`/`MAX`,
above/below, raise/lower and up/back next to round terms.

**Display — the number, no label.** The game header shows the number as is (`-89`, `0`, `1`). The
countdown shows no sign: it counts down before the target and up from it. The link preview says
„Noch 58 Tage: Spiel mit!“. There is no `T−`/`T+`.

huettehuette counted the other way (a larger number was earlier) and was end-inclusive; ported
test vectors are negated and their boundary cases adjusted.

## DST handling

The mental model is Luxon's *“Math across DSTs”*
(<https://moment.github.io/luxon/#/zones?id=math-across-dsts>): **calendar units** (days) anchor the
wall-clock, **precise units** (hours, minutes, seconds) anchor elapsed time. `java.time` behaves
the same: `ZonedDateTime.plusDays()` is calendar-aware, `.plus(Duration)` is exact.

- **Round boundaries are calendar units.** A DST day (23 h or 25 h) is exactly one round; the
  boundary stays glued to the wall-clock time. `plusDays` / `plus({days})`, **never**
  `instant ± 86400s`.
- **The tick within a round is precise units:** on a DST day "time until next round" is 23 h or
  25 h.

## Computation & placement

- **Server-authoritative.** The current round is a pure function of
  `(now, targetAt, targetTimezone, roundLength)` — no DB. The SPA renders the backend's instants
  and re-derives nothing ([frontend-state.md](frontend-state.md)).
- **Cover DST transitions and exact-boundary instants explicitly** in its tests.

## A grid that is in play is fixed

A round number is stored nowhere; it is recomputed from `targetAt` and `targetTimezone`. Moving
either after rounds were announced points the grid at numbers `game.round_games` already holds — a
round twice, or numbers skipped.

- **A run is frozen from the start of round `gamesFromRound - 1`** — the earliest instant a
  `round_games` row can exist, since rounds are announced a day ahead. From then on the two fields
  are 409; the way forward is a new edition.
- **An unfrozen run may start at once:** its game start may be the running round, never one that
  has ended (`firstGameRoundEnd`). The form makes the admin confirm, because target and zone are
  fixed right away.
- **The state is derived, never stored** (`frozenSince(edition)` against the clock). The check
  compares the persisted edition with the one the update would produce and rejects any update after
  which the run would no longer be frozen — a rule on the effect, not on a field.
- **`phaseTwoStartRound` and the game window do not freeze.** Rule and stake are frozen per round
  at announcement (`award_rule`, `award_points`), so moving them touches only rounds not yet
  announced.

## Editions: 0..1 active, always dated

- **A community has 0..1 active edition;** "none" is a normal state, never an error — the
  countdown then shows no date.
- An edition always has `targetAt` and `gamesFromRound`; only `label` is optional (null = called
  like the community).
- **Write paths are separate:** `PATCH /communities/{slug}` renames only (the slug never changes),
  `POST .../editions` creates (409 while one is active), `PUT .../editions/active` **replaces
  completely** — an absent optional field clears it, there is no "null = keep".
- Round bounds: `gamesFromRound <= phaseTwoStartRound <= 0` (phase two optional).
- **Archiving ends a run** (`POST .../editions/active/archive`, admin, any time): the edition row
  stays with `final_standings` (rank, name, short name, colour, points — **no `user_id`**, so a
  deleted account changes nothing), and every `game.round_games` row of the run is deleted; plays,
  votes and assets go by cascade. A new table bound to a run must cascade from `round_games` or
  `editions`, or archiving leaves it behind. Announcing locks the edition `FOR KEY SHARE` and refuses an
  archived one, so no round outlives its run. An edit reads the edition `FOR NO KEY UPDATE`;
  unlocked, a save racing the archive writes `archived_at = null` back. The two pass each other, so
  a slow materialisation never holds up a save; only the archive's `FOR UPDATE` waits for both.
- **The edition `id` is its stable seed** — `PUT .../editions/active` keeps it. Presentational,
  public picks draw from it in the client: the closing poster is `hash32(id) % posterList.length`
  (`communities/fallbacks/poster/posters.ts`). Growing a list re-rolls only the edition that is
  closing right now; anything a player could profit from stays server-side.

## Fast rounds (not built, not specced)

The agreed shape only: the day stays the base grid, and a day can hold **several games** of varying
length, numbered `{major}.{minor}` (`1.1`, `1.2`, `2.1`), each a half-open interval nested in its
day's. One game per day is `minor = 1`. When it is specced, `MaterialisationSchedule` must announce
every sub-round of the next day.
