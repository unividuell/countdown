# `shared/`

Contracts that **both** `core/` (Kotlin) and `webapp-vue/` (TypeScript) assert against. Checked in,
not generated at build time — deleting a file here breaks tests in both suites.

| File | Contract | Written by | Asserted by |
|---|---|---|---|
| `rng/golden-vectors.json` | The seeded-RNG stream must be byte-identical on the JVM and in the browser | `SeededRandomGoldenVectorTest` (`-Drng.vectors.write=true`) | the same Kotlin test **and** `webapp-vue/src/lib/rng/__tests__/seededRandom.spec.ts` |

Rationale and the rules for such pairs:
[`.claude/guidelines/cross-runtime-parity.md`](../.claude/guidelines/cross-runtime-parity.md).

Changing a committed vector is a **breaking change** for anything persisted against it (e.g. a
stored RNG seed) — bump the file's `version` field when you do.
