package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.EditionConflictException
import org.unividuell.countdown.core.community.internal.EditionDraft
import org.unividuell.countdown.core.community.internal.EditionFrozenException
import org.unividuell.countdown.core.community.internal.EditionNotFoundException
import org.unividuell.countdown.core.community.internal.EditionService
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class EditionServiceTest {
    private val now = Instant.parse("2026-11-05T12:00:00Z")
    private val repository = mockk<CommunityEditionRepository>()
    private val service = EditionService(
        editions = repository,
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )
    private val communityId = UUID.randomUUID()

    // Starts 2026-12-20 18:00 Berlin; round -30 begins 2026-11-19, so the grid is still open at `now`.
    private val draft = EditionDraft(
        label = "Run 2026",
        startsAt = Instant.parse("2026-12-20T17:00:00Z"),
        startsAtTimezone = "Europe/Berlin",
        phaseTwoStartRound = -7,
        gamesFromRound = -30,
    )

    init {
        every { repository.save(any()) } answers { firstArg() }
    }

    @Test
    fun `create stores the draft as the active edition`() {
        every { repository.findActiveByCommunityId(communityId) } returns null

        val edition = service.create(communityId = communityId, draft = draft.copy(label = "  Run 2026  "))

        edition.communityId shouldBe communityId
        edition.label shouldBe "Run 2026"
        edition.startsAt shouldBe draft.startsAt
        edition.phaseTwoStartRound shouldBe -7
        edition.gamesFromRound shouldBe -30
        edition.gamesUntilRound shouldBe 0
    }

    @Test
    fun `create turns a blank label into null`() {
        every { repository.findActiveByCommunityId(communityId) } returns null

        service.create(communityId = communityId, draft = draft.copy(label = "   ")).label shouldBe null
    }

    @Test
    fun `create rejects a second active edition with 409`() {
        every { repository.findActiveByCommunityId(communityId) } returns anEdition(communityId = communityId)

        shouldThrow<EditionConflictException> { service.create(communityId = communityId, draft = draft) }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `create rejects a draft whose freeze moment has passed`() {
        every { repository.findActiveByCommunityId(communityId) } returns null
        val begun = draft.copy(startsAt = Instant.parse("2026-11-10T17:00:00Z"), gamesFromRound = -89)

        shouldThrow<IllegalArgumentException> { service.create(communityId = communityId, draft = begun) }
            .message.shouldContain("already")
    }

    @Test
    fun `replace swaps every field, null clears phase two`() {
        val current = anEdition(communityId = communityId, id = UUID.randomUUID(), phaseTwoStartRound = -7)
        every { repository.findActiveByCommunityId(communityId) } returns current

        val replaced = service.replace(
            communityId = communityId,
            draft = EditionDraft(
                label = "Neu",
                startsAt = Instant.parse("2027-01-10T17:00:00Z"),
                startsAtTimezone = "America/New_York",
                phaseTwoStartRound = null,
                gamesFromRound = -20,
            ),
        )

        replaced.id shouldBe current.id
        replaced.label shouldBe "Neu"
        replaced.startsAt shouldBe Instant.parse("2027-01-10T17:00:00Z")
        replaced.startsAtTimezone shouldBe "America/New_York"
        replaced.phaseTwoStartRound shouldBe null
        replaced.gamesFromRound shouldBe -20
    }

    @Test
    fun `replace keeps gamesUntilRound`() {
        every { repository.findActiveByCommunityId(communityId) } returns
            anEdition(communityId = communityId, gamesUntilRound = -2)

        service.replace(communityId = communityId, draft = draft).gamesUntilRound shouldBe -2
    }

    @Test
    fun `replace without an active edition throws EditionNotFoundException`() {
        every { repository.findActiveByCommunityId(communityId) } returns null

        shouldThrow<EditionNotFoundException> { service.replace(communityId = communityId, draft = draft) }
    }

    @Test
    fun `replace of a not yet frozen run rejects a draft whose freeze moment has passed`() {
        every { repository.findActiveByCommunityId(communityId) } returns anEdition(communityId = communityId)
        val begun = draft.copy(startsAt = Instant.parse("2026-11-10T17:00:00Z"), gamesFromRound = -89)

        shouldThrow<IllegalArgumentException> { service.replace(communityId = communityId, draft = begun) }
            .message.shouldContain("already")
    }

    private fun openForCreate() {
        every { repository.findActiveByCommunityId(communityId) } returns null
    }

    private fun openForReplace() {
        every { repository.findActiveByCommunityId(communityId) } returns
            anEdition(communityId = communityId, gamesUntilRound = -2)
    }

    @Test
    fun `create rejects an invalid IANA zone`() {
        openForCreate()

        shouldThrow<IllegalArgumentException> {
            service.create(communityId = communityId, draft = draft.copy(startsAtTimezone = "Mars/Olympus"))
        }
    }

    @Test
    fun `replace rejects an invalid IANA zone`() {
        openForReplace()

        shouldThrow<IllegalArgumentException> {
            service.replace(communityId = communityId, draft = draft.copy(startsAtTimezone = "Mars/Olympus"))
        }
    }

    @Test
    fun `create rejects a phaseTwoStartRound that is not negative`() {
        openForCreate()

        shouldThrow<IllegalArgumentException> {
            service.create(communityId = communityId, draft = draft.copy(phaseTwoStartRound = 0))
        }
    }

    @Test
    fun `replace rejects a phaseTwoStartRound that is not negative`() {
        openForReplace()

        shouldThrow<IllegalArgumentException> {
            service.replace(communityId = communityId, draft = draft.copy(phaseTwoStartRound = 0))
        }
    }

    @Test
    fun `create rejects a gamesFromRound above gamesUntilRound`() {
        openForCreate()

        shouldThrow<IllegalArgumentException> {
            service.create(communityId = communityId, draft = draft.copy(gamesFromRound = 89))
        }.message shouldBe "gamesFromRound (89) must not be above gamesUntilRound (0)"
    }

    @Test
    fun `replace rejects a gamesFromRound above the kept gamesUntilRound`() {
        openForReplace()

        // A smaller number is earlier: from=-1 with the stored until=-2 would end before it begins.
        shouldThrow<IllegalArgumentException> {
            service.replace(communityId = communityId, draft = draft.copy(gamesFromRound = -1))
        }
    }

    @Test
    fun `create rejects a gamesFromRound below the hundred-year bound`() {
        openForCreate()

        shouldThrow<IllegalArgumentException> {
            service.create(communityId = communityId, draft = draft.copy(gamesFromRound = -36501))
        }
    }

    @Test
    fun `replace rejects a gamesFromRound below the hundred-year bound`() {
        openForReplace()

        shouldThrow<IllegalArgumentException> {
            service.replace(communityId = communityId, draft = draft.copy(gamesFromRound = -36501))
        }
    }

    // Far-future start, so the freeze moment 36502 days earlier still lies ahead of `now`.
    private val farFuture = draft.copy(startsAt = Instant.parse("2200-01-01T17:00:00Z"))

    @Test
    fun `create accepts a gamesFromRound exactly at the hundred-year bound`() {
        openForCreate()

        service.create(communityId = communityId, draft = farFuture.copy(gamesFromRound = -36500))
            .gamesFromRound shouldBe -36500
    }

    @Test
    fun `replace accepts a gamesFromRound exactly at the hundred-year bound`() {
        openForReplace()

        service.replace(communityId = communityId, draft = farFuture.copy(gamesFromRound = -36500))
            .gamesFromRound shouldBe -36500
    }

    @Test
    fun `create rejects a label shorter than 3 or longer than 50 chars`() {
        openForCreate()

        listOf("ab", "x".repeat(51)).forEach { label ->
            shouldThrow<IllegalArgumentException> {
                service.create(communityId = communityId, draft = draft.copy(label = label))
            }
        }
    }

    @Test
    fun `replace rejects a label shorter than 3 or longer than 50 chars`() {
        openForReplace()

        listOf("ab", "x".repeat(51)).forEach { label ->
            shouldThrow<IllegalArgumentException> {
                service.replace(communityId = communityId, draft = draft.copy(label = label))
            }
        }
    }

    @Test
    fun `labels of exactly 3 and 50 chars are accepted`() {
        openForCreate()

        listOf("abc", "x".repeat(50)).forEach { label ->
            service.create(communityId = communityId, draft = draft.copy(label = label)).label shouldBe label
        }
    }

    @Test
    fun `replace turns a blank label into null`() {
        openForReplace()

        service.replace(communityId = communityId, draft = draft.copy(label = "   ")).label shouldBe null
    }

    // The grid froze on 2026-11-03 (the start of round -46), so this run is frozen at `now`.
    private val frozen = anEdition(
        communityId = communityId,
        startsAt = Instant.parse("2026-12-20T17:00:00Z"),
        gamesFromRound = -45,
    )

    @Test
    fun `replace on a frozen run rejects a new startsAt`() {
        every { repository.findActiveByCommunityId(communityId) } returns frozen

        shouldThrow<EditionFrozenException> {
            service.replace(
                communityId = communityId,
                draft = draft.copy(startsAt = Instant.parse("2026-12-21T17:00:00Z"), gamesFromRound = -45),
            )
        }
    }

    @Test
    fun `replace on a frozen run rejects thawing`() {
        every { repository.findActiveByCommunityId(communityId) } returns frozen

        shouldThrow<EditionFrozenException> {
            service.replace(communityId = communityId, draft = draft.copy(gamesFromRound = -30))
        }
    }

    @Test
    fun `replace on a frozen run allows a new label`() {
        every { repository.findActiveByCommunityId(communityId) } returns frozen

        val replaced = service.replace(
            communityId = communityId,
            draft = draft.copy(label = "Umbenannt", gamesFromRound = -45),
        )

        replaced.label shouldBe "Umbenannt"
    }
}
