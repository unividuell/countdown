package org.unividuell.countdown.core.rng

import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File

/**
 * The cross-runtime determinism contract, expressed as data.
 *
 * The JVM is the source of truth: [build] derives every expectation from [SeededRandom], and both
 * `SeededRandomGoldenVectorTest` (JVM) and `seededRandom.spec.ts` (browser runtime) assert against
 * the same serialized file. A single shared file is deliberate — duplicating literals in two test
 * files, as the `Slugs`/`slugify` parity pair does, lets one side drift unnoticed.
 */
object RngGoldenVectors {

    const val ALGORITHM = "xoshiro128** / splitmix32-expanded seed / FNV-1a-32 over UTF-8"
    const val VERSION = 1

    /** Resolved relative to the module directory, which is Maven's and Vitest's working directory. */
    val FILE: File = File("../shared/rng/golden-vectors.json")

    val mapper = jacksonObjectMapper()

    enum class SeedKind { INT, STRING }

    data class Seed(val seed: String, val seedKind: SeedKind) {
        fun random(): SeededRandom = when (seedKind) {
            SeedKind.INT -> SeededRandom.fromSeed(seed.toInt())
            SeedKind.STRING -> SeededRandom.fromSeed(seed)
        }
    }

    data class WordsCase(val seed: String, val seedKind: SeedKind, val count: Int, val expected: List<Long>)
    data class IntCase(val seed: String, val seedKind: SeedKind, val bound: Int, val count: Int, val expected: List<Int>)
    data class BetweenCase(val seed: String, val seedKind: SeedKind, val min: Int, val max: Int, val count: Int, val expected: List<Int>)
    data class DoubleCase(val seed: String, val seedKind: SeedKind, val count: Int, val expectedBits: List<String>)
    data class BooleanCase(val seed: String, val seedKind: SeedKind, val count: Int, val expected: String)
    data class ShuffleCase(val seed: String, val seedKind: SeedKind, val size: Int, val expected: List<Int>)
    data class WeightedCase(val seed: String, val seedKind: SeedKind, val weights: List<Double>, val count: Int, val expected: List<Int>)
    data class SampleCase(val seed: String, val seedKind: SeedKind, val size: Int, val k: Int, val expected: List<Int>)
    data class ChecksumCase(val seed: String, val seedKind: SeedKind, val draws: Int, val modulus: Long, val expected: Long)

    data class Vectors(
        val algorithm: String,
        val version: Int,
        val note: String,
        val words: List<WordsCase>,
        val nextInt: List<IntCase>,
        val nextIntBetween: List<BetweenCase>,
        val nextDouble: List<DoubleCase>,
        val nextBoolean: List<BooleanCase>,
        val shuffled: List<ShuffleCase>,
        val weightedPick: List<WeightedCase>,
        val sample: List<SampleCase>,
        val streamChecksum: List<ChecksumCase>,
    )

    private val intSeeds = listOf(0, 1, -1, 42, 7, 99, 2024, 2147483647, -2147483648, 1234567890, -999)
        .map { Seed(it.toString(), SeedKind.INT) }

    // Non-ASCII seeds are the interesting ones: hashing UTF-16 code units instead of UTF-8 bytes
    // silently produces a different stream, and this project's slugs are German.
    private val stringSeeds = listOf("", "a", "huette", "hütte-2026", "Grüße", "straße", "Silvester🎉", "0", "round-1/community-42")
        .map { Seed(it, SeedKind.STRING) }

    private val allSeeds = intSeeds + stringSeeds

    fun build(): Vectors = Vectors(
        algorithm = ALGORITHM,
        version = VERSION,
        note = "Generated from the JVM SeededRandom. Regenerate with: ./mvnw test -Dtest=SeededRandomGoldenVectorTest -Drng.vectors.write=true",
        words = allSeeds.map { s ->
            val r = s.random()
            WordsCase(s.seed, s.seedKind, 12, (1..12).map { r.nextUint32() })
        },
        nextInt = listOf(1, 2, 3, 6, 7, 52, 255, 256, 1000, 65536, 2147483646, 2147483647).map { bound ->
            val s = Seed("42", SeedKind.INT)
            val r = s.random()
            IntCase(s.seed, s.seedKind, bound, 24, (1..24).map { r.nextInt(bound) })
        },
        nextIntBetween = listOf(
            Triple(1, 6, 24),
            Triple(-5, 5, 24),
            Triple(0, 0, 4),
            Triple(-2147483648, 2147483647, 12),
            Triple(2147483640, 2147483647, 12),
        ).map { (min, max, count) ->
            val s = Seed("hütte-2026", SeedKind.STRING)
            val r = s.random()
            BetweenCase(s.seed, s.seedKind, min, max, count, (1..count).map { r.nextIntBetween(min, max) })
        },
        nextDouble = allSeeds.map { s ->
            val r = s.random()
            DoubleCase(s.seed, s.seedKind, 8, (1..8).map { r.nextDouble().toRawBits().toULong().toString(16) })
        },
        nextBoolean = allSeeds.map { s ->
            val r = s.random()
            BooleanCase(s.seed, s.seedKind, 64, (1..64).joinToString("") { if (r.nextBoolean()) "1" else "0" })
        },
        shuffled = listOf(0, 1, 2, 5, 20, 52, 200).map { size ->
            val s = Seed("99", SeedKind.INT)
            val r = s.random()
            ShuffleCase(s.seed, s.seedKind, size, r.shuffled((0 until size).toList()))
        },
        weightedPick = listOf(
            listOf(1.0, 1.0, 1.0),
            listOf(0.1, 0.2, 0.7),
            listOf(1.0, 0.0, 1.0),
            listOf(1e-9, 1.0, 1e9),
            listOf(0.3333333333333333, 0.3333333333333333, 0.3333333333333333),
        ).map { weights ->
            val s = Seed("Grüße", SeedKind.STRING)
            val r = s.random()
            val items = weights.indices.toList()
            WeightedCase(s.seed, s.seedKind, weights, 32, (1..32).map { r.weightedPick(items, weights) })
        },
        sample = listOf(0 to 0, 10 to 0, 10 to 1, 10 to 4, 10 to 10, 52 to 5).map { (size, k) ->
            val s = Seed("round-1/community-42", SeedKind.STRING)
            val r = s.random()
            SampleCase(s.seed, s.seedKind, size, k, r.sample((0 until size).toList(), k))
        },
        // A long run catches divergence that only shows up after the state has fully mixed.
        streamChecksum = listOf(Seed("2024", SeedKind.INT), Seed("straße", SeedKind.STRING)).map { s ->
            val r = s.random()
            val modulus = 1_000_000_007L
            var sum = 0L
            repeat(1_000_000) { sum = (sum + r.nextUint32()) % modulus }
            ChecksumCase(s.seed, s.seedKind, 1_000_000, modulus, sum)
        },
    )
}
