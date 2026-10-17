# `shared/`

Contracts that **both** `core/` (Kotlin) and `webapp-vue/` (TypeScript) assert against. Checked in,
not generated at build time — deleting a file here breaks tests in both suites.

| File | Contract | Written by | Asserted by |
|---|---|---|---|
| `rng/golden-vectors.json` | The seeded-RNG stream must be byte-identical on the JVM and in the browser | `SeededRandomGoldenVectorTest` (`-Drng.vectors.write=true`) | the same Kotlin test **and** `webapp-vue/src/lib/rng/__tests__/seededRandom.spec.ts` |
| `copy-blocks/fit.json` | How Blockierung's `fit` maps a guess cell onto the template, and back | by hand — seven cases; Kotlin's `Fit` is the source of truth | `FitGoldenVectorTest` **and** `webapp-vue/src/games/copyblocks/__tests__/fit.spec.ts` |
| `round-assets/seal-vectors.json` | A round asset sealed with ChaCha20-Poly1305 (`nonce ‖ ciphertext ‖ tag`) opens in the browser with `@noble/ciphers` | Node's built-in crypto, see below — an implementation independent of both sides | `AssetSealTest` **and** the frontend's decrypt spec |

For the RNG the browser side is a **test-scope reference implementation**, not production code —
rounds are server-authoritative. The file still pins the Kotlin generator against accidental change,
and it is the specification a future browser implementation would be built against.

Rationale and the rules for such pairs:
[`.claude/guidelines/cross-runtime-parity.md`](../.claude/guidelines/cross-runtime-parity.md).

Changing a committed vector is a **breaking change** for anything persisted against it (e.g. a
stored RNG seed) — bump the file's `version` field when you do.

## `round-assets/`

`seal-vectors.json` holds two sealed assets under one key and nonce: an empty plaintext (the sealed
form is nonce + tag, 28 bytes) and 300 bytes. Each vector is hex: `keyHex`, `nonceHex`, `plaintextHex`,
`sealedHex` (`nonce ‖ ciphertext ‖ tag`). It has no `version` field: a change is a format change, not a
tweak.

Written by Node's built-in crypto, so neither the JDK nor `@noble/ciphers` vouches for itself. Run from
the repo root:

```bash
node -e '
const c = require("crypto");
const key = Buffer.from([...Array(32).keys()]);
const nonce = Buffer.from([...Array(12).keys()].map(i => 0xa0 + i));
const plaintexts = [Buffer.alloc(0), Buffer.from([...Array(300).keys()].map(i => i % 251))];
const vectors = plaintexts.map(p => {
  const e = c.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
  const ct = Buffer.concat([e.update(p), e.final()]);
  return { keyHex: key.toString("hex"), nonceHex: nonce.toString("hex"),
           plaintextHex: p.toString("hex"), sealedHex: Buffer.concat([nonce, ct, e.getAuthTag()]).toString("hex") };
});
console.log(JSON.stringify({ vectors }, null, 2));' > shared/round-assets/seal-vectors.json
```
