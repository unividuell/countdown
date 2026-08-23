# Game Lab — the non-prod harness for mini-games

`gamelab` (backend) + `src/gamelab/` and `src/pages/c/[slug]/lab/[game].vue` (frontend).
Design: `docs/superpowers/specs/2026-08-08-game-lab-design.md`.

## The direction rule — the lab adapts, never the game

The contract is `GameType`, exposed in `game` (not `game.internal`) because the lab is now a
consumer of it. The lab **uses** `GameType` through `GameCatalog`/`GameTypeHandle`; it does not
implement it, and no production module implements it for the lab's sake either. "The lab has no way
to show this" is never an argument against a game design — **the lab changes, the contract does not**.

The dependency direction enforces it: `gamelab` depends on `game`'s exposed package, never on
`game.internal`, and `game` does not know the lab exists — no import, no bean, no test hook the other
way. The worked example is what actually happened here: the lab used to carry its own parallel
abstraction (`LabGame`, `GuessHueLabGame`, `SampleLabGame`) beside the real game instead of using it,
and that duplication is what got deleted — not a new lab-only interface invented to paper over a gap.
The lab can still be rewritten or deleted without touching a game.

One sanctioned exception, test-only: `LabPointsParityTest`
(`core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabPointsParityTest.kt`) imports
`AnnouncementService`, `PlayService`, `ResolvedRound`, `GuessHueSolution` and `RoundPlayRepository`
straight from `game.internal`, because proving that a lab round pays what a real round pays means
driving the real round's own services — the reasoning is argued in full in that test's own KDoc.
`ModularityTests.verify()` scans production sources, not tests, so production code keeps obeying the
rule without exception.

## Non-prod tooling: the two-gate pattern

Second instance after the test-user picker — from here it is the convention. Every bean of a
non-prod tool carries **both**:

```kotlin
@Profile("!production")
@ConditionalOnProperty("app.<tool>.enabled")
```

- Full key as the annotation **value**. `prefix=`/`name=` with a hyphenated prefix silently never
  matches under Spring Boot 4.
- Set the key in **all three** `application*.yaml` — and in `core/src/test/resources/application.yaml`,
  which *replaces* the main file on the test classpath. Forget the test one and every lab bean is
  missing from every test context.
- Switched off means **the beans do not exist**, so the endpoint answers **404, not 403**. A 403
  advertises the feature to someone who should not know it is there.
- The SPA bundle is identical in every environment (`develop`→`:staging`, `main`→`:latest`), so the
  frontend cannot gate itself. **The server decides**; the page renders "not available" on 404, and
  is not linked from anywhere. Do not add an environment flag to `/api/me` for this.
- Assert the gate: one test with `@TestPropertySource(properties = ["app.<tool>.enabled=false"])`
  that the beans are absent and the endpoint 404s.

## Self-limiting in-memory state

A lab round is **chosen, not materialised**: game + seed + phase is its key. Choosing it freezes
`params` (from `GameRandom.fromSeed(seed)`) and `award` (from `awardFor`) exactly the way a real
round's `round_games` row would freeze them at announce time. That freeze is also why the lab runs
through the real classes at all — a phase selector only tells the truth about `CLOSEST_ONLY` if the
judging and the scoring behind it are the framework's own, not a lab-local copy of them.

The store keeps **one round per (community, game)**; a request with a different seed *or* a
different phase discards the previous one — a different key is a different round, and switching the
phase additionally changes the award. Memory is therefore bounded by construction — no TTL, no LRU,
no cleanup job.
Prefer this shape over an expiring cache whenever "the newest one is the only interesting one"
holds.

It is **application-scoped, not session-scoped**: a session-bound store would hide every tester's
guess from every other tester, which is exactly what multi-player testing needs to see.

## Payload hygiene is a red test, not a comment

Every `GamePayload` gets a test that serialises it and pins the **exact field set**. The project
runs Jackson 3 (`tools.jackson.databind`), whose `JsonNode` reads property names via
`propertyNames()`, not the Jackson 2 `fieldNames()`:

```kotlin
val json = mapper.writeValueAsString(game.present(params))
val fields = mapper.readTree(json).propertyNames().toSet()

fields shouldBe setOf("description", "initHue", "saturation", "lightness")
```

Pinning the field set — rather than asserting the answer is absent — is what catches a new field
that merely *narrows* the answer. `GuessHueGameTypeTest` is the worked example, run against
`GameType.present(params)` — the same method and the same test the real round relies on, not a
lab-only stand-in for it. The client-side half (the solution is never materialised in component
state, not even derived) cannot be tested this way and stays a review point per game — see the
anti-cheat spec.

The field-set test pins `present()` only. `LabRoundResponse.others[].guess` and `.outcome` are a
second, unpinned path out of the server that no test covers, and they are broadcast to *every*
tester in the round once the viewer has guessed — see the withholding rule below for exactly when.

`GameType.judge` always returns a `Judgement`: `qualifies` and `deviation` are never optional,
because `pointsFor` needs both for every guess, from every game. Only `Judgement.outcome` may be
`null`, for a game with nothing beyond the framework's own comparison values to show. **Throwing
stays the only way to refuse an invalid guess**, and it must stay that way — `LabService` calls
`judge()` before the store, so a malformed guess never consumes the player's single attempt.

## Others are withheld until the viewer has guessed — unconditionally

`LabService` withholds `others` **server-side**, not by filtering in the client, until the viewer has
an entry of their own: a payload the browser never receives cannot be read out of the network tab
either. There is no `GameType` property that decides this per game, because there is no game for
which showing another tester's guess before one's own would be the right answer.

That invariant replaces `LabGame.revealsOthersBeforeGuess`, a switch every game once had to answer
with no default. It existed only because, with a single real game to check it against, "always
withhold" still looked like a per-game decision instead of the one correct answer for all of them —
exactly the shape [game-rounds.md](game-rounds.md) now names as a bug: a switch whose right answer
is the same for every case belongs in a shared rule, not a per-case review point.

## A second way out of the server, guarded separately

`GameType.solution(params)` is the only way anything may leave the server *after* the guess — never
fold it into `GamePayload`, which also travels *before* the guess and would lose its
exact-field-set test's meaning if the solution could ride along early. `solution` defaults to
`null`: the safe direction is the free one here, so a game that implements nothing reveals nothing.
The gate is one condition, evaluated server-side in `LabService` — the viewer has an entry of their
own — and is deliberately **not** coupled to the others-withholding rule above: "seeing the others"
and "seeing the solution" are two separate questions, one unconditional and one per-game. Every
`GameSolution` earns the same exact-field-set serialisation test its payload does.

A game that withholds its solution this way must withhold it everywhere, not just here: once the
viewer has guessed, `others[].outcome` goes out unconditionally (see above), so an `outcome` that
carries the distance to — or anything else that reconstructs — a withheld solution hands it straight
back through the exit that was supposedly closed.

## The component contract carries the viewer's own guess

Every lab game component receives `myGuess` alongside `payload`. The payload is derived from the seed
alone — it describes the *round*, not the player — so without this a reload lands on the round's
opening state in a round the viewer has already spent: Guess Hue's wheel would sit on the starting
angle rather than on the angle that was submitted. Narrow it defensively; it is `unknown` by contract,
and `typeof x === 'number'` alone lets `NaN` through all the way to the screen.

## What the lab deliberately cannot check

The lab's seed is **public, in the URL** — requirement 2 demands it. So the lab verifies "the
solution is not in the payload" and **not** "the seed never reaches the client". The real game path
gets its own controller, where the seed comes from the round row and the lab's URL mechanics do not
reach.
