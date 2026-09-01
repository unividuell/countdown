# Weltanschauung (`spot-object`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship „Weltanschauung“ — a round names an object, players find it anywhere in Google Street
View, every tip counts, and the other players may confirm or flag it afterwards.

**Architecture:** Three layers, in this order. (1) A **framework extension for peer review** in the
`game` module: one vote row per (tip, voter), a nullable admin override on the play row, one pure
strike rule, and a re-evaluation that reads them — `pointsFor` itself is untouched. (2) A new
Modulith module `spotobject` holding the curated term list, the reverse-geocoding client and the
Street View still-image redirect. (3) The frontend: a full-bleed map/Street View board, a
two-column tip grid, the usual scoreboard, and a single-tip page with equally weighted
confirm/flag buttons. The lab is carried along at every layer, never exempted.

**Tech Stack:** Spring Boot 4.1 · Kotlin 2.4 · Java 25 · Spring Modulith 2.1 · Spring Data JDBC ·
PostgreSQL 18 · Flyway (module-based) · mockk + kotest + MockMvc Kotlin DSL + Testcontainers —
Vite 8 · Vue 3 · TypeScript (strict) · Vue Router 5 (file-based) · Tailwind v4 · Vitest ·
Google Maps JavaScript API + Street View Static API + Geocoding API.

**Spec:** [`docs/superpowers/specs/2026-08-29-weltanschauung-design.md`](../specs/2026-08-29-weltanschauung-design.md)

## Global Constraints

Copied from the spec and the guidelines; every task's requirements implicitly include these.

- **Language.** Source code, comments and commit messages are **English**. User-facing text is
  **German** and uses `„…“` (low opening, high closing) — never a straight `"`.
- **Commit messages** follow the seven rules in `CLAUDE.md`: imperative subject ≤50 chars,
  capitalised, no trailing period, blank line, body wrapped at 72, body says what and why.
- **Kotlin call sites** use named arguments from two arguments on (exceptions: single argument,
  varargs, Java-declared functions, trailing lambdas, infix). See `.claude/guidelines/kotlin.md`.
- **Comments**: explain *what* the block does and *why*, in as few words as possible. Do not add
  comments to code you did not write or modify. Leave blank lines between logical blocks.
- **Logging**: `kotlin-logging`, `private val logger = KotlinLogging.logger {}` **inside** the class
  (never top-level), always lambda messages. Log where behaviour degrades silently.
- **Persistence**: Spring Data JDBC, `id UUID PRIMARY KEY DEFAULT uuidv7()`, entity
  `@Id val id: UUID? = null`, **no `@Column` annotations**, `@Table(schema = …, name = …)` only.
- **Migrations** are module-based: `core/src/main/resources/db/migration/<module>/V<n>__*.sql`.
  The `game` module is at `V3`; the next is `V4`. A new module gets its own directory starting
  at `V1`.
- **Game content is secret.** The real term list is **never** committed in plaintext — not in a
  spec, plan, commit message or test fixture. Only the obviously fake sample set is committed.
- **The game judges, the framework awards.** `pointsFor` stays unchanged; what changes is the
  `Verdict` that goes into it.
- **Award constants:** `AwardRule.ALL_QUALIFYING` (phase one, 1 point), `AwardRule.CLOSEST_ONLY`
  (phase two). `Phase.of(roundNumber, phaseTwoStartRound)` — phase two is
  `roundNumber <= threshold`, because a **larger round number is earlier in time**.
- **Game id:** `spot-object`. **Module/package:** `spotobject`. **Classes:** `SpotObject*`.
  **German display name:** `Weltanschauung`.
- **The strike rule, verbatim:** `flags >= 2 && flags > confirms`.
- **Frontend width is capped at `max-w-xl` everywhere**; height is not. `round-bleed` is the
  edge-to-edge utility below `sm`. An element carrying `round-bleed` must **not** also carry
  `w-full`.
- **Frontend tests** use Vitest + `vi` (never mockk), `@vue/test-utils` `mount`, and
  `data-test="…"` selectors.
- **Never construct `new google.maps.StreetViewPanorama`.** Always the map's own default panorama
  via `map.getStreetView()`. Measured: the default panorama produces no billed Dynamic Street View
  SKU events; a constructed one would.
- **No image bytes in our database.** A tip is `{panoId, heading, pitch, zoom}` and nothing else.
- **Google attribution stays visible** — never overlaid, never cropped.
- **No foreign map beside Street View.** If a map appears anywhere in this feature, it is a Google
  map or there is none.
- **No cross-round, searchable catalogue of finds.** Tips stay bound to their round; nothing
  aggregates them across rounds into something browsable.

## Deviation from the spec — read before Task 8

The spec says the signed Street View still URL is delivered „in the DTO“. This plan delivers it
through a **redirect endpoint in the `spotobject` module** instead:
`GET /api/spot-object/shot?pano=…&heading=…&pitch=…&fov=…` → `302` to the signed Google URL.

Why: the only per-play, game-shaped exit the framework has is `Judgement.outcome`, and that is
**persisted as JSONB at judge time**. Putting the URL there would freeze an API key and an HMAC
signature into the database for the lifetime of every round, and rotating either would silently
break every historical tile. The redirect keeps the signing secret server-side (the spec's actual
requirement), persists nothing, and needs no new framework hook — it is the same shape
`SongSnippetController` already has in its own module.

The cost: any authenticated user can ask for any panorama, so the endpoint is a thin Street View
proxy for the ten people in the community. Accepted — it sits behind the login, and the parameters
are clamped.

**If the user rejects this, stop and ask before implementing Task 9.**

## File Structure

### Backend — framework extension (`core/src/main/kotlin/org/unividuell/countdown/core/game/`)

| File | Responsibility |
|---|---|
| `PeerReview.kt` *(new, exposed)* | `Vote`, `VoteTally`, `struckOut`, `effectiveQualifies` — the pure rule both worlds call. Beside `PlayFlow.kt`, for the same reason. |
| `GameType.kt` *(modify)* | `allowsPeerReview(params: P): Boolean = false`. |
| `GameCatalog.kt` *(modify)* | Forward `allowsPeerReview` through `GameTypeHandle`. |
| `internal/RoundPlayVote.kt` *(new)* | The vote row entity plus the `PlayVote` read projection. |
| `internal/RoundPlayVoteRepository.kt` *(new)* | Upsert, delete, and the round-wide tally read. |
| `internal/RoundPlay.kt` *(modify)* | `adminOverride: Boolean?`. |
| `internal/RoundPlayRepository.kt` *(modify)* | `updateAdminOverride`. |
| `internal/RoundScoring.kt` *(modify)* | Feed `effectiveQualifies` into the `Verdict`. |
| `internal/ReviewService.kt` *(new)* | Window, permission, lock, write, re-evaluate. |
| `internal/RoundController.kt` *(modify)* | The two `PUT` endpoints. |
| `internal/RoundDtos.kt` *(modify)* | `VoteView`, the three review fields on both play DTOs, `canOverride`, the two request bodies. |
| `internal/RoundResponses.kt` *(modify)* | Fill them. |
| `internal/GameExceptions.kt` *(modify)* | `ReviewNotOpenException`, `ReviewNotAllowedException`. |
| `resources/db/migration/game/V4__create_round_play_votes.sql` *(new)* | Table + column. |

### Backend — the `spotobject` module (`core/src/main/kotlin/org/unividuell/countdown/core/spotobject/`)

| File | Responsibility |
|---|---|
| `SpotObjectTerms.kt` *(new, public surface)* | The loaded list; `draw(presentation)`. |
| `CountryLookup.kt` *(new, public surface)* | `countryOf(panoId): String?` — one call, soft-failing. |
| `StreetViewShot.kt` *(new, public surface)* | `fovOf(zoom)` and the signed Static-API URL builder. |
| `internal/SpotObjectProperties.kt` *(new)* | `terms-path`, `maps-api-key`, `signing-secret`. |
| `internal/SpotObjectConfiguration.kt` *(new)* | Properties, `RestClient` with timeouts, the terms bean plus its fail-fast. |
| `internal/SpotObjectTermsLoader.kt` *(new)* | Mounted file or bundled sample. |
| `internal/SpotObjectTermsYamlReader.kt` *(new)* | Parse + mechanical checks. |
| `internal/SpotObjectException.kt` *(new)* | Loader failure. |
| `internal/GoogleCountryLookup.kt` *(new)* | Street View metadata → Geocoding → ISO-3166-1 alpha-2. |
| `internal/SpotObjectController.kt` *(new)* | `GET /api/spot-object/config`, `GET /api/spot-object/shot`. |
| `resources/spot-object-terms.sample.yaml` *(new)* | Obviously fake terms. |

### Backend — the adapter and the lab

| File | Responsibility |
|---|---|
| `game/internal/SpotObjectGameType.kt` *(new)* | Params, payload, outcome, draw/present/judge. Lives in `game.internal` like every other adapter. |
| `gamelab/internal/LabRoundStore.kt` *(modify)* | `votes` and `overrides` beside `openedAt`. |
| `gamelab/internal/LabService.kt` *(modify)* | `vote`, `override`, `canOverride = true`. |
| `gamelab/internal/LabDtos.kt` *(modify)* | The same three review fields plus `canOverride`. |
| `gamelab/internal/LabController.kt` *(modify)* | The two lab `PUT` twins. |

### Frontend (`webapp-vue/src/`)

| File | Responsibility |
|---|---|
| `games/GameEntry.ts` *(modify)* | `votes`, `struck`, `adminOverride`. |
| `games/registry.ts` *(modify)* | Register `spot-object`. |
| `api/types.ts` *(modify)* | `Vote`, `VoteView`, the review fields, `canOverride`. |
| `api/rounds.ts` *(modify)* | `castVote`, `setAdminOverride`. |
| `games/spotobject/types.ts` *(new)* | Payload/guess/outcome guards, `shotUrl`, `googleUrl`. |
| `games/spotobject/useStreetView.ts` *(new)* | Loads the Maps JS API once; owns map + default panorama. |
| `games/spotobject/SpotObjectBoard.vue` *(new)* | The playing face: full-bleed map, HUD overlay. |
| `games/spotobject/tips.ts` *(new)* | Pure tile/row building from `GameEntry[]`. |
| `games/spotobject/SpotObjectTipGrid.vue` *(new)* | The two-column review grid. **Not** the scoreboard. |
| `games/spotobject/SpotObjectScoreboard.vue` *(new)* | The usual scoreboard, beside `FindPatternScoreboard.vue`. |
| `games/spotobject/SpotObjectReveal.vue` *(new)* | Stacks grid over scoreboard. |
| `games/spotobject/SpotObjectGame.vue` *(new)* | Which face; the one place `unknown` becomes typed. |
| `games/spotobject/TipDetail.vue` *(new)* | The single-tip view, shared by both worlds' routes. |
| `pages/c/[slug]/rounds/[roundNumber]/tips/[userId].vue` *(new)* | The product route. |
| `pages/c/[slug]/lab/[game]/index.vue` *(moved from `lab/[game].vue`)* | Unchanged behaviour, new path. |
| `pages/c/[slug]/lab/[game]/tips/[userId].vue` *(new)* | The lab twin. |
| `pages/legal.vue` *(new)* | The terms and privacy paragraph Google's maps oblige us to write. |
| `gamelab/types.ts`, `gamelab/api.ts`, `gamelab/games.ts` *(modify)* | The lab's mirror of the above. |
| `games/{guesshue,songsnippet,findpattern}/*Game.vue` *(modify)* | Declare `canOverride` so the component contract stays one shape. |

---

## Task 1: The strike rule as one pure function

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/PeerReview.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PeerReviewTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum class Vote { CONFIRM, FLAG }`
  - `data class VoteTally(val confirms: Int, val flags: Int)` with `companion object { val NONE }`
    and `fun of(values: Collection<Vote>): VoteTally`
  - `fun struckOut(tally: VoteTally): Boolean`
  - `fun effectiveQualifies(adminOverride: Boolean?, qualifies: Boolean, tally: VoteTally): Boolean`

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/game/PeerReviewTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

/**
 * The rule both worlds call. A table rather than prose: every pair below was argued about once,
 * and the table is where that argument stays settled.
 */
class PeerReviewTest {

    private fun tally(confirms: Int, flags: Int) = VoteTally(confirms = confirms, flags = flags)

    @Test
    fun `two flags strike a tip unless as many confirm it`() {
        struckOut(tally(confirms = 0, flags = 0)) shouldBe false
        struckOut(tally(confirms = 0, flags = 1)) shouldBe false
        struckOut(tally(confirms = 0, flags = 2)) shouldBe true
        struckOut(tally(confirms = 1, flags = 2)) shouldBe true
        struckOut(tally(confirms = 2, flags = 2)) shouldBe false
        struckOut(tally(confirms = 2, flags = 3)) shouldBe true
        struckOut(tally(confirms = 5, flags = 0)) shouldBe false
    }

    @Test
    fun `a tally counts each value separately`() {
        VoteTally.of(listOf(Vote.FLAG, Vote.CONFIRM, Vote.FLAG)) shouldBe tally(confirms = 1, flags = 2)
        VoteTally.of(emptyList()) shouldBe VoteTally.NONE
    }

    @Test
    fun `a struck tip loses its qualification, and gets it back when the vote turns`() {
        val struck = tally(confirms = 0, flags = 2)
        effectiveQualifies(adminOverride = null, qualifies = true, tally = struck) shouldBe false
        effectiveQualifies(adminOverride = null, qualifies = true, tally = tally(confirms = 2, flags = 2)) shouldBe true
    }

    @Test
    fun `voting cannot lift a tip the game itself rejected`() {
        effectiveQualifies(adminOverride = null, qualifies = false, tally = tally(confirms = 9, flags = 0)) shouldBe false
    }

    @Test
    fun `the admin override wins in both directions`() {
        effectiveQualifies(adminOverride = true, qualifies = true, tally = tally(confirms = 0, flags = 5)) shouldBe true
        effectiveQualifies(adminOverride = true, qualifies = false, tally = VoteTally.NONE) shouldBe true
        effectiveQualifies(adminOverride = false, qualifies = true, tally = tally(confirms = 9, flags = 0)) shouldBe false
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=PeerReviewTest
```

Expected: compilation failure — `Unresolved reference: VoteTally`.

- [ ] **Step 3: Write the implementation**

Create `core/src/main/kotlin/org/unividuell/countdown/core/game/PeerReview.kt`:

```kotlin
package org.unividuell.countdown.core.game

/**
 * One ballot with two sides, not two counters. A row per (tip, voter) makes „confirmed and flagged
 * at once“ structurally impossible and gives a way back out of a misclick.
 */
enum class Vote { CONFIRM, FLAG }

/** The two counts of one tip's ballots. */
data class VoteTally(val confirms: Int, val flags: Int) {

    companion object {
        val NONE = VoteTally(confirms = 0, flags = 0)

        fun of(values: Collection<Vote>): VoteTally = VoteTally(
            confirms = values.count { it == Vote.CONFIRM },
            flags = values.count { it == Vote.FLAG },
        )
    }
}

/**
 * The whole rule, in one expression: `flags >= 2 && flags > confirms`.
 *
 * Without confirmations the two-vote threshold holds — one player alone cannot shoot anybody down,
 * two friends are signal enough. Once anybody confirms, the majority of cast votes has to stand
 * against the tip. A struck tip comes back if later confirmations turn it.
 */
fun struckOut(tally: VoteTally): Boolean = tally.flags >= 2 && tally.flags > tally.confirms

/**
 * What the framework's arithmetic should treat this play as — the input `RoundScoring` builds its
 * [Verdict] from.
 *
 * Exposed and pure for the same reason `pointsFor` and `guessActionFor` are: the lab replays the
 * exact rule the real round applies, rather than owning a second copy that can drift.
 *
 * The override is a stored *input*, not a written score: nobody edits points by hand, and the
 * re-evaluation stays a pure function of persisted values.
 */
fun effectiveQualifies(adminOverride: Boolean?, qualifies: Boolean, tally: VoteTally): Boolean =
    adminOverride ?: (qualifies && !struckOut(tally))
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd core && ./mvnw -q test -Dtest=PeerReviewTest
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/PeerReview.kt core/src/test/kotlin/org/unividuell/countdown/core/game/PeerReviewTest.kt && git commit -m "Add the peer-review strike rule as a pure function

One row per (tip, voter) with two possible values, so a player cannot
confirm and flag at once and can take a vote back. The rule itself —
two flags strike unless as many confirm — lives here, exposed and pure,
for the same reason pointsFor and guessActionFor do: the lab has to
replay it rather than own a second copy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The vote table, the override column, and their repository

**Files:**
- Create: `core/src/main/resources/db/migration/game/V4__create_round_play_votes.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayVote.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayVoteRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlay.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayVoteRepositoryTest.kt`

**Interfaces:**
- Consumes: `Vote` (Task 1).
- Produces:
  - `data class PlayVote(val roundPlayId: UUID, val voterUserId: UUID, val value: Vote)`
  - `RoundPlayVoteRepository.castVote(roundPlayId, voterUserId, value, createdAt): Int`
  - `RoundPlayVoteRepository.withdrawVote(roundPlayId, voterUserId): Int`
  - `RoundPlayVoteRepository.votesOfRound(roundGameId): List<PlayVote>`
  - `RoundPlayRepository.updateAdminOverride(id, adminOverride): Int`
  - `RoundPlay.adminOverride: Boolean?`

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayVoteRepositoryTest.kt`.
Follow `RoundPlayRepositoryTest` for the fixture helpers — same `@Import`/`@SpringBootTest`/
`@Transactional` triple, same `aUser()`/`aRound()` shape:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundPlayVoteRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundPlayVoteRepositoryTest(
    @Autowired val plays: RoundPlayRepository,
    @Autowired val votes: RoundPlayVoteRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val at = Instant.parse("2026-08-29T10:00:00Z")

    private fun json(raw: String): JsonNode = mapper.readTree(raw)

    private fun aUser(): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = "player")).id)

    private fun aRound(slug: String): RoundGame {
        val creator = aUser()
        val community = communities.save(Community(name = slug, slug = slug, createdBy = creator))
        val edition = editions.save(
            CommunityEdition(communityId = requireNotNull(community.id), label = "Run 2026"),
        )
        return store.announce(
            edition = edition,
            roundNumber = 12,
            gameType = "spot-object",
            params = json("""{"term":"Rosa Gartenzwerg","timed":false}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
            announcedAt = at,
        )
    }

    /** A revealed, guessed play — the only kind anybody can vote on. */
    private fun aPlay(round: RoundGame, userId: UUID): UUID {
        val roundGameId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = at)
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId),
        )
        val id = requireNotNull(play.id)
        plays.recordGuess(
            id = id,
            guess = json("""{"panoId":"abc","heading":10.0,"pitch":0.0,"zoom":1.0}"""),
            guessedAt = at,
            qualifies = true,
            deviation = 0.0,
            outcome = json("""{"country":"ES"}"""),
        )
        return id
    }

    @Test
    fun `a second vote by the same voter replaces the first`() {
        val round = aRound("votes-replace")
        val target = aPlay(round = round, userId = aUser())
        val voter = aUser()

        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.FLAG, createdAt = at)
        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.CONFIRM, createdAt = at)

        val stored = votes.votesOfRound(requireNotNull(round.id))
        stored shouldHaveSize 1
        stored.single().value shouldBe Vote.CONFIRM
    }

    @Test
    fun `withdrawing removes the row entirely`() {
        val round = aRound("votes-withdraw")
        val target = aPlay(round = round, userId = aUser())
        val voter = aUser()

        votes.castVote(roundPlayId = target, voterUserId = voter, value = Vote.FLAG, createdAt = at)
        votes.withdrawVote(roundPlayId = target, voterUserId = voter) shouldBe 1

        votes.votesOfRound(requireNotNull(round.id)) shouldHaveSize 0
    }

    @Test
    fun `the round-wide read returns every vote of every play, and nothing from another round`() {
        val round = aRound("votes-round")
        val other = aRound("votes-other-round")
        val firstTarget = aPlay(round = round, userId = aUser())
        val secondTarget = aPlay(round = round, userId = aUser())
        val elsewhere = aPlay(round = other, userId = aUser())

        votes.castVote(roundPlayId = firstTarget, voterUserId = aUser(), value = Vote.FLAG, createdAt = at)
        votes.castVote(roundPlayId = secondTarget, voterUserId = aUser(), value = Vote.CONFIRM, createdAt = at)
        votes.castVote(roundPlayId = elsewhere, voterUserId = aUser(), value = Vote.FLAG, createdAt = at)

        votes.votesOfRound(requireNotNull(round.id)) shouldHaveSize 2
    }

    @Test
    fun `the admin override starts null and survives a round trip in both directions`() {
        val round = aRound("override")
        val target = aPlay(round = round, userId = aUser())

        plays.findById(target).get().adminOverride.shouldBeNull()

        plays.updateAdminOverride(id = target, adminOverride = false) shouldBe 1
        plays.findById(target).get().adminOverride shouldBe false

        plays.updateAdminOverride(id = target, adminOverride = null) shouldBe 1
        plays.findById(target).get().adminOverride.shouldBeNull()
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=RoundPlayVoteRepositoryTest
```

Expected: compilation failure — `Unresolved reference: RoundPlayVoteRepository`.

- [ ] **Step 3: Write the migration and the persistence code**

Create `core/src/main/resources/db/migration/game/V4__create_round_play_votes.sql`:

```sql
-- Peer review: the other players' judgement of one tip, and the game master's own.
CREATE TABLE game.round_play_votes (
    id             UUID        PRIMARY KEY DEFAULT uuidv7(),
    round_play_id  UUID        NOT NULL REFERENCES game.round_plays(id) ON DELETE CASCADE,
    -- Cross-schema FK, as in round_plays: `game` depends on `iam` in code, so Modulith migrates
    -- iam first. See modules-and-migrations.md.
    voter_user_id  UUID        NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    -- CONFIRM or FLAG. One ballot with two sides, so nobody can hold both at once.
    value          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    -- One ballot per voter and tip: changing your mind is an UPDATE, not a second row.
    UNIQUE (round_play_id, voter_user_id)
);

CREATE INDEX idx_round_play_votes_play ON game.round_play_votes (round_play_id);

-- The game master's verdict, and only theirs: NULL lets the vote decide, true keeps the tip
-- whatever the flags say, false strikes it whatever the confirmations say. A stored input, never
-- a hand-written score — the re-evaluation stays a pure function.
ALTER TABLE game.round_plays
    ADD COLUMN admin_override BOOLEAN NULL;
```

Create `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayVote.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import org.unividuell.countdown.core.game.Vote
import java.time.Instant
import java.util.UUID

/**
 * One player's judgement of one tip. Written only through [RoundPlayVoteRepository]'s upsert, so
 * the entity exists to name the table rather than to be `save()`d.
 */
@Table(schema = "game", name = "round_play_votes")
data class RoundPlayVote(
    @Id
    val id: UUID? = null,
    val roundPlayId: UUID,
    val voterUserId: UUID,
    val value: Vote,
    val createdAt: Instant,
)

/** One vote, reduced to what a tally and a name list need. */
data class PlayVote(val roundPlayId: UUID, val voterUserId: UUID, val value: Vote)
```

Create `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundPlayVoteRepository.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.game.Vote
import java.time.Instant
import java.util.UUID

interface RoundPlayVoteRepository : CrudRepository<RoundPlayVote, UUID> {

    /**
     * Cast or change one vote. `ON CONFLICT DO UPDATE` is what makes the endpoint a `PUT`: a voter
     * holds exactly one ballot per tip, and a second click replaces it instead of stacking.
     *
     * Inside `ON CONFLICT` the existing row is addressed by the table name **without** its schema.
     */
    @Modifying
    @Query(
        """
        INSERT INTO game.round_play_votes (round_play_id, voter_user_id, value, created_at)
        VALUES (:roundPlayId, :voterUserId, :value, :createdAt)
        ON CONFLICT (round_play_id, voter_user_id)
            DO UPDATE SET value = EXCLUDED.value, created_at = EXCLUDED.created_at
        """,
    )
    fun castVote(roundPlayId: UUID, voterUserId: UUID, value: Vote, createdAt: Instant): Int

    /** Take a vote back. Zero rows means there was none — not an error, the end state is the same. */
    @Modifying
    @Query(
        """
        DELETE FROM game.round_play_votes
        WHERE round_play_id = :roundPlayId AND voter_user_id = :voterUserId
        """,
    )
    fun withdrawVote(roundPlayId: UUID, voterUserId: UUID): Int

    /**
     * Every vote of one round — the input of the re-evaluation and of the response, read once.
     *
     * Grouping happens in Kotlin, like `pointsOf`: `VoteTally.of` is the one place the two counts
     * are derived, and duplicating that in SQL is how the two would drift. Bounded by members²
     * per round — a few hundred tiny rows at most.
     */
    @Query(
        """
        SELECT v.round_play_id AS round_play_id, v.voter_user_id AS voter_user_id, v.value AS value
        FROM game.round_play_votes v
        JOIN game.round_plays p ON p.id = v.round_play_id
        WHERE p.round_game_id = :roundGameId
        """,
    )
    fun votesOfRound(roundGameId: UUID): List<PlayVote>
}
```

In `RoundPlay.kt`, add the column as the **last** constructor parameter, after `points`:

```kotlin
    val points: Int? = null,
    /**
     * The game master's verdict on this tip, overriding the peer vote in either direction. `null`
     * — the normal state — lets the vote decide. A stored input like `qualifies`, not a written
     * score: the re-evaluation reads it and stays pure.
     */
    val adminOverride: Boolean? = null,
)
```

In `RoundPlayRepository.kt`, add next to `updatePoints`:

```kotlin
    /**
     * Write only the override. A targeted `UPDATE` rather than `save()`, for the same reason
     * [updatePoints] is one: a full-row write from a stale snapshot would clobber a concurrent
     * `revealOrCount`'s counter increment.
     */
    @Modifying
    @Query("UPDATE game.round_plays SET admin_override = :adminOverride WHERE id = :id")
    fun updateAdminOverride(id: UUID, adminOverride: Boolean?): Int
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd core && ./mvnw -q test -Dtest=RoundPlayVoteRepositoryTest
```

Expected: PASS, 4 tests. (Docker must be running for Testcontainers.)

- [ ] **Step 5: Commit**

```bash
git add core/src/main/resources/db/migration/game core/src/main/kotlin/org/unividuell/countdown/core/game/internal core/src/test/kotlin/org/unividuell/countdown/core/game/RoundPlayVoteRepositoryTest.kt && git commit -m "Add vote rows and an admin override to a round play

One row per (tip, voter), upserted, so a PUT is the honest verb and a
second click replaces a ballot instead of stacking one. The override is
a nullable column rather than a written score, which keeps the
re-evaluation a pure function of persisted values.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Re-evaluation honours the votes and the override

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundScoring.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundScoringPeerReviewTest.kt`

**Interfaces:**
- Consumes: `effectiveQualifies`, `VoteTally`, `Vote` (Task 1); `RoundPlayVoteRepository`,
  `PlayVote`, `RoundPlay.adminOverride` (Task 2).
- Produces:
  - `GameType.allowsPeerReview(params: P): Boolean = false`
  - `GameTypeHandle.allowsPeerReview(params: JsonNode): Boolean`
  - `RoundScoring.reevaluate(round: RoundGame): Int` — unchanged signature, new behaviour.

`pointsFor` is **not** touched. The whole change is which `Verdict` goes into it.

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundScoringPeerReviewTest.kt`.
Copy the fixture helpers from `RoundScoringTest` (same `aUser`/`aRound`/`guessed` shape) and add:

```kotlin
    /** A vote from a fresh voter — the identity does not matter, only the count and the value. */
    private fun voteOn(play: UUID, value: Vote) {
        votes.castVote(roundPlayId = play, voterUserId = aUser(), value = value, createdAt = at)
    }

    private fun playIdOf(round: RoundGame, user: UUID): UUID = requireNotNull(
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)?.id,
    )

    private fun pointsOf(round: RoundGame, user: UUID): Int? =
        plays.findByRoundGameIdAndUserId(roundGameId = requireNotNull(round.id), userId = user)?.points

    @Test
    fun `a struck tip loses its point and gets it back when the vote turns`() {
        val round = aRound("strike-phase-one", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1

        val play = playIdOf(round = round, user = player)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 0

        voteOn(play = play, value = Vote.CONFIRM)
        voteOn(play = play, value = Vote.CONFIRM)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1
    }

    /**
     * The whole reason peer review is framework arithmetic: striking the fastest tip has to hand
     * the stake to the next one, and taking the strike back has to hand it straight back.
     */
    @Test
    fun `in phase two the second fastest inherits the stake, and returns it`() {
        val round = aRound("strike-phase-two", Award(rule = AwardRule.CLOSEST_ONLY, points = 3))
        val fastest = aUser()
        val second = aUser()
        guessed(round = round, user = fastest, qualifies = true, deviation = 1_000.0, at = at)
        guessed(round = round, user = second, qualifies = true, deviation = 5_000.0, at = at)
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 3
        pointsOf(round = round, user = second) shouldBe 0

        val play = playIdOf(round = round, user = fastest)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 0
        pointsOf(round = round, user = second) shouldBe 3

        votes.deleteAll()
        scoring.reevaluate(round)
        pointsOf(round = round, user = fastest) shouldBe 3
        pointsOf(round = round, user = second) shouldBe 0
    }

    @Test
    fun `the admin override beats the vote in both directions`() {
        val round = aRound("override-scoring", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        val play = playIdOf(round = round, user = player)
        voteOn(play = play, value = Vote.FLAG)
        voteOn(play = play, value = Vote.FLAG)

        plays.updateAdminOverride(id = play, adminOverride = true)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 1

        plays.updateAdminOverride(id = play, adminOverride = false)
        scoring.reevaluate(round)
        pointsOf(round = round, user = player) shouldBe 0
    }

    /** Every other game keeps behaving exactly as before, because no vote can ever exist for it. */
    @Test
    fun `a round without votes scores exactly as it did before`() {
        val round = aRound("no-votes", Award(rule = AwardRule.ALL_QUALIFYING, points = 1))
        val player = aUser()
        guessed(round = round, user = player, qualifies = true, deviation = 0.0, at = at)
        scoring.reevaluate(round)

        pointsOf(round = round, user = player) shouldBe 1
    }
```

The class needs `@Autowired val votes: RoundPlayVoteRepository` in its constructor and imports for
`Vote`, `RoundPlayVoteRepository` and `UUID`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=RoundScoringPeerReviewTest
```

Expected: FAIL — the first strike test reports `1` where `0` was expected, because `RoundScoring`
does not read votes yet.

- [ ] **Step 3: Write the implementation**

In `RoundScoring.kt`, take the vote repository and fold the tallies in. Replace the constructor and
the `verdicts` argument:

```kotlin
@Component
class RoundScoring(
    private val plays: RoundPlayRepository,
    private val votes: RoundPlayVoteRepository,
) {

    private val logger = KotlinLogging.logger {}

    /** Returns how many rows changed — `0` means the stored points were already correct. */
    @Transactional
    fun reevaluate(round: RoundGame): Int {
        val roundGameId = requireNotNull(round.id)
        val guessed = plays.findByRoundGameId(roundGameId).filter { it.guessedAt != null }
        // One read for the whole round, grouped here rather than in SQL: `VoteTally.of` is the one
        // place the two counts are derived, and a second derivation is how they would drift.
        val tallies = votes.votesOfRound(roundGameId)
            .groupBy { it.roundPlayId }
            .mapValues { (_, cast) -> VoteTally.of(cast.map { it.value }) }

        val points = pointsFor(
            award = Award(rule = round.awardRule, points = round.awardPoints),
            verdicts = guessed.map { play ->
                val playId = requireNotNull(play.id)
                Verdict(
                    id = playId,
                    // The one line peer review adds: the game's verdict, as the round's own
                    // players (or its game master) have since amended it.
                    qualifies = effectiveQualifies(
                        adminOverride = play.adminOverride,
                        qualifies = play.qualifies == true,
                        tally = tallies[playId] ?: VoteTally.NONE,
                    ),
                    // A guessed row always carries a deviation; treating a missing one as "infinitely
                    // far off" keeps a broken row out of the win rather than crashing the round.
                    deviation = play.deviation ?: Double.MAX_VALUE,
                )
            },
        )
        // …the write loop below is unchanged…
```

Add the imports `org.unividuell.countdown.core.game.VoteTally` and
`org.unividuell.countdown.core.game.effectiveQualifies`.

In `GameType.kt`, add after `requiresReveal`:

```kotlin
    /**
     * Whether this game's tips may be confirmed or flagged by the other players afterwards.
     *
     * **With** a default, unlike [requiresReveal] — and that is the same rule, not an exception:
     * the default has to be the safe direction. For [requiresReveal] the convenient `false` is the
     * unsafe one (it would start somebody's clock unasked); here `false` is simply today's
     * behaviour. A game that says nothing gets nothing new, and a game whose solution is
     * machine-checkable has nothing to vote about anyway.
     */
    fun allowsPeerReview(params: P): Boolean = false
```

In `GameCatalog.kt`, add beside `requiresReveal`:

```kotlin
    /** Whether this round's tips are open to peer review, from a stored `params` blob. */
    fun allowsPeerReview(params: JsonNode): Boolean = type.allowsPeerReview(paramsOf(params))
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='RoundScoringPeerReviewTest,RoundScoringTest,ScoringTest,PlayServiceTest,GameCatalogTest'
```

Expected: PASS. The existing suites must be green unchanged — no game answers `true` yet, and no
round has votes, so `effectiveQualifies` collapses to `qualifies`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game/RoundScoringPeerReviewTest.kt && git commit -m "Let the round's re-evaluation read the peer vote

Taking points away still needs no mechanism: points stay a pure function
of the award rule and every verdict of the round, and peer review only
changes what a verdict says. That is also why this belongs in the
framework — a game doing it itself would have to write other players'
rows or build a second scoring path.

pointsFor is untouched, and the switch defaults to off, so the three
existing games score exactly as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The vote and override endpoints

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/ReviewService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptions.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameExceptionHandler.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/ReviewServiceTest.kt`

**Interfaces:**
- Consumes: everything from Tasks 1–3; `AnnouncementService.resolve`, `HistoryService.resolve`,
  `RoundGameStore.lock`, `MembershipQuery.isAdmin`, `RoundResponses.of`.
- Produces:
  - `data class VoteRequest(val value: Vote?)`
  - `data class OverrideRequest(val value: Boolean?)`
  - `ReviewService.vote(slug, voterId, isSuperAdmin, roundNumber, targetUserId, value): RoundResponse`
  - `ReviewService.override(slug, adminId, isSuperAdmin, roundNumber, targetUserId, value): RoundResponse`
  - `PUT /api/communities/{slug}/rounds/{roundNumber}/plays/{userId}/vote`
  - `PUT /api/communities/{slug}/rounds/{roundNumber}/plays/{userId}/override`
  - `class ReviewNotOpenException` → 409, `class ReviewNotAllowedException` → 403

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/game/ReviewServiceTest.kt`. It needs a
real community with a running round of a game that allows peer review. Until Task 8 exists, define
a **test-only** `GameType` inside the test file and register it as a `@TestConfiguration` bean, the
way `AnnouncementServiceTest` sets its scene — check that file for the exact community/edition
fixture it builds, and reuse it.

The behaviours to pin, one test each:

```kotlin
    @Test
    fun `a player who guessed may flag somebody else's tip, and the points move`() { /* … */ }

    @Test
    fun `voting again replaces the vote, and a null value withdraws it`() { /* … */ }

    @Test
    fun `nobody may vote on their own tip`() {
        shouldThrow<ReviewNotAllowedException> { /* vote with voterId == targetUserId */ }
    }

    @Test
    fun `somebody who has not played the round may not vote`() {
        shouldThrow<ReviewNotAllowedException> { /* voter without a guessed play row */ }
    }

    @Test
    fun `the current round and the one before it accept votes`() { /* both succeed */ }

    @Test
    fun `anything older than the previous round is not found`() {
        shouldThrow<RoundNotFoundException> { /* roundNumber = previous + 1 */ }
    }

    @Test
    fun `a game that does not allow peer review refuses the vote`() {
        shouldThrow<ReviewNotOpenException> { /* a guess-hue round */ }
    }

    @Test
    fun `only a community admin may set the override`() {
        shouldThrow<ReviewNotAllowedException> { /* a plain member */ }
    }
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=ReviewServiceTest
```

Expected: compilation failure — `Unresolved reference: ReviewService`.

- [ ] **Step 3: Write the implementation**

Add to `GameExceptions.kt`:

```kotlin
/**
 * The round is real but its review is not open: its game does not allow peer review, or the
 * round is older than the one before the running one → 409.
 */
class ReviewNotOpenException(message: String = "this round is not open for review") :
    RuntimeException(message)

/**
 * The caller may not cast this vote: they did not play the round, it is their own tip, or they
 * are not this community's admin → 403. Not a 404: the round itself is visible to them.
 */
class ReviewNotAllowedException(message: String = "this vote is not yours to cast") :
    RuntimeException(message)
```

Register them in `GameExceptionHandler`: `ReviewNotOpenException` in `conflict`,
`ReviewNotAllowedException` in `forbidden`.

Add to `RoundDtos.kt`:

```kotlin
/** `null` withdraws the ballot — one verb for casting, changing and taking back. */
data class VoteRequest(val value: Vote?)

/** `null` hands the decision back to the vote. */
data class OverrideRequest(val value: Boolean?)
```

Create `ReviewService.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.Vote
import java.time.Clock
import java.util.UUID

/**
 * Peer review: confirming, flagging, and the game master's override.
 *
 * Every write here takes the **round's row lock**, the same one a guess takes: it ends in
 * `RoundScoring.reevaluate`, which reads every play of the round and writes every one back. Two
 * votes landing together without the lock would each compute from the same stale picture, and one
 * update would be lost in exactly the moment the points move.
 */
@Service
class ReviewService(
    private val announcements: AnnouncementService,
    private val history: HistoryService,
    private val store: RoundGameStore,
    private val plays: RoundPlayRepository,
    private val votes: RoundPlayVoteRepository,
    private val scoring: RoundScoring,
    private val responses: RoundResponses,
    private val memberships: MembershipQuery,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    @Transactional
    fun vote(
        slug: String,
        voterId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        targetUserId: UUID,
        value: Vote?,
    ): RoundResponse {
        // [isSuperAdmin] is accepted for the same reason `PlayService`'s writes accept it and pass
        // `false`: the signature stays the shape every round action has, and the decision not to
        // use it stays visible at the call site. The read bypass exists so an admin may *look*
        // without joining; this is a write into other people's scoring.
        val open = openForReview(slug = slug, userId = voterId, roundNumber = roundNumber)
        if (targetUserId == voterId) throw ReviewNotAllowedException("you cannot vote on your own tip")

        val round = store.lock(open.roundGame)
        val roundGameId = requireNotNull(round.id)
        // Whoever did not play the round does not judge it. Not implied by the framework: for the
        // running round one only sees others' tips after guessing, but the history opens
        // everything to everyone once the round is closed.
        val voterPlay = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = voterId)
        if (voterPlay?.guessedAt == null) throw ReviewNotAllowedException("you have not played this round")

        val target = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = targetUserId)
            ?.takeIf { it.guessedAt != null }
            ?: throw ReviewNotAllowedException("there is no tip to vote on")
        val targetPlayId = requireNotNull(target.id)

        if (value == null) {
            votes.withdrawVote(roundPlayId = targetPlayId, voterUserId = voterId)
        } else {
            votes.castVote(
                roundPlayId = targetPlayId,
                voterUserId = voterId,
                value = value,
                createdAt = clock.instant(),
            )
        }

        val written = scoring.reevaluate(round)
        logger.debug { "round ${round.roundNumber}: vote by $voterId on $targetUserId rewrote $written rows" }
        return responses.of(current = open.copy(roundGame = round), viewerId = voterId)
    }

    /** Moderation during the game is explicitly allowed — what is not is recurring admin *prep*. */
    @Transactional
    fun override(
        slug: String,
        adminId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        targetUserId: UUID,
        value: Boolean?,
    ): RoundResponse {
        val open = openForReview(slug = slug, userId = adminId, roundNumber = roundNumber)
        if (!memberships.isAdmin(communityId = open.communityId, userId = adminId)) {
            throw ReviewNotAllowedException("only this community's admin may override a tip")
        }

        val round = store.lock(open.roundGame)
        val target = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = targetUserId,
        )?.takeIf { it.guessedAt != null }
            ?: throw ReviewNotAllowedException("there is no tip to override")

        plays.updateAdminOverride(id = requireNotNull(target.id), adminOverride = value)
        scoring.reevaluate(round)
        logger.info { "round ${round.roundNumber}: $adminId set the override on $targetUserId to $value" }
        return responses.of(current = open.copy(roundGame = round), viewerId = adminId)
    }

    /**
     * The round this vote is for, if it is still open to one.
     *
     * The window is „the running round or the one immediately before it“, and it needs no clock:
     * `previousRoundNumber` is the pointer `ResolvedRound` already carries. Without a window,
     * a tip submitted just before the round turned would be practically unassailable; with a
     * wider one the table would still wobble weeks later.
     */
    private fun openForReview(slug: String, userId: UUID, roundNumber: Int): ResolvedRound.Announced {
        val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = false)
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        val resolved = when (roundNumber) {
            currentNumber -> current
            current.previousRoundNumber -> history.resolve(current = current, roundNumber = roundNumber)
            else -> throw RoundNotFoundException()
        }
        val announced = when (resolved) {
            is ResolvedRound.NoGame -> throw NoGameToPlayException(resolved.reason)
            is ResolvedRound.Announced -> resolved
        }
        if (!announced.handle.allowsPeerReview(announced.roundGame.params)) throw ReviewNotOpenException()
        return announced
    }
}
```

Add to `RoundController.kt`, with `@PutMapping` and `PathVariable` imports:

```kotlin
    /**
     * Confirm, flag, or take the vote back — one verb, because a voter holds exactly one ballot
     * per tip and a second click replaces it.
     */
    @PutMapping("/{roundNumber}/plays/{userId}/vote")
    fun vote(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
        @PathVariable userId: UUID,
        @RequestBody body: VoteRequest,
    ): RoundResponse = reviews.vote(
        slug = slug, voterId = me.id, isSuperAdmin = me.isSuperAdmin,
        roundNumber = roundNumber, targetUserId = userId, value = body.value,
    )

    /** The game master's verdict on one tip. `null` hands the decision back to the vote. */
    @PutMapping("/{roundNumber}/plays/{userId}/override")
    fun override(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
        @PathVariable userId: UUID,
        @RequestBody body: OverrideRequest,
    ): RoundResponse = reviews.override(
        slug = slug, adminId = me.id, isSuperAdmin = me.isSuperAdmin,
        roundNumber = roundNumber, targetUserId = userId, value = body.value,
    )
```

Add `private val reviews: ReviewService` to the controller's constructor.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='ReviewServiceTest,RoundControllerTest,RoundHistoryServiceTest'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game/ReviewServiceTest.kt && git commit -m "Add the vote and override endpoints

PUT, not POST: a voter holds exactly one ballot per tip, so a second
click replaces or withdraws it rather than stacking a second row. Both
writes take the round's row lock, because both end in a re-evaluation
that rewrites every play of the round.

The window is the running round and the one before it — the pointer
ResolvedRound already carries, so no clock is involved. Only players of
the round may vote, never on their own tip.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The round response carries the votes, openly

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundResponsePeerReviewTest.kt`

**Interfaces:**
- Consumes: `PlayVote`, `VoteTally`, `struckOut`, `effectiveQualifies`, `MembershipQuery.isAdmin`.
- Produces:
  - `data class VoteView(val userId: UUID, val username: String, val value: Vote)`
  - `OtherPlayDto.votes: List<VoteView>`, `.struck: Boolean`, `.adminOverride: Boolean?`
  - the same three on `MyPlayDto`
  - `RoundResponse.canOverride: Boolean = false`

Everything is open — counts **and** names. Anonymity is what makes voting careless; standing next
to your flag by name is the point, and among friends it is the fun of it.

- [ ] **Step 1: Write the failing test**

Create `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundResponsePeerReviewTest.kt`,
built on the same fixture as `ReviewServiceTest`:

```kotlin
    @Test
    fun `a tip carries every vote by name, in both directions`() {
        // two voters flag, one confirms → three VoteViews with usernames, struck = true
    }

    @Test
    fun `the viewer's own tip carries its votes too`() {
        // MyPlayDto.votes is populated the same way OtherPlayDto's is
    }

    @Test
    fun `a tip nobody voted on is not struck and carries an empty list`() { /* … */ }

    @Test
    fun `struck follows the override, not only the count`() {
        // adminOverride = true with two flags → struck = false, adminOverride = true
    }

    @Test
    fun `canOverride is true for the community admin and false for a plain member`() { /* … */ }

    @Test
    fun `votes stay hidden while the viewer has not guessed`() {
        // `others` is empty before the viewer's own guess, so there is nothing to leak — assert it
    }
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=RoundResponsePeerReviewTest
```

Expected: compilation failure — `Unresolved reference: VoteView`.

- [ ] **Step 3: Write the implementation**

Add to `RoundDtos.kt`:

```kotlin
/**
 * One cast ballot, with the name attached. Nothing about the vote is secret — not the counts and
 * not who cast them. Anonymity is what makes voting careless; among friends, being asked „warum
 * hast du mich geflaggt?“ is the point.
 */
data class VoteView(val userId: UUID, val username: String, val value: Vote)
```

Add the same three fields to **both** `OtherPlayDto` and `MyPlayDto`, after `durationMs`:

```kotlin
    /** Every vote cast on this tip, by name. Empty for a game without peer review. */
    val votes: List<VoteView> = emptyList(),
    /**
     * Whether this tip currently scores nothing because of the review — the server's own answer,
     * override included. The client never re-derives it: the rule lives in one place, and the
     * client has no business owning a second copy of it.
     */
    val struck: Boolean = false,
    /** The game master's verdict, shown openly: it would otherwise be the one hidden move. */
    val adminOverride: Boolean? = null,
```

Add to `RoundResponse`, after `awardPoints`:

```kotlin
    /**
     * Whether **this viewer** may set an override here. Viewer-scoped like `me`, not a property of
     * the round: in the product it means „is this community's admin“, in the lab it is always
     * true. The component is the same in both worlds and asks nobody — it is told.
     */
    val canOverride: Boolean = false,
```

In `RoundResponses.kt`, take `RoundPlayVoteRepository` and `MembershipQuery` in the constructor,
then inside `announced(...)`:

```kotlin
        // One read for the whole round. Grouped by play id, and only for the rows this viewer may
        // see anyway — a tip that is withheld carries no votes either.
        val tallies = votes.votesOfRound(requireNotNull(current.roundGame.id))
            .groupBy { it.roundPlayId }
```

Extend the identity lookup so voters get names too — they are community members, but not
necessarily among the players of this round:

```kotlin
        val voterIds = tallies.values.flatten().map { it.voterUserId }
        val byId = identities.of(
            communityId = current.communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId } + voterIds,
        )
```

Add one shared helper and call it from both DTO builders:

```kotlin
    /**
     * The review side of one play: who voted what, and whether the tip currently counts. `struck`
     * is `!effectiveQualifies(...)` rather than `struckOut(...)` alone, so an override shows up
     * here exactly as it shows up in the scoring — one rule, read twice, never two rules.
     */
    private fun reviewOf(
        play: RoundPlay,
        cast: List<PlayVote>,
        byId: Map<UUID, MemberIdentity>,
    ): Triple<List<VoteView>, Boolean, Boolean?> {
        val tally = VoteTally.of(cast.map { it.value })
        val views = cast.mapNotNull { vote ->
            byId[vote.voterUserId]?.let {
                VoteView(userId = vote.voterUserId, username = it.username, value = vote.value)
            }
        }.sortedBy { it.username }
        val counts = !effectiveQualifies(
            adminOverride = play.adminOverride,
            qualifies = play.qualifies == true,
            tally = tally,
        )
        return Triple(views, counts, play.adminOverride)
    }
```

Pass `cast = tallies[play.id].orEmpty()` from `mineDtoOf` and `otherDtoOf`, and set
`canOverride = memberships.isAdmin(communityId = current.communityId, userId = viewerId)` on the
`RoundResponse`.

The `NoGame` branch keeps `canOverride`'s default: there is no tip to override.

**One test constructs `RoundResponses` by hand** —
`core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceNoGameTypeTest.kt:46`.
It needs the two new constructor arguments; give it mockk doubles that answer an empty vote list
and `false` for `isAdmin`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='RoundResponsePeerReviewTest,RoundControllerTest,RoundHistoryServiceTest,PlayServiceTest'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game/RoundResponsePeerReviewTest.kt && git commit -m "Publish the votes with the names attached

Nothing about the review is secret — not the counts, not who cast them.
Anonymous voting is careless voting; standing next to your own flag by
name is what makes this work among friends, and it is half the fun.

struck is the server's answer, not a count the client re-derives: it is
!effectiveQualifies, the same expression the scoring uses, so the tile
and the points can never disagree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The `spotobject` module — the curated term list

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/SpotObjectTerms.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectProperties.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectException.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectTermsYamlReader.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectTermsLoader.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectConfiguration.kt`
- Create: `core/src/main/resources/spot-object-terms.sample.yaml`
- Modify: `core/src/main/resources/application.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/spotobject/SpotObjectTermsTest.kt`

**Reference implementation:** `guesshue/internal/GuessHueDataset*` — same five files, same
fail-fast, same sample-on-the-classpath rule. Read them before writing.

**Interfaces:**
- Consumes: `SeededRandom` (`core.rng`).
- Produces:
  - `class SpotObjectTerms(val terms: List<String>) { fun draw(presentation: SeededRandom): String }`
  - `@ConfigurationProperties("app.spot-object")` with `termsPath: String = ""`
  - bean `spotObjectTerms: SpotObjectTerms`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.spotobject

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.spotobject.internal.SpotObjectException
import org.unividuell.countdown.core.spotobject.internal.SpotObjectTermsYamlReader

class SpotObjectTermsTest {

    private fun read(yaml: String) =
        SpotObjectTermsYamlReader.read(yaml.byteInputStream(), "test")

    @Test
    fun `it reads a list of terms`() {
        read("terms:\n  - Rosa Gartenzwerg\n  - Umgedrehtes Fahrrad\n") shouldBe
            listOf("Rosa Gartenzwerg", "Umgedrehtes Fahrrad")
    }

    /** Mechanically wrong is checked; whether a term is any *good* is looked at, never asserted. */
    @Test
    fun `it rejects an empty list and a blank term`() {
        shouldThrow<SpotObjectException> { read("terms: []\n") }
        shouldThrow<SpotObjectException> { read("terms:\n  - \"  \"\n") }
    }

    @Test
    fun `it rejects a duplicate, which is a copy-paste slip rather than a matter of taste`() {
        shouldThrow<SpotObjectException> { read("terms:\n  - Gnom\n  - Gnom\n") }
    }

    @Test
    fun `the draw comes from the presentation stream and is reproducible`() {
        val terms = SpotObjectTerms(listOf("a", "b", "c", "d"))

        terms.draw(SeededRandom.fromSeed(7)) shouldBe terms.draw(SeededRandom.fromSeed(7))
        terms.terms shouldContain terms.draw(SeededRandom.fromSeed(99))
    }

    @Test
    fun `the bundled sample parses`() {
        val stream = requireNotNull(
            javaClass.getResourceAsStream("/spot-object-terms.sample.yaml"),
        )
        stream.use { SpotObjectTermsYamlReader.read(it, "sample").size shouldBe 12 }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=SpotObjectTermsTest
```

Expected: compilation failure — `Unresolved reference: SpotObjectTerms`.

- [ ] **Step 3: Write the implementation**

`SpotObjectTerms.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The curated list of things to go looking for. The module's public surface: the game framework's
 * adapter gets this bean and draws its round from it.
 *
 * A term earns its place by being **worldwide** and **recognisable in the picture**. Something that
 * exists in one culture only turns the search into local knowledge; something you must stand next
 * to turns it into an argument.
 *
 * Immutable and stateless — the randomness lives in the [SeededRandom] passed in, never here.
 */
class SpotObjectTerms(val terms: List<String>) {

    /**
     * Drawn from the **presentation** stream, which is the whole of this game's draw: the term is
     * published in the payload, and there is no second, withheld value for it to narrow.
     *
     * That the list is secret anyway is not a contradiction — the seeds come from
     * `GameRandom.independent`, not from round coordinates, so owning the list still does not tell
     * anybody which term comes tomorrow.
     */
    fun draw(presentation: SeededRandom): String = presentation.pick(terms)
}
```

`internal/SpotObjectException.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject.internal

/** The term list is missing, unreadable, or mechanically wrong — a boot failure, never a runtime one. */
class SpotObjectException(message: String) : RuntimeException(message)
```

`internal/SpotObjectProperties.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app.spot-object")
open class SpotObjectProperties(
    /**
     * Absolute path to the **decrypted** term list the deployment mounts into the container. Empty
     * means: the sample from the classpath — a startup abort in a deployed environment, see
     * [SpotObjectConfiguration].
     */
    val termsPath: String = "",
    /** Browser key for the Maps JavaScript API. Referrer-restricted; the client is told this one. */
    val mapsApiKey: String = "",
    /** URL-signing secret for the Street View Static API. Server-side only, never sent anywhere. */
    val signingSecret: String = "",
)
```

`internal/SpotObjectTermsYamlReader.kt` — an `object` with `read(source: InputStream, origin:
String): List<String>`, using **SnakeYAML** (`org.yaml.snakeyaml.Yaml`), not Jackson: SnakeYAML is
already on the compile classpath through the Boot starter, and a YAML Jackson module would be a
new dependency for one list. Mirror `GuessHueDatasetYamlReader` — read it first, including its
rule that every message names [origin], because whoever debugs this is not looking at the file
(it sits decrypted on a server). It parses `{ terms: [String] }` and rejects an empty list, a
blank entry, and a duplicate.

`internal/SpotObjectTermsLoader.kt` — a straight copy of `GuessHueDatasetLoader`'s shape:
`load()` returns `LoadedSpotObjectTerms(terms, origin, isSample)`, reading the mounted file when
`termsPath` is non-blank and `/spot-object-terms.sample.yaml` otherwise.

`internal/SpotObjectConfiguration.kt` — mirror `GuessHueDatasetConfiguration`, including the
`DEPLOYED_PROFILES = setOf("production", "staging")` abort and the `logger.warn`/`logger.info`
pair. Also `@EnableConfigurationProperties(SpotObjectProperties::class)`.

`resources/spot-object-terms.sample.yaml` — **twelve obviously fake terms.** They exist so the
tests and a local run have something to draw; they are not the real set and must read as
placeholders:

```yaml
# The bundled SAMPLE. Deliberately silly — see game-content.md: examples never come from the real
# set, and the application refuses to start on this file under `production` or `staging`.
terms:
  - Rosa Gartenzwerg
  - Umgedrehtes Fahrrad
  - Kaputter Regenschirm
  - Gelber Briefkasten
  - Einzelner Turnschuh
  - Bemalter Stromkasten
  - Verlassener Einkaufswagen
  - Blaue Parkbank
  - Wäscheleine über der Straße
  - Windrad im Vorgarten
  - Auto ohne Räder
  - Katze auf einem Dach
```

In `application.yaml`, under `app:`, after the `song-snippet` block:

```yaml
  spot-object:
    # Empty means: the sample list from the classpath — a boot failure in production/staging,
    # where update.sh decrypts the real file with sops and compose mounts it in. Same shape as
    # guess-hue above.
    terms-path: ${SPOT_OBJECT_TERMS_PATH:}
    # The browser key for the Maps JavaScript API. Referrer-restricted, so it is handed to the
    # client; without it the board cannot load a map at all.
    maps-api-key: ${SPOT_OBJECT_MAPS_API_KEY:}
    # The URL-signing secret for the Street View Static API. Server-side only.
    signing-secret: ${SPOT_OBJECT_SIGNING_SECRET:}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest=SpotObjectTermsTest
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/spotobject core/src/main/resources/spot-object-terms.sample.yaml core/src/main/resources/application.yaml core/src/test/kotlin/org/unividuell/countdown/core/spotobject && git commit -m "Add the spotobject module and its curated term list

The same shape guess-hue already has: plain YAML read from a mounted
path, the bundled sample otherwise, and a refusal to boot on the sample
under production or staging. No sops in Kotlin — the deployment
decrypts, the application only reads.

The checker only checks what is mechanically wrong. Whether a term is
worldwide and recognisable is looked at, not asserted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The country lookup — soft-failing, and it never sees a coordinate from the client

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/CountryLookup.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/GoogleCountryLookup.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectConfiguration.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/spotobject/GoogleCountryLookupTest.kt`
- Test fixtures: `core/src/test/resources/spotobject/streetview-metadata.json`,
  `core/src/test/resources/spotobject/geocode-barcelona.json`

**Interfaces:**
- Consumes: `SpotObjectProperties.mapsApiKey`.
- Produces: `interface CountryLookup { fun countryOf(panoId: String): String? }`

**Why the panorama id and not a coordinate.** The spec requires that the coordinate is *not*
persisted. The guess is written to `round_plays.guess` verbatim by the framework, so any field the
client submits is stored. Resolving from the `panoId` — Street View **metadata** (a free,
unmetered SKU) gives the location, Geocoding turns it into a country — makes „not persisted“
structural instead of a discipline: the coordinate never enters the request at all.

The price is two sequential calls inside a judgement. Both fail soft, together: no country, no
error, the tip goes through and its tile simply carries no flag.

- [ ] **Step 1: Write the failing test**

Save two trimmed real responses as fixtures (`location.lat`/`location.lng` in the first,
`results[].address_components[]` with a `country` type in the second — see the `songsnippet`
fixtures for the pattern), then:

```kotlin
package org.unividuell.countdown.core.spotobject

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withServerError
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.spotobject.internal.GoogleCountryLookup
import org.springframework.core.io.ClassPathResource

class GoogleCountryLookupTest {

    private fun fixture(name: String) = ClassPathResource("spotobject/$name").getContentAsString(Charsets.UTF_8)

    @Test
    fun `it resolves a panorama to an ISO country code`() {
        // metadata → {lat,lng}; geocode → address_components with type `country`, short_name "ES"
        // assert: lookup.countryOf("abc") shouldBe "ES"
    }

    @Test
    fun `a failing metadata call yields no country and no exception`() {
        // withServerError() on the first call
        // assert: lookup.countryOf("abc").shouldBeNull()
    }

    @Test
    fun `a failing geocode call yields no country and no exception`() { /* … */ }

    @Test
    fun `a response without a country component yields null`() { /* results: [] */ }
}
```

Use `MockRestServiceServer.bindTo(builder)` against the same `RestClient.Builder` the production
bean is built from — `DeezerSongCatalog`'s tests in `core/src/test/.../songsnippet/` show this
project's idiom; follow whatever they do rather than inventing a second one.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=GoogleCountryLookupTest
```

Expected: compilation failure — `Unresolved reference: GoogleCountryLookup`.

- [ ] **Step 3: Write the implementation**

`CountryLookup.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject

/**
 * Which country a panorama stands in, as an ISO-3166-1 alpha-2 code — or `null` when the answer
 * cannot be had.
 *
 * **`null` is a normal answer, not an error.** A tip must never fail because a foreign service is
 * having a bad minute: the guess goes through and its tile simply shows no flag.
 *
 * Takes the panorama id rather than a coordinate on purpose. The framework persists a guess
 * verbatim, so a coordinate in the request would be a coordinate in the database; resolving from
 * the id means it is never submitted at all.
 */
interface CountryLookup {
    fun countryOf(panoId: String): String?
}
```

`internal/GoogleCountryLookup.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.spotobject.CountryLookup

/** Property names mirror Google's JSON verbatim so binding needs no annotations. */
internal data class StreetViewLocationJson(val lat: Double = 0.0, val lng: Double = 0.0)
internal data class StreetViewMetadataJson(
    val status: String = "",
    val location: StreetViewLocationJson? = null,
)
internal data class AddressComponentJson(
    val short_name: String = "",
    val types: List<String> = emptyList(),
)
internal data class GeocodeResultJson(val address_components: List<AddressComponentJson> = emptyList())
internal data class GeocodeResponseJson(
    val status: String = "",
    val results: List<GeocodeResultJson> = emptyList(),
)

/**
 * Panorama id → location → country, in two calls.
 *
 * The first is the Street View **metadata** endpoint, which is free and unmetered — it exists
 * precisely so an application can ask about a panorama without fetching an image. The second is
 * Geocoding. Point-in-polygon offline was considered and rejected: the answer should come *from*
 * Google rather than be derived by us from Google's data.
 */
@Component
class GoogleCountryLookup(
    @Qualifier("googleMapsRestClient") private val client: RestClient,
    private val properties: SpotObjectProperties,
) : CountryLookup {

    private val logger = KotlinLogging.logger {}

    override fun countryOf(panoId: String): String? {
        val location = locationOf(panoId) ?: return null
        return countryAt(lat = location.lat, lng = location.lng)
    }

    private fun locationOf(panoId: String): StreetViewLocationJson? = runCatching {
        client.get()
            .uri {
                it.path("/maps/api/streetview/metadata")
                    .queryParam("pano", panoId)
                    .queryParam("key", properties.mapsApiKey)
                    .build()
            }
            .retrieve()
            .body(StreetViewMetadataJson::class.java)
            ?.takeIf { it.status == "OK" }
            ?.location
    }.getOrElse {
        // The one place behaviour degrades silently: the tip is accepted with no flag, and without
        // this line nobody would ever learn why the flags stopped appearing.
        logger.warn(it) { "street view metadata lookup failed for pano $panoId" }
        null
    }

    private fun countryAt(lat: Double, lng: Double): String? = runCatching {
        client.get()
            .uri {
                it.path("/maps/api/geocode/json")
                    .queryParam("latlng", "$lat,$lng")
                    .queryParam("result_type", "country")
                    .queryParam("key", properties.mapsApiKey)
                    .build()
            }
            .retrieve()
            .body(GeocodeResponseJson::class.java)
            ?.results
            ?.flatMap { it.address_components }
            ?.firstOrNull { COUNTRY in it.types }
            ?.short_name
            ?.takeIf { it.isNotBlank() }
    }.getOrElse {
        logger.warn(it) { "reverse geocoding failed for $lat,$lng" }
        null
    }

    private companion object {
        const val COUNTRY = "country"
    }
}
```

In `SpotObjectConfiguration.kt`, add the client — the same shape `SongSnippetConfiguration` uses,
and for the same reason: a bare builder is an unconfigured prototype per injection point, so the
timeouts have to be built once and handed over.

```kotlin
    /**
     * Short timeouts on purpose: this client is called from inside a judgement, and a stalled
     * connection there would hold up somebody's submission. Three seconds, then no flag.
     */
    @Bean
    fun googleMapsRequestFactory(): ClientHttpRequestFactory {
        val settings = HttpClientSettings.defaults()
            .withConnectTimeout(Duration.ofSeconds(3))
            .withReadTimeout(Duration.ofSeconds(3))
        return ClientHttpRequestFactoryBuilder.detect().build(settings)
    }

    @Bean
    fun googleMapsRestClient(
        builder: RestClient.Builder,
        @Qualifier("googleMapsRequestFactory") requestFactory: ClientHttpRequestFactory,
    ): RestClient = builder.baseUrl("https://maps.googleapis.com").requestFactory(requestFactory).build()
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest=GoogleCountryLookupTest
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/spotobject core/src/test/kotlin/org/unividuell/countdown/core/spotobject core/src/test/resources/spotobject && git commit -m "Resolve a tip's country from its panorama id

The panorama id, not a coordinate: the framework persists a guess
verbatim, so a coordinate in the request would be a coordinate in the
database. Street View's metadata endpoint — free and unmetered — turns
the id into a location, and geocoding turns that into a country, so the
client never submits one.

Both calls fail soft. A foreign service having a bad minute must never
cost somebody their submission; the tile just carries no flag, and the
degradation is logged because otherwise nobody would ever learn why.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The still image and the client's map key

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/StreetViewShot.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/spotobject/internal/SpotObjectController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/spotobject/StreetViewShotTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/spotobject/SpotObjectControllerTest.kt`

**Read the „Deviation from the spec“ section above before starting this task.**

**Interfaces:**
- Consumes: `SpotObjectProperties.mapsApiKey`, `.signingSecret`.
- Produces:
  - `object StreetViewShot { fun fovOf(zoom: Double): Double; fun url(panoId, heading, pitch, fov, width, height, apiKey, signingSecret): String }`
  - `GET /api/spot-object/config` → `{ "mapsApiKey": "…" }`
  - `GET /api/spot-object/shot?pano=&heading=&pitch=&fov=&w=&h=` → `302` to the signed Google URL

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.spotobject

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test

class StreetViewShotTest {

    /** Street View's zoom is a scale; the Static API wants the field of view it corresponds to. */
    @Test
    fun `zoom maps to a field of view and is clamped at both ends`() {
        StreetViewShot.fovOf(1.0) shouldBe 90.0
        StreetViewShot.fovOf(2.0) shouldBe 45.0
        StreetViewShot.fovOf(0.0) shouldBe 100.0   // 180 clamped down
        StreetViewShot.fovOf(9.0) shouldBe 10.0    // 0.35 clamped up
    }

    @Test
    fun `the signed url carries the key, the panorama and a signature`() {
        val url = StreetViewShot.url(
            panoId = "abc", heading = 12.0, pitch = 0.0, fov = 90.0,
            width = 400, height = 300, apiKey = "KEY", signingSecret = "c2VjcmV0",
        )

        url shouldContain "pano=abc"
        url shouldContain "key=KEY"
        url shouldContain "signature="
        url shouldNotContain "c2VjcmV0"
    }

    /**
     * The signature is over path + query, HMAC-SHA1 with the URL-safe-base64-decoded secret, and
     * URL-safe-base64 encoded. Pinned against a known pair so a refactor cannot quietly change it.
     */
    @Test
    fun `the signature matches Google's documented algorithm`() {
        // Compute the expectation once with a scratch script, paste the literal here, and keep it.
    }

    @Test
    fun `out-of-range angles are clamped rather than rejected`() {
        StreetViewShot.url(
            panoId = "abc", heading = 999.0, pitch = -999.0, fov = 1_000.0,
            width = 400, height = 300, apiKey = "K", signingSecret = "c2VjcmV0",
        ) shouldContain "pitch=-90"
    }
}
```

And a MockMvc test for the controller — follow `RoundControllerTest`'s Kotlin DSL idiom:

```kotlin
    @Test
    fun `the config endpoint hands out the browser key`() { /* jsonPath("$.mapsApiKey") */ }

    @Test
    fun `the shot endpoint redirects and never leaks the signing secret`() {
        // status 302, Location starts with https://maps.googleapis.com/maps/api/streetview
        // and the response body is empty
    }

    @Test
    fun `both endpoints need a session`() { /* 401 without authentication */ }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw -q test -Dtest='StreetViewShotTest,SpotObjectControllerTest'
```

Expected: compilation failure — `Unresolved reference: StreetViewShot`.

- [ ] **Step 3: Write the implementation**

`StreetViewShot.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * The frozen frame of a tip: a plain JPEG from the Street View **Static** API — no controls, no
 * movement, nothing to click.
 *
 * A `StreetViewPanorama` per tile was the obvious alternative and is the expensive one: each
 * constructed panorama object is a billed Dynamic Street View event, while the map's default
 * panorama (and this static image) are not. Whoever wants to look around follows the free Maps URL
 * into Google's own viewer instead.
 */
object StreetViewShot {

    /** Street View's zoom is a scale; the Static API wants the field of view it corresponds to. */
    fun fovOf(zoom: Double): Double = (180.0 / Math.pow(2.0, zoom)).coerceIn(MIN_FOV, MAX_FOV)

    /**
     * Signed server-side, because the signing secret must never reach a browser. The signature is
     * HMAC-SHA1 over path + query with the URL-safe-base64-decoded secret, URL-safe-base64
     * encoded — Google's documented algorithm, and it has to match byte for byte.
     */
    fun url(
        panoId: String,
        heading: Double,
        pitch: Double,
        fov: Double,
        width: Int,
        height: Int,
        apiKey: String,
        signingSecret: String,
    ): String {
        val query = listOf(
            "size" to "${width.coerceIn(16, 640)}x${height.coerceIn(16, 640)}",
            "pano" to panoId,
            "heading" to format(heading.coerceIn(-180.0, 360.0)),
            "pitch" to format(pitch.coerceIn(-90.0, 90.0)),
            "fov" to format(fov.coerceIn(MIN_FOV, MAX_FOV)),
            "key" to apiKey,
        ).joinToString("&") { (name, value) -> "$name=${encode(value)}" }

        val unsigned = "$PATH?$query"
        if (signingSecret.isBlank()) return "$HOST$unsigned"
        return "$HOST$unsigned&signature=${sign(path = unsigned, secret = signingSecret)}"
    }

    private fun sign(path: String, secret: String): String {
        val key = Base64.getUrlDecoder().decode(secret)
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        return Base64.getUrlEncoder().encodeToString(mac.doFinal(path.toByteArray(StandardCharsets.UTF_8)))
    }

    /** No exponent and no locale decimal comma — Google parses these as plain decimals. */
    private fun format(value: Double): String =
        if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private const val HOST = "https://maps.googleapis.com"
    private const val PATH = "/maps/api/streetview"
    private const val MIN_FOV = 10.0
    private const val MAX_FOV = 100.0
}
```

`internal/SpotObjectController.kt`:

```kotlin
package org.unividuell.countdown.core.spotobject.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.spotobject.StreetViewShot

/** What the browser needs in order to draw a map at all. Referrer-restricted, hence handed out. */
data class SpotObjectConfigDto(val mapsApiKey: String)

/**
 * This module's own HTTP surface, the way `songsnippet` has one.
 *
 * The still image is a **redirect**, not a URL in a DTO: the only per-play, game-shaped exit the
 * framework offers is `Judgement.outcome`, and that is persisted at judge time — an API key and an
 * HMAC frozen into every historical round is a worse trade than one extra hop. The signing secret
 * stays here either way, which was the actual requirement.
 */
@RestController
@RequestMapping("/api/spot-object")
class SpotObjectController(private val properties: SpotObjectProperties) {

    @GetMapping("/config")
    fun config() = SpotObjectConfigDto(mapsApiKey = properties.mapsApiKey)

    /**
     * A tip's frozen frame. Cached privately and long: the same six parameters always denote the
     * same photograph, and every tile on the review grid asks for one.
     */
    @GetMapping("/shot")
    fun shot(
        @RequestParam pano: String,
        @RequestParam(defaultValue = "0") heading: Double,
        @RequestParam(defaultValue = "0") pitch: Double,
        @RequestParam(defaultValue = "90") fov: Double,
        @RequestParam(name = "w", defaultValue = "400") width: Int,
        @RequestParam(name = "h", defaultValue = "300") height: Int,
    ): ResponseEntity<Void> = ResponseEntity.status(302)
        .header(
            HttpHeaders.LOCATION,
            StreetViewShot.url(
                panoId = pano, heading = heading, pitch = pitch, fov = fov,
                width = width, height = height,
                apiKey = properties.mapsApiKey, signingSecret = properties.signingSecret,
            ),
        )
        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400, immutable")
        .build()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='StreetViewShotTest,SpotObjectControllerTest'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/spotobject core/src/test/kotlin/org/unividuell/countdown/core/spotobject && git commit -m "Serve a tip's still frame through a signed redirect

The Static API needs a URL signature, and the signing secret must never
reach a browser — so the server builds the URL. It hands it over as a
302 rather than in a DTO because the only per-play, game-shaped exit the
framework has is the outcome, and that is persisted: an API key and an
HMAC frozen into every historical round would break the moment either
rotates.

A static JPEG, not a panorama per tile: a constructed panorama object is
a billed event, and this one is not. Looking around happens in Google's
own viewer, through a free Maps URL.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: `SpotObjectGameType` — the adapter

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/SpotObjectGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/SpotObjectGameTypeTest.kt`

**Reference implementation:** `FindPatternGameType` — the adapter lives in `game.internal` and the
content module knows nothing about it.

**Interfaces:**
- Consumes: `SpotObjectTerms.draw`, `CountryLookup.countryOf`, `GameRandom`, `RoundContext`,
  `Judgement`, `InvalidGuessException`.
- Produces:
  - `data class SpotObjectParams(val term: String, val timed: Boolean)`
  - `data class SpotObjectPayload(val term: String) : GamePayload`
  - `data class SpotObjectOutcome(val country: String?) : GameOutcome`
  - `@Component class SpotObjectGameType(terms, countries) : GameType<SpotObjectParams>` with
    `id = "spot-object"`, `displayName = "Weltanschauung"`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.SpotObjectGameType
import org.unividuell.countdown.core.game.internal.SpotObjectOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.spotobject.CountryLookup
import org.unividuell.countdown.core.spotobject.SpotObjectTerms
import tools.jackson.databind.json.JsonMapper

class SpotObjectGameTypeTest {

    private val countries = mockk<CountryLookup>()
    private val game = SpotObjectGameType(
        terms = SpotObjectTerms(listOf("Rosa Gartenzwerg", "Umgedrehtes Fahrrad")),
        countries = countries,
    )
    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    private fun guessOf(
        panoId: String = "abc", heading: Double = 12.0, pitch: Double = 0.0, zoom: Double = 1.0,
    ) = mapper.readTree(
        """{"panoId":"$panoId","heading":$heading,"pitch":$pitch,"zoom":$zoom}""",
    )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "spot-object"
        game.displayName shouldBe "Weltanschauung"
    }

    /**
     * This game has no round secret, so the solution stream is unused — and the field-set tests
     * below pin exactly that emptiness. They are not ceremony: they are where it would show if
     * something got laid into the payload later that not everyone may see.
     */
    @Test
    fun `the term follows the presentation seed alone`() {
        draw(phase = Phase.ONE, seed = 1, presentationSeed = 7).term shouldBe
            draw(phase = Phase.ONE, seed = 2, presentationSeed = 7).term
    }

    @Test
    fun `the payload carries exactly the term`() {
        val json = mapper.valueToTree<tools.jackson.databind.JsonNode>(game.present(draw(phase = Phase.ONE)))

        json.propertyNames().toList() shouldContainExactly listOf("term")
    }

    @Test
    fun `there is nothing to reveal`() {
        game.solution(draw(phase = Phase.ONE)).shouldBeNull()
        game.solution(draw(phase = Phase.TWO)).shouldBeNull()
    }

    @Test
    fun `only phase two asks for a deliberate reveal`() {
        game.requiresReveal(draw(phase = Phase.ONE)) shouldBe false
        game.requiresReveal(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `peer review is on in both phases`() {
        game.allowsPeerReview(draw(phase = Phase.ONE)) shouldBe true
        game.allowsPeerReview(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `every formally valid tip qualifies, and carries the country it was resolved to`() {
        every { countries.countryOf("abc") } returns "ES"

        val judged = game.judge(params = draw(phase = Phase.ONE), guess = guessOf())

        judged.qualifies shouldBe true
        judged.deviation shouldBe 0.0
        judged.outcome shouldBe SpotObjectOutcome(country = "ES")
    }

    @Test
    fun `a country that cannot be resolved is not an error`() {
        every { countries.countryOf(any()) } returns null

        game.judge(params = draw(phase = Phase.ONE), guess = guessOf()).outcome shouldBe
            SpotObjectOutcome(country = null)
    }

    @Test
    fun `a malformed tip is rejected before anything is written`() {
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = mapper.readTree("""{}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(panoId = " "))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(heading = 400.0))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(pitch = -91.0))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = guessOf(zoom = 5.5))
        }
    }

    /** The lookup must not be reached for a guess that was going to be refused anyway. */
    @Test
    fun `a malformed tip never reaches the country lookup`() {
        shouldThrow<InvalidGuessException> {
            game.judge(params = draw(phase = Phase.ONE), guess = mapper.readTree("""{}"""))
        }
        io.mockk.verify(exactly = 0) { countries.countryOf(any()) }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw -q test -Dtest=SpotObjectGameTypeTest
```

Expected: compilation failure — `Unresolved reference: SpotObjectGameType`.

- [ ] **Step 3: Write the implementation**

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.spotobject.CountryLookup
import org.unividuell.countdown.core.spotobject.SpotObjectTerms
import tools.jackson.databind.JsonNode

/**
 * The frozen round. [term] is the whole of it — this is the first game with **no round secret**,
 * so nothing here is withheld.
 *
 * [timed] is how the phase reaches [SpotObjectGameType.requiresReveal], the same shape Guess Hue's
 * `toleranceDeg` and Musterung's `timed` already have. It stays in the params and never reaches a
 * client: whether a clock is running is something the framework says through the reveal face and
 * the delivered `durationMs`, not something the game announces.
 */
data class SpotObjectParams(val term: String, val timed: Boolean)

/** One field, and the field-set test pins that. There is nothing else the player needs. */
data class SpotObjectPayload(val term: String) : GamePayload

/**
 * What the server worked out about the tip: which country it stands in, as ISO-3166-1 alpha-2, or
 * `null` when the lookup could not answer.
 *
 * The outcome is the right place for it because it is exactly what the server *computed* — the
 * panorama and the angles are already in `guess` and travel to everyone who has played anyway.
 * Persisted as JSONB, so the flag survives the round and the history without geocoding again.
 */
data class SpotObjectOutcome(val country: String?) : GameOutcome

/**
 * Weltanschauung: find a named object anywhere in Street View.
 *
 * There is no stored solution — the world is large and there are arbitrarily many right answers.
 * Whoever submits is right; the other players decide afterwards whether they believe it. That is
 * what `allowsPeerReview` turns on, and it is the whole of this game's judging.
 *
 * The searching is meant to happen **abroad**: in your own town you often already know where
 * something stands. The rule is deliberately **not enforced** — the tip is accepted and the tile
 * shows the country's flag beside it. Spotting a home-country tip is a player's job, not the
 * server's.
 */
@Component
class SpotObjectGameType(
    private val terms: SpotObjectTerms,
    private val countries: CountryLookup,
) : GameType<SpotObjectParams> {

    override val id = "spot-object"
    override val displayName = "Weltanschauung"
    override val paramsType = SpotObjectParams::class.java

    /**
     * Everything comes from the presentation stream, and the solution stream stays unused: there
     * is no withheld value for a published one to narrow. The draw is still unpredictable —
     * `GameRandom.independent` seeds from a CSPRNG, not from round coordinates — so owning the
     * whole term list does not tell anybody which term comes tomorrow.
     */
    override fun draw(random: GameRandom, context: RoundContext) = SpotObjectParams(
        term = terms.draw(random.presentation),
        timed = context.phase == Phase.TWO,
    )

    override fun present(params: SpotObjectParams) = SpotObjectPayload(term = params.term)

    /** Phase two only — there the clock is the result, and the reveal is what starts it, once. */
    override fun requiresReveal(params: SpotObjectParams) = params.timed

    /** The one game whose tips are judged by the other players rather than by the machine. */
    override fun allowsPeerReview(params: SpotObjectParams) = true

    /**
     * The shape first, and only then the network call: a typo must not consume the one attempt,
     * and it must not cost a lookup either.
     */
    override fun judge(params: SpotObjectParams, guess: JsonNode): Judgement {
        val panoId = guess.get("panoId")?.takeIf { it.isString }?.stringValue()?.trim()
        if (panoId.isNullOrEmpty()) throw InvalidGuessException("guess must carry a non-empty 'panoId'")
        val heading = number(guess = guess, field = "heading", min = -180.0, max = 360.0)
        val pitch = number(guess = guess, field = "pitch", min = -90.0, max = 90.0)
        val zoom = number(guess = guess, field = "zoom", min = 0.0, max = 5.0)

        return Judgement(
            // Whoever submits is right. The other players may take it back afterwards, and that
            // happens in the framework, not here.
            qualifies = true,
            // Nothing to be far from. In a timed round the framework overwrites this with the
            // reveal-to-guess duration — the clock is its, not the game's.
            deviation = 0.0,
            outcome = SpotObjectOutcome(country = countries.countryOf(panoId)),
        )
    }

    /** Nothing to reveal: there was never an answer to hold back. */
    override fun solution(params: SpotObjectParams) = null

    private fun number(guess: JsonNode, field: String, min: Double, max: Double): Double {
        val value = guess.get(field)?.takeIf { it.isNumber }?.doubleValue()
            ?: throw InvalidGuessException("guess must carry a numeric '$field'")
        if (value < min || value > max) {
            throw InvalidGuessException("'$field' must lie in [$min, $max], was $value")
        }
        return value
    }
}
```

**Note for the implementer:** the Jackson 3 (`tools.jackson`) accessor names differ from Jackson 2.
Check `FindPatternGameType.judge` and `GuessHueGameType.judge` for the exact spelling this codebase
uses on `JsonNode` (`isString`/`stringValue()`, `isNumber`/`doubleValue()`, `canConvertToInt()`)
and match it rather than trusting the snippet above.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='SpotObjectGameTypeTest,GameCatalogTest,GameSelectionTest'
```

Expected: PASS. `GameCatalogTest` must still pass with a fourth game in the catalogue — check
whether it asserts a fixed id list and extend it if so.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/SpotObjectGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/SpotObjectGameTypeTest.kt && git commit -m "Add Weltanschauung as an announceable game

The first game with no round secret: the term is the whole draw and it
is published, so solution() is null and the solution stream stays
unused. The field-set tests pin that emptiness rather than a field
list — they are where it would show if something that not everyone may
see were laid into the payload later.

judge checks the shape before it calls anything, so a typo costs neither
the one attempt nor a lookup.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: The lab grows votes and overrides

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabRoundStore.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabExceptions.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabPeerReviewTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabPointsParityTest.kt` *(extend)*

The lab is where this game's UI and UX get looked at by hand, peer review included. It therefore
gets **no exemption** — it gets the extension. `LabRoundStore` is already application-scoped and
explicitly not session-bound, so two accounts from the test-login picker on one lab round already
see each other. That makes multi-player review the real thing here, not a re-enactment.

**Interfaces:**
- Consumes: `Vote`, `VoteTally`, `effectiveQualifies` (Task 1).
- Produces:
  - `LabRoundStore.vote(communityId, gameId, round, targetUserId, voterUserId, value): LabRoundSnapshot?`
  - `LabRoundStore.override(communityId, gameId, round, targetUserId, value): LabRoundSnapshot?`
  - `LabEntry.votes: Map<UUID, Vote>`, `.adminOverride: Boolean?`
  - `LabEntryDto.votes: List<LabVoteView>`, `.struck: Boolean`, `.adminOverride: Boolean?`
  - `LabRoundResponse.canOverride: Boolean` — **always `true`**
  - `PUT /api/lab/{slug}/{game}/plays/{userId}/vote`, `…/override`

- [ ] **Step 1: Write the failing test**

Create `LabPeerReviewTest`, modelled on `LabRoundStoreTest`/`LabServiceTest`:

```kotlin
    @Test
    fun `two flags strike a lab tip and take its points`() { /* … */ }

    @Test
    fun `a confirmation majority gives them back`() { /* … */ }

    @Test
    fun `in phase two the second fastest inherits, exactly as in a real round`() { /* … */ }

    @Test
    fun `voting on your own lab tip is refused`() { /* LabReviewNotAllowedException */ }

    @Test
    fun `a tester who has not guessed may not vote`() { /* … */ }

    @Test
    fun `everybody in the lab may set the override`() {
        // no admin check at all — assert a plain member succeeds
    }

    @Test
    fun `resetting the round forgets the votes and the overrides`() { /* … */ }

    @Test
    fun `forgetting one tester's entry forgets the votes on it`() { /* … */ }

    @Test
    fun `the response says canOverride is true`() { /* … */ }
```

Then extend `LabPointsParityTest` with the case the spec names: **a struck tip in phase two** must
pay identically in both worlds. That test is what makes „the lab shows what the game shows“ a
property rather than a promise, and re-evaluation is exactly where the two could drift.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw -q test -Dtest='LabPeerReviewTest,LabPointsParityTest'
```

Expected: compilation failure — `Unresolved reference: vote`.

- [ ] **Step 3: Write the implementation**

In `LabRoundStore`, add two fields to the private `Round` class, right beside `openedAt` — the same
shape in which the lab was given the clock, one field more and no parallel mechanism:

```kotlin
        /** Peer review: target -> voter -> value. Cleared with everything else. */
        val votes = ConcurrentHashMap<UUID, ConcurrentHashMap<UUID, Vote>>()
        /** The game master's verdict per target. In the lab everybody is the game master. */
        val overrides = ConcurrentHashMap<UUID, Boolean>()
```

Clear both in `resetRound` and clear the target's entries in `forget` — the same two places that
already forget everything else. In `forget`, also drop the votes **cast by** the forgotten tester,
not only those cast on them: they are back in front of the gate at stage 0 and have no ballot.

Extend `LabEntry` with `votes: Map<UUID, Vote>` and `adminOverride: Boolean?`, and make `rescore`
build its verdicts through the shared rule — **not** a second copy of it:

```kotlin
    private fun Round.rescore() {
        val points = pointsFor(
            award = frozen.award,
            verdicts = entries.values.map {
                Verdict(
                    id = it.userId,
                    qualifies = effectiveQualifies(
                        adminOverride = overrides[it.userId],
                        qualifies = it.qualifies,
                        // `.values` is a Collection, and `orEmpty()` has no Collection overload —
                        // `toList()` first, or this does not compile.
                        tally = VoteTally.of(votes[it.userId]?.values?.toList().orEmpty()),
                    ),
                    deviation = it.deviation,
                )
            },
        )
        // …unchanged…
    }
```

Add `vote(...)` and `override(...)`, both taking the same `synchronized(stored)` lock every other
mutator takes and both ending in `rescore()`, returning `null` when the target has no entry.

In `LabService`:

- `vote(...)` refuses `targetUserId == userId` and a voter without an entry
  (`LabReviewNotAllowedException`), and refuses a game whose
  `handle.allowsPeerReview(playing.params)` is false (`LabReviewNotOpenException` → 409).
- `override(...)` performs **no permission check at all**. That is not new mechanics, it is the
  absence of one: the lab models no roles anywhere, and its endpoints hang on the two gates, not
  on a permission.
- `respond(...)` sets `canOverride = true` and fills each `LabEntryDto`'s `votes`/`struck`/
  `adminOverride` from the store, using the same `effectiveQualifies` call.

In `LabDtos`, add `data class LabVoteView(val userId: UUID, val username: String, val value: Vote)`
and the three fields on `LabEntryDto` plus `canOverride` on `LabRoundResponse` — **the same field
names the product's DTOs use**, so both worlds satisfy `GameEntry` structurally and the component
never learns which one it renders for.

In `LabController`, add the two `PUT` twins in the shape of the existing actions (seed and phase as
`@RequestParam`, `@PathVariable userId`), and add the two new exceptions to `LabExceptionHandler`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw -q test -Dtest='LabPeerReviewTest,LabPointsParityTest,LabServiceTest,LabRoundStoreTest,LabControllerTest,LabDisabledTest'
```

Expected: PASS. `LabDisabledTest` proves the new endpoints are 404 rather than 403 when the lab is
off — extend it if it enumerates paths.

- [ ] **Step 5: Run the whole backend suite and commit**

```bash
cd core && ./mvnw -q test
```

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab && git commit -m "Let the lab exercise peer review

The lab is where this game's UI gets looked at by hand, review included,
so it gets the extension rather than an exemption. Two fields beside
openedAt, cleared in the two places that already forget everything else
— the same shape in which the lab was once given the clock.

The rule is not copied: both worlds call effectiveQualifies. A lab-local
second version would be exactly the parallel abstraction that was
deleted from here once already.

In the lab everybody is the game master. That is not new mechanics but a
missing check: the lab models no roles anywhere, and its endpoints hang
on the two gates.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Frontend — the wire types, the API clients, and one contract for every game

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/api/rounds.ts`
- Modify: `webapp-vue/src/games/GameEntry.ts`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Modify: `webapp-vue/src/gamelab/api.ts`
- Modify: `webapp-vue/src/games/guesshue/GuessHueGame.vue`
- Modify: `webapp-vue/src/games/songsnippet/SongSnippetGame.vue`
- Modify: `webapp-vue/src/games/findpattern/FindPatternGame.vue`
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Test: `webapp-vue/src/games/__tests__/GameEntry.spec.ts`

**Interfaces:**
- Produces:
  - `type Vote = 'CONFIRM' | 'FLAG'`
  - `interface VoteView { userId: string; username: string; value: Vote }`
  - `OtherPlayDto.votes: VoteView[]`, `.struck: boolean`, `.adminOverride: boolean | null`
  - `RoundResponse.canOverride: boolean`
  - `GameEntry.votes: VoteView[]`, `.struck: boolean`, `.adminOverride: boolean | null`
  - `castVote(slug, roundNumber, userId, value: Vote | null): Promise<RoundResponse>`
  - `setAdminOverride(slug, roundNumber, userId, value: boolean | null): Promise<RoundResponse>`
  - `castLabVote(slug, game, seed, phase, userId, value)`, `setLabOverride(…)`
  - every game component accepts `canOverride?: boolean`

**The `GameEntry` rule holds:** a field may be added only when *every* world already carries it.
Tasks 5 and 10 made both worlds carry these three, so the rule is satisfied — that is why those
tasks come first.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/__tests__/GameEntry.spec.ts`, a pure type-shape test in the style of
`webapp-vue/src/games/findpattern/__tests__/types.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import type { LabEntryDto } from '@/gamelab/types'
import type { MyPlayDto, OtherPlayDto } from '@/api/types'

/**
 * The point of `GameEntry` is that no world has to map into it. These assignments are the test:
 * if any of the three wire types stops satisfying it structurally, this file stops compiling.
 */
describe('GameEntry', () => {
  it('is satisfied by all three wire types, review fields included', () => {
    const mine: MyPlayDto = {
      userId: 'u', username: 'A', avatar: { shortName: 'A', bgColorHex: '#000' },
      stage: 0, guess: null, outcome: null, points: 1, durationMs: null,
      revealedAt: '2026-08-29T10:00:00Z', guessedAt: '2026-08-29T10:01:00Z',
      votes: [{ userId: 'v', username: 'B', value: 'FLAG' }],
      struck: false, adminOverride: null,
    }
    const other: OtherPlayDto = { ...mine } as OtherPlayDto
    const lab: LabEntryDto = {
      userId: 'u', username: 'A', avatar: { shortName: 'A', bgColorHex: '#000' },
      guess: null, outcome: null, at: '2026-08-29T10:01:00Z', points: 1, stage: 0,
      durationMs: null, votes: [], struck: false, adminOverride: null,
    }

    const entries: GameEntry[] = [mine, other, lab]

    expect(entries).toHaveLength(3)
    expect(entries[0]?.votes[0]?.value).toBe('FLAG')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm vitest run src/games/__tests__/GameEntry.spec.ts
```

Expected: FAIL — `Object literal may only specify known properties, and 'votes' does not exist`.

- [ ] **Step 3: Write the implementation**

In `api/types.ts`:

```typescript
/** One ballot with two sides — mirrors the server's `Vote`. */
export type Vote = 'CONFIRM' | 'FLAG'

/**
 * One cast ballot, with the name attached. Nothing about the review is secret, counts or casters:
 * anonymity is what makes voting careless, and being asked why you flagged somebody is the point.
 */
export interface VoteView {
  userId: string
  username: string
  value: Vote
}
```

Add to `OtherPlayDto` (`MyPlayDto` extends it, so it inherits them):

```typescript
  /** Every vote cast on this tip, by name. Empty for a game without peer review. */
  votes: VoteView[]
  /**
   * The server's answer to „does this tip currently score nothing“, override included. Never
   * re-derived here: the rule lives on the server, and a second copy is a copy that can drift.
   */
  struck: boolean
  /** The game master's verdict, shown openly — it would otherwise be the one hidden move. */
  adminOverride: boolean | null
```

Add to `RoundResponse`:

```typescript
  /** Whether *this viewer* may set an override. Viewer-scoped, like `me` — never a round property. */
  canOverride: boolean
```

In `GameEntry.ts`, add the same three fields with the same names, and import `VoteView`.

In `api/rounds.ts`:

```typescript
/**
 * One ballot per voter and tip, so `PUT`: a second click replaces it, and `null` withdraws it.
 * The round number rides in the path because the window is „the running round or the one before“,
 * and both must be addressable.
 */
export const castVote = (slug: string, roundNumber: number, userId: string, value: Vote | null) =>
  apiFetch<RoundResponse>(
    `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/plays/${encodeURIComponent(userId)}/vote`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  )

/** The game master's verdict on one tip. `null` hands the decision back to the vote. */
export const setAdminOverride = (
  slug: string,
  roundNumber: number,
  userId: string,
  value: boolean | null,
) =>
  apiFetch<RoundResponse>(
    `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/plays/${encodeURIComponent(userId)}/override`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  )
```

In `gamelab/types.ts` and `gamelab/api.ts`, add the mirrors: the same three fields on
`LabEntryDto`, `canOverride: boolean` on `LabRoundResponse`, and `castLabVote`/`setLabOverride`
built with the existing `labUrl` helper (`/plays/${userId}/vote`, `/plays/${userId}/override`).

In `RoundCard.vue`, pass it through on the `<component :is>`:

```vue
        :can-override="round?.canOverride ?? false"
```

In each of the three existing game components, add the prop so the contract stays one shape — the
same reason `FindPatternGame` already declares `skip` and `giveUp` it never emits:

```typescript
  /** Declared, never used here: the contract is the same shape for every game the card renders. */
  canOverride?: boolean
```

- [ ] **Step 4: Run the tests and the type check**

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: PASS. Existing specs that construct `MyPlayDto`/`OtherPlayDto`/`LabEntryDto` literals
will fail to compile until they carry the three new fields — add them there too, as
`votes: []`, `struck: false`, `adminOverride: null`.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src && git commit -m "Carry the peer review to the client

Both worlds already send the same three fields, which is what lets them
be added to GameEntry at all: a field only one world has is how a game
would start depending on the lab.

canOverride is viewer-scoped, not a round property — the same shape
mineUserId and awardRule already have. Every game declares it so the
component contract stays one shape, even where it is never read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Frontend — the board

**Files:**
- Create: `webapp-vue/src/games/spotobject/types.ts`
- Create: `webapp-vue/src/games/spotobject/useStreetView.ts`
- Create: `webapp-vue/src/games/spotobject/SpotObjectBoard.vue`
- Create: `webapp-vue/src/games/spotobject/__tests__/types.spec.ts`
- Create: `webapp-vue/src/games/spotobject/__tests__/SpotObjectBoard.spec.ts`

**Interfaces:**
- Consumes: `apiFetch` (for `/api/spot-object/config`).
- Produces:
  - `interface SpotObjectPayload { term: string }`, `isSpotObjectPayload(value): value is …`
  - `interface SpotObjectTip { panoId: string; heading: number; pitch: number; zoom: number }`,
    `asSpotObjectTip(value): SpotObjectTip | null`
  - `interface SpotObjectOutcome { country: string | null }`, `asSpotObjectOutcome(value)`
  - `shotUrl(tip, width, height): string` → `/api/spot-object/shot?…`
  - `googleUrl(tip): string` → `https://www.google.com/maps/@?api=1&map_action=pano&…`
  - `flagOf(country: string | null): string` (regional-indicator emoji, `''` for null)
  - `useStreetView()` → `{ ready, error, mount(el), pano, toWorldMap() }`
  - `SpotObjectBoard.vue` — props `{ payload, disabled }`, emit `guess: [SpotObjectTip]`

**Layout rules, from the prototype (the final polish is a deliberate manual pass at the end of the
MR; this is the starting point, not the finish):**

- The map runs to **all four edges** of the round surface. Our own information sits on top as an
  overlay — the term top left, the actions at the bottom. No fullscreen mode.
- **Width** stays capped like everywhere (`max-w-xl`, and `round-bleed` below `sm`): a desktop
  player must not learn more at a glance than a phone player.
- **Height is free.** On a phone the board gets the whole viewport height; from `sm` it is capped.
  Searching needs area, and `aspect-square` is a placeholder measurement, not a rule.
- The entry point is the **world map**, not a random spot — saying „ich suche jetzt in Barcelona“ is
  half the appeal. `StreetViewCoverageLayer` stays on permanently (Google only draws the blue lines
  from roughly zoom 14).
- **No place search.** One may be expected to know where Barcelona is.
- A way **back to the world map** is mandatory.
- `gestureHandling: 'greedy'`, so one finger pans on a phone instead of demanding two.
- Google's attribution is never covered — keep the overlays out of the **whole bottom band**. The
  logo is fixed bottom-left in both the map and the panorama and cannot be moved or hidden, and the
  „Map data ©… / Terms“ text sits bottom-right.

- [ ] **Step 1: Write the failing tests**

`__tests__/types.spec.ts` — pure, no DOM:

```typescript
import { describe, expect, it } from 'vitest'
import { asSpotObjectTip, flagOf, googleUrl, isSpotObjectPayload, shotUrl } from '../types'

describe('spot object types', () => {
  it('accepts a well-formed payload and rejects anything else', () => {
    expect(isSpotObjectPayload({ term: 'Rosa Gartenzwerg' })).toBe(true)
    expect(isSpotObjectPayload({ term: 42 })).toBe(false)
    expect(isSpotObjectPayload(null)).toBe(false)
  })

  it('reads a tip out of an unknown guess, or answers null', () => {
    expect(asSpotObjectTip({ panoId: 'a', heading: 1, pitch: 2, zoom: 3 })).toEqual({
      panoId: 'a', heading: 1, pitch: 2, zoom: 3,
    })
    expect(asSpotObjectTip({ panoId: 'a' })).toBeNull()
    expect(asSpotObjectTip(undefined)).toBeNull()
  })

  /** Our own endpoint, never Google's: the signature is the server's business. */
  it('builds the still url against our own endpoint', () => {
    const url = shotUrl({ panoId: 'a b', heading: 12, pitch: 0, zoom: 1 }, 400, 300)

    expect(url.startsWith('/api/spot-object/shot?')).toBe(true)
    expect(url).toContain('pano=a+b')
    expect(url).toContain('fov=90')
    expect(url).not.toContain('key=')
  })

  /** Free, keyless, and it is where a reviewer is meant to move around — not on our board. */
  it('builds a Maps URL into Google’s own viewer', () => {
    expect(googleUrl({ panoId: 'a', heading: 0, pitch: 0, zoom: 1 })).toContain('map_action=pano')
  })

  it('turns a country code into a flag, and null into nothing', () => {
    expect(flagOf('ES')).toBe('🇪🇸')
    expect(flagOf(null)).toBe('')
  })
})
```

`__tests__/SpotObjectBoard.spec.ts` — mock `useStreetView` entirely (`vi.mock`), because happy-dom
has no Google Maps and the composable is where that lives:

```typescript
  it('shows the searched term', () => { /* data-test="spot-term" */ })
  it('disables „Gefunden“ until a panorama is open', () => { /* … */ })
  it('emits the tip the panorama is showing', () => { /* … */ })
  it('offers a way back to the world map while a panorama is open', () => { /* … */ })
  it('says so when the map could not be loaded', () => { /* error branch */ })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm vitest run src/games/spotobject
```

Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Write the implementation**

`types.ts` — the guards, plus:

```typescript
/** Street View's zoom is a scale; the Static API wants the field of view it corresponds to. */
const fovOf = (zoom: number): number => Math.min(Math.max(180 / 2 ** zoom, 10), 100)

/**
 * Our own endpoint, not Google's. The signature is built server-side — the signing secret must
 * never be in a bundle — so the browser asks us and follows the redirect.
 */
export function shotUrl(tip: SpotObjectTip, width: number, height: number): string {
  const query = new URLSearchParams({
    pano: tip.panoId,
    heading: String(tip.heading),
    pitch: String(tip.pitch),
    fov: String(fovOf(tip.zoom)),
    w: String(width),
    h: String(height),
  })
  return `/api/spot-object/shot?${query}`
}

/**
 * Maps URLs: free, keyless, no SKU. Moving and zooming happens on Google's side, which is both the
 * cheaper and the more correct place for it — our own view stays the frame that was submitted.
 */
export function googleUrl(tip: SpotObjectTip): string { /* api=1&map_action=pano&pano=…&heading=…&pitch=…&fov=… */ }
```

`useStreetView.ts` — owns everything Google:

```typescript
/**
 * The Maps JavaScript API, loaded once per document and shared.
 *
 * The one rule that must not be broken here: **never construct a `StreetViewPanorama`.** The map's
 * own default panorama (`map.getStreetView()`) costs nothing — measured — while every constructed
 * panorama object is a billed Dynamic Street View event. Walking around is the whole game, so the
 * difference is not marginal.
 *
 * The key comes from `/api/spot-object/config` rather than from a build-time variable: the SPA
 * bundle is identical on staging and production, so the bundle cannot know its environment — the
 * server does.
 */
```

It exposes `mount(element)` which creates the map (`center: {lat: 20, lng: 0}, zoom: 2`,
`gestureHandling: 'greedy'`, `streetViewControl: true`, `mapTypeControl: false`,
`fullscreenControl: false`), attaches a `StreetViewCoverageLayer`, takes `map.getStreetView()` and
sets `addressControl: false, showRoadLabels: false, panControl: false, enableCloseButton: false,
fullscreenControl: false`. It listens to `visible_changed` and `pano_changed` and publishes a
reactive `{ visible, panoId, heading, pitch, zoom }`. `toWorldMap()` is `pano.setVisible(false)`.

Note in the file: `sources: [StreetViewSource.OUTDOOR]` is set but **the Pegman control ignores
it** — measured and accepted. Whoever lands on a single photo goes back to the world map.

`SpotObjectBoard.vue` — the map fills a `relative` stage; two absolutely positioned HUD rows
(`pointer-events-none` on the row, `pointer-events-auto` on the controls) carry the term pill at
the top and „Zur Weltkarte“ / „Gefunden“ at the bottom. `env(safe-area-inset-bottom)` on the lower
row. Height: `h-[100dvh] sm:h-[min(100dvh-6rem,40rem)]`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm vitest run src/games/spotobject && pnpm exec vue-tsc -b
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/spotobject && git commit -m "Add the Weltanschauung board

The world map is the entry point, not a random drop: saying „ich suche
jetzt in Barcelona“ is half the appeal, and the coverage layer shows
where there is anything to walk in at all.

Everything Google lives in one composable, including the rule that must
not be broken: never construct a StreetViewPanorama. The map's own
default panorama was measured to cost nothing, and a constructed one is
a billed event per instance.

The map runs to every edge and our own information floats over it. Width
stays capped like everywhere; height does not, because searching needs
area.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Frontend — the tip grid, the scoreboard, the reveal

**Files:**
- Create: `webapp-vue/src/games/spotobject/tips.ts`
- Create: `webapp-vue/src/games/spotobject/SpotObjectTipGrid.vue`
- Create: `webapp-vue/src/games/spotobject/SpotObjectScoreboard.vue`
- Create: `webapp-vue/src/games/spotobject/SpotObjectReveal.vue`
- Create: `webapp-vue/src/games/spotobject/SpotObjectGame.vue`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Tests: `__tests__/tips.spec.ts`, `__tests__/SpotObjectTipGrid.spec.ts`,
  `__tests__/SpotObjectScoreboard.spec.ts`, `__tests__/SpotObjectGame.spec.ts`

**Three components, not two.** `SpotObjectReveal.vue` composes and stacks, exactly as
`FindPatternReveal.vue` does:

1. `SpotObjectTipGrid.vue` — new, and explicitly **not part of the scoreboard**.
2. `SpotObjectScoreboard.vue` — isolated, in the same form as every other game's, beside
   `FindPatternScoreboard.vue`.

The separation is the point: the grid is this game's review surface, the scoreboard is the scoring
display all games share. Folded into one, this scoreboard would be the only one in the collection
that no longer looks like the others.

**Interfaces:**
- Consumes: `GameEntry`, `AwardRule`, `isProvisional`, `formatDuration`-style helpers,
  `shotUrl`/`googleUrl`/`flagOf`/`asSpotObjectTip`/`asSpotObjectOutcome` (Task 12),
  `tickOfRow` from `@/games/revealChoreography`.
- Produces:
  - `interface TipTile { userId; name; colorHex; ink; tip: SpotObjectTip | null; country: string | null; flag: string; confirms: VoteView[]; flags: VoteView[]; struck: boolean; adminOverride: boolean | null; mine: boolean; tick: number }`
  - `tipTiles({ entries, mineUserId }): TipTile[]`
  - `interface ScoreRow { … }` and `scoreRows({ entries, awardRule, mineUserId }): ScoreRow[]`
    — model on `findpattern/scoreboard.ts`, which is the shape a test can assert on
  - `SpotObjectTipGrid.vue` — props `{ tiles, tipPath: (userId: string) => RouteLocationRaw }`
    (`RouteLocationRaw` from `vue-router`, the same type Task 14's route builder produces — one
    type through grid, game component and card, so no layer stringifies and another parses)
  - `SpotObjectScoreboard.vue` — props `{ rows, live, animate }`
  - `SpotObjectReveal.vue` — props `{ tiles, rows, live, animate, tipPath }`
  - `SpotObjectGame.vue` — the standard game props plus `tipPath`, emits `guess`

**Grid rules, from the prototype:**

- **Two columns at every width**, on the narrowest phone included: the quick overview of every tip
  is what the grid is for.
- Per tile: the still image, the country flag, the name, the votes **with names**, a link into
  Google. A struck tip is recognisable as struck.
- The whole tile is the tap target for opening the single-tip page. The Google link inside it is a
  real `<a>`, so the tile itself must be a `div` with a click handler — an `<a>` inside an `<a>`
  is invalid HTML, and that is exactly the bug the prototype hit.
- The tile image is `loading="lazy"`; the frame holds `aspect-[4/3]` so the grid does not jump as
  images land.

- [ ] **Step 1: Write the failing tests**

`__tests__/tips.spec.ts`:

```typescript
  it('splits votes into confirmations and flags, keeping the names', () => { /* … */ })
  it('marks the viewer’s own tile', () => { /* … */ })
  it('carries the struck state the server sent, and never recomputes it', () => {
    // an entry with struck: true and no votes at all must still come out struck
  })
  it('turns the outcome’s country into a flag, and a missing one into nothing', () => { /* … */ })
  it('answers a null tip for a row that gave up', () => { /* guess: null */ })
```

`__tests__/SpotObjectTipGrid.spec.ts`:

```typescript
  it('renders one tile per tip in two columns', () => { /* data-test="tip-tile" */ })
  it('names everybody who voted, on both sides', () => { /* … */ })
  it('marks a struck tile', () => { /* data-test="tip-struck" */ })
  it('says when the game master lifted a tip', () => { /* „vom Spielleiter aufgehoben“ */ })
  it('links into Google without nesting it inside the tile link', () => {
    expect(wrapper.findAll('a a')).toHaveLength(0)
  })
```

`__tests__/SpotObjectScoreboard.spec.ts` — mirror `FindPatternScoreboard.spec.ts` including its
`vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })` setup.

`__tests__/SpotObjectGame.spec.ts`:

```typescript
  it('shows the board while there is no entry of one’s own', () => { /* … */ })
  it('switches to the reveal once the viewer has played', () => { /* … */ })
  it('emits the tip the board produced', () => { /* … */ })
  it('says so for a payload it cannot read', () => { /* the shared „lässt sich hier nicht anzeigen“ */ })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm vitest run src/games/spotobject
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementation**

`tips.ts` is pure — everything a test can assert lives here, and the components have nothing left
to get wrong. `struck` is **copied from the entry**, never recomputed: the rule lives on the
server, and a client-side second copy is a copy that can drift.

`SpotObjectGame.vue` decides the face. Unlike Musterung it cannot key on `solution` — this game has
none. It switches on **the viewer having an entry with a guess**, which is the same condition the
server uses to open `others`:

```typescript
/**
 * Which face. There is no solution to watch for — this game has none — so the switch is the
 * viewer's own finished entry, which is exactly the condition the server gates `others` on.
 */
const mine = computed(() => props.entries.find((entry) => entry.userId === props.mineUserId) ?? null)
const played = computed(() => mine.value !== null && mine.value.guess !== null)
```

`hasRevealedLive` follows `FindPatternGame`'s pattern verbatim — a `watch` without `immediate`, so
a reload mounts already-played and starts `false` instead of replaying the choreography.

`SpotObjectReveal.vue` is two children in a `flex flex-col gap-6`, grid above scoreboard.

Register in `games/registry.ts`:

```typescript
  'spot-object': SpotObjectGame,
```

and in `gamelab/games.ts`'s `labGameList`:

```typescript
  { id: 'spot-object', title: 'Weltanschauung' },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src && git commit -m "Add the Weltanschauung reveal, grid and scoreboard

Three components, not two. The grid is this game's review surface; the
scoreboard is the scoring display every game shares, and folding them
together would make this the one scoreboard that no longer looks like
the others.

Two columns at every width, because the quick overview of every tip is
what the grid is for. The tile is a div rather than a link: it already
contains the link into Google, and nesting anchors is invalid HTML.

struck is copied from the response, never recomputed here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Frontend — the single-tip page in the product

**Files:**
- Create: `webapp-vue/src/games/spotobject/TipDetail.vue`
- Create: `webapp-vue/src/games/spotobject/__tests__/TipDetail.spec.ts`
- Create: `webapp-vue/src/pages/c/[slug]/rounds/[roundNumber]/tips/[userId].vue`
- Create: `webapp-vue/src/pages/c/[slug]/rounds/[roundNumber]/tips/__tests__/userId.spec.ts`
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Modify: `webapp-vue/src/rounds/RoundCard.vue` *(the `tipPath` prop, passed down beside `assetUrl`)*
- Modify: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`
- Modify: `webapp-vue/typed-router.d.ts` *(regenerated by the plugin; commit the result)*

**Its own route, not a modal.** The reason is the back button: with its own URL it closes the tip,
and that is the one thing a modal cannot give. Same measurements as the board, with a fat close
icon.

**Confirm and flag sit side by side, half each, same size and same font weight** — only the colour
tells them apart. Neither direction is suggested by the layout.

**Check the route against `.claude/guidelines/frontend-routing.md` before creating it.** Two things
it demands: the page sits under the `[slug]` shell, so it reads `useCommunityContext()` rather than
the router for the slug; and for its own two params it uses the typed
`useRoute('/c/[slug]/rounds/[roundNumber]/tips/[userId]')` overload, because plain `useRoute()`
returns a union of every route and fails under `strict` + `vue-tsc`.

**Interfaces:**
- Consumes: `getCurrentRound`, `getRound`, `castVote`, `setAdminOverride`, `useAction`,
  `useCommunityContext`, `useAuth`, `RoundSurface`, `shotUrl`, `googleUrl`, `flagOf`.
- Produces:
  - `TipDetail.vue` — props `{ tile: TipTile; term: string; canVote: boolean; canOverride: boolean; myVote: Vote | null; busy: boolean; closeTo: RouteLocationRaw }`, emits `vote: [Vote | null]`, `override: [boolean | null]`
  - route `/c/:slug/rounds/:roundNumber/tips/:userId`

- [ ] **Step 1: Write the failing tests**

`TipDetail.spec.ts`:

```typescript
  it('gives confirm and flag the same weight', () => {
    // both buttons carry the same size/weight classes; only the colour class differs
  })
  it('emits the vote, and emits null when the held vote is clicked again', () => { /* … */ })
  it('hides both buttons for the viewer’s own tip', () => { /* canVote false */ })
  it('shows the override only when the viewer may set it', () => { /* canOverride */ })
  it('shows a big close control that leads back', () => { /* data-test="tip-close" */ })
  it('links into Google’s own viewer', () => { /* moving around happens there, not here */ })
```

`pages/.../__tests__/userId.spec.ts` — mock `@/communities/context` the way every other page spec
does, mock `@/api/rounds`, and assert:

```typescript
  it('loads the running round when the number matches it', () => { /* getCurrentRound only */ })
  it('loads a past round otherwise', () => { /* then getRound */ })
  it('says so when the tip is not in the round', () => { /* … */ })
  it('sends the vote and redraws from the response', () => { /* … */ })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm vitest run src/games/spotobject src/pages/c
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementation**

`TipDetail.vue` — a `RoundSurface` with the same stage measurements as the board, the still image
filling it, the close control as a round 2.75rem button top right, and the two vote buttons in a
`flex gap-2` with `flex-1 basis-0` each:

```vue
      <!-- Half each, same height, same font weight: only the colour separates them. Nothing about
           the layout may suggest one direction over the other. -->
      <div class="flex gap-2">
        <button data-test="tip-confirm" class="h-11 flex-1 basis-0 rounded-md font-semibold …">
          Bestätigen
        </button>
        <button data-test="tip-flag" class="h-11 flex-1 basis-0 rounded-md font-semibold …">
          Flaggen
        </button>
      </div>
```

Below them, the cast votes by name, and — only when `canOverride` — the game master's control with
its three states („Wertung überlassen“ / „Zählen lassen“ / „Streichen“).

The page itself:

```typescript
/**
 * One tip, on its own URL.
 *
 * A route rather than a modal, for the back button: with its own URL the phone's back gesture
 * closes the tip, and that is the one thing a modal cannot give.
 */
const route = useRoute('/c/[slug]/rounds/[roundNumber]/tips/[userId]')
const { community } = useCommunityContext()

const roundNumber = computed(() => Number(route.params.roundNumber))
const targetUserId = computed(() => String(route.params.userId))

/**
 * The running round answers under `/current`; anything older has its own number. Asking `/current`
 * first is one request in the common case and two in the rare one, and it avoids having to know
 * which is which before asking.
 */
async function load(): Promise<void> {
  const current = await getCurrentRound(community.value.slug)
  round.value =
    current.round?.number === roundNumber.value
      ? current
      : await getRound(community.value.slug, roundNumber.value)
}
```

Voting replaces `round.value` with the response — the server already sends the whole round back, so
nothing is derived locally.

In `pages/c/[slug]/index.vue`, hand `RoundCard` the path builder so the grid's tiles know where to
link. Give `RoundCard` a `tipPath?: (userId: string) => RouteLocationRaw` prop and pass it down to
the game component beside `assetUrl`.

- [ ] **Step 4: Run the tests, the type check and the router**

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: PASS. `typed-router.d.ts` is regenerated on the first `vite`/`vitest` run — commit it.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src webapp-vue/typed-router.d.ts && git commit -m "Add the single-tip page

Its own route rather than a modal, and the reason is the back button:
with a URL of its own, the phone's back gesture closes the tip. A modal
cannot give that.

Confirm and flag are the same size and the same weight, half the width
each — only the colour separates them, so nothing about the layout
suggests one direction. Moving around and zooming happen in Google's own
viewer behind a free Maps URL, not on a surface of ours.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: Frontend — the lab's own tip route

**Files:**
- Move: `webapp-vue/src/pages/c/[slug]/lab/[game].vue` → `webapp-vue/src/pages/c/[slug]/lab/[game]/index.vue`
- Create: `webapp-vue/src/pages/c/[slug]/lab/[game]/tips/[userId].vue`
- Create: `webapp-vue/src/pages/c/[slug]/lab/[game]/tips/__tests__/userId.spec.ts`
- Modify: `webapp-vue/typed-router.d.ts` *(regenerated; commit it)*
- Modify: any spec or link that names the old route

The single-tip page is the same component in the lab, on a route of its own — which is the only way
the back behaviour that motivated the route is testable at all.

**The move renames the route.** `pages/c/[slug]/lab/[game].vue` is `'/c/[slug]/lab/[game]'`;
`pages/c/[slug]/lab/[game]/index.vue` becomes `'/c/[slug]/lab/[game]/'` — with the trailing slash,
the same way `'/c/[slug]/lab/'` already reads. Every `useRoute('/c/[slug]/lab/[game]')` must be
updated, and `git mv` keeps the file's history.

**In the lab everybody is the game master.** `canOverride` arrives as `true` from the server
(Task 10), so the page needs no switch of its own and `LabControls.vue` is not touched. This is not
new mechanics but a missing check — the lab models no roles anywhere.

- [ ] **Step 1: Write the failing test**

`pages/c/[slug]/lab/[game]/tips/__tests__/userId.spec.ts`, modelled on the product page's spec:

```typescript
  it('opens a lab tip from the seeded round', () => { /* openLabRound with seed + phase */ })
  it('lets anybody set the override, because canOverride is true', () => { /* … */ })
  it('sends the vote through the lab endpoint', () => { /* castLabVote */ })
  it('carries seed and phase back to the round on close', () => {
    // the close control returns to /c/:slug/lab/:game?seed=…&phase=… — the round key is the URL
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd webapp-vue && pnpm vitest run src/pages/c
```

Expected: FAIL — module not found.

- [ ] **Step 3: Do the move and write the page**

```bash
cd webapp-vue && mkdir -p "src/pages/c/[slug]/lab/[game]" && git mv "src/pages/c/[slug]/lab/[game].vue" "src/pages/c/[slug]/lab/[game]/index.vue"
```

Then update the route name inside it and anywhere else it is referenced:

```bash
cd webapp-vue && grep -rn "c/\[slug\]/lab/\[game\]'" src | cat
```

The new page mounts the same `TipDetail.vue`, sourcing the round from `openLabRound` and voting
through `castLabVote` / `setLabOverride`. Seed and phase ride in its query, because they are the
lab's round key — a tip page without them could not say which round it belongs to.

- [ ] **Step 4: Run the full frontend suite**

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A webapp-vue && git commit -m "Give the lab its own single-tip route

The same component on a route of its own, which is the only way the back
behaviour that motivated the route is testable at all. Seed and phase
ride in the query because they are the lab's round key.

No switch in LabControls: canOverride already arrives true, so in the
lab everybody is the game master — the absence of a check rather than a
second mechanism.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 16: The terms paragraph the map obliges us to write

**Files:**
- Create: `webapp-vue/src/pages/legal.vue`
- Create: `webapp-vue/src/pages/__tests__/legal.spec.ts`
- Modify: `webapp-vue/src/nav/NavDrawer.vue`
- Modify: `webapp-vue/typed-router.d.ts` *(regenerated; commit it)*

Google's terms require that an application using their maps binds its own users to Google's terms
of service and points at Google's privacy policy. The spec lists this among the build rules and
says it plainly: „Ein Absatz, gehört zum Feature.“ This repository has no legal page at all today,
so the paragraph needs somewhere to stand.

**The wording is the user's to approve.** Write the two required paragraphs plainly and in German,
using `„…“`, and say in the handover that the text wants a read before it ships. Do not invent a
company, an address, or claims about data we do not actually process.

**Interfaces:**
- Produces: route `/legal`, linked from the drawer's foot block.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Legal from '@/pages/legal.vue'

describe('legal', () => {
  it('binds the reader to Google’s terms of service', () => {
    const wrapper = mount(Legal)

    expect(wrapper.html()).toContain('https://policies.google.com/terms')
  })

  it('points at Google’s privacy policy', () => {
    expect(mount(Legal).html()).toContain('https://policies.google.com/privacy')
  })

  it('opens both links away from the app', () => {
    const links = mount(Legal).findAll('a[href^="https://policies.google.com"]')

    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toContain('noopener')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd webapp-vue && pnpm vitest run src/pages/__tests__/legal.spec.ts
```

Expected: FAIL — `Cannot find module '@/pages/legal.vue'`.

- [ ] **Step 3: Write the page and link it**

A plain page inside the app's normal content column, two short sections: one binding the reader to
Google's terms as a condition of using the map, one naming Google as a recipient of map requests
and linking their privacy policy.

Link it from `NavDrawer.vue`'s foot block, beside whatever already stands there — the drawer sits
above every route in `App.vue`, so a link there is reachable by construction rather than by
convention, which is the rule `frontend-routing.md` states for controls that must exist everywhere.

- [ ] **Step 4: Run the tests**

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src webapp-vue/typed-router.d.ts && git commit -m "Add the legal page the map obliges us to write

Using Google's maps means binding our own users to Google's terms and
pointing at their privacy policy. There was no page to put that on, so
this is the page. Linked from the drawer, which sits above every route,
so it is reachable by construction rather than by convention.

The wording wants a read before it ships.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 17: Deployment, secrets and the operator's README

**Files:**
- Modify: `core/src/main/resources/application-production.yaml`
- Modify: `core/src/main/resources/application-staging.yaml`
- Modify: `compose.yaml` and the staging compose file
- Modify: `scripts/` — add the sops helper beside `guess-hue-dataset.sh`
- Modify: `update.sh`
- Modify: `.claude/launch.json`
- Modify: `core/README.md`, and the deployment guidelines if the shape changed
- Modify: `.gitignore` — the `.local/` term-list buffer, if not already covered

Read `.claude/guidelines/deployment.md`, `deployment-server.md` and `game-content.md` first, and
follow the Guess Hue dataset's path end to end: it is the same problem with the same solution.

- [ ] **Step 1: Mirror the Guess Hue dataset's handling**

```bash
grep -rn "GUESS_HUE_DATASET" --include='*.yaml' --include='*.yml' --include='*.sh' --include='*.json' . | cat
```

Every hit is a place `SPOT_OBJECT_TERMS_PATH` needs a sibling: the compose mount, `update.sh`'s
decrypt step, the production/staging profiles, and `.claude/launch.json`'s local `dev-path` (which
answers empty on a machine without the age key, so the sample loads and the app still runs).

- [ ] **Step 2: Add the two new secrets**

`SPOT_OBJECT_MAPS_API_KEY` and `SPOT_OBJECT_SIGNING_SECRET` are ordinary deployment secrets, not
game content — they follow whatever `GITHUB_CLIENT_SECRET` already does on the server. In
`application-production.yaml` and `application-staging.yaml` they get **no default**, so a missing
one fails the boot fast rather than shipping a board that cannot draw a map.

- [ ] **Step 3: Write the operator's note**

In `core/README.md`, one short section: which three variables exist, what happens without each
(no terms → sample, refused in production/staging; no map key → the board cannot load; no signing
secret → unsigned still URLs, which Google will refuse), and how the term list is handed over
(`.local/` in the **main checkout**, never a worktree → `sops -e` → commit the ciphertext).

**Do not put a single real term anywhere in these files, in a commit message, or in a PR body.**

- [ ] **Step 4: Verify**

```bash
cd core && ./mvnw -q test
```

```bash
cd webapp-vue && pnpm vitest run && pnpm exec vue-tsc -b && pnpm lint
```

Expected: both green. Then start the app locally (`cd core && ./mvnw spring-boot:run` plus
`cd webapp-vue && pnpm dev`), open the lab at
`/c/<slug>/lab/spot-object?seed=1&phase=ONE`, and play one round: drop the Pegman, submit, open a
tip, flag it from a second account through the test-login picker, and watch the points move.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Wire the Weltanschauung secrets into the deployment

The term list travels the same path the Guess Hue dataset does: sops on
the way in, a plain file mounted by compose, no crypto in Kotlin and no
key in CI. The map key and the signing secret are ordinary deployment
secrets with no default, so a missing one fails the boot instead of
shipping a board that cannot draw a map.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Closing the MR

Two things the spec puts here on purpose, and neither is optional:

1. **The layout pass.** The frontend built above is the prototype's rough direction, not the
   finish. The final layout and design is a deliberate manual step at the end of this MR.
2. **Feed the knowledge back.** Per
   [`.claude/guidelines/feeding-knowledge-back.md`](../../../.claude/guidelines/feeding-knowledge-back.md),
   whatever turned out to be a transferable rule belongs in `.claude/guidelines/` — the peer-review
   shape in `game-rounds.md`, and anything learned about the Maps billing boundary wherever it
   fits. Post-mortems and measurements stay in the commit message.

Also, once and by hand: **delete the throwaway API key** used for the prototype
(`/tmp/streetview-probe/*` and the chat log) from Google Cloud → Keys & Credentials. It was never
in the repository, and it must not outlive the prototype.
