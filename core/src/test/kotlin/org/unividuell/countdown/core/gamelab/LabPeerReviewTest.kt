package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.IntNode
import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactly
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
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.Vote
import org.unividuell.countdown.core.gamelab.internal.LabRound
import org.unividuell.countdown.core.gamelab.internal.LabReviewNotAllowedException
import org.unividuell.countdown.core.gamelab.internal.LabReviewNotOpenException
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.RecordResult
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.spotobject.CountryLookup
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/**
 * `LabService.vote`/`override` against the real catalogue. `spot-object` is the only registered game
 * that allows peer review today, so it stands in for "a game with review switched on" the same way
 * `LabServiceTest` uses `guess-hue` for the opposite. `CountryLookup` is mocked so the judge
 * underneath never reaches Google — the same payload-hygiene concern `LabServiceTest` already guards.
 *
 * The pure scoring mechanics (strike, confirmation, phase-two inheritance, reset, forget) are tested
 * beneath this class, directly against [LabRoundStore] — no Spring context needed for a rule that is
 * exercised through [org.unividuell.countdown.core.game.effectiveQualifies] and takes no dependency on
 * the surrounding modules. Modelled on `LabRoundStoreTest`.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class LabPeerReviewTest(
    @Autowired val service: LabService,
) {

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    // Spot Object's judge resolves a country through this on every guess — mocked so this file does
    // not reach out to Google for real.
    @MockkBean lateinit var countries: CountryLookup

    private val communityId = UUID.randomUUID()
    private val alice = User(id = UUID.randomUUID(), githubId = 1L, githubLogin = "alice")
    private val bob = User(id = UUID.randomUUID(), githubId = 2L, githubLogin = "bob")
    private val aliceId = requireNotNull(alice.id)
    private val bobId = requireNotNull(bob.id)
    private val mapper = JsonMapper.builder().build()

    private data class TwoMembers(val me: UUID, val other: UUID)

    /** The access grant every test here needs: a community both alice and bob belong to. */
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

    private val spotObjectGuess = mapper.readTree("""{"panoId":"abc","heading":12.0,"pitch":0.0,"zoom":1.0}""")

    @Test
    fun `voting on your own lab tip is refused`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = spotObjectGuess,
        )

        shouldThrow<LabReviewNotAllowedException> {
            service.vote(
                slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
                voterUserId = mine.me, isSuperAdmin = false, targetUserId = mine.me, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `a tester who has not guessed may not vote`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = spotObjectGuess,
        )

        // Bob never guessed, so he has no entry to judge from.
        shouldThrow<LabReviewNotAllowedException> {
            service.vote(
                slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
                voterUserId = mine.other, isSuperAdmin = false, targetUserId = mine.me, value = Vote.FLAG,
            )
        }
    }

    @Test
    fun `everybody in the lab may set the override`() {
        // Bob is a plain member — nothing marks him an admin anywhere in the lab — and it succeeds.
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = spotObjectGuess,
        )

        service.override(
            slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
            adminId = mine.other, isSuperAdmin = false, targetUserId = mine.me, value = false,
        )

        val response = service.open(
            slug = community.slug, gameId = "spot-object", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        val me = response.me.shouldNotBeNull()
        me.adminOverride shouldBe false
        me.struck shouldBe true
        me.points shouldBe 0
    }

    @Test
    fun `the response says canOverride is true`() {
        val (community, mine) = aCommunityWithTwoMembers()

        service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        ).canOverride shouldBe true
    }

    @Test
    fun `a game without peer review refuses the vote`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, guess = mapper.readTree("""{"hue":123.5}"""),
        )
        service.guess(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.other, isSuperAdmin = false, guess = mapper.readTree("""{"hue":45.0}"""),
        )

        shouldThrow<LabReviewNotOpenException> {
            service.vote(
                slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                voterUserId = mine.other, isSuperAdmin = false, targetUserId = mine.me, value = Vote.FLAG,
            )
        }
    }
}

/**
 * The scoring side of peer review, straight against [LabRoundStore]: no Spring context, no game
 * catalogue — [store.vote]/[store.override] take the rule from
 * [org.unividuell.countdown.core.game.effectiveQualifies] the same way [store.record] takes
 * `pointsFor`. Modelled on `LabRoundStoreTest`.
 */
class LabRoundStorePeerReviewTest {

    private val clock = Clock.fixed(Instant.parse("2026-08-08T12:00:00Z"), ZoneOffset.UTC)
    private val store = LabRoundStore(clock)
    private val community = UUID.randomUUID()
    private val mapper = JsonMapper.builder().build()

    private fun round(seed: Int, phase: Phase = Phase.ONE, rule: AwardRule = AwardRule.ALL_QUALIFYING) =
        LabRound(
            seed = seed,
            phase = phase,
            params = mapper.readTree("""{"seed":$seed}"""),
            award = Award(rule = rule, points = if (rule == AwardRule.ALL_QUALIFYING) 1 else 7),
        )

    private fun record(user: UUID, seed: Int = 42, deviation: Double = 0.0) =
        store.record(
            communityId = community, gameId = "sample", round = round(seed = seed), userId = user,
            guess = IntNode(1), judgement = Judgement(qualifies = true, deviation = deviation, outcome = null),
            timed = false,
        )

    @Test
    fun `two flags strike a lab tip and take its points`() {
        val target = UUID.randomUUID()
        val (voter1, voter2) = UUID.randomUUID() to UUID.randomUUID()
        record(target)

        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = voter1, value = Vote.FLAG,
        )
        val after = store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = voter2, value = Vote.FLAG,
        )

        after.shouldNotBeNull().entries.single { it.userId == target }.points shouldBe 0
    }

    @Test
    fun `a confirmation majority gives them back`() {
        val target = UUID.randomUUID()
        val (flag1, flag2) = UUID.randomUUID() to UUID.randomUUID()
        val (confirm1, confirm2) = UUID.randomUUID() to UUID.randomUUID()
        record(target)
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = flag1, value = Vote.FLAG,
        )
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = flag2, value = Vote.FLAG,
        )
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = confirm1, value = Vote.CONFIRM,
        )

        // Flags (2) still outnumber confirms (1): still struck.
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .entries.single().points shouldBe 0

        val after = store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = confirm2, value = Vote.CONFIRM,
        )

        // Flags (2) no longer outnumber confirms (2): the majority is gone.
        after.shouldNotBeNull().entries.single().points shouldBe 1
    }

    @Test
    fun `in phase two the second fastest inherits, exactly as in a real round`() {
        val r = round(seed = 9, phase = Phase.TWO, rule = AwardRule.CLOSEST_ONLY)
        val fastest = UUID.randomUUID()
        val second = UUID.randomUUID()
        val (voter1, voter2) = UUID.randomUUID() to UUID.randomUUID()
        store.record(
            communityId = community, gameId = "sample", round = r, userId = fastest,
            guess = IntNode(1), judgement = Judgement(qualifies = true, deviation = 3.0, outcome = null),
            timed = false,
        )
        store.record(
            communityId = community, gameId = "sample", round = r, userId = second,
            guess = IntNode(2), judgement = Judgement(qualifies = true, deviation = 9.0, outcome = null),
            timed = false,
        )
        val before = store.open(communityId = community, gameId = "sample", round = r)
            .entries.associateBy { it.userId }
        before.getValue(fastest).points shouldBe 7
        before.getValue(second).points shouldBe 0

        store.vote(
            communityId = community, gameId = "sample", round = r,
            targetUserId = fastest, voterUserId = voter1, value = Vote.FLAG,
        )
        val after = store.vote(
            communityId = community, gameId = "sample", round = r,
            targetUserId = fastest, voterUserId = voter2, value = Vote.FLAG,
        ).shouldNotBeNull().entries.associateBy { it.userId }

        after.getValue(fastest).points shouldBe 0
        after.getValue(second).points shouldBe 7
    }

    @Test
    fun `resetting the round forgets the votes and the overrides`() {
        val target = UUID.randomUUID()
        val (voter1, voter2) = UUID.randomUUID() to UUID.randomUUID()
        record(target)
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = voter1, value = Vote.FLAG,
        )
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, voterUserId = voter2, value = Vote.FLAG,
        )
        store.override(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = target, value = false,
        )

        store.resetRound(communityId = community, gameId = "sample", round = round(seed = 42))

        // A lingering vote or override would show up as an immediate strike or a forced verdict on
        // this fresh entry, which never received either.
        val after = record(target)
        (after as RecordResult.Recorded).snapshot.entries.single().points shouldBe 1
    }

    @Test
    fun `forgetting one tester's entry forgets the votes on it`() {
        val alice = UUID.randomUUID()
        val bob = UUID.randomUUID()
        record(alice)
        record(bob)
        // Two flags on bob: one cast by alice, one by a third tester who is not otherwise in play.
        val carol = UUID.randomUUID()
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = bob, voterUserId = alice, value = Vote.FLAG,
        )
        store.vote(
            communityId = community, gameId = "sample", round = round(seed = 42),
            targetUserId = bob, voterUserId = carol, value = Vote.FLAG,
        )
        store.open(communityId = community, gameId = "sample", round = round(seed = 42))
            .entries.single { it.userId == bob }.points shouldBe 0

        // Alice leaves: her own ballot on bob's tip goes with her, not only the votes cast on hers —
        // one flag is no longer enough to strike bob.
        val after = store.forget(
            communityId = community, gameId = "sample", round = round(seed = 42), userId = alice,
        )

        after.entries.map { it.userId } shouldContainExactly listOf(bob)
        after.entries.single().points shouldBe 1
    }
}
