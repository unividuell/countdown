# Countdown & Rounds (the app's core principle)

The defining USP: each **community** counts down to its event start (`startsAt`). To shorten
the wait, the time before (and during/after) the event is divided into **rounds** that carry
gameplay. This file is the **binding domain model** for the countdown/round mechanics — capture
decisions here, don't re-derive them. (Origin reference: `huettehuette.unividuell.org`
`server/composables/useCurrentGameRound.ts` + its tests; the port deliberately changes a few
conventions — see below.)

Not yet implemented — this is the agreed model to build the `countdown` module against.

## Anchor: `startsAt` + community `timezone`

- A community has **`startsAt`** (the event start) stored as Postgres `TIMESTAMPTZ` → mapped to a
  Kotlin **`Instant`** (an absolute moment, **zone-less**).
- **`TIMESTAMPTZ` does NOT store a timezone.** Postgres converts the input to UTC on write and
  **discards the offset/zone**; on read it renders in the session zone. So `startsAt` alone only
  knows *"this instant"*, not *"11:00 in which zone"*. A fixed numeric offset wouldn't help either
  — it can't do DST (winter `+01:00` vs summer `+02:00`).
- Therefore each community also has **`timezone`** — an **IANA zone id** (e.g. `Europe/Berlin`),
  **admin-editable**, default `Europe/Berlin`. (New `community` column;
  validate it's a real IANA zone.)
- The round-anchor **time-of-day (e.g. 11:00) is NOT a separate field** — it falls out of
  `startsAt` rendered in `timezone` (`startsAt.atZone(timezone)`). So **`startsAt` (instant) +
  `timezone` (zone)** together fully define the countdown anchor and the round grid.

## A round = an interval + a signed number

- A **round is a half-open time interval `[start, end)` with an integer number** (and a derived
  label). **Start-inclusive, end-exclusive.** Modelling it as an interval (not "a day") is
  deliberate: the default round is 1 day, but later **fast rounds** (e.g. 5-minute rounds during
  the event) plug in as shorter intervals without reworking the model. The daily computation below
  is just the **default round generator**.
- **Default round = one calendar day** in the community `timezone`, anchored to `startsAt`'s
  time-of-day. If `startsAt` is `…T11:00` in `Europe/Berlin`, each round runs
  `[day 11:00, next-day 11:00)` local time.

### Signed T-offset numbering (the port's convention)

The round number is the **signed offset to the start**, increasing monotonically over time. There
is **no round 0** — `startsAt` is the boundary between `T−1` and `T+1`:

- `T−1` = `[startsAt − 1 day, startsAt)` — the last countdown day.
- `T−n` = `[startsAt − n days, startsAt − (n−1) days)`.
- `T+1` = `[startsAt, startsAt + 1 day)` — the first interval at/after the start (the event begins).
- `T+n` = `[startsAt + (n−1) days, startsAt + n days)`.

For a uniform daily grid, with `k = floor((now − startsAt) / roundLength)` computed in `timezone`
(DST-aware day math), the current round number is:

```
r = (k >= 0) ? k + 1 : k        // …, −2, −1, +1, +2, …  (skips 0)
```

The **number is also the label** (`−59`, `−1`, `+1`); displayed as `T−59` / `T+1`.

> **Differences from huettehuette (deliberate):** the origin used the *opposite* sign — a positive
> count-down (`trunc(daysUntil)` → 59…1, **with a round 0** = the last day, then `floor` → −1, −2
> after start) and label `"T-" + number`. The port flips to the signed T-offset (label == number)
> and **start-inclusive** boundaries. The origin was **end-inclusive** at the time-of-day mark
> (the exact 11:00:00 instant belonged to the older round); the port makes 11:00:00 belong to the
> round it *starts*.

## DST handling

- Day math runs in the community `timezone` and is **calendar-aware**: a DST-transition day
  (23 h or 25 h real time) still counts as **exactly one round** — the boundary stays glued to the
  wall-clock time-of-day (11:00). Use zone-aware date math (`ZonedDateTime.plusDays` /
  Luxon `plus({days})`), never `instant ± 86400s`.
- The **within-round countdown** to the next boundary, however, reflects **real elapsed time**, so
  on DST days the visible "time until next round" is 23 h / 25 h. (Origin split this into
  "higher-order" calendar units + "lower-order" precise hours/min/sec — see
  `huettehuette/stores/useCountdownStore.ts`.)

## Computation & placement

- **Server-authoritative.** The current-round computation is a **pure function** of
  `(now, startsAt, timezone, roundLength)` — no DB needed for the number itself. Put it in a
  backend Spring Modulith module (working name **`countdown`**, schema-per-module), depending on
  `community` (for `startsAt` + `timezone` + `phaseTwoStartRound`). Expose a public query
  (current round for `now`; the round number for any instant; a round's `[start, end)`).
- **Heavily unit-tested**, TDD: port the huettehuette test vectors (adjusting for the flipped sign
  + start-inclusive boundary), and cover the **DST transitions** explicitly (spring-forward /
  fall-back days) and the exact-boundary instants.
- **Frontend** shows the live countdown + current round. If the SPA computes it client-side
  (for a ticking display), keep it in **parity** with the backend function — same rule, parity
  test — exactly like the slug-derivation parity (see `multi-tenancy.md`). Alternatively render
  from a backend value; the origin did both (client store + server composable).

## Related / future

- **`phaseTwoStartRound`** (already a `community` field): a **round threshold** that changes
  **scoring** (tolerance / point curve) at/after that round — a concern of the future *points*
  logic, not the round grid itself. With the signed convention it holds a T-offset value; pin its
  exact meaning when the points module is specced.
- **Fast rounds** (e.g. 5-minute rounds during the event, `T+`): a *future spec*. The
  interval-based round model is designed to accommodate them — a fast-round window overrides the
  default daily generator for a range of time with a shorter `roundLength`. Don't build them yet;
  just don't model rounds in a way that assumes "round == 1 day".
