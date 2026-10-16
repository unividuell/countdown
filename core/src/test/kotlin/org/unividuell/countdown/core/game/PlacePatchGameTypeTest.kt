package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.PlacePatchGameType
import org.unividuell.countdown.core.game.internal.PlacePatchOutcome
import org.unividuell.countdown.core.game.internal.PlacePatchParams
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import org.unividuell.countdown.core.placepatch.FrozenPhoto
import org.unividuell.countdown.core.placepatch.PlacePatchImageStore
import org.unividuell.countdown.core.placepatch.PlacePatchImages
import org.unividuell.countdown.core.placepatch.PlacePatchLayout
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.awt.image.BufferedImage
import java.util.UUID

class PlacePatchGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val imageA = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val imageB = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val roundGameId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000f1")

    private val mapper = JsonMapper.builder().build()
    private val pool = mockk<ImagePoolQuery> {
        every { candidateIds(community) } returns listOf(imageA, imageB)
        every { candidateIds(null) } returns emptyList()
        every { displaySize(any()) } returns ImageSize(width = 400, height = 300)
    }
    private val images = mockk<PlacePatchImages>()
    private val store = mockk<PlacePatchImageStore>(relaxed = true)
    private val game = PlacePatchGameType(pool = pool, images = images, store = store, mapper = mapper)

    private val frozen = PlacePatchImages.freeze(
        source = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB),
        layout = PlacePatchLayout(cols = 40, rows = 30, size = 10),
    )

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(previous: List<PlacePatchParams> = emptyList(), phase: Phase = Phase.ONE) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    private fun guess(json: String) = mapper.readTree(json)

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "place-patch"
        game.displayName shouldBe "Platzierung"
    }

    @Test
    fun `a drawn round lays out the photo's grid and hides the patch inside it`() {
        val params = draw()

        (params.cols to params.rows) shouldBe (40 to 30)
        params.size shouldBe 10
        params.x shouldBeInRange 0..30
        params.y shouldBeInRange 0..20
        params.imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `an image this edition already had is not drawn again, a used-up pool counts in full`() {
        val earlier = draw().copy(imageId = imageA)
        repeat(20) { seed ->
            draw(random = random(scene = seed), context = context(previous = listOf(earlier))).imageId shouldBe imageB
        }

        val used = listOf(draw().copy(imageId = imageA), draw().copy(imageId = imageB))
        draw(context = context(previous = used)).imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `the image follows the scene seed only`() {
        draw(random = random(solution = 9, presentation = 9, scene = 3)).imageId shouldBe draw(random = random(scene = 3)).imageId
        (1..40).map { draw(random = random(scene = it)).imageId }.toSet() shouldBe setOf(imageA, imageB)
    }

    @Test
    fun `the fray follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)).fraySeed shouldBe draw(random = random(presentation = 2)).fraySeed
        (1..20).map { draw(random = random(presentation = it)).fraySeed }.toSet().size shouldBeGreaterThan 1
    }

    @Test
    fun `the position follows the solution seed only`() {
        val a = draw(random = random(solution = 1))
        val b = draw(random = random(solution = 1, presentation = 77, scene = 3))

        (b.x to b.y) shouldBe (a.x to a.y)
        (1..20).map { draw(random = random(solution = it)).let { p -> p.x to p.y } }.toSet().size shouldBeGreaterThan 1
    }

    @Test
    fun `phase two is timed - one deliberate reveal, scored on the clock`() {
        val one = draw(context = context(phase = Phase.ONE))
        val two = draw(context = context(phase = Phase.TWO))

        one.timed shouldBe false
        game.requiresReveal(one) shouldBe false
        game.scoresOnDuration(one) shouldBe false
        two.timed shouldBe true
        game.requiresReveal(two) shouldBe true
        game.scoresOnDuration(two) shouldBe true
    }

    @Test
    fun `scene, payload, solution and outcome carry exactly their fields`() {
        val params = draw()

        fields(game.scene(params)) shouldBe setOf("cols", "rows", "size")
        fields(game.present(params)) shouldBe setOf("cols", "rows", "size")
        fields(game.solution(params)) shouldBe setOf("x", "y")
        fields(game.judge(params = params, guess = guess("""{"x":0,"y":0}""")).outcome) shouldBe setOf("correct")
    }

    @Test
    fun `only the exact cell is a hit`() {
        val params = draw().copy(x = 7, y = 4)

        game.judge(params = params, guess = guess("""{"x":7,"y":4}""")).let {
            it.qualifies shouldBe true
            it.deviation shouldBe 0.0
            it.outcome shouldBe PlacePatchOutcome(correct = true)
        }
        listOf(6 to 4, 8 to 4, 7 to 3, 7 to 5).forEach { (x, y) ->
            game.judge(params = params, guess = guess("""{"x":$x,"y":$y}""")).qualifies shouldBe false
        }
    }

    @Test
    fun `the corners of the board are valid guesses`() {
        val params = draw()

        game.judge(params = params, guess = guess("""{"x":0,"y":0}""")).outcome.shouldNotBeNull()
        game.judge(params = params, guess = guess("""{"x":30,"y":20}""")).outcome.shouldNotBeNull()
    }

    @Test
    fun `a malformed or out-of-board guess is refused before anything is written`() {
        val params = draw()
        listOf(
            """{"x":-1,"y":0}""",
            """{"x":31,"y":0}""",
            """{"x":0,"y":21}""",
            """{"y":0}""",
            """{"x":1.5,"y":0}""",
            """{"x":"3","y":0}""",
            """{"x":9999999999,"y":0}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(json)) }
        }
    }

    @Test
    fun `it is available while the community or the global pool has an image`() {
        game.isAvailable(context()) shouldBe true

        every { pool.candidateIds(any()) } returns emptyList()
        game.isAvailable(context()) shouldBe false
    }

    @Test
    fun `board and patch both open with the reveal, every other key keeps its own stage`() {
        val params = draw()

        game.assetStage(params = params, key = 0) shouldBe 0
        game.assetStage(params = params, key = 1) shouldBe 0
        game.assetStage(params = params, key = 2) shouldBe 2
    }

    @Test
    fun `the photo is frozen once, and a second call freezes nothing`() {
        val params = draw()
        every { images.frozen(imageId = params.imageId, layout = any()) } returns frozen
        every { store.find(roundGameId) } returns null

        game.materialised(params = params, roundGameId = roundGameId)

        verify(exactly = 1) { store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = frozen) }

        every { store.find(roundGameId) } returns FrozenPhoto(mediaType = "image/jpeg", bytes = frozen)
        game.materialised(params = params, roundGameId = roundGameId)
        verify(exactly = 1) { images.frozen(imageId = any(), layout = any()) }
    }

    @Test
    fun `a vanished pool image yields no assets rather than a broken round`() {
        every { images.frozen(imageId = any(), layout = any()) } returns null

        game.produceAssets(draw()).shouldBeEmpty()
    }

    @Test
    fun `the board is a JPEG and the patch a PNG, both from the stored photo`() {
        every { store.find(roundGameId) } returns FrozenPhoto(mediaType = "image/jpeg", bytes = frozen)
        val params = draw()

        game.asset(params = params, roundGameId = roundGameId, key = 0).shouldNotBeNull().mediaType shouldBe "image/jpeg"
        game.asset(params = params, roundGameId = roundGameId, key = 1).shouldNotBeNull().mediaType shouldBe "image/png"
        game.asset(params = params, roundGameId = roundGameId, key = SOLUTION_ASSET_KEY).shouldBeNull()
        game.asset(params = params, roundGameId = roundGameId, key = SCENE_ASSET_KEY).shouldBeNull()
    }

    @Test
    fun `the lab gets both pictures at once`() {
        every { images.frozen(imageId = any(), layout = any()) } returns frozen

        game.produceAssets(draw()).keys shouldBe setOf(0, 1)
    }

    @Test
    fun `the history keeps the photo, archiving deletes it`() {
        game.releaseStageAssets(listOf(roundGameId))
        verify(exactly = 0) { store.release(any()) }

        game.releaseAssets(listOf(roundGameId))
        verify(exactly = 1) { store.release(listOf(roundGameId)) }
    }
}
