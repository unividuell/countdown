# Game Lab — the non-prod harness for mini-games

`gamelab` (backend) + `src/gamelab/` and `src/pages/c/[slug]/lab/[game].vue` (frontend).
Design: `docs/superpowers/specs/2026-08-08-game-lab-design.md`.

## The direction rule — the lab adapts, never the game

`LabGame` is a **guess, not a contract**. When a real game needs a different shape — an explicit
reveal step, several guesses per round, a clock — **the interface changes and the game does not**.
"The lab interface does not allow it" is never an argument against a game design.

The dependency direction enforces it: a real game's lab adapter lives **in `gamelab`** and calls
the game module's public API. No production module implements `LabGame`; no production module
depends on the lab. The lab can be rewritten or deleted without touching a game.

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

The lab store keeps **one round per (community, game)**; a request with a different seed discards
the previous one. Memory is therefore bounded by construction — no TTL, no LRU, no cleanup job.
Prefer this shape over an expiring cache whenever "the newest one is the only interesting one"
holds.

It is **application-scoped, not session-scoped**: a session-bound store would hide every tester's
guess from every other tester, which is exactly what multi-player testing needs to see.

## Payload hygiene is a red test, not a comment

Every `LabPayload` gets a test that serialises it and pins the **exact field set**. The project
runs Jackson 3 (`tools.jackson.databind`), whose `JsonNode` reads property names via
`propertyNames()`, not the Jackson 2 `fieldNames()`:

```kotlin
val json = mapper.writeValueAsString(game.reveal(4711))
val fields = mapper.readTree(json).propertyNames().toSet()

fields shouldBe setOf("lowerBound", "upperBound")
```

Pinning the field set — rather than asserting the answer is absent — is what catches a new field
that merely *narrows* the answer. `SampleLabGameTest` is the worked example. The client-side half
(the solution is never materialised in component state, not even derived) cannot be tested this way
and stays a review point per game — see the anti-cheat spec.

The field-set test pins `reveal()` only. `LabRoundResponse.others[].guess` and `.outcome` are a
second, unpinned path out of the server that no test covers, and they are broadcast to *every*
tester in the round — including one who has not guessed yet. `SampleLabGame` accepts this because
the lab has no competitive stake; a real game must make a deliberate, per-game call on whether
`others` should be withheld until `me != null`, not inherit the lab's default by copying the sample.

## What the lab deliberately cannot check

The lab's seed is **public, in the URL** — requirement 2 demands it. So the lab verifies "the
solution is not in the payload" and **not** "the seed never reaches the client". The real game path
gets its own controller, where the seed comes from the round row and the lab's URL mechanics do not
reach.
