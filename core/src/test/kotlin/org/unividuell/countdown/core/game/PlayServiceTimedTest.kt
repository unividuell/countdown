package org.unividuell.countdown.core.game

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

/**
 * The clock is the second half of „Winner Takes It All“, so it has to be provable: a timed game's
 * recorded distance must be the milliseconds between the reveal and the guess, and under
 * `CLOSEST_ONLY` the fastest correct guess must be the one that pays.
 *
 * Its own Spring context, like [PlayServiceStrictRevealTest]: the fake game and the stepping clock
 * must not leak into any other test's context.
 */
@Import(TestcontainersConfiguration::class, PlayServiceTimedTest.TimedGame::class)
@SpringBootTest
@Transactional
class PlayServiceTimedTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: TimedGame.SteppingClock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class TimedGame {
        /** A clock the test moves by hand — reveal and guess have to land on two known instants. */
        class SteppingClock(private var now: Instant) : Clock() {
            override fun instant(): Instant = now
            override fun getZone(): ZoneId = ZoneOffset.UTC
            override fun withZone(zone: ZoneId?): Clock = this
            fun advance(by: Duration) {
                now = now.plus(by)
            }
        }

        data class TimedParams(val answer: Int)
        data class TimedPayload(val prompt: String) : GamePayload

        @Bean
        @Primary
        fun steppingClock() = SteppingClock(Instant.parse("2026-08-25T10:00:00Z"))

        /** Right/wrong plus a deliberate reveal — the shape Musterung has in phase two. */
        @Bean
        fun timedGame(): GameType<TimedParams> = object : GameType<TimedParams> {
            override val id = "timed-fake"
            override val displayName = "Uhrwerk"
            override val paramsType = TimedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = TimedParams(answer = 7)
            override fun present(params: TimedParams) = TimedPayload(prompt = "?")
            override fun judge(params: TimedParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("value")?.asInt() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: TimedParams) = true
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    /**
     * A second ACTIVE member, added directly through the repository: shorter than the
     * generate-invite / accept / approve round trip and this is a fixture, not the thing under test.
     */
    private fun aMember(community: Community, login: String): UUID {
        val userId = aUser(login)
        members.save(
            CommunityMember(
                communityId = requireNotNull(community.id), userId = userId, status = MemberStatus.ACTIVE,
            ),
        )
        return userId
    }

    private fun aCommunity(name: String): Community {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community
    }

    private fun announce(community: Community, rule: AwardRule) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "timed-fake",
            params = mapper.readTree("""{"answer":7}"""),
            award = Award(rule = rule, points = 3), announcedAt = clock.instant(),
        )
    }

    private fun currentNumber(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    private fun roundGameId(community: Community): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(
            store.find(edition = edition, roundNumber = currentNumber(community))?.id,
        )
    }

    @Test
    fun `the recorded distance is the milliseconds between reveal and guess`() {
        val community = aCommunity("Timed Distance")
        announce(community = community, rule = AwardRule.ALL_QUALIFYING)
        val viewer = aMember(community, "viewer")

        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(42))
        play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = roundGameId(community), userId = viewer,
        ).shouldNotBeNull()
        row.deviation shouldBe 42_000.0
        row.qualifies shouldBe true
    }

    @Test
    fun `under closest-only the fastest correct guess takes the points`() {
        val community = aCommunity("Timed Race")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val quick = aMember(community, "quick")
        val slow = aMember(community, "slow")

        play.reveal(slug = community.slug, userId = quick, isSuperAdmin = false)
        play.reveal(slug = community.slug, userId = slow, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(5))
        play.guess(
            slug = community.slug, userId = quick, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )
        clock.advance(Duration.ofSeconds(30))
        play.guess(
            slug = community.slug, userId = slow, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        val rows = plays.findByRoundGameId(roundGameId(community)).associateBy { it.userId }
        rows[quick].shouldNotBeNull().points shouldBe 3
        rows[slow].shouldNotBeNull().points shouldBe 0
    }

    @Test
    fun `a wrong guess scores nothing however fast it was`() {
        val community = aCommunity("Timed Wrong")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val wrong = aMember(community, "wrong")

        play.reveal(slug = community.slug, userId = wrong, isSuperAdmin = false)
        clock.advance(Duration.ofMillis(200))
        play.guess(
            slug = community.slug, userId = wrong, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":1}"""),
        )

        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = roundGameId(community), userId = wrong,
        ).shouldNotBeNull()
        row.deviation shouldBe 200.0
        row.points shouldBe 0
    }

    @Test
    fun `a timed round publishes how long each finished player took`() {
        val community = aCommunity("Timed Published")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val mine = aMember(community = community, login = "mine")
        val other = aMember(community = community, login = "other")

        play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(9))
        play.guess(
            slug = community.slug, userId = other, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )
        play.reveal(slug = community.slug, userId = mine, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(4))
        val response = play.guess(
            slug = community.slug, userId = mine, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        response.me.shouldNotBeNull().durationMs shouldBe 4_000L
        response.others.single().durationMs shouldBe 9_000L
    }

    @Test
    fun `a player who has only revealed carries no duration yet`() {
        val community = aCommunity("Timed Unfinished")
        announce(community = community, rule = AwardRule.ALL_QUALIFYING)
        val viewer = aMember(community = community, login = "viewer")

        val response = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        response.me.shouldNotBeNull().durationMs shouldBe null
    }
}
