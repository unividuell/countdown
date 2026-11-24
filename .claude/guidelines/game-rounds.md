# Game rounds

How a community's round gets a game, and how a guess becomes points. Reasoning:
`docs/superpowers/specs/2026-08-11-round-game-selection-design.md`.

## The run is the round coordinate, not the community

A community is permanent, its countdown recurs: every run has its own round -58. Everything that
hangs off a round hangs off `edition_id` (`community.editions`); at most one edition per community
is active, enforced by a partial unique index on `archived_at IS NULL`.

Round order is [countdown.md](countdown.md)'s number line: smaller is earlier. The game window's
bounds are `from`/`until`, never start/end, inclusive on both ends.

## A closed round is open

- **Once `current.closed`, every member gets `payload`, `solution` and every finished guess**
  (`RoundResponses`), whether or not they opened the round: nothing is left to protect.
- **A row revealed but never guessed stays withheld, closed or not.** It names a person's behaviour,
  not the round's outcome.
- **`HistoryService.resolve` refuses anything not strictly older than the running round.** Without
  that line the history endpoint is a second route to the running round's solution, past
  `present()`/`solution()` and their field-set tests.
- **The way back is a pointer on every round's answer.** `previousRoundNumber` is
  `MAX(round_number)` strictly below the current one within the game window; `NULL` is the
  beginning. A day without a `round_games` row is simply not in the chain. It lives on
  `ResolvedRound`, not as a parameter into `RoundResponses.of`: the client replaces its whole round
  object with every action response, so a pointer threaded through one call site is one another
  call site forgets.
- The super-admin bypass (`AnnouncementService.resolve`) reaches closed rounds like the running one:
  looking is a read. Untested.

## What must be fixed per round is materialised a day ahead

- **`MaterialisationSchedule` announces every active run's next round once a day**, and the running
  one if an earlier run missed it. Ahead, because a round boundary is `targetAt`'s time of day in the
  run's zone, a different hour per community. The announcing `GET` is the fallback.
- **Both write `INSERT … ON CONFLICT DO NOTHING`, then `SELECT`** — never by catching
  `DuplicateKeyException` ([persistence.md](persistence.md)). First writer wins; the loser reads the
  winner's row and plays their game.
- The run checks for a row before drawing, and never announces a round before the one it follows:
  the selection only looks back.
- **Nothing hands out a round newer than the running one.** A round announced ahead holds its
  solution a day early (`MaterialisationScheduleBootTest`).
- Persisting is allowed: the anti-cheat constraint forbids recurring admin work, not storage.

## One secret per round, two exits — and the rule is per stream

- **A round's `params` blob is its only secret, and it leaves through two functions:** `present()`
  before the guess, `solution()` after it. `solution` defaults to `null` and never rides in
  `GamePayload`, which also travels before the guess.
- **Each exit is pinned per game by a test of the exact field set**, not "the answer is absent":
  only the set catches a new field that merely narrows the answer. Jackson 3 reads the names with
  `propertyNames()`. `GuessHueGameTypeTest`, `FindPatternGameTypeTest`.
- **The scene is a third publication, not a third exit.** `GameType.scene(params)` is what reaches
  the client before the reveal — the layout under the cover — and carries nothing the reveal
  protects; field-set test per game, `null` by default. Scene, not stage: stage is a ladder's rung.
- **A published value is never drawn from a stream that drew something still protected.** Not "must
  not equal the solution": `SeededRandom` is invertible, so a published double steps the state
  backwards to whatever the stream drew earlier. `GameRandom` has three independently seeded
  streams, split by **publication**: `scene` (before the reveal), `presentation` (from the reveal
  on), `solution` (stays here). Seeds from one `SecureRandom` are fine.
- A seed derived from round coordinates is not a secret. The seed is drawn, used, thrown away.
- **`solution()` returning `null` closes that one exit only.** Once the viewer has guessed, every
  other player's `guess` and `Judgement.outcome` go out unconditionally — so `outcome` must carry
  nothing the withheld solution can be rebuilt from, a distance included.

## Round assets: named, frozen once, sealed until their stage

A game only *produces* assets; the framework stores, gates and ships them. `GameType.produceAssets(params)`
returns `RoundAsset`s: a name (`[a-z0-9-]+`, unique per round — identity only, it says nothing about
visibility), a media type, plain bytes, and exactly one visibility.

| Visibility | Bytes fetchable by | Key reaches | Delivered as |
|---|---|---|---|
| `Scene` | every member | — | plain; what the cover lies over |
| `FromStage(n)` | every member | who revealed and reached stage `n` (`0` = at the reveal) | ChaCha20-Poly1305 ciphertext, one random key per asset |
| `AfterGuess` | who guessed or gave up | — | plain |

- **One rule, two callers.** `AssetVisibility.mayFetch`/`opensKey` and `keysFor` (`RoundAssets.kt`)
  answer for the real round and the lab; each caller supplies the viewer's state from its own
  source. A closed round opens every asset and key. Never branch on a name or a number.
- **Stored once, never released.** `RoundMaterialiser` calls `produceAssets` once per round into
  `game.round_assets`, visibility frozen with the bytes: the gate never asks the game again, and an
  ephemeral source (a Deezer preview URL) is never resolved twice. Both racers of an announce
  materialise; the unique key keeps the loser's rows from replacing the winner's. Nothing frees the
  rows before the edition is archived (a single `DELETE`, not built).
- **A failure per asset omits the asset, it never throws.** `produceAssets` runs inside
  `materialise`'s transaction, so a throw rolls back the whole announce and every retry draws anew,
  possibly another game. Log a warning and leave the asset out (Peilung: a clip gone from the pool
  stays silent, the other still sounds).
- **Sealed ahead, key with the stage.** A stage asset may be fetched before its stage, so no
  transfer lands on the scored clock; the stage that opens it brings the key (`assetKeys` in the
  round response, never in the payload — the game knows no keys). One key per asset: a shared round
  key would open the whole ladder at stage 0. Sealing protects the wire, not the database — the
  keys sit beside the ciphertext, so `game.round_assets` is never safe to expose.

```
under the cover                         reveal / stage n
GET …/assets/{name}  ──► ciphertext ─┐
POST /reveal ──► payload + assetKeys ─┴─► open (noble) ──► insert
```

- **`AfterGuess` is never sent ahead, not even sealed.** The ciphertext's size is public (plaintext
  + 28 bytes), and the size of Anspielung's preview MP3 identifies the track in the pool.
- **The size of a `FromStage` asset is public before its stage and must not narrow the solution** —
  the scene rule again. If it would, the game makes it constant (Platzierung's patch is an
  uncompressed PNG; a compressed one is as large as the texture at the spot is busy). The framework
  does not pad. A size that only names the photo is accepted where it narrows nothing else.
- **The asset URL carries the `round_games` id (`?round=`).** Round numbers restart with each run
  and the response is cached `immutable` for a day: the number alone would hit the previous run's
  entry.
- A catalogue-wide lookup (search, track metadata) lives on the module's own URL
  (`/api/song-snippet/...`) and needs no gate: it reveals nothing about the round's choice.

## The viewer's row and the others' rows are different types

`MyPlayDto` and `OtherPlayDto` are two types, not one with fields nulled. What the others played and
scored is the round; *when* they revealed and guessed is between them and the server. Two types
leave no field to forget to blank. Sorting `others` by `guessedAt` stays: an order is not a clock.

**`durationMs` is the one exception**, published on both types under exactly
`GameType.scoresOnDuration(params)`: where elapsed time is the ranking, the duration *is* the
outcome. `requiresReveal` and `scoresOnDuration` are two questions (Entstauber: `true`/`false`).

## The game judges, the framework awards

- **A game says "eligible" (`qualifies`) and "this far off" (`deviation`); points and whose points
  expire are the same for every game.** The boundary runs at the value the framework must
  *compare* but cannot *compute*.
- **`GameType.judge` always returns both;** only `Judgement.outcome` may be `null`. Throwing is the
  only way to refuse an invalid guess.
- **Rule and stake come from one function (`awardFor`) and are frozen onto the round** — that lets
  the balance change later without costing history. Phase one is `ALL_QUALIFYING` for 1 point;
  phase two is `CLOSEST_ONLY`, its stake growing by one per round from 2 on.
- A genuine precondition goes in `qualifies`; if nobody meets it, nobody wins.
- A ported rule carries the original's name in a comment, not the identifier: `CLOSEST_ONLY` says
  what happens, „winner takes it all“ where it comes from.

## A client's time claim is checked against the server's span — as a floor only

A game whose client measures what it scores (Entstauber's reaction times) overrides
`judge(params, guess, context)` and reads `GuessContext.sinceRevealMs`.

- **Floor:** no run reaches the server before it could have ended, and latency only lengthens the
  span — no tolerance, no false alarm.
- **Never a ceiling:** a retry, a background tab, a dead spot arrive as late as a cheat. Log late,
  don't mark it.
- **A mark names its reason in the stored `outcome`** (an enum list, empty when plausible), not
  only in a log line; the line carries `GuessContext.playId`. Players see *that* a run is marked,
  the super-admin why.
- **Mark, never reject**, for every run that cannot be repeated.

## Points are a cache over persisted inputs

`points = f(award rule, all verdicts of the round)` — a materialised view, not a verdict.

- **"Taking points away" needs no mechanism.** Every guess re-evaluates the whole round and writes
  `points` for all guessed rows; stateless, so it heals itself. A scoring bugfix is a backfill.
- **Whoever needs a round's rule reads the frozen row, never `awardFor` again** — an admin may have
  moved the thresholds since. `pointsOf` carries `award_rule`; whether a number can still move
  follows from it (`CLOSEST_ONLY` and `> 0` is up for grabs, a zero is lost). Decide it on the
  server; the client is told.
- **Standings sum only rounds that are finished and inside the run's current window**
  (`windowReasonOf`, as the announcement uses). Shrinking the window lowers a total, re-opening
  restores it.
- **The lab runs through the same `awardFor` and `pointsFor`,** not a copy
  (`LabPointsParityTest`).

## Whoever writes other rows must serialise

An evaluation across a round takes a row lock on the round (`SELECT … FOR UPDATE`), or the moment
the points move loses an update. Rounds do not block each other.

**Nothing foreign inside that lock.** `judge` may do network I/O (Weltanschauung asks Google), so it
runs *before* the lock; held across a foreign call the lock queues every write of the round behind
the slowest response and pins a JDBC connection. Params (written once) and the play row (every
write is conditional) are safe to read unlocked.

## Unique index instead of a service check

- **"Once per player and round" is a constraint plus a conditional statement**, never
  read-then-check: `UNIQUE (round_game_id, user_id)` with `UPDATE … WHERE guessed_at IS NULL`
  (`recordGuess`), `INSERT … ON CONFLICT DO NOTHING` (`revealOnce`). Zero affected rows is the 409.
- **Judge before the write,** so an invalid guess cannot consume the one attempt.
- **A row already guessed answers 409 before judging** — `judge` can be the round's most expensive
  call. A shortcut, not the guard: two racing first guesses both pass it, the `UPDATE` decides.

## Whoever addresses a round says which one

Every write on the current round — reveal, guess, skip, give-up — carries `roundNumber`.
`PlayService` checks it against the round it resolved before writing, locking or judging; a
mismatch is `RoundMovedOnException` → 409, and the client refetches. Rounds switch at their own
start time, so "the current round" can differ between request and response — a hold ending just
after the switch would otherwise spend the next round's one reveal unseen. The lab sends no number:
seed and phase are its round key.

## What is replayable from timestamps needs no column

Guesses are immutable and dated, so every intermediate state can be reconstructed — hence no column
for who took whose points. A log line covers the operational case.

## A per-game switch needs answers that differ

- **A switch whose right answer is the same for every game is a bug:** it moves an invariant into a
  per-case review. Once the viewer has guessed, the others' guesses go out; before, they are
  withheld server-side — for every game, with no property to set. A participation count is fine at
  any time: it is a `COUNT`, not a list of guesses.
- **A switch with real variance is abstract, without a default.** `GameType.requiresReveal(params)`:
  the convenient answer (`false`) is the unsafe one — it starts the clock without consent.

## A rule that is meant to grow gets its whole input

`GameSelection` receives the run's entire history and the candidate list, though "not twice in a
row" needs one row: the next rule is then a change to a pure function. Legitimate while the input is
cheap.

A game whose content may be absent says so in `isAvailable(context)`; the selection draws among the
available ones, and the lab answers 404 for the others.

## Difficulty: the framework says how hard, the game says what that means

`RoundContext.difficulty` is `0.0`–`1.0`; the game decides what it changes (Peilung: one clip or
two). `difficultyOf` (`Difficulty.kt`) is its one source for a real round:

- **A game's first appearance in the edition is `0.0`**, however late — whoever meets a game first
  is learning it. After that it climbs linearly with the edition's progress.
- **Not stored; only its effect is.** The game draws with it into `params`, frozen at
  materialisation, so changing the curve alters no announced round.
- **`0.0` is the default.** `isAvailable` and the selection run before a type is chosen and see
  `0.0`, so availability must not depend on it.

## Stages generalise the framework, not the game

- **`round_plays.stage` belongs to the framework;** a single-stage game always writes `0`.
- **`stagesScore(params)` separates two ladders:** stages *are* the score (Anspielung: a wrong
  guess costs a stage) or stages *count steps* (Peilung: pings, then one guess `judge` scores).
  `guessActionFor` (`PlayFlow.kt`) takes it without a default and is the one decision the lab
  replays too.
- **A wrong guess advances the round only where stages score and under `ALL_QUALIFYING`;**
  `CLOSEST_ONLY` (phase two) is terminal on the first guess.
- **One `deviation` column, and the framework overrides it** — with the stage where stages score,
  with the reveal-to-guess duration for a `scoresOnDuration` game; only then the game's own. A game
  may *check* a time claim, never *score* on it: the round's timing is framework state.
- **Giving up is `guessed_at` set with no `guess`:** not qualifying, zero points, solution gate
  open.
- **A stage can carry data: the step.** `GameType.step(params, stage, input)` answers one move
  (Peilung's ping). The input is stored, the answer never: `step` is pure and recomputed from the
  frozen params. `round_plays.steps` holds one entry per stage (JSON `null` without input), written
  with the stage in one statement. `MyPlayDto.steps` carries input and answer, `OtherPlayDto.steps`
  only inputs. A step answer may read the earlier inputs (`StepContext`); `judge` sees the stored
  inputs (`GuessContext.steps`).
- **A ladder unlimited for the player is finite for the row:** `stages` is a hidden ceiling
  (Peilung: 999 pings + 1). Peilung does not charge its steps in the score: phase two on time
  rewards few steps by itself.
