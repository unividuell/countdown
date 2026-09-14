package org.unividuell.countdown.core.socialpreview

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.InviteQuery
import org.unividuell.countdown.core.countdown.CountdownQuery
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage
import org.unividuell.countdown.core.socialpreview.internal.PreviewService
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PreviewServiceTest {

    private val communities = mockk<CommunityQuery>()
    private val invites = mockk<InviteQuery>()
    private val countdown = mockk<CountdownQuery>()
    private val now = Instant.parse("2026-09-13T10:00:00Z")
    private val service = PreviewService(
        communities = communities,
        invites = invites,
        countdown = countdown,
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )

    private val id = UUID.randomUUID()
    private val community = Community(id = id, name = "Hütte Hütte", slug = "huettehuette", createdBy = UUID.randomUUID())

    private fun round(number: Int) = Round(
        number = number,
        label = if (number >= 0) "T-$number" else "T+${-number}",
        start = now,
        end = now,
    )

    @Test
    fun `a community with a running countdown shows its name and round`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(58)

        service.forCommunity("huettehuette") shouldBe PreviewPage(
            title = "Hütte Hütte",
            description = "T-58: Spiel mit!",
            path = "/c/huettehuette",
        )
    }

    @Test
    fun `a community without a date drops the round part`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns null

        service.forCommunity("huettehuette").description shouldBe "Spiel mit!"
    }

    @Test
    fun `a community past its start drops the round part`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(-3)

        service.forCommunity("huettehuette").description shouldBe "Spiel mit!"
    }

    @Test
    fun `an unknown slug is indistinguishable from the start page`() {
        every { communities.findBySlug("nope") } returns null

        service.forCommunity("nope") shouldBe PreviewPage.generic()
    }

    @Test
    fun `a valid invite names the community and says it is an invitation`() {
        every { invites.communityOfValidInvite("A7K2MP") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(58)

        service.forInvite("A7K2MP") shouldBe PreviewPage(
            title = "Hütte Hütte",
            description = "Du bist eingeladen — T-58: Spiel mit!",
            path = "/join/A7K2MP",
        )
    }

    @Test
    fun `an unknown or expired code is indistinguishable from the start page`() {
        every { invites.communityOfValidInvite("ZZZZZZ") } returns null

        service.forInvite("ZZZZZZ") shouldBe PreviewPage.generic()
    }
}
