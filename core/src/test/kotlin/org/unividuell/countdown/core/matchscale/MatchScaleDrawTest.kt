package org.unividuell.countdown.core.matchscale

import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThanOrEqual
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.matchscale.MatchScaleDataset.Companion.MAX_FACTOR
import org.unividuell.countdown.core.matchscale.MatchScaleDataset.Companion.withinFactor
import org.unividuell.countdown.core.rng.SeededRandom

class MatchScaleDrawTest {

    private fun entry(name: String, metresPerUnit: Double) = MatchScaleEntry(
        name = name,
        path = "M0 0 l1000 0 l0 500 z",
        width = 1000.0,
        height = 500.0,
        metresPerUnit = metresPerUnit,
        attribution = null,
    )

    private val alpha = MatchScaleCategory(
        key = "alpha",
        displayName = "Alpha",
        entries = listOf(entry("a1", 1.0), entry("a2", 2.0), entry("a3", 4.0), entry("a4", 8.0), entry("a-far", 500.0)),
    )

    private val beta = MatchScaleCategory(
        key = "beta",
        displayName = "Beta",
        entries = listOf(entry("b1", 10.0), entry("b2", 30.0), entry("b3", 90.0)),
    )

    private val dataset = MatchScaleDataset(listOf(alpha, beta))

    private fun draw(seed: Int, used: Map<String, Set<Set<String>>> = emptyMap()) =
        dataset.draw(presentation = SeededRandom.fromSeed(seed), used = used)

    @Test
    fun `the factor always lies within one tenth and ten`() {
        repeat(500) { seed ->
            val factor = draw(seed).factor

            factor shouldBeGreaterThanOrEqual 1 / MAX_FACTOR
            factor shouldBeLessThanOrEqual MAX_FACTOR
        }
    }

    @Test
    fun `a and b are different entries of the same category`() {
        repeat(500) { seed ->
            val pair = draw(seed)

            pair.a shouldNotBe pair.b
            pair.category.entries.contains(pair.a) shouldBe true
            pair.category.entries.contains(pair.b) shouldBe true
        }
    }

    @Test
    fun `the same seed draws the same pair`() {
        repeat(50) { seed -> draw(seed) shouldBe draw(seed) }
    }

    /** Every pair of [category] within the factor, unordered. */
    private fun pairsOf(category: MatchScaleCategory) = category.entries.flatMapIndexed { i, a ->
        category.entries.drop(i + 1).filter { withinFactor(a = a, b = it) }.map { setOf(a.name, it.name) }
    }.toSet()

    @Test
    fun `a pair drawn earlier in the edition is not drawn again, its entries may be`() {
        val used = mapOf(
            "alpha" to pairsOf(alpha) - setOf(setOf("a1", "a2")),
            "beta" to setOf(setOf("b1", "b2"), setOf("b1", "b3")),
        )

        repeat(200) { seed ->
            val pair = draw(seed, used)

            setOf(pair.a.name, pair.b.name) shouldBe
                if (pair.category.key == "alpha") setOf("a1", "a2") else setOf("b2", "b3")
        }
    }

    @Test
    fun `either entry of a pair may stand on the left`() {
        val used = mapOf("alpha" to pairsOf(alpha) - setOf(setOf("a1", "a2")), "beta" to pairsOf(beta))

        val lefts = (0 until 200).map { draw(it, used) }.filter { it.category.key == "alpha" }.map { it.a.name }

        lefts.toSet() shouldBe setOf("a1", "a2")
    }

    @Test
    fun `once a category has no undrawn pair, its block is lifted`() {
        val used = mapOf("alpha" to pairsOf(alpha), "beta" to pairsOf(beta))

        repeat(200) { seed ->
            val pair = draw(seed, used)

            pair.factor shouldBeGreaterThanOrEqual 1 / MAX_FACTOR
            pair.factor shouldBeLessThanOrEqual MAX_FACTOR
        }
    }

    @Test
    fun `every category is drawn`() {
        val keys = (0 until 200).map { draw(it).category.key }.toSet()

        keys shouldBe setOf("alpha", "beta")
    }

    @Test
    fun `the boundary ratio counts as a pair despite rounding`() {
        withinFactor(a = entry("x", 0.3), b = entry("y", 3.0)) shouldBe true
        withinFactor(a = entry("x", 3.0), b = entry("y", 0.3)) shouldBe true
        withinFactor(a = entry("x", 1.0), b = entry("y", 10.01)) shouldBe false
    }
}
