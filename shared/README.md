# `shared/`

Contracts that **both** `core/` (Kotlin) and `webapp-vue/` (TypeScript) assert against. Checked in,
not generated at build time — deleting a file here breaks tests in both suites.

| File | Contract | Written by | Asserted by |
|---|---|---|---|
| `rng/golden-vectors.json` | The seeded-RNG stream must be byte-identical on the JVM and in the browser | `SeededRandomGoldenVectorTest` (`-Drng.vectors.write=true`) | the same Kotlin test **and** `webapp-vue/src/lib/rng/__tests__/seededRandom.spec.ts` |
| `edition-grid/vectors.json` | Round start/`roundAt` arithmetic of the edition form's calendar, in `CountdownEngine` and in TS | `EditionGridGoldenVectorTest` (`-Dedition.vectors.write=true`) | the same Kotlin test **and** `webapp-vue/src/communities/edition/__tests__/editionGrid.spec.ts` |
| `copy-blocks/fit.json` | How Blockierung's `fit` maps a guess cell onto the template, and back | by hand — seven cases; Kotlin's `Fit` is the source of truth | `FitGoldenVectorTest` **and** `webapp-vue/src/games/copyblocks/__tests__/fit.spec.ts` |
| `round-assets/seal-vectors.json` | A round asset sealed with ChaCha20-Poly1305 (`nonce ‖ ciphertext ‖ tag`) opens in the browser with `@noble/ciphers` | Node's built-in crypto, see below — an implementation independent of both sides | `AssetSealTest` **and** the frontend's decrypt spec |
| `mix-color/spectral-vectors.json` | Pigment mixing (Kubelka-Munk) and OKLab ΔE of Anrührung, ported from spectral.js to Kotlin: hex exact, OKLab to 1e-9 | spectral.js 3.0.0 itself, see below — a third implementation vouches for the port | `MixingGoldenVectorTest` |
| `stack-floor/tower.json` | Hochstapler's tower: position of the sliding bar, the cut, the whole tower from click times | `TowerGoldenVectorTest` (`-Dstackfloor.vectors.write=true`) | the same Kotlin class **and** `webapp-vue/src/games/stackfloor/__tests__/tower.spec.ts` |

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

## `mix-color/`

`spectral-vectors.json` holds `mixes` (recipe by pigment key `c m y w k` -> `#RRGGBB` and the OKLab of that hex)
and `deltaE` (100 x OKLab distance of two hexes). It has no `version` field: only recipes are stored, the
colour is mixed anew each time. Kotlin asserts hex exactly and OKLab to 1e-9; if a hex flips on a
V8/JVM rounding boundary, swap that recipe here rather than loosen the check.

Written by spectral.js 3.0.0, installed once outside the project (it is in no `package.json`). Mixing
runs in pigment order `c m y w k`, as `mixHex` does. Run from the repo root:

```bash
D=$(mktemp -d) && (cd "$D" && npm i --no-save spectral.js@3.0.0)
SPECTRAL="$D/node_modules/spectral.js" node -e '
const { Color, mix } = require(process.env.SPECTRAL);
const P = { c: "#00A0E9", m: "#E4007C", y: "#FFE600", w: "#FFFFFF", k: "#1A1A1A" };
const recipes = [
  { c: 1 }, { m: 1 }, { y: 1 }, { w: 1 }, { k: 1 },
  { c: 1, m: 1 }, { c: 1, y: 1 }, { c: 1, w: 1 }, { c: 1, k: 1 }, { m: 1, y: 1 },
  { m: 1, w: 1 }, { m: 1, k: 1 }, { y: 1, w: 1 }, { y: 1, k: 1 }, { w: 1, k: 1 },
  { c: 1, m: 1, y: 1 },
  { c: 1, m: 1, k: 5 }, { y: 1, k: 6 },
  { c: 1, w: 8 }, { m: 2, y: 1, w: 7 },
  { c: 5, m: 4, y: 3, w: 5, k: 3 }, { c: 7, y: 6, w: 4, k: 3 },
  { c: 3, y: 1 }, { m: 1, y: 2 }, { m: 1, y: 5 },
  { c: 1, m: 1 }, { c: 2, m: 2 }, { y: 1, k: 1 }, { y: 3, k: 3 },
];
const mixes = recipes.map((recipe) => {
  const parts = Object.keys(P).filter((k) => recipe[k] > 0).map((k) => [new Color(P[k]), recipe[k]]);
  const hex = mix(...parts).toString();
  return { recipe, hex, oklab: new Color(hex).OKLab };
});
const pairs = [["#FF0000", "#00FF00"], ["#000000", "#FFFFFF"], ["#336699", "#336699"], ["#C8A040", "#C0A848"], ["#00A0E9", "#E4007C"], ["#808080", "#8C8C8C"]];
mixes.slice(0, 4).forEach((m, i) => pairs.push([m.hex, mixes[i + 5].hex]));
const deltaE = pairs.map(([a, b]) => {
  const [L1, a1, b1] = new Color(a).OKLab, [L2, a2, b2] = new Color(b).OKLab;
  return { a, b, deltaE: 100 * Math.hypot(L1 - L2, a1 - a2, b1 - b2) };
});
console.log(JSON.stringify({ mixes, deltaE }, null, 2));
' > shared/mix-color/spectral-vectors.json
```
