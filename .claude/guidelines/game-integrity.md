# Game integrity — validated at the first game

`docs/superpowers/specs/2026-08-02-anti-cheat-design.md` is the brainstorm; this file is what
survived Musterung (`find-pattern`), whose secret sits in what the player can see. Every rule has
code behind it; what is still intent stays in the spec. The exits, streams and assets themselves
are [game-rounds.md](game-rounds.md)'s.

## From parseable to perceptual

- **What carries the answer leaves the server as a picture, not a value.** `FindPatternPayload` is
  three numbers; board and pattern are rendered PNGs (`FindPatternImages`). Data would let a
  three-line script locate the pattern; a picture moves the attack to pixel extraction — the
  documented ceiling for a secret that lives in the visible.
- **A module exposes no helper that hands out a cell's colour** — nothing a caller could rebuild
  the image's content from without rendering it.
- **An image derived from a solution-stream draw is as unsafe as the draw.** Only the stream
  boundary is safe. `FindPatternGameTypeTest` proves it both ways: presentation seed fixed, board
  unchanged across solution seeds — and the reverse.
- **A picture is an asset, never a payload field.** In the payload it would arrive on the scored
  clock; as a `FromStage(0)` asset it is preloaded sealed under the cover. Its size is public
  before the reveal — for Musterung that is the palette's compressibility, which helps no search.

## The client never materialises the solution, not even derived

`FindPatternBoard.vue` holds the tapped cell indices and nothing else — no computed "where the
pattern is", not for a hint overlay, not transiently. What the browser never receives is not in the
network tab; what component state never computes is not in the Vue devtools either. No test covers
this: it is a review point per game.

## Time scoring is server-authoritative

- **The clock is `revealed_at → guessed_at`, both server `Instant`s.** `PlayService.guess` reads
  the guess instant once, for the stamp and the duration.
- **Revealing is state, so a refresh does not reset the clock** (`revealOnce`).
- No client-submitted duration, nothing to reconcile, no rule that flags or bans an outlier.

## The ceiling, named — Entstauber

The first game that cannot keep two of these rules, by necessity:

- **The tile order leaves the server as a list:** a round trip per tile is out at 900–2000 ms a
  beat. Sealed before the reveal, never in the DOM after it — the network tab stays open.
- **The ⌀ reaction time is a client stamp:** without round trips there is no server-side
  measurement.

What stands in: a plausibility floor (`< 120 ms` or `> intervalMs` marks the run), the mark shown
in the evaluation, the raw times stored. **Mark, never reject** — a false alarm must never cost a
player their only attempt.
