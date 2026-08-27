# Game integrity — validated at the first game

`docs/superpowers/specs/2026-08-02-anti-cheat-design.md` is the brainstorm; this file is what
survived contact with Musterung (`find-pattern`), the game it names as the hard case — its secret
sits in what the player can see, not in a fact only the server knows. Every rule below has code
behind it. What is still intent, not yet validated anywhere, stays in the spec.

## From parseable to perceptual

What carries the answer leaves the server as a picture, not a value. `FindPatternPayload` is exactly
five fields — `cols`, `rows`, `patternLength`, `boardImage`, `patternImage` — pinned by a field-set
test, and neither image field is a colour or an index: both are rendered PNGs
(`FindPatternImages`). Had the four tones travelled as data, a three-line script could read them out
of the payload and locate the pattern without looking at anything. Rendering moves the attack from
"parse the payload" to "extract pixels" — the documented ceiling for a game whose secret lives in the
visible, not a gap to close later. The rule this generalises to: **a module exposes no helper that
hands out a cell's colour** — nothing a caller could use to reconstruct the image's content without
rendering it.

## Two streams, split by publication, not by value

`FindPatternGameType.draw` draws `blocks`, `delta` and the palette reference from
`random.presentation`, and only `patternStartIndex` from `random.solution` — the comment on that one
line reads "the only draw from the solution stream". The rule this proves is `game-rounds.md`'s
two-streams rule applied to a game whose published values are *images*, not scalars: an image
*derived from* a solution-stream draw is exactly as unsafe as publishing the draw itself, because a
determined-enough script still extracts the value the image encodes. What is safe is a stream
boundary — nothing presented was ever touched by the solution generator, so there is nothing to
invert. `FindPatternGameTypeTest` carries both proofs as tests: one holds the presentation seed fixed
across different solution seeds and asserts the board is unchanged; the other holds the solution seed
fixed across different presentation seeds and asserts the start index is unchanged. Either one failing
would mean a stream crossed a boundary it must not.

## A field-set test per payload *and* per solution

Not "the answer is absent" — the exact set, both directions. `FindPatternGameTypeTest` pins
`present()` to `{cols, rows, patternLength, boardImage, patternImage}` and `solution()` separately to
`{blocks, pattern, palette, delta, startIndices}`. Pinning the solution matters as much as pinning the
payload: `game-rounds.md`'s two-exits rule says a game that withholds part of its answer must also
make sure the other exit does not hand it back — a solution field-set test is what makes "the other
exit carries nothing more" checkable instead of asserted.

## The client never materialises the solution, not even derived

`FindPatternBoard.vue` holds a single `ref<number[]>` of tapped cell indices and nothing else — no
computed "where the pattern actually is" for a hint overlay, no local variable that would hold it even
transiently. A value the browser never receives cannot be read out of the network tab; a value the
component state never computes cannot be read out of the Vue devtools either — payload hygiene alone
does not cover the second one.

## Time scoring is server-authoritative — no client stamps, no drift reconciliation, no ban

The clock is `revealed_at → guessed_at`, both server `Instant`s, and `PlayService.guess` reads the
guess instant once and uses that same reading both to record `guessed_at` and to compute the duration
— there is no second clock read for either value to drift against the other. A refresh does not reset
the clock: revealing is state (`revealOnce`'s `INSERT … ON CONFLICT (round_game_id, user_id) DO
NOTHING`, see `game-rounds.md`), so "start, look, refresh, replay with a head start" pays for the look
regardless of how many times the client reloads. There is no client-submitted duration, nothing to
reconcile against a server value, and no rule that flags or bans an outlier — the spec's "detection,
not hardening" stance for this class of signal stays a spec-side open question, not something this
build answers.

## Images belong in the payload while they are small — the asset endpoint is for expensive, stored bytes

Musterung's two PNGs travel as base64 inside `FindPatternPayload`, not through the framework's binary
round-asset endpoint (`/api/communities/{slug}/rounds/{roundNumber}/assets/{key}`). The counter-proof
for why that is the right call, not an oversight: that endpoint's pre-guess gate (`PlayService.asset`)
lets a key through only while `key in 0..play.stage`, and a single-stage game like Musterung
(`play.stage` frozen at `0`) means exactly one key is reachable before the guess. A second pre-guess
image routed through that endpoint would need either a second key opened before the guess — a change
to what `stage` means for a single-stage game — or a second condition in the gate itself. Two small
images that both change every round are cheaper as JSON fields than as a framework change; the asset
endpoint earns its cost only for bytes too large or too expensive to regenerate per request (a song
snippet's WAV ladder, not a 225-byte PNG).
