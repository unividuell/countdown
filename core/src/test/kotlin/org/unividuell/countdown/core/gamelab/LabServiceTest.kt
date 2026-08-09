package org.unividuell.countdown.core.gamelab

import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.gamelab.LabGame
import org.unividuell.countdown.core.gamelab.LabOutcome
import org.unividuell.countdown.core.gamelab.LabPayload
import org.unividuell.countdown.core.gamelab.LabSolution
import org.unividuell.countdown.core.gamelab.internal.AlreadyGuessedException
import org.unividuell.countdown.core.gamelab.internal.InvalidGuessException
import org.unividuell.countdown.core.gamelab.internal.LabAccessDeniedException
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.gamelab.internal.SampleLabGame
import org.unividuell.countdown.core.gamelab.internal.SampleOutcome
import org.unividuell.countdown.core.gamelab.internal.SamplePayload
import org.unividuell.countdown.core.gamelab.internal.UnknownLabGameException
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class LabServiceTest {

    private val communityId = UUID.randomUUID()
    private val alice = User(id = UUID.randomUUID(), githubId = 1L, githubLogin = "alice")
    private val bob = User(id = UUID.randomUUID(), githubId = 2L, githubLogin = "bob")

    private val communities = mockk<CommunityQuery>()
    private val memberships = mockk<MembershipQuery>()
    private val users = mockk<UserQuery>()
    private val store = LabRoundStore(Clock.fixed(Instant.parse("2026-08-08T12:00:00Z"), ZoneOffset.UTC))
    private val game = SampleLabGame()
    private val mapper = jacksonObjectMapper()

    private val service = LabService(communities, memberships, users, store, listOf(game))

    private fun grantAccess() {
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId, any()) } returns true
        every { users.findAllById(any()) } answers {
            val ids = firstArg<Collection<UUID>>().toSet()
            listOf(alice, bob).filter { it.id in ids }
        }
    }

    private fun secretFor(seed: Int, payload: SamplePayload): Int =
        (payload.lowerBound..payload.upperBound).first { candidate ->
            (game.score(seed, mapper.readTree("""{"value":$candidate}""")) as SampleOutcome).correct
        }

    @Test
    fun `open returns the revealed payload and no entry of my own`() {
        grantAccess()

        val response = service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)

        response.seed shouldBe 42
        response.game shouldBe "sample"
        response.displayName shouldBe "Zahlenraten (Attrappe)"
        response.payload shouldBe game.reveal(42)
        response.me.shouldBeNull()
        response.others.shouldBeEmpty()
        response.tookOverRound shouldBe false
    }

    @Test
    fun `an unknown community is a 404-shaped denial`() {
        every { communities.findBySlug("ghost") } returns null

        shouldThrow<LabAccessDeniedException> {
            service.open("ghost", "sample", 42, alice.id!!, isSuperAdmin = false)
        }
    }

    @Test
    fun `a non-member is denied the same way`() {
        // Same exception as "no such community" — the two must be indistinguishable to the caller.
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId, alice.id!!) } returns false

        shouldThrow<LabAccessDeniedException> {
            service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)
        }
    }

    @Test
    fun `a super-admin who is not a member is let in`() {
        every { communities.findBySlug("team") } returns
            Community(id = communityId, name = "Team", slug = "team", createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId, alice.id!!) } returns false
        every { users.findAllById(any()) } returns emptyList()

        service.open("team", "sample", 42, alice.id!!, isSuperAdmin = true).seed shouldBe 42
    }

    @Test
    fun `an unknown game id is rejected`() {
        grantAccess()

        shouldThrow<UnknownLabGameException> {
            service.open("team", "nosuchgame", 42, alice.id!!, isSuperAdmin = false)
        }
    }

    @Test
    fun `a guess lands as my own entry, carrying my name and avatar`() {
        grantAccess()
        val payload = game.reveal(42) as SamplePayload

        val response = service.guess(
            "team", "sample", 42, alice.id!!, false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        val me = response.me.shouldNotBeNull()
        me.userId shouldBe alice.id
        me.username shouldBe alice.username
        me.avatar shouldBe Avatar.of(alice)
        response.others.shouldBeEmpty()
    }

    @Test
    fun `another tester's guess shows up under others`() {
        grantAccess()
        val payload = game.reveal(42) as SamplePayload
        service.guess(
            "team", "sample", 42, bob.id!!, false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        val response = service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)

        response.me.shouldBeNull()
        response.others.map { it.userId } shouldContainExactly listOf(bob.id)
    }

    @Test
    fun `a correct guess is reported correct`() {
        grantAccess()
        val secret = secretFor(42, game.reveal(42) as SamplePayload)

        val response = service.guess(
            "team", "sample", 42, alice.id!!, false, mapper.readTree("""{"value":$secret}"""),
        )

        (response.me!!.outcome as SampleOutcome).correct shouldBe true
    }

    @Test
    fun `an invalid guess is rejected without consuming the player's one attempt`() {
        // Pins the order in LabService.guess: score() runs before store.record(), so an
        // out-of-range guess must not count against the player's single attempt — a later
        // valid guess from the same user still has to succeed and land as `me`.
        grantAccess()
        val payload = game.reveal(42) as SamplePayload

        shouldThrow<InvalidGuessException> {
            service.guess(
                "team", "sample", 42, alice.id!!, false,
                mapper.readTree("""{"value":${payload.upperBound + 1}}"""),
            )
        }

        val response = service.guess(
            "team", "sample", 42, alice.id!!, false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        response.me.shouldNotBeNull().userId shouldBe alice.id
    }

    @Test
    fun `a second guess is refused`() {
        grantAccess()
        val payload = game.reveal(42) as SamplePayload
        val body = mapper.readTree("""{"value":${payload.lowerBound}}""")
        service.guess("team", "sample", 42, alice.id!!, false, body)

        shouldThrow<AlreadyGuessedException> {
            service.guess("team", "sample", 42, alice.id!!, false, body)
        }
    }

    @Test
    fun `resetting the round clears everyone, forgetting mine clears only me`() {
        grantAccess()
        val payload = game.reveal(42) as SamplePayload
        val body = mapper.readTree("""{"value":${payload.lowerBound}}""")
        service.guess("team", "sample", 42, alice.id!!, false, body)
        service.guess("team", "sample", 42, bob.id!!, false, body)

        val afterForget = service.forgetMine("team", "sample", 42, alice.id!!, false)
        afterForget.me.shouldBeNull()
        afterForget.others.map { it.userId } shouldContainExactly listOf(bob.id)

        val afterReset = service.resetRound("team", "sample", 42, alice.id!!, false)
        afterReset.others.shouldBeEmpty()
        afterReset.me.shouldBeNull()
    }

    @Test
    fun `opening a different seed reports the takeover`() {
        grantAccess()
        service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)

        service.open("team", "sample", 99, alice.id!!, isSuperAdmin = false)
            .tookOverRound shouldBe true
    }

    @Test
    fun `two games sharing an id fail the boot`() {
        // Fail fast: a silently shadowed game would be found only by someone wondering why their
        // lab page shows the wrong thing.
        shouldThrow<IllegalArgumentException> {
            LabService(communities, memberships, users, store, listOf(game, SampleLabGame()))
        }
    }

    /**
     * A game that accepts guesses without scoring them, hides the other testers until the viewer
     * has guessed, and reveals a solution once they have — the shape Guess Hue needs. Declared
     * here rather than by flipping `SampleLabGame`, whose open behaviour is itself documented and
     * tested.
     */
    private object SecretivePayload : LabPayload

    private object SecretiveSolution : LabSolution

    private class SecretiveGame : LabGame {
        override val id = "secretive"
        override val displayName = "Verschwiegen"
        override val revealsOthersBeforeGuess = false
        override fun reveal(seed: Int) = SecretivePayload
        override fun score(seed: Int, guess: JsonNode): LabOutcome? = null
        override fun solution(seed: Int) = SecretiveSolution
    }

    private val secretive = SecretiveGame()
    private val secretiveService =
        LabService(communities, memberships, users, store, listOf(secretive))

    @Test
    fun `a game that hides the others shows none of them before I have guessed`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val response = secretiveService.open("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        response.me.shouldBeNull()
        response.others.shouldBeEmpty()
    }

    @Test
    fun `a game that hides the others shows them once I have guessed`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val response = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        response.me.shouldNotBeNull()
        response.others.map { it.username } shouldContainExactly listOf("bob")
    }

    @Test
    fun `a game that does not score stores an entry without an outcome`() {
        grantAccess()

        val response = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        response.me.shouldNotBeNull().outcome.shouldBeNull()
    }

    @Test
    fun `the sample game keeps showing the others before I have guessed`() {
        // The default-free property means this stays a decision, not an inheritance.
        grantAccess()
        val payload = game.reveal(42) as SamplePayload
        service.guess(
            "team", "sample", 42, bob.id!!, isSuperAdmin = false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        val response = service.open("team", "sample", 42, alice.id!!, isSuperAdmin = false)

        response.others.map { it.username } shouldContainExactly listOf("bob")
    }

    @Test
    fun `the solution stays behind the guess`() {
        // The whole gate: `me == null` is the one condition, and it is checked server-side — a
        // solution the browser never receives cannot be read out of the network tab either.
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, bob.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val before = secretiveService.open("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        before.solution.shouldBeNull()
    }

    @Test
    fun `the solution arrives with my own guess`() {
        grantAccess()

        val after = secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        after.solution shouldBe SecretiveSolution
    }

    @Test
    fun `deleting my guess puts me back in front of the gate`() {
        grantAccess()
        secretiveService.guess(
            "team", "secretive", 42, alice.id!!, isSuperAdmin = false, mapper.readTree("""{}"""),
        )

        val afterForget =
            secretiveService.forgetMine("team", "secretive", 42, alice.id!!, isSuperAdmin = false)

        afterForget.solution.shouldBeNull()
    }

    @Test
    fun `a game that reveals nothing keeps answering null after a guess`() {
        // The default is the safe direction, so the sample game inherits it without saying a word.
        grantAccess()
        val payload = game.reveal(42) as SamplePayload

        val response = service.guess(
            "team", "sample", 42, alice.id!!, isSuperAdmin = false,
            mapper.readTree("""{"value":${payload.lowerBound}}"""),
        )

        response.solution.shouldBeNull()
    }
}
