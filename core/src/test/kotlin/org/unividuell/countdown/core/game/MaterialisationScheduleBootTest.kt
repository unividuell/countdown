package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
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
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.MaterialisationSchedule
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The run against a real database: what it persists, what it leaves alone, and that a round
 * announced ahead stays out of reach. Calls
 * [MaterialisationSchedule.prepare] for this class's own edition, never `run()`: that walks every
 * active edition of the context, other test classes' included.
 */
@Import(
    TestcontainersConfiguration::class,
    AnnouncementMaterialisedHookTest.RecordingGame::class,
    SongSnippetTestCatalogConfiguration::class,
)
@SpringBootTest
@Transactional
class MaterialisationScheduleBootTest(
    @Autowired val schedule: MaterialisationSchedule,
    @Autowired val materialiser: RoundMaterialiser,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val history: HistoryService,
    @Autowired val plays: PlayService,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private data class Run(val community: Community, val owner: UUID, val edition: CommunityEdition)

    /** A run far in the future with an unbounded window, so every round near today carries a game. */
    private fun aRun(name: String): Run {
        val owner = requireNotNull(
            users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id,
        )
        val community = communities.create(creatorUserId = owner, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return Run(community = community, owner = owner, edition = edition)
    }

    private fun currentOf(edition: CommunityEdition): Int = engine.roundAt(
        now = clock.instant(),
        startsAt = requireNotNull(edition.startsAt),
        zone = ZoneId.of(edition.startsAtTimezone),
    ).number

    private fun aPlantedRound(edition: CommunityEdition, roundNumber: Int): RoundGame = store.announce(
        edition = edition,
        roundNumber = roundNumber,
        gameType = "recording-fake",
        params = mapper.valueToTree(AnnouncementMaterialisedHookTest.RecordingGame.RecParams(n = 7)),
        award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
        announcedAt = clock.instant(),
    )

    @Test
    fun `the running and the next round are persisted, and a second call changes neither`() {
        val edition = aRun("Schedule Persists").edition
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 2
        val running = store.find(edition = edition, roundNumber = current).shouldNotBeNull()
        val next = store.find(edition = edition, roundNumber = current - 1).shouldNotBeNull()

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 0
        store.find(edition = edition, roundNumber = current) shouldBe running
        store.find(edition = edition, roundNumber = current - 1) shouldBe next
    }

    @Test
    fun `a row written before the run is left as it was`() {
        val edition = aRun("Schedule Leaves Alone").edition
        val current = currentOf(edition)
        val planted = aPlantedRound(edition = edition, roundNumber = current - 1)

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 1

        store.find(edition = edition, roundNumber = current - 1) shouldBe planted
    }

    @Test
    fun `losing the race to the fallback returns the winner's row without an error`() {
        val edition = aRun("Schedule Loses Race").edition
        val current = currentOf(edition)
        // The run found no row, then the fallback wrote one before the run's insert.
        val winner = aPlantedRound(edition = edition, roundNumber = current)

        materialiser.materialise(edition = edition, roundNumber = current) shouldBe winner
    }

    @Test
    fun `a round announced ahead is reachable through neither the history nor the asset path`() {
        val (community, owner, edition) = aRun("Schedule Keeps Ahead Sealed")
        val current = currentOf(edition)
        schedule.prepare(edition = edition, now = clock.instant())
        val ahead = store.find(edition = edition, roundNumber = current - 1).shouldNotBeNull()

        shouldThrow<RoundNotFoundException> {
            history.pastRound(slug = community.slug, userId = owner, isSuperAdmin = false, roundNumber = current - 1)
        }
        shouldThrow<RoundNotFoundException> {
            plays.asset(
                slug = community.slug, userId = owner, isSuperAdmin = false,
                roundNumber = current - 1, roundGameId = requireNotNull(ahead.id), name = "solution",
            )
        }
    }
}
