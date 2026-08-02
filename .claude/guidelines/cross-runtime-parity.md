# Cross-runtime parity (JVM ↔ Browser)

Some logic has to run **identically** in Kotlin and in TypeScript — slug derivation today, seeded
RNG for the mini-games next. This file holds the rules that make such a pair safe. The general
project preference still stands: **keep logic in one place** (the countdown engine lives only in
Kotlin and ships absolute instants). Duplicate a function across runtimes **only when both sides
genuinely must compute it locally**, and then treat parity as a contract, not a hope.

Worked examples: `Slugs.slugify` ↔ `slugify.ts` (string parity), `SeededRandom.kt` ↔
`seededRandom.ts` (bit-exact numeric parity — see
[`docs/superpowers/specs/2026-08-02-cross-runtime-rng-design.md`](../../docs/superpowers/specs/2026-08-02-cross-runtime-rng-design.md)).

## Kotlin is the source of truth

Change Kotlin first, mirror TypeScript **in the same commit**, and keep the parity test green.
Add a header comment to the TS mirror naming its Kotlin counterpart.

## Pin the contract in one shared file, not in two test files

For a handful of cases, restating literals in both test files is acceptable (`SlugsTest.kt` /
`slugify.spec.ts`). For anything larger — and for **all numeric** parity — generate golden vectors
from the Kotlin side into a single file under `shared/` and have both suites read **that file**.
Duplicated literals let one side drift without turning red.

```
shared/rng/golden-vectors.json     # written by Kotlin, asserted by Kotlin AND Vitest
```

Give the file a `version` field: changing the values is a breaking change for anything persisted
against it (e.g. a stored RNG seed).

## Only bit-exactly specified operations

Both platforms leave some math **implementation-defined**. Measured on 200k inputs, V8 vs.
JavaScriptCore (i.e. Chrome vs. Safari — no JVM needed to break):

| Safe — identical everywhere | Unsafe — diverges between engines |
|---|---|
| `& \| ^ ~ << >> >>>` (both mask shift ≤ 31) | `sin` `cos` `tan` `log` `exp` `pow` `atan` `cbrt` |
| `Math.imul` ≡ Kotlin `Int * Int` | `Math.random` (obviously) |
| `+` `-` on ≤ 32-bit values | `Intl` / `localeCompare` / `for-in` order |
| IEEE754 `+ - * /`, division by powers of two | multi-byte TypedArray bit reinterpretation |
| `sqrt` (IEEE 754 correctly rounded) | |

A useful corollary: sticking to this list also makes the **JRE vendor and version irrelevant**. The
JLS fixes integer two's-complement wraparound and shift masking, and since Java 17 `strictfp` is
always on (JEP 306), so there is no platform-dependent floating-point precision left. Verified for
the RNG across Temurin, Liberica (what Paketo ships), Corretto, Zulu and OpenJ9 — identical output.
That is precisely what an unspecified JDK internal like `RandomGeneratorFactory` cannot promise.

Consequences:

- **No Gaussian / Box-Muller in shared code.** Draw it server-side and send the value, or use an
  integer-only approximation. On the JVM `StrictMath` is bit-exact — but JS has no `StrictMath`, so
  that escape hatch does not exist for the browser.
- **Never `a * b` on two 32-bit ints in JS** — a binary64 product above 2⁵³ silently loses low bits.
  Use `Math.imul`.
- Use `DataView` with an **explicit** endianness flag; a `Uint32Array` view's byte order is
  implementation-defined.

## Hash strings over UTF-8 bytes, never UTF-16 code units

`charCodeAt` iterates UTF-16 code units; Kotlin's `toByteArray(UTF_8)` iterates bytes. They agree
only for ASCII — and this project's slugs are German. Measured FNV-1a-32 over `hütte-2026`:
`3145535092` (UTF-8) vs. `3329605845` (UTF-16).

```ts
for (const byte of new TextEncoder().encode(seed)) { /* … */ }
```
```kotlin
for (byte in seed.toByteArray(Charsets.UTF_8)) { /* … */ }
```

## A uint32 is signed in Kotlin and unsigned in JS

`x >>> 0` in JS yields a positive `number`; the same bits as a Kotlin `Int` are **negative** above
2³¹. Any comparison (`while (r < threshold)`) then behaves differently on the two sides. Remove the
trap structurally: widen to `Long` in Kotlin (`Int.toUInt().toLong()`) rather than remembering to
compare unsigned.

## Never send a `Long` above 2⁵³ as a JSON number

A JS `Number` is a binary64, so `JSON.parse` silently rounds. The JVM writes
`7205759403792793601`; the SPA reads `7205759403792794000` — no exception, just wrong data. Send
such values as **strings** (or keep them ≤ 32 bit). Applies to any future numeric ID, not just RNG
seeds.

## Do not trust a platform RNG for reproducibility

`kotlin.random.Random` disclaims cross-version stability in its own KDoc, and the JDK's named
`RandomGeneratorFactory` algorithms are unspecified — `L32X64MixRandom`'s per-seed stream actually
changed in an OpenJDK 17.0.x patch release
([JDK-8282551](https://bugs.openjdk.org/browse/JDK-8282551)). Only `java.util.Random` carries a
portability guarantee, and only for the methods it specifies itself. For reproducible game RNG we
therefore ship our own generator on both sides.

Third-party libraries do not solve it either — they add a version-pinning problem without giving a
cross-language guarantee. Two measured examples: Apache Commons RNG 1.6's `XoShiRo128StarStar`
implements the **superseded v1.0** of the algorithm (scrambler on `s[0]`, not `s[1]`) and does not
match the author's reference; npm's `pure-rand` returns only the low 32 bits of xoroshiro128+ and
emits player-visible patterns for small integer seeds. **Pin the algorithm against its canonical
reference** (for us: [prng.di.unimi.it](https://prng.di.unimi.it/xoshiro128starstar.c)) and cite the
variant in a code comment, so nobody later "fixes" it into the wrong one.
