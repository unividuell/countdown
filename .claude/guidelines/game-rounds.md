# Game rounds

How a community's round gets a game, and how a guess becomes points. See
`docs/superpowers/specs/2026-08-11-round-game-selection-design.md` for the reasoning behind each rule.

## The run is the round coordinate, not the community

A community is permanent, its countdown is not: the target event recurs, so `(community, T-58)` is not
a key — every run has its own T-58 with its own guesses and its own ranking. Everything that hangs off
a round hangs off `edition_id` (`community.editions`), and exactly one edition per community is active,
enforced by a partial unique index on `archived_at IS NULL`.

## A larger round number is earlier

The game window's bounds are named `from`/`until`, never start/end. "The previous round" is `round_number > n`, ascending
— the first row is the most recently played one. Phase two is `round_number <= phase_two_start_round`.
The game window is inclusive on both ends, and `games_from_round = NULL` means unbounded above.

## What must be fixed per round is materialised on the first announcement

Lazily, by the `GET` that announces it, via `INSERT … ON CONFLICT DO NOTHING` followed by a `SELECT`
— **not** by catching `DuplicateKeyException`: a constraint violation marks the transaction
rollback-only in Postgres, so the re-read inside the same transaction would fail. First writer wins,
the loser reads the winner's row and plays their game.

Persisting is allowed. The anti-cheat constraint forbids *recurring admin work*, not storage.

## One secret per round, two exits — and the rule is per stream

A round's `params` blob is its only secret, and it leaves the server through exactly two functions:
`present()` before the guess, `solution()` after it. Both are pinned per game by a field-set test.

A value that is published must never be drawn from the stream that produced the solution. Not "must
not equal the solution" — `SeededRandom` is invertible (`nextDouble` publishes 53 bits of two
consecutive words, the xoshiro128** transition is a bijection), so a published double lets the state be
stepped **backwards** to whatever the same stream drew earlier. Hence `GameRandom`, with two
independently seeded streams, and the split runs along **publication**: anything the player is shown or
that gets announced comes from `presentation`, and `solution` draws only what stays here. Two seeds
from one `SecureRandom` are fine — a CSPRNG's output is not invertible to its state.

A seed derived from round coordinates is not a secret. The seed is drawn, used, and thrown away.

`solution()` returning `null` only closes that one exit. Once the viewer has guessed, the framework
sends every other player's `guess` and `Judgement.outcome` unconditionally (see the switch rule
below) — so a game that withholds its solution must also make sure its `outcome` carries nothing the
solution can be reconstructed from, a distance included, or the second exit gives back what the first
one held.

## The viewer's row and the others' rows are different types

`MyPlayDto` and `OtherPlayDto` are two types, not one with the private fields nulled out. What the
others played and what it scored is the round, and they get it; *when* they revealed and *when* they
guessed says how long each of them sat on it, and that is between them and the server. Two types make
that structural: there is no field to forget to blank, and a stamp added to the viewer's row cannot
reach everybody else's by accident. The same reasoning as `qualifies`/`deviation` — a value the
browser never receives cannot be read out of the network tab either — one level up, at the row.

Sorting `others` by `guessedAt` stays: the order the round happened in is what the list is for, and an
order is not a clock.

## The game judges, the framework awards

A game says "eligible for points" (`qualifies`) and "this far off" (`deviation`); how many points that
is worth, and whose points expire because of it, is the same for every game. The boundary runs at the
value the framework must **compare** but cannot **compute**.

Rule *and* stake come from **one** function (`awardFor`) and are frozen onto the round, which is what
lets the balance change later without costing history. A game that has a genuine precondition puts it
in `qualifies`; if nobody meets it, nobody wins — and that is the game's statement, not the rule's.

A ported rule carries the original's name in a **comment**, not in the identifier: `CLOSEST_ONLY` says
what happens, „winner takes it all“ says where it comes from. Keep it to a few words.

## Points are a cache over persisted inputs

`points` is not a verdict but a materialised view: `points = f(award rule, all verdicts of the round)`.
Two consequences worth knowing before touching it:

- **"Taking points away" needs no mechanism.** Every guess re-evaluates the whole round and writes
  `points` for all guessed rows. No removal step, no job, no events — and the re-evaluation is
  stateless, so it heals itself.
- **A scoring bugfix is a backfill**, not a shrug about lost history.
- **Whoever needs a round's rule reads the frozen row, never `awardFor` again.** A recomputation
  answers for *today's* thresholds, and an admin may have moved them under a round announced long
  before — so `pointsOf` carries `award_rule` along with the points. Whether a number can still move
  follows from that rule and nothing else: `CLOSEST_ONLY` and `> 0` is up for grabs, a zero is a
  round already lost and no later guess brings it back. Decide it here; the client is told, not asked
  to derive.

The standings sum only rounds that are **finished** and **inside the run's current window**, using the
same `windowReasonOf` the announcement uses. Shrinking the window therefore lowers a total, and
re-opening it restores the same number untouched.

The lab's rounds run through the same `awardFor` and the same `pointsFor` as a real round, not a
copy of either. Whoever touches one changes both, on purpose: `LabPointsParityTest` pins that a lab
round in phase two pays exactly what a real round in phase two pays.

## Whoever writes other rows must serialise

An evaluation across a whole round needs a row lock on the round (`SELECT … FOR UPDATE`), or the exact
moment the points move loses an update. Locking one row serialises the guesses of *one* round; rounds
do not block each other.

## Unique index instead of a service check

"One guess per player and round" is `UNIQUE (round_game_id, user_id)` plus an
`UPDATE … WHERE guessed_at IS NULL` — zero affected rows is the 409. Not read-then-check.

Judging happens **before** the write, so an invalid guess cannot consume the one attempt.

## Whoever addresses a round says which one

A guess carries the round number it believes it is playing, not just "the current one":
`GuessRequest` pairs `roundNumber` with the guess, and `PlayService.guess` checks it against the round
it just resolved before locking anything or judging — a mismatch is `RoundMovedOnException`, mapped to
409. "The current round" is not the same thing for a client and a server once a day boundary passes
between the two requests; sending the number costs one field and turns a would-be verdict against a
target the player never saw into a result the client can react to instead.

## What is replayable from timestamps needs no column

Guesses are immutable and dated, so every intermediate state can be reconstructed — which is why there
is no column recording who took whose points. "I need a column for moment X" only holds once the replay
cannot produce X. A log line covers the operational case without making the evaluation stateful.

## A switch whose right answer is the same for every case is a bug

It moves an invariant into a per-case review. The framework carries no such switch: once the viewer has
guessed, the others' guesses are delivered unconditionally and withheld server-side, for every game —
there is no per-game property to set. `revealsOthersBeforeGuess` was exactly that switch, in `gamelab`
(see [game-lab.md](game-lab.md)) — it, its branch and its test are gone now that the lab enforces the
same unconditional rule instead of asking each game to answer it. A participation count ("7 of 15 have
guessed") is fine at any time — it is a `COUNT`, not a filtered list of guesses.

## A switch with real variance belongs to the game

`GameType.requiresReveal(params)` is abstract, with **no default**, because the convenient answer
(`false`) is the unsafe one — it starts the player's clock without their consent and knows no lockout.
Contrast the switch above: the mechanism is the same shape, a per-case boolean, so what separates a bug
from a contract is not the mechanism but whether the answers actually differ. Guess Hue answers `false`
unconditionally, in both phases — it scores nothing on time, so the click would be ceremony without
purpose — but the next time-scored game gets an honest `true`, and inheriting a default could never have
gotten that one right by accident. "Exactly once" for that `true` case is a statement, not a
read-then-check: `revealOnce`'s `INSERT … ON CONFLICT (round_game_id, user_id) DO NOTHING` is the same
shape as `recordGuess`'s `WHERE guessed_at IS NULL` above — zero affected rows is the 409, so two clicks
racing each other cannot both win.

## A rule that is meant to grow gets its whole input

`GameSelection` receives the entire history of the run and the candidate list, although "not the same
game twice in a row" would need one row. That makes the next rule a change to a pure function instead
of to a query, a service and their tests. Legitimate as long as the full input is cheap — here a few
dozen two-column rows, once per round.
