package org.unividuell.countdown.core.rng

/**
 * xoshiro128** with splitmix32 seed expansion. Reproducible by design: a round can be re-derived from
 * its seed at any time, so nothing generated has to be persisted. No platform RNG offers that —
 * `kotlin.random.Random` disclaims cross-version stability, and `L32X64MixRandom` changed its
 * per-seed stream in an OpenJDK patch release (JDK-8282551).
 *
 * The stream is also reproducible in a browser runtime, pinned by `shared/rng/golden-vectors.json`
 * against a test-scope reference implementation in
 * `webapp-vue/src/lib/rng/__tests__/seededRandom.reference.ts`. That property is verified but
 * deliberately unused: rounds are server-authoritative, and a seed that reaches the client reveals
 * every future draw.
 *
 * [nextUint32] follows Blackman/Vigna's reference verbatim — https://prng.di.unimi.it/xoshiro128starstar.c
 * — i.e. **v1.1, whose scrambler reads `s1`**. The superseded v1.0 reads `s0` and yields a different
 * stream; Apache Commons RNG still ships that older variant, so "aligning with the library" would
 * break the contract rather than fix it.
 *
 * Only operations mandated bit-for-bit by both the JVM and ECMAScript are used: 32-bit two's
 * complement arithmetic and IEEE754 add/multiply/divide by powers of two. `Math.log`, `sin`, `cos`,
 * `exp`, `pow`, `atan` and `cbrt` are implementation-approximated on both platforms and measurably
 * disagree between JS engines (V8 vs JavaScriptCore differ by 1 ulp), so they must never appear here.
 *
 * The `rng` module owns no tables and holds no state beyond an instance's four words, so it needs
 * neither a schema nor a Flyway migration. It is the exposed API of the module: construct one per
 * seeded unit of work (a round, a puzzle) and let it go — never share an instance across requests,
 * since every draw mutates the state and would desync a concurrent replay.
 *
 * See `docs/superpowers/specs/2026-08-02-cross-runtime-rng-design.md`.
 */
class SeededRandom private constructor(
    private var s0: Int,
    private var s1: Int,
    private var s2: Int,
    private var s3: Int,
) {

    companion object {
        private const val FNV_OFFSET_BASIS = -0x7ee3623b // 0x811c9dc5
        private const val FNV_PRIME = 0x01000193
        private const val GOLDEN_GAMMA_32 = -0x61c88647 // 0x9e3779b9
        private const val TWO_POW_32 = 0x1_0000_0000L
        private const val TWO_POW_26 = 67108864.0
        private const val TWO_POW_53 = 9007199254740992.0

        fun fromSeed(seed: Int): SeededRandom {
            var a = seed
            val state = IntArray(4)
            for (i in 0 until 4) {
                a += GOLDEN_GAMMA_32
                var t = a xor (a ushr 16)
                t *= 0x21f0aaad
                t = t xor (t ushr 15)
                t *= 0x735a2d97
                state[i] = t xor (t ushr 15)
            }
            // xoshiro cannot escape the all-zero state; splitmix32 can only produce it for one seed.
            if (state[0] or state[1] or state[2] or state[3] == 0) state[0] = 1
            return SeededRandom(state[0], state[1], state[2], state[3])
        }

        /** Hashed over the UTF-8 bytes — hashing UTF-16 code units would diverge for "hütte". */
        fun fromSeed(seed: String): SeededRandom {
            var h = FNV_OFFSET_BASIS
            for (byte in seed.toByteArray(Charsets.UTF_8)) {
                h = h xor (byte.toInt() and 0xff)
                h *= FNV_PRIME
            }
            return fromSeed(h)
        }

        private fun rotl(x: Int, k: Int): Int = (x shl k) or (x ushr (32 - k))
    }

    /** The raw xoshiro128** stream, widened so the value is unsigned and comparisons are safe. */
    fun nextUint32(): Long {
        val result = rotl(s1 * 5, 7) * 9
        val t = s1 shl 9
        s2 = s2 xor s0
        s3 = s3 xor s1
        s1 = s1 xor s2
        s0 = s0 xor s3
        s2 = s2 xor t
        s3 = rotl(s3, 11)
        return result.toUInt().toLong()
    }

    /** Unbiased via rejection — a plain `% span` would over-represent the low residues. */
    private fun nextBounded(span: Long): Long {
        val threshold = TWO_POW_32 % span
        var r = nextUint32()
        while (r < threshold) r = nextUint32()
        return r % span
    }

    fun nextInt(boundExclusive: Int): Int {
        require(boundExclusive > 0) { "bound must be positive, was $boundExclusive" }
        return nextBounded(boundExclusive.toLong()).toInt()
    }

    fun nextIntBetween(min: Int, maxInclusive: Int): Int {
        require(maxInclusive >= min) { "max must not be below min, was $min..$maxInclusive" }
        val span = maxInclusive.toLong() - min.toLong() + 1L
        return (min + nextBounded(span)).toInt()
    }

    /** 53 bits from two words, scaled by an exact power of two, so the result is bit-identical. */
    fun nextDouble(): Double {
        val hi = nextUint32() ushr 5
        val lo = nextUint32() ushr 6
        return (hi * TWO_POW_26 + lo) / TWO_POW_53
    }

    /**
     * The most significant bit — the conservative choice, and the one `java.util.Random.next(1)`
     * makes too. Switching to `and 1` would need the vectors regenerated on both sides.
     */
    fun nextBoolean(): Boolean = (nextUint32() ushr 31) != 0L

    /**
     * Fisher-Yates, descending, drawing `nextInt(i + 1)`.
     *
     * Drawing `nextInt(size)` instead is genuinely biased. Running ascending is *not* biased but
     * produces a different permutation for the same seed — and, like the biased variant, it
     * reproduces identically on both platforms, so no parity test would catch either mistake. The
     * direction is pinned only by the golden vectors. `Collections.shuffle`/`MutableList.shuffle`
     * must not be used: their draw order is tied to `java.util.Random`, which has no browser
     * counterpart.
     */
    fun <T> shuffled(items: List<T>): List<T> {
        val out = items.toMutableList()
        for (i in out.size - 1 downTo 1) {
            val j = nextInt(i + 1)
            val swapped = out[i]
            out[i] = out[j]
            out[j] = swapped
        }
        return out
    }

    fun <T> pick(items: List<T>): T {
        require(items.isNotEmpty()) { "cannot pick from an empty list" }
        return items[nextInt(items.size)]
    }

    /** Weights are summed left to right so the browser performs the identical additions. */
    fun <T> weightedPick(items: List<T>, weights: List<Double>): T {
        require(items.isNotEmpty() && items.size == weights.size) {
            "items and weights must be non-empty and equal in length"
        }
        var total = 0.0
        for (w in weights) {
            require(w >= 0.0) { "weights must be non-negative, was $w" }
            total += w
        }
        require(total > 0.0) { "weights must not sum to zero" }
        val target = nextDouble() * total
        var cumulative = 0.0
        for (i in items.indices) {
            cumulative += weights[i]
            if (target < cumulative) return items[i]
        }
        return items[items.size - 1]
    }

    /** Without replacement. Equivalent to taking the first k of a full shuffle. */
    fun <T> sample(items: List<T>, k: Int): List<T> {
        require(k in 0..items.size) { "k must be within 0..${items.size}, was $k" }
        return shuffled(items).take(k)
    }
}
