package org.unividuell.countdown.core.gamelab

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException
import org.unividuell.countdown.core.gamelab.internal.LabService
import tools.jackson.databind.JsonNode
import java.util.UUID

/** The lab's asset gate asks the game which stage a key belongs to, exactly as `PlayService.asset` does. */
@Import(TestcontainersConfiguration::class, LabAssetStageTest.PairedGame::class)
@SpringBootTest
class LabAssetStageTest(@Autowired val service: LabService) {

    @TestConfiguration
    class PairedGame {
        data class PairedParams(val answer: String)
        data class PairedPayload(val images: Int) : GamePayload

        @Bean
        fun pairedGame(): GameType<PairedParams> = object : GameType<PairedParams> {
            override val id = "paired-fake"
            override val displayName = "Doppelbild"
            override val paramsType = PairedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = PairedParams(answer = "42")
            override fun present(params: PairedParams) = PairedPayload(images = 2)
            override fun judge(params: PairedParams, guess: JsonNode) =
                Judgement(qualifies = false, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: PairedParams) = false
            override fun scoresOnDuration(params: PairedParams) = false
            override fun assetStage(params: PairedParams, key: Int) = if (key == 1) 0 else key
            override fun produceAssets(params: PairedParams) = (0..2).associateWith {
                RoundAsset(mediaType = "image/png", bytes = byteArrayOf(it.toByte()))
            }
        }
    }

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val communityId = UUID.randomUUID()
    private val slug = "paired"
    private val tester = UUID.randomUUID()

    @Test
    fun `a single-stage game's second image opens with the first, a key mapped above stays shut`() {
        every { communities.findBySlug(slug) } returns
            Community(id = communityId, name = "Paired", slug = slug, createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()

        service.open(
            slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        )

        service.asset(
            slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, key = 1,
        ).bytes shouldBe byteArrayOf(1)
        shouldThrow<LabAssetForbiddenException> {
            service.asset(
                slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE,
                userId = tester, isSuperAdmin = false, key = 2,
            )
        }
    }
}
