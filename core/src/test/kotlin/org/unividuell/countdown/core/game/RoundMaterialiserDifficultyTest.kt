package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.internal.GameSelection
import org.unividuell.countdown.core.game.internal.PastRound
import org.unividuell.countdown.core.game.internal.RoundAssetStore
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class RoundMaterialiserDifficultyTest {

    data class FakeParams(val n: Int)
    data class FakePayload(val n: Int) : GamePayload

    /** Records the context of every call that takes one, so the test can compare what each saw. */
    private class RecordingGame : GameType<FakeParams> {
        val availableContexts = mutableListOf<RoundContext>()
        val drawContexts = mutableListOf<RoundContext>()

        override val id = "fake"
        override val displayName = "Fake"
        override val paramsType = FakeParams::class.java
        override fun isAvailable(context: RoundContext): Boolean {
            availableContexts += context
            return true
        }
        override fun draw(random: GameRandom, context: RoundContext): FakeParams {
            drawContexts += context
            return FakeParams(n = context.roundNumber)
        }
        override fun present(params: FakeParams) = FakePayload(n = params.n)
        override fun requiresReveal(params: FakeParams) = false
        override fun scoresOnDuration(params: FakeParams) = false
        override fun judge(params: FakeParams, guess: JsonNode) =
            Judgement(qualifies = true, deviation = 0.0, outcome = null)
    }

    private val mapper = JsonMapper.builder().build()
    private val game = RecordingGame()
    private val store = mockk<RoundGameStore>()
    private val selection = mockk<GameSelection>()
    private val assets = mockk<RoundAssetStore>()

    private val materialiser = RoundMaterialiser(
        store = store,
        catalog = GameCatalog(games = listOf(game), mapper = mapper),
        selection = selection,
        assets = assets,
        clock = Clock.fixed(Instant.parse("2026-10-29T10:00:00Z"), ZoneOffset.UTC),
    )

    @Test
    fun `the draw sees the difficulty, the selection does not`() {
        val edition = CommunityEdition(
            id = UUID.randomUUID(), communityId = UUID.randomUUID(), label = "Team 2026", gamesUntilRound = 0,
        )
        // Oldest round 20 played "fake"; round 10 is now: (20 - 10) / (20 - 0) = 0.5.
        val history = (13..19).map { PastRound(roundNumber = it, gameType = "guess-hue") } +
            PastRound(roundNumber = 20, gameType = "fake")
        every { store.history(edition = edition, roundNumber = 10) } returns history
        every { selection.pick(candidates = any(), history = any(), random = any()) } returns "fake"
        every { store.previousParams(edition = edition, gameType = "fake") } returns emptyList()
        every {
            store.announce(
                edition = edition, roundNumber = 10, gameType = "fake", params = any(), award = any(), announcedAt = any(),
            )
        } answers {
            RoundGame(
                id = UUID.randomUUID(), editionId = requireNotNull(edition.id), roundNumber = 10, gameType = "fake",
                params = arg<JsonNode>(3), awardRule = AwardRule.ALL_QUALIFYING, awardPoints = 1,
                announcedAt = Instant.parse("2026-10-29T10:00:00Z"),
            )
        }
        every { assets.exists(any()) } returns true

        materialiser.materialise(edition = edition, roundNumber = 10)

        game.drawContexts.single().difficulty shouldBe 0.5
        game.availableContexts.single().difficulty shouldBe 0.0
    }
}
