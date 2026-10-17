package org.unividuell.countdown.core.gamelab

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
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
import org.unividuell.countdown.core.game.AssetVisibility
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException
import org.unividuell.countdown.core.gamelab.internal.LabAssetNotFoundException
import org.unividuell.countdown.core.gamelab.internal.LabService
import tools.jackson.databind.JsonNode
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** The lab runs the real round's asset rule over its in-memory round: keys with the open, bytes before it. */
@Import(TestcontainersConfiguration::class, LabAssetStageTest.SealedGame::class)
@SpringBootTest
class LabAssetStageTest(
    @Autowired val service: LabService,
    @Autowired val productions: SealedGame.Productions,
) {

    @TestConfiguration
    class SealedGame {
        data class SealedParams(val answer: String)
        data class SealedPayload(val clips: Int) : GamePayload

        class Productions {
            val count = AtomicInteger()
        }

        @Bean fun productions() = Productions()

        @Bean
        fun sealedGame(productions: Productions): GameType<SealedParams> = object : GameType<SealedParams> {
            override val id = "sealed-fake"
            override val displayName = "Versiegelt"
            override val paramsType = SealedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = SealedParams(answer = "42")
            override fun present(params: SealedParams) = SealedPayload(clips = 1)
            override fun judge(params: SealedParams, guess: JsonNode) =
                Judgement(qualifies = false, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: SealedParams) = true
            override fun scoresOnDuration(params: SealedParams) = false
            override fun produceAssets(params: SealedParams): List<RoundAsset> {
                productions.count.incrementAndGet()
                return listOf(
                    RoundAsset(name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav", bytes = byteArrayOf(0)),
                    RoundAsset(name = "solution", visibility = AssetVisibility.AfterGuess, mediaType = "audio/mpeg", bytes = byteArrayOf(99)),
                )
            }
        }
    }

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val communityId = UUID.randomUUID()
    private val slug = "sealed"
    private val tester = UUID.randomUUID()

    private fun aCommunityWithTheTester() {
        every { communities.findBySlug(slug) } returns
            Community(id = communityId, name = "Sealed", slug = slug, createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()
    }

    private fun asset(name: String) = service.asset(
        slug = slug, gameId = "sealed-fake", seed = 7, phase = Phase.ONE,
        userId = tester, isSuperAdmin = false, name = name,
    )

    @Test
    fun `a lab stage key needs the open, like the real round`() {
        aCommunityWithTheTester()

        service.open(
            slug = slug, gameId = "sealed-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        ).assetKeys shouldBe emptyMap()
        service.reveal(
            slug = slug, gameId = "sealed-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        ).assetKeys.keys shouldBe setOf("clip-0")
    }

    @Test
    fun `lab stage bytes are fetchable before the open, sealed`() {
        aCommunityWithTheTester()

        asset("clip-0").header.key shouldNotBe null
    }

    @Test
    fun `lab assets are produced once per round`() {
        aCommunityWithTheTester()
        val before = productions.count.get()

        val first = asset("clip-0")
        val second = asset("clip-0")

        productions.count.get() - before shouldBe 1
        second.bytes shouldBe first.bytes
    }

    @Test
    fun `the lab's after-guess asset waits for an entry of one's own`() {
        aCommunityWithTheTester()

        shouldThrow<LabAssetForbiddenException> { asset("solution") }
        service.giveUp(
            slug = slug, gameId = "sealed-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        )
        asset("solution").bytes shouldBe byteArrayOf(99)
    }

    @Test
    fun `an unknown lab asset is not found`() {
        aCommunityWithTheTester()

        shouldThrow<LabAssetNotFoundException> { asset("clip-9") }
    }
}
