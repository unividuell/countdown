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

## A closed round is open

A round nobody can play any more has nothing left to protect: `RoundResponses` sends `payload`,
`solution` and every finished guess to every member once `current.closed`, whether or not that member
ever opened the round while it ran — missing it cost them the points and there is no second chance to
earn them, so the gate that used to wait for a guess is not guarding anything by then. What stays
withheld regardless of `closed` is a row that was revealed but never guessed: that fact names a
person's behaviour, not the round's outcome, and closing the round does not change whose business
that is.

The one line that makes opening the round safe is `HistoryService.resolve` refusing anything not
**strictly older** than the running round. Drop it and the history endpoint becomes a second route to
the running round's own solution, one that walks past `present()`/`solution()` and the field-set tests
that pin what those two are allowed to carry.

The way back through a run is a pointer on every round's own answer, not a page to request:
`previousRoundNumber` is `MIN(round_number)` strictly above the current one within the game window,
and `NULL` means „ganz am Anfang“. A day without a `round_games` row — one before the schedule
existed, or one both the schedule and the fallback missed — is simply not a link in the chain;
nothing has to count the gap. The pointer lives on `ResolvedRound` itself rather than travelling as a
parameter into `RoundResponses.of`: the client replaces its whole round object with every action
response, so a pointer threaded through only one call site is a pointer some other call site can
forget.

`AnnouncementService.resolve`'s super-admin bypass reaches closed rounds the same way it reaches the
running one: looking at a round is a read whether or not that round is still playable, so an operator
who never joined the community can resolve a past round through the history endpoint too and see its
solution and everyone's guesses. This falls out of a contract that already existed for the running
round — it is not a new decision — and it is currently untested; naming it here is the point.

## What must be fixed per round is materialised a day ahead

`MaterialisationSchedule` announces every active run's next round once a day — and the running one if
an earlier run missed it. Ahead, because a round boundary is `startsAt`'s time of day in the run's own
zone, a different hour per community: one daily run can only prepare the round that starts within the
next 24 hours. The announcing `GET` is the fallback for a round the run missed.

Both write via `INSERT … ON CONFLICT DO NOTHING` followed by a `SELECT` — **not** by catching
`DuplicateKeyException`: a constraint violation marks the transaction rollback-only in Postgres, so
the re-read inside the same transaction would fail. First writer wins, the loser reads the winner's
row and plays their game. The run checks for a row before drawing, so whatever exists stays, and
never announces a round before the one it follows: the selection only looks back.

A round announced ahead holds its solution a day before it is playable: nothing may hand out a round
newer than the running one (`MaterialisationScheduleBootTest` pins it with the row present).

Persisting is allowed. The anti-cheat constraint forbids *recurring admin work*, not storage.

## One secret per round, two exits — and the rule is per stream

A round's `params` blob is its only secret, and it leaves the server through exactly two functions:
`present()` before the guess, `solution()` after it. Both are pinned per game by a field-set test.

The **scene** is a third publication, and deliberately *not* a third exit for the secret.
`GameType.scene(params)` is what may reach the client before the reveal — the layout a sealed game
sets up under its cover — and it carries nothing the reveal protects: that is its contract, pinned
by a field-set test per game like `present()` and `solution()`. `null` is the default and the safe
direction. It is named scene, not stage, because stage is the rung of a staged game.

A scene draws from **neither** of the other two streams — not `presentation`, not `solution`. Either
one is invertible to a published value, so a scene value taken from `presentation` would let a client
rebuild the still-sealed payload before the reveal, and one from `solution` would rebuild the
solution. A drawn scene value comes from `GameRandom.scene`, the third stream: published before the
reveal, so it must not share a stream with anything the reveal or the guess protects.

A value that is published must never be drawn from the stream that produced the solution. Not "must
not equal the solution" — `SeededRandom` is invertible (`nextDouble` publishes 53 bits of two
consecutive words, the xoshiro128** transition is a bijection), so a published double lets the state be
stepped **backwards** to whatever the same stream drew earlier. Hence `GameRandom`, with three
independently seeded streams, and the split runs along **publication**: `scene` draws what reaches the
client before the reveal, `presentation` what is shown from the reveal on, and `solution` only what
stays here. The seeds from one `SecureRandom` are fine — a CSPRNG's output is not invertible to its
state.

A seed derived from round coordinates is not a secret. The seed is drawn, used, and thrown away.

`solution()` returning `null` only closes that one exit. Once the viewer has guessed, the framework
sends every other player's `guess` and `Judgement.outcome` unconditionally (see the switch rule
below) — so a game that withholds its solution must also make sure its `outcome` carries nothing the
solution can be reconstructed from, a distance included, or the second exit gives back what the first
one held.

## Round assets: named, frozen once, sealed until their stage

A game only *produces* assets; the framework stores, gates and ships them. `GameType.produceAssets(params)`
returns `RoundAsset`s: a name (`[a-z0-9-]+`, unique per round — identity only, it says nothing about
visibility), a media type, plain bytes, and exactly one visibility.

| Visibility | Bytes fetchable by | Key reaches | Delivered as |
|---|---|---|---|
| `Scene` | every member | — | plain; what the cover lies over |
| `FromStage(n)` | every member | who revealed and reached stage `n` (`0` = at the reveal) | ChaCha20-Poly1305 ciphertext, one random key per asset |
| `AfterGuess` | who guessed or gave up | — | plain |

- **One rule, two callers.** `AssetVisibility.mayFetch`/`opensKey` and `keysFor` (`RoundAssets.kt`) answer
  for the real round (`PlayService`, `RoundResponses`) and the lab (`LabService`); each caller only
  supplies the viewer's state from its own source. A closed round (see above) opens every asset and
  every key. Never branch on a name or a number: magic keys and per-game stage maps are how the rule
  used to fork.
- **Stored once, never released.** `RoundMaterialiser` calls `produceAssets` once per round into
  `game.round_assets`, visibility frozen with the bytes; the gate never asks the game again, and a
  source that goes away (a Deezer preview URL is ephemeral) is never resolved a second time. Both racers
  of an announce materialise: `exists` spares the second, and the unique key means the loser's rows —
  random keys — can never replace the winner's. Nothing frees them before the edition is archived (a
  single `DELETE`, not built), so the table grows with every round and history has all the round had.
- **Sealed ahead, key with the stage.** A stage asset may be fetched before its stage, so the bytes
  travel under the reveal cover and nothing loads on the scored clock; the stage that opens it brings
  the key (`assetKeys` in the round response, never in the payload — the game knows no keys). One key
  per asset: a shared round key would open the whole ladder at stage 0.

```
under the cover                         reveal / stage n
GET …/assets/{name}  ──► ciphertext ─┐
POST /reveal ──► payload + assetKeys ─┴─► open (noble) ──► insert
```

- **`AfterGuess` is never sent ahead, not even sealed.** The ciphertext's size is public (plaintext + 28
  bytes), and the size of Anspielung's preview MP3 identifies the track in the pool.
- **The size of a `FromStage` asset is public before its stage and must not narrow the solution.** Same
  rule as a scene value. If the size would follow the solution, the game makes it constant: Platzierung's
  patch is an uncompressed PNG, because a compressed one is as large as the texture at (x, y) is busy,
  and a script holding the photo could try every candidate. The framework does not pad. A size that only
  names the photo (Platzierung's board) is accepted where it narrows nothing else.
- **The asset URL carries the `round_games` id (`?round=`).** Round numbers restart with each run and the
  response is cached `immutable` for a day: the number alone would hit the previous run's entry — a stale
  picture, or ciphertext that no longer opens.
- A catalogue-wide lookup (search, track metadata) lives on the module's own URL (`/api/song-snippet/...`)
  and needs no gate: searching the catalogue reveals nothing about which song the round chose.

## The viewer's row and the others' rows are different types

`MyPlayDto` and `OtherPlayDto` are two types, not one with the private fields nulled out. What the
others played and what it scored is the round, and they get it; *when* they revealed and *when* they
guessed says how long each of them sat on it, and that is between them and the server. Two types make
that structural: there is no field to forget to blank, and a stamp added to the viewer's row cannot
reach everybody else's by accident. The same reasoning as `qualifies`/`deviation` — a value the
browser never receives cannot be read out of the network tab either — one level up, at the row.

Sorting `others` by `guessedAt` stays: the order the round happened in is what the list is for, and an
order is not a clock.

**The duration is the one exception, and it sharpens the rule rather than breaking it.** Timestamps
stay private because *when* someone acted is their own business, not the round's outcome — but for a
game whose ranking is built on elapsed time, the duration between the two stamps *is* the round's
outcome, the way a Guess Hue player's angle is. `durationMs` is published on both `MyPlayDto` and
`OtherPlayDto` under exactly one condition, `GameType.scoresOnDuration(params)`. Withholding it for a
time-scored game would show a ranking whose basis nobody can see; publishing it for every other game
would leak exactly the sitting-on-it fact this section exists to protect.

`requiresReveal` and `scoresOnDuration` are two questions: a deliberate, single reveal, and whether
reveal-to-guess is the score. Entstauber answers `true`/`false`.

## The game judges, the framework awards

A game says "eligible for points" (`qualifies`) and "this far off" (`deviation`); how many points that
is worth, and whose points expire because of it, is the same for every game. The boundary runs at the
value the framework must **compare** but cannot **compute**.

Rule *and* stake come from **one** function (`awardFor`) and are frozen onto the round, which is what
lets the balance change later without costing history. A game that has a genuine precondition puts it
in `qualifies`; if nobody meets it, nobody wins — and that is the game's statement, not the rule's.

A ported rule carries the original's name in a **comment**, not in the identifier: `CLOSEST_ONLY` says
what happens, „winner takes it all“ says where it comes from. Keep it to a few words.

## A client's time claim is checked against the server's span — as a floor only

A game whose client measures what it scores (Entstauber's reaction times) overrides the
`judge(params, guess, context)` overload and reads `GuessContext.sinceRevealMs`: the server's span from
the reveal to the guess's arrival. Use it as a **floor** — no run reaches the server before the run it
claims could have ended, and latency only lengthens the span, so the check needs no tolerance and
raises no false alarm. Never as a **ceiling**: a retry after a failed send, a request parked in a
background tab, a dead spot all arrive as late as a cheat. Log late, don't mark it.

A mark names its reason in the stored `outcome` — an enum list, empty when plausible — not only in a
log line; the line carries `GuessContext.playId`, so row and line find each other. Players' hints say
*that* a run is marked; the reasons are for the super-admin.

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

**Nothing foreign inside that lock.** `judge` may do network I/O — Weltanschauung asks Google for the
panorama's country — so it runs *before* the lock is taken, the way the lab already judges outside its
`synchronized`. Held across a foreign call, the lock serialises every guess, give-up, vote and
override of the round behind the slowest response, and pins a pooled JDBC connection while it waits.
The round's params are safe to read unlocked (written once, at announce time), and so is the play row:
every write to it is a conditional statement that simply fails on a stale read.

## Unique index instead of a service check

"One guess per player and round" is `UNIQUE (round_game_id, user_id)` plus an
`UPDATE … WHERE guessed_at IS NULL` — zero affected rows is the 409. Not read-then-check.

Judging happens **before** the write, so an invalid guess cannot consume the one attempt.

## Whoever addresses a round says which one

Every write on the current round — reveal, guess, skip, give-up — carries the round number it believes
it is playing, not just "the current one": each request body has `roundNumber`, and `PlayService`
checks it against the round it just resolved before writing, locking or judging anything — a mismatch
is `RoundMovedOnException`, mapped to 409, and the client refetches. "The current round" is not the
same thing for a client and a server once the next round starts between the two requests — rounds
switch at their own start time, not at midnight; sending the number costs one field and turns a
would-be verdict against a target the player never saw into a result the client can react to instead.
The reveal is the sharpest case: for a `requiresReveal` game a hold that ends just after the round
switch would otherwise spend the next round's one reveal and start its scored clock unseen. The lab
sends no number: seed and phase ride on every call and already are its round key.

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

A game whose content may be absent says so in `isAvailable(context)`; the selection draws among the
available ones only, and the lab answers 404 for the others.

## Stages generalise the framework, not the game

`round_plays.stage` belongs to the framework, not to any one game: a single-stage game (Guess Hue)
just always writes the constant `0`. For a staged round, the recorded `deviation` **is** the stage —
the framework overrides whatever the game returns with the stage number, and the game's own
`deviation` is a meaningless `0.0` that never reaches storage. "A wrong guess below the last stage
advances the round instead of recording it" is not universal — it holds only under `ALL_QUALIFYING`;
`CLOSEST_ONLY` (phase two) is always terminal on the first guess, whatever the stage, because only one
guess ever counts. The pure decision lives in one place, `guessActionFor` in `PlayFlow.kt`, exposed so
the lab replays the exact rule a real round applies instead of a copy of it.

A `scoresOnDuration` game is the second case of the same shape: `PlayService.guess` overrides
`deviation` with the reveal-to-guess duration, and the game's own `deviation` never reaches storage
there either — same reasoning as the stage override, and for the same reason it belongs to the
framework and not the game: a game judges its own content, but the round's timing is framework state.
A game may *check* a time claim against the span (see above), never *score* on it. `PlayService.guess`'s `when` checks stage,
then reveal duration, then the game's own `deviation`, in that order — and all three ride on the one
`deviation` column rather than a column each, because `deviation` is already the single comparison
value `pointsFor` and `CLOSEST_ONLY` both read.

Giving up is `guessed_at`
set with no `guess` — re-evaluation reads that as not qualifying, awards zero points, and opens the
solution gate the same way a judged-and-lost guess would.
