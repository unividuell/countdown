package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.GameSelection
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * Producing assets that fails with a *checked* exception — javazoom's MP3 decoder throws them, and
 * Kotlin lets them through undeclared — must roll the round back like any other failure. Otherwise the row
 * commits without its assets, and the fallback, finding the row, never retries.
 *
 * No test transaction: the rollback under test is the materialiser's own. Its own context, because
 * the selection here always picks the failing game.
 */
@Import(TestcontainersConfiguration::class, RoundMaterialiserRollbackTest.FailingGame::class)
@SpringBootTest
class RoundMaterialiserRollbackTest(
    @Autowired val materialiser: RoundMaterialiser,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
) {
    @TestConfiguration
    class FailingGame {
        @Bean
        @Primary
        fun alwaysTheFailingGame(): GameSelection = GameSelection { _, _, _ -> "checked-failure" }

        @Bean
        fun checkedFailureGame(): GameType<FailParams> = object : GameType<FailParams> {
            override val id = "checked-failure"
            override val displayName = "Scheiternd"
            override val paramsType = FailParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = FailParams(n = context.roundNumber)
            override fun present(params: FailParams) = FailPayload(n = params.n)
            override fun judge(params: FailParams, guess: JsonNode) =
                Judgement(qualifies = true, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: FailParams) = false
            override fun scoresOnDuration(params: FailParams) = false
            override fun produceAssets(params: FailParams): List<RoundAsset> {
                throw IOException("malformed mp3")
            }
        }

        data class FailParams(val n: Int)
        data class FailPayload(val n: Int) : GamePayload
    }

    @Test
    fun `a hook failing with a checked exception leaves no round behind`() {
        val owner = requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id)
        val community = communities.create(creatorUserId = owner, rawName = "Checked Failure")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val current = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number

        shouldThrow<IOException> { materialiser.materialise(edition = edition, roundNumber = current) }

        store.find(edition = edition, roundNumber = current).shouldBeNull()
    }
}
