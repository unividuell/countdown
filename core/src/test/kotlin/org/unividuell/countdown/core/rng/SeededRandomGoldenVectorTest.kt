package org.unividuell.countdown.core.rng

import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test

/**
 * Pins the JVM stream to the committed golden vectors. `seededRandom.spec.ts` asserts the browser
 * implementation against the same file, so the two suites together prove the streams are identical.
 *
 * Regenerate after an intentional algorithm change (which is a breaking change for any persisted
 * seed): `./mvnw test -Dtest=SeededRandomGoldenVectorTest -Drng.vectors.write=true`
 */
class SeededRandomGoldenVectorTest {

    @Test
    fun `jvm stream matches the shared golden vectors`() {
        val generated = RngGoldenVectors.build()

        if (System.getProperty("rng.vectors.write") == "true") {
            RngGoldenVectors.FILE.parentFile.mkdirs()
            val json = RngGoldenVectors.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated)
            RngGoldenVectors.FILE.writeText(json + "\n")
        }

        RngGoldenVectors.FILE.exists() shouldBe true
        val committed = RngGoldenVectors.mapper.readValue(
            RngGoldenVectors.FILE,
            RngGoldenVectors.Vectors::class.java,
        )

        committed.algorithm shouldBe RngGoldenVectors.ALGORITHM
        committed.version shouldBe RngGoldenVectors.VERSION
        committed.words shouldBe generated.words
        committed.nextInt shouldBe generated.nextInt
        committed.nextIntBetween shouldBe generated.nextIntBetween
        committed.nextDouble shouldBe generated.nextDouble
        committed.nextBoolean shouldBe generated.nextBoolean
        committed.shuffled shouldBe generated.shuffled
        committed.weightedPick shouldBe generated.weightedPick
        committed.sample shouldBe generated.sample
        committed.streamChecksum shouldBe generated.streamChecksum
    }

    @Test
    fun `same seed replays the identical stream and different seeds diverge`() {
        val a = SeededRandom.fromSeed(2026)
        val b = SeededRandom.fromSeed(2026)
        val c = SeededRandom.fromSeed(2027)

        val fromA = (1..64).map { a.nextUint32() }
        val fromB = (1..64).map { b.nextUint32() }
        val fromC = (1..64).map { c.nextUint32() }

        fromA shouldBe fromB
        fromA shouldNotBe fromC
    }

    @Test
    fun `raw words stay inside the unsigned 32-bit range`() {
        val random = SeededRandom.fromSeed("range-probe")
        repeat(100_000) {
            val word = random.nextUint32()
            (word in 0L..0xFFFF_FFFFL) shouldBe true
        }
    }

    @Test
    fun `string seeds are hashed over utf-8 bytes so umlauts do not depend on the encoding`() {
        // "hütte" is 6 UTF-8 bytes but 5 UTF-16 code units — hashing the wrong unit is the classic
        // way for a JVM and a browser to disagree while both look correct in isolation.
        val fromString = SeededRandom.fromSeed("hütte")
        val fromBytes = SeededRandom.fromSeed(
            "hütte".toByteArray(Charsets.UTF_8).fold(-0x7ee3623b) { h, b -> (h xor (b.toInt() and 0xff)) * 0x01000193 },
        )

        (1..8).map { fromString.nextUint32() } shouldBe (1..8).map { fromBytes.nextUint32() }
    }

    @Test
    fun `nextInt is unbiased across the whole bound`() {
        val random = SeededRandom.fromSeed(4711)
        val bound = 7
        val draws = 700_000
        val counts = IntArray(bound)
        repeat(draws) { counts[random.nextInt(bound)]++ }

        val expected = draws / bound
        counts.forEach { count ->
            // Chi-square would be the rigorous check; a 2% band is enough to catch modulo bias,
            // which would skew the low residues by ~1/bound here.
            (count > expected * 0.98 && count < expected * 1.02) shouldBe true
        }
    }

    @Test
    fun `shuffled is uniform over all permutations`() {
        // Cross-runtime equality cannot catch this class of bug: a biased shuffle (drawing
        // nextInt(size) instead of nextInt(i + 1)) reproduces perfectly on both platforms and would
        // pass every parity test. Only a distributional check sees it.
        val random = SeededRandom.fromSeed("permutation-uniformity")
        val rounds = 240_000
        val counts = mutableMapOf<List<Int>, Int>()
        repeat(rounds) { counts.merge(random.shuffled(listOf(0, 1, 2, 3)), 1, Int::plus) }

        counts.size shouldBe 24
        val expected = rounds / 24
        counts.values.forEach { count ->
            (count > expected * 0.9 && count < expected * 1.1) shouldBe true
        }
    }

    @Test
    fun `shuffled preserves every element and rejects the identity for a large deck`() {
        val random = SeededRandom.fromSeed("deck")
        val deck = (0 until 52).toList()
        val shuffled = random.shuffled(deck)

        shuffled.sorted() shouldBe deck
        shuffled shouldNotBe deck
        deck shouldBe (0 until 52).toList()
    }
}
