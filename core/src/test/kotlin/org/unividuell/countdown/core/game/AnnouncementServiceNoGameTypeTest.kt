package org.unividuell.countdown.core.game

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.GameCatalog
import org.unividuell.countdown.core.game.internal.GameSelection
import org.unividuell.countdown.core.game.internal.NoGameReason
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.game.internal.RoundResponses
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/**
 * `AnnouncementService.materialise` has a branch — an empty catalogue, `selection.pick` returning
 * `null` — that [AnnouncementServiceTest] cannot reach through the real Spring context: `guesshue`
 * is an unconditional bean there, so the catalogue is never actually empty (Spring itself injects an
 * empty `List<GameType<*>>` without complaint; that is not what keeps this branch out of reach).
 *
 * A plain unit test reaches it directly: construct the service with mockk doubles and a
 * [GameSelection] that always returns `null`, no Spring context, no Testcontainers.
 */
class AnnouncementServiceNoGameTypeTest {

    private val communities = mockk<CommunityQuery>()
    private val memberships = mockk<MembershipQuery>()
    private val engine = CountdownEngine()
    private val store = mockk<RoundGameStore>()
    private val catalog = mockk<GameCatalog>()
    private val selection = GameSelection { _, _, _ -> null }
    private val clock = Clock.fixed(Instant.parse("2026-08-12T10:00:00Z"), ZoneOffset.UTC)
    // Never exercised: the NO_GAME_TYPE branch under test returns before RoundResponses touches
    // either dependency.
    private val responses = RoundResponses(plays = mockk<RoundPlayRepository>(), users = mockk<UserQuery>())

    private val service = AnnouncementService(
        communities = communities, memberships = memberships, engine = engine,
        store = store, catalog = catalog, selection = selection, responses = responses, clock = clock,
    )

    @Test
    fun `an empty catalogue yields NO_GAME_TYPE, with the round still present`() {
        val communityId = UUID.randomUUID()
        val community = Community(
            id = communityId, name = "Empty Catalogue", slug = "empty-catalogue",
            createdBy = UUID.randomUUID(),
        )
        val edition = CommunityEdition(
            id = UUID.randomUUID(), communityId = communityId, label = "Run 2026",
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
        )
        every { communities.findBySlug("empty-catalogue") } returns community
        every { communities.activeEditionOf(communityId) } returns edition
        every { store.find(edition = edition, roundNumber = any()) } returns null
        every { store.history(edition = edition, roundNumber = any()) } returns emptyList()
        every { catalog.ids() } returns emptyList()

        val res = service.currentRound(
            slug = "empty-catalogue", userId = UUID.randomUUID(), isSuperAdmin = true,
        )

        res.noGameReason shouldBe NoGameReason.NO_GAME_TYPE
        res.round.shouldNotBeNull()
        res.game.shouldBeNull()
    }
}
