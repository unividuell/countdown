# Cross-runtime parity (JVM ↔ Browser)

Rules for logic that has to compute **identically** in Kotlin and TypeScript. The project
preference stands: **keep logic in one place** (the countdown engine lives only in Kotlin and ships
absolute instants). Duplicate a function across runtimes **only when both sides must compute it
locally**, and then treat parity as a contract.

Worked examples: `Slugs.slugify` ↔ `slugify.ts` (strings), `CountdownEngine` round dates ↔
`editionGrid.ts` (live form preview; vectors in `shared/edition-grid/vectors.json`, rewritten with
`-Dedition.vectors.write=true`), and `SeededRandom.kt` ↔ `seededRandom.reference.ts` (bit-exact
numerics — see
[the RNG spec](../../docs/superpowers/specs/2026-08-02-cross-runtime-rng-design.md)).

**Establish *whether* both sides must compute locally before building the second implementation.**
The RNG's parity is proven and unused: rounds are server-authoritative, because a seed the client
can derive from hands it every future draw. Its TypeScript side therefore lives in test scope
(`webapp-vue/src/lib/rng/__tests__/`), where nobody builds on it.

## Kotlin is the source of truth

Change Kotlin first, mirror TypeScript **in the same commit**, keep the parity test green. The TS
mirror names its Kotlin counterpart in a header comment.

## Pin the contract in one shared file, not in two test files

For a handful of cases, restating literals in both test files is acceptable (`SlugsTest.kt` /
`slugify.spec.ts`). For anything larger — and for **all numeric** parity — generate golden vectors
into one file under `shared/` and have both suites read **that file**: duplicated literals let one
side drift without turning red.

```
shared/rng/golden-vectors.json         # written by Kotlin, asserted by Kotlin AND Vitest
shared/round-assets/seal-vectors.json  # written by Node's crypto, asserted by Kotlin AND Vitest
shared/mix-color/spectral-vectors.json # written by spectral.js 3.0.0 (third implementation), Kotlin only
```

- **The file earns its keep with one consumer too:** it pins the Kotlin side and is the ready
  specification for a second implementation. Dropping a mirror costs no verification.
- **Give it a `version` field** — changing the values breaks anything persisted against it (a
  stored seed). Vectors of a published standard need none (the seal vectors are RFC 8439).
- **Where both sides implement a published standard** (`AssetSeal` on the JDK, `@noble/ciphers` in
  the browser), write the vectors with a third implementation — Node's crypto, recipe in
  `shared/README.md` — so neither side vouches for itself.

## Only bit-exactly specified operations

Both platforms leave some math implementation-defined — V8 and JavaScriptCore already disagree, no
JVM needed:

| Safe — identical everywhere | Unsafe — diverges between engines |
|---|---|
| `& \| ^ ~ << >> >>>` (both mask shift ≤ 31) | `sin` `cos` `tan` `log` `exp` `pow` `atan` `cbrt` |
| `Math.imul` ≡ Kotlin `Int * Int` | `Math.random` |
| `+` `-` on ≤ 32-bit values | `Intl` / `localeCompare` / `for-in` order |
| IEEE754 `+ - * /`, division by powers of two | multi-byte TypedArray bit reinterpretation |
| `sqrt` (IEEE 754 correctly rounded) | |

Sticking to the left column also makes JRE vendor, JRE version and CPU architecture irrelevant.

- **No Gaussian / Box-Muller in shared code.** Draw it server-side and send the value, or use an
  integer-only approximation. JS has no `StrictMath`.
- **Never `a * b` on two 32-bit ints in JS** — a product above 2⁵³ loses low bits. `Math.imul`.
- **Never reinterpret bytes through a multi-byte TypedArray view;** its byte order is
  implementation-defined. `DataView` with an explicit endianness flag.

## Hash strings over UTF-8 bytes, never UTF-16 code units

`charCodeAt` iterates UTF-16 code units, Kotlin's `toByteArray(UTF_8)` bytes. They agree only for
ASCII — and this project's slugs are German.

```ts
for (const byte of new TextEncoder().encode(seed)) { /* … */ }
```
```kotlin
for (byte in seed.toByteArray(Charsets.UTF_8)) { /* … */ }
```

## A uint32 is signed in Kotlin and unsigned in JS

`x >>> 0` in JS is a positive `number`; the same bits as a Kotlin `Int` are **negative** above 2³¹,
so a comparison behaves differently. Widen to `Long` in Kotlin (`Int.toUInt().toLong()`) rather
than remembering to compare unsigned.

## Never send a `Long` above 2⁵³ as a JSON number

`JSON.parse` rounds silently: the JVM writes `7205759403792793601`, the SPA reads
`7205759403792794000`. Send such values as **strings** (or keep them ≤ 32 bit). Applies to any
numeric id.

## Do not trust a platform RNG for reproducibility

- **`kotlin.random.Random` and the JDK's named `RandomGeneratorFactory` algorithms promise no
  stable stream** — one changed in an OpenJDK patch release
  ([JDK-8282551](https://bugs.openjdk.org/browse/JDK-8282551)). We ship our own generator.
- **A third-party library adds a version-pinning problem and no cross-language guarantee.**
- **Pin the algorithm against its canonical reference**
  ([prng.di.unimi.it](https://prng.di.unimi.it/xoshiro128starstar.c)) and cite the variant in a
  code comment, so nobody "fixes" it into the wrong one.
