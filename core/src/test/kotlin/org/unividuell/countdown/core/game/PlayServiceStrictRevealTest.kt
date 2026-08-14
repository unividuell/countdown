package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AlreadyRevealedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.JsonNode
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The `true` branch of [org.unividuell.countdown.core.game.GameType.requiresReveal] has no real game
 * to exercise it: Guess Hue answers `false` in both phases (see [GuessHueGameTypeTest]). This test
 * adds a fake [GameType] via [StrictRevealGame] so "exactly once" has something to run against.
 *
 * A **separate** Spring context from [PlayServiceTest] on purpose: adding this second game to the
 * catalogue changes what [org.unividuell.countdown.core.game.internal.GameSelection] has to choose
 * from, and a freshly materialised community here would risk a coin flip between "guess-hue" and
 * "strict-reveal" for every other test that happens to share the context. Sidestepped twice over —
 * this file's own round is written straight into the row via [RoundGameStore.announce], never through
 * selection, and the fake bean lives only in this file's `@Import`, not in [PlayServiceTest]'s.
 */
@Import(TestcontainersConfiguration::class, PlayServiceStrictRevealTest.StrictRevealGame::class)
@SpringBootTest
@Transactional
class PlayServiceStrictRevealTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class StrictRevealGame {
        data class StrictParams(val label: String)
        data class StrictPayload(val label: String) : GamePayload

        /** A game that insists on a deliberate reveal, so the "exactly once" rule has an exerciser. */
        @Bean
        fun strictGame(): GameType<StrictParams> = object : GameType<StrictParams> {
            override val id = "strict-reveal"
            override val displayName = "Streng"
            override val paramsType = StrictParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = StrictParams(label = "x")
            override fun present(params: StrictParams) = StrictPayload(label = params.label)
            override fun judge(params: StrictParams, guess: JsonNode) =
                Judgement(qualifies = true, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: StrictParams) = true
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    @Test
    fun `a game that asks for a deliberate reveal is revealed exactly once`() {
        val (community, viewer) = aCommunity("Strict Reveal")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        // Written straight to the row: the selection must not decide which game this test gets.
        store.announce(
            edition = edition, roundNumber = currentRoundNumberOf(community),
            gameType = "strict-reveal", params = mapper.readTree("""{"label":"x"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )

        val res = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        res.game.shouldNotBeNull().requiresReveal shouldBe true

        shouldThrow<AlreadyRevealedException> {
            play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        }
    }
}
