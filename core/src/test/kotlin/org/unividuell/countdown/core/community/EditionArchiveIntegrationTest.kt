package org.unividuell.countdown.core.community

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionArchiver
import org.unividuell.countdown.core.community.internal.EditionDraft
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class EditionArchiveIntegrationTest(
    @Autowired val archiver: EditionArchiver,
    @Autowired val editionService: EditionService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val communities: CommunityService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val mapper: ObjectMapper,
) {
    private val at = Instant.parse("2026-08-12T10:00:00Z")

    private fun aUser(name: String): UUID = requireNotNull(
        users.save(User(subject = System.nanoTime().toString(), githubLogin = name, displayName = name)).id,
    )

    /** A community with a run; the creator is not [player], since `created_by` is `ON DELETE RESTRICT`. */
    private fun aRunWith(player: UUID): CommunityEdition {
        val community = communities.create(creatorUserId = aUser("owner"), rawName = "Archive ${System.nanoTime()}")
        val communityId = requireNotNull(community.id)
        members.save(CommunityMember(communityId = communityId, userId = player, status = MemberStatus.ACTIVE))
        return editions.save(
            anEdition(communityId = communityId, targetAt = Instant.parse("2099-01-01T10:00:00Z"), gamesFromRound = -36500),
        )
    }

    private fun scored(edition: CommunityEdition, user: UUID, points: Int) {
        val round = store.announce(
            edition = edition, roundNumber = -30000, gameType = "guess-hue",
            params = mapper.readTree("""{"hue":1.0}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = at,
        )
        val roundId = requireNotNull(round.id)
        plays.revealOrCount(roundGameId = roundId, userId = user, revealedAt = at)
        val play = requireNotNull(plays.findByRoundGameIdAndUserId(roundGameId = roundId, userId = user))
        plays.save(play.copy(points = points))
    }

    @Test
    fun `archive keeps standings when a player is deleted afterwards`() {
        val fry = aUser("Fry")
        val edition = aRunWith(fry)
        scored(edition = edition, user = fry, points = 5)

        archiver.archive(edition.communityId)
        users.deleteById(fry)

        val table = editions.findById(requireNotNull(edition.id)).get().finalStandings.shouldNotBeNull()
        val row = (0 until table.size()).map { table.get(it) }.single { it.get("name").asString() == "Fry" }
        row.get("points").asInt() shouldBe 5
        row.get("rank").asInt() shouldBe 1
    }

    @Test
    fun `a new edition can be created after archiving`() {
        val edition = aRunWith(aUser("Leela"))

        archiver.archive(edition.communityId)

        editionService.create(
            communityId = edition.communityId,
            draft = EditionDraft(
                label = "Run 2100",
                targetAt = Instant.parse("2100-01-01T10:00:00Z"),
                targetTimezone = "Europe/Berlin",
                phaseTwoStartRound = null,
                gamesFromRound = -30,
            ),
        ).archivedAt shouldBe null
    }
}
