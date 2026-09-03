package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.gamelab.internal.AlreadyGuessedException
import org.unividuell.countdown.core.gamelab.internal.LabAccessDeniedException
import org.unividuell.countdown.core.gamelab.internal.LabNotRevealedException
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.UnknownLabGameException
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import org.unividuell.countdown.core.spotobject.CountryLookup
import java.util.UUID

/**
 * `LabService` against the **real** [GameCatalog] — this is exactly the property the consolidation is
 * for, so faking the catalogue here would test nothing. Only the surrounding modules (community, iam)
 * are mocked; `CommunityQuery`/`MembershipQuery`/`MemberIdentityQuery` are the lab's only door into
 * them, and mocking those beans in the real Spring context is what keeps this test out of
 * `game.internal` — constructing a [org.unividuell.countdown.core.game.internal.GuessHueGameType] by
 * hand would reach into the game module's internals, which `gamelab` may never import.
 *
 * [SongSnippetTestCatalogConfiguration] keeps `song-snippet` — addressed directly by id below, same as
 * `guess-hue` — off the network and off the empty pool the test classpath's Deezer properties would
 * otherwise leave it with.
 */
@Import(TestcontainersConfiguration::class, SongSnippetTestCatalogConfiguration::class)
@SpringBootTest
class LabServiceTest(
    @Autowired val service: LabService,
    @Autowired val catalog: GameCatalog,
) {

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    // Spot Object's judge resolves a country through this on every guess — mocked so the loop test
    // below does not reach out to Google for real.
    @MockkBean lateinit var countries: CountryLookup

    private val communityId = UUID.randomUUID()
    private val alice = User(id = UUID.randomUUID(), githubId = 1L, githubLogin = "alice")
    private val bob = User(id = UUID.randomUUID(), githubId = 2L, githubLogin = "bob")
    private val aliceId = requireNotNull(alice.id)
    private val bobId = requireNotNull(bob.id)
    private val mapper = JsonMapper.builder().build()

    private data class TwoMembers(val me: UUID, val other: UUID)

    /** The access grant every kept test needs: a community both alice and bob belong to. */
    private fun aCommunityWithTwoMembers(): Pair<Community, TwoMembers> {
        val community = Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { communities.findBySlug("team") } returns community
        every { memberships.isActiveMember(communityId = communityId, userId = any()) } returns true
        every {
            identities.of(communityId = any(), userIds = any<Collection<UUID>>())
        } answers {
            val ids = secondArg<Collection<UUID>>().toSet()
            listOf(alice, bob).filter { it.id in ids }
                .associate { requireNotNull(it.id) to MemberIdentity(username = it.username, avatar = Avatar.of(it)) }
        }
        every { countries.countryOf(any()) } returns null
        return community to TwoMembers(me = aliceId, other = bobId)
    }

    /** One valid guess per catalogue entry. A new game adds a branch here and the loop above covers it. */
    private fun aValidGuessFor(gameId: String): JsonNode = when (gameId) {
        "guess-hue" -> mapper.readTree("""{"hue":123.5}""")
        // Shape-valid, not necessarily correct — same relationship to song-snippet's real target as
        // this file's fixed hue has to guess-hue's: a legal guess is all "for every game there is" needs.
        "song-snippet" -> mapper.readTree("""{"trackId":1}""")
        "find-pattern" -> mapper.readTree("""{"startIndex":3}""")
        "spot-object" -> mapper.readTree("""{"panoId":"abc","heading":12.0,"pitch":0.0,"zoom":1.0}""")
        else -> error("no lab test guess for game '$gameId' — add one when the game is added")
    }

    // `roundNumber = 12` duplicates LabService's private LAB_ROUND_NUMBER with nothing linking the
    // two: it is inert for guess-hue, whose `draw` ignores the round number entirely, but it would
    // silently mis-derive the expected round for the first game that does not. Deliberate coupling,
    // not an oversight — if that assumption ever breaks, this helper needs the real constant exposed.
    private fun drawnParams(seed: Int, phase: Phase = Phase.ONE) =
        catalog.handle("guess-hue")!!.draw(
            random = GameRandom.fromSeed(seed),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    private fun expectedPayload(seed: Int, phase: Phase = Phase.ONE) =
        catalog.handle("guess-hue")!!.present(drawnParams(seed = seed, phase = phase))

    private fun expectedSolution(seed: Int, phase: Phase = Phase.ONE) =
        catalog.handle("guess-hue")!!.solution(drawnParams(seed = seed, phase = phase))

    /**
     * The exact target hue for [seed], read out of the exposed [expectedSolution] via serialisation
     * rather than by importing the game-internal params type. A guess built from this is guaranteed
     * to qualify (deviation `0.0`) — `aValidGuessFor`'s fixed `123.5` is not, it only has to be *some*
     * legal hue, so it qualifies or not depending on where the seed happens to draw the target.
     */
    private fun targetHueFor(seed: Int, phase: Phase = Phase.ONE): Double =
        mapper.readTree(mapper.writeValueAsString(expectedSolution(seed = seed, phase = phase)))
            .get("targetHue").asDouble()

    @Test
    fun `open returns the revealed payload and no entry of my own`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val response = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        response.seed shouldBe 42
        response.game shouldBe "guess-hue"
        response.displayName shouldBe "Farbausmalung"
        response.payload shouldBe expectedPayload(seed = 42)
        response.me.shouldBeNull()
        response.others.shouldBeEmpty()
        response.tookOverRound shouldBe false
    }

    @Test
    fun `an unknown community is a 404-shaped denial`() {
        every { communities.findBySlug("ghost") } returns null

        shouldThrow<LabAccessDeniedException> {
            service.open(
                slug = "ghost", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = aliceId, isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `a non-member is denied the same way`() {
        // Same exception as "no such community" — the two must be indistinguishable to the caller.
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = aliceId) } returns false

        shouldThrow<LabAccessDeniedException> {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = aliceId, isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `a super-admin who is not a member is let in`() {
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = aliceId) } returns false
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()

        service.open(
            slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = aliceId, isSuperAdmin = true,
        ).seed shouldBe 42
    }

    @Test
    fun `an unknown game id is rejected`() {
        val (community, mine) = aCommunityWithTwoMembers()

        shouldThrow<UnknownLabGameException> {
            service.open(
                slug = community.slug, gameId = "nosuchgame", seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `a guess lands as my own entry, carrying my name and avatar`() {
        val (community, mine) = aCommunityWithTwoMembers()
        // The exact target, not aValidGuessFor's fixed value: the points assertion below needs a
        // guess that is guaranteed to qualify.
        val guess = mapper.readTree("""{"hue":${targetHueFor(seed = 42)}}""")

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = guess,
        )

        val me = response.me.shouldNotBeNull()
        me.userId shouldBe mine.me
        me.username shouldBe alice.username
        me.avatar shouldBe Avatar.of(alice)
        // Neither of these has a branch to miss — `outcome`/`points` are plain field-copies from
        // `Judgement`/`pointsFor` — but nothing else in this test tree asserts them, so a `null`/`0`
        // stub in either LabRoundStore.record or LabService.respond would still pass every test.
        me.outcome.shouldNotBeNull()
        me.points shouldBe 1
        response.others.shouldBeEmpty()
    }

    @Test
    fun `another tester's guess shows up under others`() {
        // Under the unconditional gate, "others" only ever holds anything once the viewer has an
        // entry of their own — so both testers guess here, unlike the pre-consolidation version of
        // this test, which relied on a game that showed the round to everyone regardless.
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        response.me.shouldNotBeNull()
        response.others.map { it.userId } shouldContainExactly listOf(mine.other)
    }

    @Test
    fun `an invalid guess is rejected without consuming the player's one attempt`() {
        // Pins the order in LabService.guess: judge() runs before store.record(), so an
        // out-of-range guess must not count against the player's single attempt — a later
        // valid guess from the same user still has to succeed and land as `me`.
        val (community, mine) = aCommunityWithTwoMembers()

        shouldThrow<InvalidGuessException> {
            service.guess(
                slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false, guess = mapper.readTree("""{"hue":360.0}"""),
            )
        }

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        response.me.shouldNotBeNull().userId shouldBe mine.me
    }

    @Test
    fun `a second guess is refused`() {
        val (community, mine) = aCommunityWithTwoMembers()
        val guess = aValidGuessFor("guess-hue")
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = guess,
        )

        shouldThrow<AlreadyGuessedException> {
            service.guess(
                slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false, guess = guess,
            )
        }
    }

    @Test
    fun `resetting the round clears everyone, forgetting mine clears only me`() {
        val (community, mine) = aCommunityWithTwoMembers()
        val guess = aValidGuessFor("guess-hue")
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = guess,
        )
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false, guess = guess,
        )

        val afterForget = service.forgetMine(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        afterForget.me.shouldBeNull()
        // Alice is back in front of the gate the moment her own entry is gone — bob's guess does
        // not leak out just because it is still sitting in the round.
        afterForget.others.shouldBeEmpty()

        val afterReset = service.resetRound(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        afterReset.others.shouldBeEmpty()
        afterReset.me.shouldBeNull()
    }

    @Test
    fun `opening a different seed reports the takeover`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        service.open(
            slug = community.slug, gameId = "guess-hue", seed = 99, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        ).tookOverRound shouldBe true
    }

    @Test
    fun `a guess that switches the round reports the takeover too`() {
        // guess() used to open() and then record() as two separate store calls, so the takeover the
        // first call saw was already gone by the second — this pins the single-call fix.
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 99, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        response.tookOverRound shouldBe true
    }

    @Test
    fun `a guess that switches the round is judged against the round it lands in, not the one it displaced`() {
        // The bug this pins: judging against the stored round (42) while recording under the freshly
        // chosen one (99) would file bob's entry with a judgement computed against alice's target
        // rather than his own — qualifying or not by accident, and contradicting the payload/solution
        // the response otherwise shows for seed 99.
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 99, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false,
            guess = mapper.readTree("""{"hue":${targetHueFor(seed = 99)}}"""),
        )

        response.tookOverRound shouldBe true
        response.seed shouldBe 99
        // Bob's guess is exactly seed 99's target: it only scores if it was judged against 99, not
        // against the round it displaced.
        response.me.shouldNotBeNull().points shouldBe 1
    }

    @Test
    fun `the solution stays behind the guess`() {
        // The whole gate: `me == null` is the one condition, and it is checked server-side — a
        // solution the browser never receives cannot be read out of the network tab either.
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val before = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        before.solution.shouldBeNull()
    }

    @Test
    fun `the solution arrives with my own guess`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val after = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        after.solution shouldBe expectedSolution(seed = 42)
    }

    @Test
    fun `deleting my guess puts me back in front of the gate`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val afterForget = service.forgetMine(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        afterForget.solution.shouldBeNull()
    }

    @Test
    fun `a super-admin who is not a member gets no solution either`() {
        // `resolve` lets a super-admin past the membership check — the one path that skips it —
        // but `respond` gates the solution on having an entry of one's own, not on having access.
        // A super-admin opening someone else's round must see the same `null` a denied non-member
        // would have gotten if they had been let in: safe by construction today, and this pins it.
        val (community, mine) = aCommunityWithTwoMembers()
        every { memberships.isActiveMember(communityId = communityId, userId = mine.me) } returns false
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val response = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = true,
        )

        response.solution.shouldBeNull()
    }

    @Test
    fun `others stay hidden until I have guessed, for every game there is`() {
        // The switch is gone, so this is no longer a per-game question: it holds for whatever the
        // catalogue contains. Iterating the catalogue is what keeps it true when a game is added.
        val (community, mine) = aCommunityWithTwoMembers()
        for (gameId in catalog.ids()) {
            service.guess(
                slug = community.slug, gameId = gameId, seed = 42, phase = Phase.ONE,
                userId = mine.other, isSuperAdmin = false, guess = aValidGuessFor(gameId),
            )

            val before = service.open(
                slug = community.slug, gameId = gameId, seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false,
            )

            before.others.shouldBeEmpty()
            before.solution.shouldBeNull()
        }
    }

    @Test
    fun `switching the phase draws a different round and changes the rule`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val one = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        val two = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        one.awardRule shouldBe AwardRule.ALL_QUALIFYING
        one.awardPoints shouldBe 1
        two.awardRule shouldBe AwardRule.CLOSEST_ONLY
        // The one number the lab invents (via the synthetic LAB_ROUND_NUMBER) rather than reads off a
        // real grid — worth pinning on its own.
        two.awardPoints shouldBe 2
        two.tookOverRound shouldBe true
    }

    @Test
    fun `the same seed and phase give the same round twice`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val first = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 4711, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        val second = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 4711, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        second.payload shouldBe first.payload
        second.tookOverRound shouldBe false
    }

    @Test
    fun `a lab entry is labelled the way the community labels that member`() {
        val (community, mine) = aCommunityWithTwoMembers()
        every {
            identities.of(communityId = any(), userIds = any<Collection<UUID>>())
        } returns mapOf(
            mine.me to MemberIdentity(
                username = "Zwerg",
                avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
            ),
        )

        val response = service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("guess-hue"),
        )

        val entry = response.me.shouldNotBeNull()
        entry.username shouldBe "Zwerg"
        entry.avatar.shortName shouldBe "ZWRG"
    }

    // --- Task 20: the lab's own reveal gate, mirroring the real round's ---------------------------

    @Test
    fun `opening a round that requires a deliberate reveal does not start the clock`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val response = service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        response.revealed shouldBe false
        // Withheld like the solution already is: the payload of a reveal-gated game is the board.
        response.payload.shouldBeNull()
    }

    @Test
    fun `only a game that requires a deliberate reveal is gated, even in phase two`() {
        val (community, mine) = aCommunityWithTwoMembers()

        service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        ).revealed shouldBe true
        service.open(
            slug = community.slug, gameId = "song-snippet", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        ).revealed shouldBe true
        service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        ).revealed shouldBe false
    }

    @Test
    fun `a guess before the reveal is refused for a game that requires one`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        shouldThrow<LabNotRevealedException> {
            service.guess(
                slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
                userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("find-pattern"),
            )
        }
    }

    @Test
    fun `revealing starts the clock and hands over the withheld payload`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        val response = service.reveal(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        response.revealed shouldBe true
        response.payload.shouldNotBeNull()
    }

    @Test
    fun `a guess after the reveal carries a duration, and a reset puts the tester back in front of the gate`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )
        service.reveal(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        val guessed = service.guess(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("find-pattern"),
        )
        guessed.me.shouldNotBeNull().durationMs.shouldNotBeNull()

        val afterReset = service.resetRound(
            slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )
        afterReset.revealed shouldBe false
        afterReset.me.shouldBeNull()

        // The gate is back, not just the visible face of it: a stale guess needs a fresh reveal too.
        shouldThrow<LabNotRevealedException> {
            service.guess(
                slug = community.slug, gameId = "find-pattern", seed = 42, phase = Phase.TWO,
                userId = mine.me, isSuperAdmin = false, guess = aValidGuessFor("find-pattern"),
            )
        }
    }
}
