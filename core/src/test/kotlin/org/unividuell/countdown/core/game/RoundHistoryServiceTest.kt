package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundAccessDeniedException
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The history endpoint's service: which rounds it accepts, and what a closed round shows.
 *
 * [PastGame] is a fake with a real solution, announced directly through [RoundGameStore] so the
 * selection never gets to pick something else for a planted round.
 *
 * Every case here calls `pastRound`, which resolves — and therefore MATERIALISES — the running
 * round. `song-snippet` is an unconditional bean, so its draw could win that materialisation and
 * download a Deezer preview; [SongSnippetTestCatalogConfiguration] is what keeps this test off the
 * network.
 */
@Import(
    TestcontainersConfiguration::class,
    RoundHistoryServiceTest.PastGame::class,
    SongSnippetTestCatalogConfiguration::class,
)
@SpringBootTest
@Transactional
class RoundHistoryServiceTest(
    @Autowired val history: HistoryService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class PastGame {
        data class PastParams(val answer: String)
        data class PastPayload(val hint: String) : GamePayload
        data class PastSolution(val answer: String) : GameSolution

        @Bean
        fun pastGame(): GameType<PastParams> = object : GameType<PastParams> {
            override val id = "past-fake"
            override val displayName = "Vergangen"
            override val paramsType = PastParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = PastParams(answer = "42")
            override fun present(params: PastParams) = PastPayload(hint = "zwei Ziffern")
            override fun requiresReveal(params: PastParams) = false
            override fun judge(params: PastParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("answer")?.asString() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun solution(params: PastParams) = PastSolution(answer = params.answer)
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

    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId,
                status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** Plants an announced round of [gameType] at [roundNumber] and returns its id. */
    private fun announceAt(community: Community, roundNumber: Int, gameType: String = "past-fake"): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(
            store.announce(
                edition = edition, roundNumber = roundNumber, gameType = gameType,
                params = mapper.readTree("""{"answer":"42"}"""),
                award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
                announcedAt = clock.instant(),
            ).id,
        )
    }

    private fun aFinishedPlay(roundGameId: UUID, userId: UUID, answer: String) {
        plays.revealOrCount(roundGameId = roundGameId, userId = userId, revealedAt = clock.instant())
        val play = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = userId),
        )
        plays.recordGuess(
            id = requireNotNull(play.id),
            guess = mapper.readTree("""{"answer":"$answer"}"""),
            guessedAt = clock.instant(),
            qualifies = answer == "42",
            deviation = 0.0,
            outcome = null,
        )
    }

    @Test
    fun `a closed round shows its payload, its solution and every finished guess to someone who never played it`() {
        val (community, viewer) = aCommunity("History Open")
        val player = aMember(community, "player")
        val past = currentRoundNumberOf(community) + 1
        val roundGameId = announceAt(community = community, roundNumber = past)
        aFinishedPlay(roundGameId = roundGameId, userId = player, answer = "42")

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
        )

        res.round.shouldNotBeNull().number shouldBe past
        res.game.shouldNotBeNull().id shouldBe "past-fake"
        res.payload.shouldNotBeNull()
        res.solution.shouldNotBeNull()
        res.me.shouldBeNull()
        res.others shouldHaveSize 1
        res.others.first().userId shouldBe player
    }

    @Test
    fun `a revealed but never guessed row stays out of a closed round's others`() {
        val (community, viewer) = aCommunity("History Lurker")
        val lurker = aMember(community, "lurker")
        val past = currentRoundNumberOf(community) + 1
        val roundGameId = announceAt(community = community, roundNumber = past)
        plays.revealOrCount(roundGameId = roundGameId, userId = lurker, revealedAt = clock.instant())

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
        )

        // Who looked is about people, not about the round; the end of the round does not change that.
        res.others shouldHaveSize 0
    }

    @Test
    fun `the running round and anything newer is not history`() {
        val (community, viewer) = aCommunity("History Current")
        val current = currentRoundNumberOf(community)

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current,
            )
        }
        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = current - 1,
            )
        }
    }

    @Test
    fun `a round that was never announced is not history`() {
        val (community, viewer) = aCommunity("History Missing")

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = currentRoundNumberOf(community) + 5,
            )
        }
    }

    @Test
    fun `a round that fell out of the run's window is not history`() {
        val (community, viewer) = aCommunity("History Window")
        val past = currentRoundNumberOf(community) + 1
        announceAt(community = community, roundNumber = past)
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        editions.save(edition.copy(gamesFromRound = past - 1))

        shouldThrow<RoundNotFoundException> {
            history.pastRound(
                slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past,
            )
        }
    }

    @Test
    fun `previousRoundNumber chains through the history and ends at null`() {
        val (community, viewer) = aCommunity("History Chain")
        val current = currentRoundNumberOf(community)
        announceAt(community = community, roundNumber = current + 1)
        announceAt(community = community, roundNumber = current + 4)

        history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 1,
        ).previousRoundNumber shouldBe current + 4
        history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 4,
        ).previousRoundNumber.shouldBeNull()
    }

    @Test
    fun `a closed round whose game this build lacks keeps its round and its pointer`() {
        val (community, viewer) = aCommunity("History Unknown Type")
        val current = currentRoundNumberOf(community)
        announceAt(community = community, roundNumber = current + 1, gameType = "gone-away")
        announceAt(community = community, roundNumber = current + 2)

        val res = history.pastRound(
            slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = current + 1,
        )

        res.game.shouldBeNull()
        res.noGameReason shouldBe NoGameReason.NO_GAME_TYPE
        res.round.shouldNotBeNull().number shouldBe current + 1
        // The chain walks past the gap instead of ending at it.
        res.previousRoundNumber shouldBe current + 2
    }

    @Test
    fun `a non-member gets no history at all`() {
        val (community, _) = aCommunity("History Secret")
        val outsider = aUser("outsider")
        val past = currentRoundNumberOf(community) + 1
        announceAt(community = community, roundNumber = past)

        shouldThrow<RoundAccessDeniedException> {
            history.pastRound(
                slug = community.slug, userId = outsider, isSuperAdmin = false, roundNumber = past,
            )
        }
    }
}
