package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.assertions.withClue
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.types.shouldBeInstanceOf
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.anEdition
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.EditionDraft
import org.unividuell.countdown.core.community.internal.EditionFrozenException
import org.unividuell.countdown.core.community.internal.EditionService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.countdown.internal.CountdownService
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.DifferentFromPreviousRound
import org.unividuell.countdown.core.game.internal.GameSelection
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.MaterialisationSchedule
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.ResolvedRound
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.game.internal.RoundPlayPoints
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * The round grid's behaviour pinned to calendar dates, never to round numbers.
 *
 * One run: liftoff on the 24th at 11:00 Berlin, games from the 18th to the 25th, phase two from the
 * 22nd — the window crosses the start. A round is named by the day it begins: noon of a day always
 * lies in the round that began at 11:00 that day. Every number comes out of the engine and goes back
 * through it, so this file holds whichever way the numbers run.
 *
 * ```
 *   15 16 17 │ 18 19 20 21 │ 22 23 24 25 │ 26 27      (June 2027)
 *   no game  │  phase one  │  phase two  │ no game
 *                                ↑ liftoff, 24th 11:00
 * ```
 */
@Import(
    TestcontainersConfiguration::class,
    SongSnippetTestCatalogConfiguration::class,
    RoundTimelineOracleTest.Oracle::class,
)
@SpringBootTest
@Transactional
class RoundTimelineOracleTest(
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Oracle.SettableClock,
    @Autowired val users: UserRepository,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val editionService: EditionService,
    @Autowired val schedule: MaterialisationSchedule,
    @Autowired val store: RoundGameStore,
    @Autowired val announcements: AnnouncementService,
    @Autowired val history: HistoryService,
    @Autowired val plays: PlayService,
    @Autowired val points: RoundPlayPoints,
    @Autowired val countdown: CountdownService,
    @Autowired val mapper: ObjectMapper,
) {
    companion object {
        const val ORACLE_A = "oracle-a"
        const val ORACLE_B = "oracle-b"
        val ORACLE_IDS = setOf(ORACLE_A, ORACLE_B)

        val BERLIN: ZoneId = ZoneId.of("Europe/Berlin")

        fun june(day: Int): LocalDate = LocalDate.of(2027, 6, day)
        fun at(date: LocalDate, hour: Int, minute: Int = 0, second: Int = 0): Instant =
            date.atTime(hour, minute, second).atZone(BERLIN).toInstant()
        fun noon(date: LocalDate): Instant = at(date = date, hour = 12)

        val START: Instant = at(date = june(24), hour = 11)
        val FIRST_GAME_DAY: LocalDate = june(18)
        val PHASE_TWO_DAY: LocalDate = june(22)
        val LAST_GAME_DAY: LocalDate = june(25)
        val GAME_DAYS: List<LocalDate> = (18..25).map { june(it) }

        /** Phase one pays one point, phase two one more per round from two on. */
        val STAKES: Map<LocalDate, Int> = mapOf(
            june(18) to 1, june(19) to 1, june(20) to 1, june(21) to 1,
            june(22) to 2, june(23) to 3, june(24) to 4, june(25) to 5,
        )
    }

    @TestConfiguration
    class Oracle {
        /** The clock the walk moves by hand. */
        class SettableClock(var now: Instant) : Clock() {
            override fun instant(): Instant = now
            override fun getZone(): ZoneId = ZoneOffset.UTC
            override fun withZone(zone: ZoneId?): Clock = this
        }

        /** Writes the difficulty it was drawn with into its params, so the database shows it; every guess counts. */
        class OracleGame(override val id: String) : GameType<OracleGame.Params> {
            data class Params(val difficulty: Double)
            data class Payload(val hint: String) : GamePayload

            override val displayName = "Orakel"
            override val paramsType = Params::class.java
            override fun draw(random: GameRandom, context: RoundContext) = Params(difficulty = context.difficulty)
            override fun present(params: Params) = Payload(hint = "any")
            override fun requiresReveal(params: Params) = false
            override fun scoresOnDuration(params: Params) = false
            override fun judge(params: Params, guess: JsonNode) =
                Judgement(qualifies = true, deviation = 0.0, outcome = null)
        }

        @Bean
        @Primary
        fun settableClock() = SettableClock(now = Instant.EPOCH)

        @Bean
        fun oracleA() = OracleGame(id = ORACLE_A)

        @Bean
        fun oracleB() = OracleGame(id = ORACLE_B)

        /** The real rule, choosing between the two oracle games only — so they must alternate. */
        @Bean
        @Primary
        fun oracleSelection() = GameSelection { candidates, history, random ->
            DifferentFromPreviousRound().pick(
                candidates = candidates.filter { it in ORACLE_IDS },
                history = history,
                random = random,
            )
        }
    }

    private data class Run(val community: Community, val owner: UUID, val edition: CommunityEdition)

    private data class Day(
        val date: LocalDate,
        /** Start days of every round with a row, right after that day's 03:00 run. */
        val announcedAfterRun: Set<LocalDate>,
        /** The running round at noon. */
        val resolved: ResolvedRound,
        /** The owner's standing at noon, after their guess. */
        val standing: MemberPoints,
    )

    private fun numberAt(instant: Instant): Int =
        engine.roundAt(now = instant, startsAt = START, zone = BERLIN).number

    private fun startDayOf(number: Int): LocalDate =
        engine.intervalOf(number = number, startsAt = START, zone = BERLIN).start.atZone(BERLIN).toLocalDate()

    private fun rowOf(run: Run, day: LocalDate): RoundGame? =
        store.find(edition = run.edition, roundNumber = numberAt(noon(day)))

    private fun drawnDifficulty(run: Run, day: LocalDate): Double =
        mapper.treeToValue(requireNotNull(rowOf(run = run, day = day)).params, Oracle.OracleGame.Params::class.java)
            .difficulty

    private fun pastRoundOn(run: Run, day: LocalDate) = history.pastRound(
        slug = run.community.slug, userId = run.owner, isSuperAdmin = false, roundNumber = numberAt(noon(day)),
    )

    /** Configured on the 1st, long before anything freezes; the window and phase two named by day. */
    private fun aRun(name: String): Run {
        clock.now = noon(june(1))
        val owner = requireNotNull(
            users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id,
        )
        val community = communities.create(creatorUserId = owner, rawName = name)
        editions.save(
            anEdition(
                communityId = requireNotNull(community.id),
                startsAt = START,
                startsAtTimezone = BERLIN.id,
                phaseTwoStartRound = numberAt(noon(PHASE_TWO_DAY)),
                gamesFromRound = numberAt(noon(FIRST_GAME_DAY)),
                gamesUntilRound = numberAt(noon(LAST_GAME_DAY)),
            ),
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return Run(community = community, owner = owner, edition = edition)
    }

    /** Each day: the 03:00 run, then at noon the running round, the owner's guess and their standing. */
    private fun walk(run: Run, days: IntRange = 15..27): List<Day> = days.map { june(it) }.map { date ->
        clock.now = at(date = date, hour = 3)
        schedule.prepare(edition = run.edition, now = clock.now)
        val announced = (14..28).map { june(it) }.filter { rowOf(run = run, day = it) != null }.toSet()

        clock.now = noon(date)
        val resolved = announcements.resolve(slug = run.community.slug, userId = run.owner, isSuperAdmin = false)
        if (resolved is ResolvedRound.Announced) {
            plays.reveal(
                slug = run.community.slug, userId = run.owner, isSuperAdmin = false,
                roundNumber = resolved.round.number,
            )
            plays.guess(
                slug = run.community.slug, userId = run.owner, isSuperAdmin = false,
                roundNumber = resolved.round.number, guess = mapper.readTree("{}"),
            )
        }
        val standing = points.standings(
            communityId = requireNotNull(run.community.id), viewerId = run.owner, userIds = listOf(run.owner),
        ).getValue(run.owner)

        Day(date = date, announcedAfterRun = announced, resolved = resolved, standing = standing)
    }

    @Test
    fun `games run on exactly the days from the 18th to the 25th`() {
        walk(aRun("Oracle Window")).forEach { day ->
            withClue("${day.date}") {
                startDayOf(requireNotNull(day.resolved.round).number) shouldBe day.date
                when {
                    day.date < FIRST_GAME_DAY ->
                        day.resolved.shouldBeInstanceOf<ResolvedRound.NoGame>().reason shouldBe NoGameReason.BEFORE_WINDOW
                    day.date > LAST_GAME_DAY ->
                        day.resolved.shouldBeInstanceOf<ResolvedRound.NoGame>().reason shouldBe NoGameReason.AFTER_WINDOW
                    else -> day.resolved.shouldBeInstanceOf<ResolvedRound.Announced>()
                }
            }
        }
    }

    @Test
    fun `each game round is announced by the run before it starts, never earlier`() {
        walk(aRun("Oracle Announce")).forEach { day ->
            val expected = GAME_DAYS.filter { it <= day.date }.toSet()
            withClue("${day.date}") { day.announcedAfterRun shouldBe expected }
        }
    }

    @Test
    fun `the two games alternate day by day`() {
        val run = aRun("Oracle Alternate")
        walk(run)

        val types = GAME_DAYS.map { requireNotNull(rowOf(run = run, day = it)).gameType }
        types.toSet() shouldBe ORACLE_IDS
        types.zipWithNext().forEach { (earlier, later) -> later shouldNotBe earlier }
    }

    @Test
    fun `difficulty starts at zero for each game and then climbs with the days to one`() {
        val run = aRun("Oracle Difficulty")
        walk(run)

        // Each game's first day is 0.0 — the 18th for one, the 19th for the other. From the 20th on:
        // days since the first game day over the days the window spans.
        val span = ChronoUnit.DAYS.between(FIRST_GAME_DAY, LAST_GAME_DAY).toDouble()
        GAME_DAYS.forEach { day ->
            val elapsed = ChronoUnit.DAYS.between(FIRST_GAME_DAY, day)
            val expected = if (elapsed < 2) 0.0 else elapsed / span
            withClue("$day") { drawnDifficulty(run = run, day = day) shouldBe (expected plusOrMinus 1e-9) }
        }
        drawnDifficulty(run = run, day = LAST_GAME_DAY) shouldBe (1.0 plusOrMinus 1e-9)
    }

    @Test
    fun `phase two starts on the 22nd and raises the stake by one per round`() {
        val run = aRun("Oracle Phase Two")
        walk(run)

        GAME_DAYS.forEach { day ->
            val row = requireNotNull(rowOf(run = run, day = day))
            val rule = if (day < PHASE_TWO_DAY) AwardRule.ALL_QUALIFYING else AwardRule.CLOSEST_ONLY
            withClue("$day") {
                Award(rule = row.awardRule, points = row.awardPoints) shouldBe
                    Award(rule = rule, points = STAKES.getValue(day))
            }
        }
    }

    @Test
    fun `standings hold finished rounds as stable and the running round as live`() {
        walk(aRun("Oracle Standings")).forEach { day ->
            withClue("${day.date}") {
                day.standing.stable shouldBe STAKES.filterKeys { it < day.date }.values.sum()
                day.standing.live?.points shouldBe STAKES[day.date]
            }
        }
    }

    @Test
    fun `the history leads back day by day and ends at the first game day`() {
        val run = aRun("Oracle History")
        val days = walk(run)

        val entry = days.single { it.date == LAST_GAME_DAY }.resolved.previousRoundNumber
        val chain = generateSequence(entry) { number ->
            history.pastRound(
                slug = run.community.slug, userId = run.owner, isSuperAdmin = false, roundNumber = number,
            ).previousRoundNumber
        }.map { startDayOf(it) }.toList()

        chain shouldBe (24 downTo 18).map { june(it) }
    }

    @Test
    fun `neither the running nor an announced-ahead round is reachable as history`() {
        val run = aRun("Oracle Sealed")
        walk(run = run, days = 15..21)
        // Noon of the 21st: the run announces the 22nd ahead.
        schedule.prepare(edition = run.edition, now = clock.now)
        val ahead = requireNotNull(rowOf(run = run, day = june(22)))

        listOf(june(21), june(22)).forEach { day ->
            withClue("$day") { shouldThrow<RoundNotFoundException> { pastRoundOn(run = run, day = day) } }
        }
        shouldThrow<RoundNotFoundException> {
            plays.asset(
                slug = run.community.slug, userId = run.owner, isSuperAdmin = false,
                roundNumber = numberAt(noon(june(22))), roundGameId = requireNotNull(ahead.id), name = "solution",
            )
        }
        startDayOf(requireNotNull(pastRoundOn(run = run, day = june(20)).round).number) shouldBe june(20)
    }

    @Test
    fun `the round before the start ends at liftoff and the next one begins there`() {
        val run = aRun("Oracle Liftoff")

        clock.now = at(date = june(24), hour = 10)
        val before = countdown.forSlug(slug = run.community.slug, userId = run.owner, isSuperAdmin = false)
        val running = requireNotNull(before.round)
        running.end shouldBe START
        requireNotNull(before.nextRound).start shouldBe running.end
        Duration.between(clock.now, running.end) shouldBe Duration.ofHours(1)

        clock.now = START
        val after = countdown.forSlug(slug = run.community.slug, userId = run.owner, isSuperAdmin = false)
        val first = requireNotNull(after.round)
        first.start shouldBe START
        requireNotNull(after.nextRound).start shouldBe first.end
    }

    @Test
    fun `start and zone stay editable until the round before the first game begins`() {
        val run = aRun("Oracle Freeze")
        fun moveStart(to: Instant) = editionService.replace(
            communityId = requireNotNull(run.community.id),
            draft = EditionDraft(
                label = run.edition.label,
                startsAt = to,
                startsAtTimezone = run.edition.startsAtTimezone,
                phaseTwoStartRound = run.edition.phaseTwoStartRound,
                gamesFromRound = run.edition.gamesFromRound,
            ),
        )

        clock.now = at(date = june(17), hour = 10, minute = 59, second = 59)
        moveStart(START.plus(Duration.ofDays(1)))
        moveStart(START)

        clock.now = at(date = june(17), hour = 11)
        shouldThrow<EditionFrozenException> { moveStart(START.plus(Duration.ofDays(1))) }
    }
}
