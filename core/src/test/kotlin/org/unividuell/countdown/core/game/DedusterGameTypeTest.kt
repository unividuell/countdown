package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterImages
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.deduster.DedusterTicks
import org.unividuell.countdown.core.deduster.RoundImageStore
import org.unividuell.countdown.core.deduster.StoredImage
import org.unividuell.countdown.core.game.internal.DedusterEnd
import org.unividuell.countdown.core.game.internal.DedusterGameType
import org.unividuell.countdown.core.game.internal.DedusterOutcome
import org.unividuell.countdown.core.game.internal.DedusterParams
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class DedusterGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val imageA = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val imageB = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val roundGameId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000f1")

    private val mapper = JsonMapper.builder().build()
    private val pool = mockk<DedusterPool> {
        every { candidates(community) } returns listOf(imageA, imageB)
        every { gridOf(any()) } returns DedusterGrid.PORTRAIT
    }
    private val images = mockk<DedusterImages>()
    private val store = mockk<RoundImageStore>(relaxed = true)
    private val game = DedusterGameType(pool = pool, images = images, store = store, mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(previous: List<DedusterParams> = emptyList(), phase: Phase = Phase.ONE) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "deduster"
        game.displayName shouldBe "Entstauber"
    }

    @Test
    fun `a drawn round lays out the photo's grid and orders every tile once`() {
        val params = draw()

        params.cols shouldBe 6
        params.rows shouldBe 8
        params.order.sorted() shouldContainExactly (0 until 48).toList()
        params.intervalMs shouldBeIn DedusterTicks.WEIGHTS.keys
        params.imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `an image this edition already had is not drawn again`() {
        val earlier = draw().copy(imageId = imageA)

        repeat(20) { seed ->
            draw(random = random(scene = seed), context = context(previous = listOf(earlier))).imageId shouldBe imageB
        }
    }

    @Test
    fun `a pool this edition has used up is drawn from in full again`() {
        val used = listOf(draw().copy(imageId = imageA), draw().copy(imageId = imageB))

        draw(context = context(previous = used)).imageId shouldBeIn listOf(imageA, imageB)
    }

    /** Entstauber keeps no secret: the solution stream must stay untouched, and is pinned so. */
    @Test
    fun `the solution seed changes nothing`() {
        draw(random = random(solution = 1)) shouldBe draw(random = random(solution = 99))
    }

    /** Image and tempo are out before the reveal, so they must not share a stream with the order. */
    @Test
    fun `image and tempo follow the scene seed, the order follows the presentation seed`() {
        val a = draw(random = random(presentation = 2, scene = 3))
        val b = draw(random = random(presentation = 77, scene = 3))
        val c = draw(random = random(presentation = 2, scene = 55))

        b.imageId shouldBe a.imageId
        b.intervalMs shouldBe a.intervalMs
        b.order shouldNotBe a.order
        c.order shouldBe a.order
    }

    @Test
    fun `the scene carries exactly the layout and the tempo`() {
        fields(game.scene(draw())) shouldBe setOf("cols", "rows", "intervalMs")
    }

    @Test
    fun `the payload carries exactly what the run needs, and no image id`() {
        fields(game.present(draw())) shouldBe setOf("cols", "rows", "intervalMs", "order")
    }

    @Test
    fun `there is no solution exit - the photo under the dust is the reward`() {
        game.solution(draw()).shouldBeNull()
    }

    @Test
    fun `it is revealed once and never scored on the duration`() {
        for (phase in Phase.entries) {
            val params = draw(context = context(phase = phase))
            game.requiresReveal(params) shouldBe true
            game.scoresOnDuration(params) shouldBe false
        }
    }

    @Test
    fun `without any image it cannot draw`() {
        every { pool.candidates(community) } returns emptyList()

        game.isAvailable(context()) shouldBe false
    }

    @Test
    fun `the photo is the scene asset, frozen once`() {
        val params = draw()
        every { images.playImage(imageId = params.imageId, grid = DedusterGrid.PORTRAIT) } returns byteArrayOf(7)
        every { store.find(roundGameId) } returns null

        game.produceAssets(params)[SCENE_ASSET_KEY].shouldNotBeNull().mediaType shouldBe "image/jpeg"
        game.materialised(params = params, roundGameId = roundGameId)

        verify(exactly = 1) { store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = byteArrayOf(7)) }
    }

    @Test
    fun `the race's second caller does not render again`() {
        every { store.find(roundGameId) } returns StoredImage(mediaType = "image/jpeg", bytes = byteArrayOf(1))

        game.materialised(params = draw(), roundGameId = roundGameId)

        verify(exactly = 0) { images.playImage(imageId = any(), grid = any()) }
    }

    @Test
    fun `a vanished pool image yields no asset rather than a broken round`() {
        every { images.playImage(imageId = any(), grid = any()) } returns null

        game.produceAssets(draw()).shouldBeEmpty()
    }

    @Test
    fun `only the scene key is served`() {
        every { store.find(roundGameId) } returns StoredImage(mediaType = "image/jpeg", bytes = byteArrayOf(1))

        game.asset(params = draw(), roundGameId = roundGameId, key = SCENE_ASSET_KEY).shouldNotBeNull()
        game.asset(params = draw(), roundGameId = roundGameId, key = 0).shouldBeNull()
    }

    @Test
    fun `the history keeps the photo, archiving drops it`() {
        game.releaseStageAssets(listOf(roundGameId))
        verify(exactly = 0) { store.release(any()) }

        game.releaseAssets(listOf(roundGameId))
        verify(exactly = 1) { store.release(listOf(roundGameId)) }
    }

    private fun run(
        reactions: List<Int>,
        endedBy: String,
        wrongTileIndex: Int? = null,
        restarted: Boolean? = null,
        extra: String = "",
    ) = mapper.readTree(
        buildString {
            append("""{"reactionsMs":${reactions},"endedBy":"$endedBy"""")
            if (wrongTileIndex != null) append(""","wrongTileIndex":$wrongTileIndex""")
            if (restarted != null) append(""","restarted":$restarted""")
            append(extra)
            append("}")
        },
    )

    private fun fixed(intervalMs: Int = 1300) = draw().copy(intervalMs = intervalMs)

    @Test
    fun `a complete run qualifies and is ranked on its average reaction`() {
        val params = fixed()
        val judgement = game.judge(params = params, guess = run(reactions = List(48) { 300 + it }, endedBy = "COMPLETE"))

        judgement.qualifies shouldBe true
        judgement.deviation shouldBe 323.5
        val outcome = judgement.outcome as DedusterOutcome
        outcome.tilesCleared shouldBe 48
        outcome.averageReactionMs shouldBe 323.5
        outcome.implausible shouldBe false
    }

    @Test
    fun `a run that ended early does not qualify`() {
        val judgement = game.judge(params = fixed(), guess = run(reactions = listOf(400, 410), endedBy = "TOO_LATE"))

        judgement.qualifies shouldBe false
        (judgement.outcome as DedusterOutcome).tilesCleared shouldBe 2
    }

    /** Zero would read as perfect, and NaN has no business in a column `==` runs over. */
    @Test
    fun `a run without a single hit is as far off as the tempo, and has no average`() {
        val judgement = game.judge(params = fixed(intervalMs = 900), guess = run(reactions = emptyList(), endedBy = "TOO_LATE"))

        judgement.deviation shouldBe 900.0
        (judgement.outcome as DedusterOutcome).averageReactionMs.shouldBeNull()
    }

    @Test
    fun `an unusable run is a client error and costs nothing`() {
        val params = fixed()
        listOf(
            """{"reactionsMs":"fast","endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[1.5],"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[-1],"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":${List(49) { 300 }},"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[300],"endedBy":"COMPLETE"}""",
            """{"reactionsMs":${List(48) { 300 }},"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[300],"endedBy":"BORED"}""",
            """{"reactionsMs":[300],"endedBy":"TOO_LATE","restarted":"yes"}""",
        ).forEach { body ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = mapper.readTree(body)) }
        }
    }

    @Test
    fun `an unusable wrong tile is dropped, not held against the run`() {
        val params = fixed()
        val correctTile = params.order[2]
        listOf(null, -1, 48, correctTile).forEach { wrong ->
            val outcome = game.judge(
                params = params,
                guess = run(reactions = listOf(400, 410), endedBy = "WRONG_TILE", wrongTileIndex = wrong),
            ).outcome as DedusterOutcome

            outcome.endedBy shouldBe DedusterEnd.WRONG_TILE
            outcome.wrongTileIndex.shouldBeNull()
        }
    }

    @Test
    fun `a usable wrong tile is kept for the evaluation`() {
        val params = fixed()
        val wrong = params.order[30]

        (game.judge(params = params, guess = run(reactions = listOf(400, 410), endedBy = "WRONG_TILE", wrongTileIndex = wrong))
            .outcome as DedusterOutcome).wrongTileIndex shouldBe wrong
    }

    /** A run cannot be repeated, so a false alarm must never cost it: marked, stored, scored. */
    @Test
    fun `a reaction faster than a human or slower than the beat marks the run`() {
        val params = fixed(intervalMs = 1000)

        (game.judge(params = params, guess = run(reactions = listOf(119, 400), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe true
        (game.judge(params = params, guess = run(reactions = listOf(400, 1001), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe true
        (game.judge(params = params, guess = run(reactions = listOf(120, 1000), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe false
    }

    @Test
    fun `a restarted run says so`() {
        (game.judge(params = fixed(), guess = run(reactions = listOf(400), endedBy = "TOO_LATE", restarted = true))
            .outcome as DedusterOutcome).restarted shouldBe true
    }

    /** The column is republished to every player who has guessed: only what was checked goes in. */
    @Test
    fun `the stored guess is rebuilt from the checked fields alone`() {
        val stored = game.judge(
            params = fixed(),
            guess = run(reactions = listOf(400), endedBy = "TOO_LATE", extra = ""","order":[1,2,3]"""),
        ).guess.shouldNotBeNull()

        stored.propertyNames().toSet() shouldBe setOf("reactionsMs", "endedBy", "wrongTileIndex", "restarted")
    }
}
