package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.anEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.RoundGameEditionData
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundGameEditionDataTest(
    @Autowired val gameData: RoundGameEditionData,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val jdbc: JdbcTemplate,
) {
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = "player")).id)

    /** An edition far in the future whose window covers today; rounds after 0 fall off it. */
    private fun anEditionOf(name: String): CommunityEdition {
        val community = communities.create(creatorUserId = aUser(), rawName = name)
        return editions.save(
            anEdition(
                communityId = requireNotNull(community.id),
                targetAt = Instant.parse("2099-01-01T10:00:00Z"),
                gamesFromRound = -36500,
            ),
        )
    }

    private fun currentRound(edition: CommunityEdition): Int =
        engine.roundAt(now = clock.instant(), targetAt = edition.targetAt, zone = ZoneId.of(edition.targetTimezone)).number

    private fun announce(edition: CommunityEdition, roundNumber: Int) = store.announce(
        edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
        params = mapper.readTree("""{"hue":1.0}"""),
        award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = at,
    )

    /** A round of [edition] with a scored play of [user] and one asset. Returns the round id. */
    private fun scored(edition: CommunityEdition, roundNumber: Int, user: UUID, points: Int): UUID {
        val roundId = requireNotNull(announce(edition = edition, roundNumber = roundNumber).id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        plays.save(play.copy(points = points))
        jdbc.update(
            "INSERT INTO game.round_assets (round_game_id, name, visibility, media_type, bytes) VALUES (?, 'board', 'SCENE', 'image/png', ?)",
            roundId, byteArrayOf(1, 2, 3),
        )
        return roundId
    }

    private fun countFor(table: String, roundId: UUID): Int = requireNotNull(
        jdbc.queryForObject(
            "SELECT count(*) FROM game.$table WHERE ${if (table == "round_games") "id" else "round_game_id"} = ?",
            Int::class.java, roundId,
        ),
    )

    @Test
    fun `final points sum every play inside the window, running round included`() {
        val edition = anEditionOf("Final Points")
        val player = aUser()
        val current = currentRound(edition)
        scored(edition = edition, roundNumber = current - 3, user = player, points = 4)
        scored(edition = edition, roundNumber = current - 2, user = player, points = 3)
        scored(edition = edition, roundNumber = current, user = player, points = 2)
        scored(edition = edition, roundNumber = 1, user = player, points = 9)

        gameData.finalPoints(edition = edition, userIds = listOf(player)) shouldBe mapOf(player to 9)
    }

    @Test
    fun `purge deletes the edition's rounds, plays and assets only`() {
        val gone = anEditionOf("Purged")
        val kept = anEditionOf("Kept")
        val player = aUser()
        val goneRound = scored(edition = gone, roundNumber = -5, user = player, points = 1)
        val keptRound = scored(edition = kept, roundNumber = -5, user = player, points = 1)

        gameData.purge(requireNotNull(gone.id))

        listOf("round_games", "round_plays", "round_assets").map { countFor(it, goneRound) } shouldBe listOf(0, 0, 0)
        listOf("round_games", "round_plays", "round_assets").map { countFor(it, keptRound) } shouldBe listOf(1, 1, 1)
    }

    @Test
    fun `announce refuses an archived edition`() {
        val edition = editions.save(anEditionOf("Archived").copy(archivedAt = at))

        shouldThrow<IllegalStateException> { announce(edition = edition, roundNumber = -5) }

        jdbc.queryForObject(
            "SELECT count(*) FROM game.round_games WHERE edition_id = ?", Int::class.java, edition.id,
        ) shouldBe 0
    }
}
