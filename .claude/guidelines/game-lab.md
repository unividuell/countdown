# Game Lab — the non-prod harness for mini-games

`gamelab` (backend) + `src/gamelab/` and `src/pages/c/[slug]/lab/` (frontend).
Design: `docs/superpowers/specs/2026-08-08-game-lab-design.md`.

## The direction rule — the lab adapts, never the game

- **The contract is `GameType`, exposed in `game`.** The lab *uses* it through
  `GameCatalog`/`GameTypeHandle`; it implements nothing of its own beside the real game, and no
  production module implements anything for the lab's sake.
- **"The lab has no way to show this" is never an argument against a game design.** The lab
  changes, the contract does not.
- **`gamelab` depends on `game`'s exposed package, never on `game.internal`;** `game` does not know
  the lab exists — no import, no bean, no test hook. The lab can be rewritten or deleted without
  touching a game. So the lab computes its own duration from its own stamp rather than importing
  the framework's helper.
- One test-only exception: `LabPointsParityTest` imports from `game.internal` to drive the real
  round's services (its KDoc argues it). `ModularityTests.verify()` scans production sources only.

## Non-prod tooling: the two-gate pattern

Every bean of a non-prod tool carries **both**:

```kotlin
@Profile("!production")
@ConditionalOnProperty("app.<tool>.enabled")
```

- Full key as the annotation **value**. `prefix=`/`name=` with a hyphenated prefix silently never
  matches under Spring Boot 4.
- Set the key in **all three** `application*.yaml` — and in the test classpath's, which *replaces*
  the main file ([configuration.md](configuration.md)). Forget that one and every lab bean is
  missing from every test context.
- Switched off means **the beans do not exist**, so the endpoint answers **404, not 403**. A 403
  advertises the feature.
- The SPA bundle is identical in every environment, so the frontend cannot gate itself. **The server
  decides**; the page renders "not available" on 404 and is not linked from anywhere. No
  environment flag in `/api/me`.
- Assert the gate: one test with `@TestPropertySource(properties = ["app.<tool>.enabled=false"])`
  that the beans are absent and the endpoint 404s.

## Self-limiting in-memory state

- **A lab round is chosen, not materialised:** game + seed + phase is its key. Choosing it freezes
  `params` (`GameRandom.fromSeed(seed)`) and `award` (`awardFor`) as a real round's row would.
- **Judging and scoring are the framework's own classes,** or the phase selector tells nothing
  true about `CLOSEST_ONLY`.
- **One round per (community, game);** another seed or phase discards the previous one. Memory is
  bounded by construction — no TTL, no LRU, no cleanup job. Prefer this shape over an expiring
  cache wherever only the newest one is interesting.
- **Application-scoped, not session-scoped:** multi-player testing must see every tester's guess.
- **Difficulty follows from the seed** (`labDifficulty`, `seed.mod(11) / 10.0`), not from a control
  or from `GameRandom` — one more draw would shift every draw after it. `mod`, not `%`: never
  negative.

## The lab's gates are the framework's rules

- **Landing on the page reveals nothing.** Only `POST .../reveal` stamps the opening;
  `LabRoundResponse.revealed` is computed server-side (`requiresReveal(params)` and the store's
  own stamp), never derived in the client. A guess without the reveal a game requires is
  `LabNotRevealedException` (409).
- **`payload` is withheld like `solution`, on the same flag.** For a reveal-gated game the payload
  *is* the board; leaving it in an unrevealed response makes the gate theatre.
- **Assets go through `mayFetch`/`opensKey`** ([game-rounds.md](game-rounds.md), „Round assets“)
  with the lab's own viewer state, so a stage-0 key comes only after the reveal. A lab that opened
  earlier would review a gate nobody ships.
- **A reset clears the stamp and does not re-stamp it.** The tester lands back in front of the
  gate; giving up records no duration.
- **`others` is withheld server-side until the viewer has an entry** — the unconditional rule of
  [game-rounds.md](game-rounds.md), with no per-game property. Once it goes out, `guess` and
  `outcome` reach every tester and no field-set test covers them.
- **The gate covers guesses, not names.** `players` (id, name, avatar) goes out before the guess so
  the member row can seat them. Keep `LabPlayerDto` to identity: anything hinting at a tip (points,
  stage, time) belongs in `others`.
- **The solution's gate is its own condition** — the viewer has an entry — not coupled to the
  others rule.
- **`judge()` runs before the store,** so a malformed guess never consumes the single attempt — and
  an entry already spent answers 409 before `judge`, as in a real round.

## The component contract carries the viewer's own guess

A game component receives `myGuess` alongside `payload`: the payload describes the round, not the
player, so without it a reload shows the opening state of a round already spent. It is `unknown` by
contract — narrow it defensively; `typeof x === 'number'` alone lets `NaN` through to the screen.

## Keyboard shortcuts are bare keys

The browser owns every modifier combination, and some never reach the page (⌘⇧W, ⌘⇧R). So the lab's
shortcuts are single letters without a modifier (`R` roll, `W` switch player, `X` reset, `Z` forget
mine); a modifier, a held key (`repeat`) or focus in an editable field lets the event pass. A game
that wants letter keys on `document` collides — move the lab's, never the game's. `P` is the app
shell's (light/dark, `ui/colorScheme.ts`, shared `isEditableTarget`): neither lab nor game takes it.

## Product components are fed, not adapted

- **The lab shows the page's `MemberRow` unchanged,** because the row is props-only; the lab maps
  its entries in `gamelab/roster.ts` and replays the post-guess hold with the exported
  `SPOILER_HOLD_MS`.
- **Before pulling in another product component, check it takes everything as props.** If it loads
  its own data or reads a route, the lab does without it rather than the component growing a lab
  seam.
- **A one-line mirror of a server rule in lab code is acceptable** (`labRoster` copies the roster's
  rank and „provisional“ rule) where drifting only makes the lab wrong, never the product. Name the
  server source in the comment.

## What the lab deliberately cannot check

The lab's seed is public, in the URL. So the lab verifies "the solution is not in the payload",
**not** "the seed never reaches the client" — in a real round the seed comes from the round row.
