#!/usr/bin/env node
/**
 * Draws Verrohrung's pixel tiles, each 32×32 RGBA PNG: the plate, cool and glowing; the pipes; the
 * stone fountain and the wooden hot tub, hot or cold, at the ends; and three puddles of dirty water
 * that mark a burst pipe or a pipe the water never reached.
 *
 * Layers per cell: the plate stands still, so it may carry light from the top left; the pipe turns,
 * so its shading is symmetric about the pipe's axis — it must look right in all four turns. Every
 * pipe is drawn at rotation 0 (straight N–S, elbow N–E, an end's stub N), the convention the server
 * and the board share. Fountain, tub and puddles never turn: they stand upright on top, and an end's
 * stub turns beneath its picture. The puddles come in three seeded variants so a field of them does
 * not repeat. As it stands, it reproduces the committed webapp-vue/src/games/turnpipes/tiles/*.png
 * byte for byte.
 *
 * Usage: node scripts/turn-pipes-tiles.mts [outDir]   (default: webapp-vue/src/games/turnpipes/tiles)
 *
 * Node 24, no dependencies: types are stripped by Node, the PNG is written by hand (zlib).
 */
import { crc32, deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 32;
const C = S / 2;

type Px = string | null;
type Painter = (x: number, y: number) => Px;

const OUT = "#151826";
const BODY = "#2c3454";
const HI = "#4a5680";
const FLANGE = "#3b4569";
const FLANGE_HI = "#5c6894";
const WATER = "#2f86e8";
const WATER_HI = "#8fd2ff";

/** The plate as it lies, and glowing where the water has run: every tile heats the hot tub. */
const COOL = {
  plate: "#b4b1be",
  hi: "#d4d2dc",
  lo: "#8f8c9b",
  out: "#6c6979",
  rivet: "#ecebf1",
};
/** Amber, not red: red reads as an error on a tile that is right. */
const HOT = {
  plate: "#e9a12a",
  hi: "#ffd067",
  lo: "#b07316",
  out: "#704508",
  rivet: "#fff6d6",
};

/** Half-widths: pipe 7 (14 of 32 px), flange 8; water channel 4.5. */
const HW = 7;
const FW = 8;
const CH = 4.5;
const FLANGE_LEN = 3;

/** One cross-section of the pipe at distance [d] from its axis. */
function section(
  d: number,
  flange: boolean,
  face: boolean,
  water: boolean,
): Px {
  const hw = flange ? FW : HW;
  if (d >= hw) return null;
  if (d >= hw - 1 || face) return OUT;
  if (water && d < CH) return d < 1.5 ? WATER_HI : WATER;
  if (flange) return d < 1.5 ? FLANGE_HI : FLANGE;
  return d < 1.5 ? HI : BODY;
}

const straight =
  (water: boolean): Painter =>
  (x, y) => {
    const d = Math.abs(x + 0.5 - C);
    const t = Math.min(y, S - 1 - y);
    return section(d, t < FLANGE_LEN, t === FLANGE_LEN - 1, water);
  };

const elbow =
  (water: boolean): Painter =>
  (x, y) => {
    // Arc around the top-right corner, through both edge midpoints.
    const r = Math.hypot(x + 0.5 - S, y + 0.5);
    const d = Math.abs(r - C);
    const t = Math.min(y, S - 1 - x);
    return section(d, t < FLANGE_LEN, t === FLANGE_LEN - 1, water);
  };

/** An end's stub: from the north edge to the middle, under the end's upright picture. */
const stub =
  (water: boolean): Painter =>
  (x, y) => {
    if (y > C - 1) return null;
    return section(
      Math.abs(x + 0.5 - C),
      y < FLANGE_LEN,
      y === FLANGE_LEN - 1,
      water,
    );
  };

const plate =
  (p: typeof COOL): Painter =>
  (x, y) => {
    // 1 px gap all round, 3 px corner radius.
    const lo = 1;
    const hi = S - 2;
    if (x < lo || y < lo || x > hi || y > hi) return null;
    const cx = x < lo + 3 ? lo + 3 : x > hi - 3 ? hi - 3 : x;
    const cy = y < lo + 3 ? lo + 3 : y > hi - 3 ? hi - 3 : y;
    if (Math.hypot(x - cx, y - cy) > 3.2) return null;

    const edge = Math.min(x - lo, hi - x, y - lo, hi - y);
    if (edge === 0 || Math.hypot(x - cx, y - cy) > 2.4) return p.out;

    // Rivets in the corners: a light pixel with a shadow below right.
    for (const [rx, ry] of [
      [4, 4],
      [S - 6, 4],
      [4, S - 6],
      [S - 6, S - 6],
    ] as const) {
      if (x === rx && y === ry) return p.rivet;
      if (x === rx + 1 && y === ry + 1) return p.lo;
    }

    // Bevel: light top/left, dark bottom/right.
    if (edge === 1) return x - lo === 1 || y - lo === 1 ? p.hi : p.lo;
    return p.plate;
  };

/** mulberry32: a few seeded numbers, the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (max: number) => Math.floor(next() * max) };
}

/** Smooth value noise on a grid of [cell] px, 0..1, wrapping. */
function noise(seed: number, cell: number) {
  const r = rng(seed);
  const n = Math.ceil(S / cell);
  const g = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => r.next()),
  );
  const ease = (t: number) => t * t * (3 - 2 * t);
  const at = (i: number, j: number) =>
    g[((j % n) + n) % n]![((i % n) + n) % n]!;
  return (x: number, y: number) => {
    const gx = x / cell;
    const gy = y / cell;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = ease(gx - ix);
    const fy = ease(gy - iy);
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

// Dirty water, translucent (#rrggbbaa) so plate and pipe show through: murky brown-olive, a dark
// edge, light ripples, a few opaque glints.
const DIRTY = {
  edge: "#33291acc",
  deep: "#5c4b2bb8",
  mid: "#76653ea8",
  ripple: "#b0a074c8",
  glint: "#ece3c8",
};

/** Water inside f < 0: an edge one pixel in, ripples where the wave crests. */
function water(
  f: (x: number, y: number) => number,
  wave: (x: number, y: number) => number,
  glints: [number, number][],
): Painter {
  return (x, y) => {
    const v = f(x + 0.5, y + 0.5);
    if (v >= 0) return null;
    if (glints.some(([gx, gy]) => gx === x && gy === y)) return DIRTY.glint;
    if (v > -1.1) return DIRTY.edge;
    const w = wave(x, y);
    if (w > 0.82) return DIRTY.ripple;
    return w > 0.35 ? DIRTY.mid : DIRTY.deep;
  };
}

const over =
  (...painters: Painter[]): Painter =>
  (x, y) => {
    for (const p of painters) {
      const c = p(x, y);
      if (c) return c;
    }
    return null;
  };

const drop = (dx: number, dy: number, rad: number): Painter =>
  water(
    (x, y) => Math.hypot(x - dx, y - dy) - rad,
    () => 0.5,
    [[Math.floor(dx - rad / 2), Math.floor(dy - rad / 2)]],
  );

/** A puddle of dirty water spreading over the plate, with ripples and four drops around it. */
function puddle(seed: number): Painter {
  const n = noise(seed, 8);
  const m = noise(seed + 50, 5);
  const r = rng(seed + 9);
  const cx = 15 + r.int(3);
  const cy = 16 + r.int(3);
  const body = water(
    (x, y) => Math.hypot(x - cx, (y - cy) * 1.1) - (10 + 5 * n(x, y)),
    (x, y) =>
      0.5 + 0.5 * Math.sin(Math.hypot(x - cx, y - cy) * 1.4 + m(x, y) * 7),
    [
      [cx - 5, cy - 4],
      [cx - 4, cy - 5],
      [cx + 4, cy + 2],
    ],
  );
  const drops = Array.from({ length: 4 }, () => {
    const a = r.next() * Math.PI * 2;
    const d = 14.5 + r.next() * 1.5;
    return drop(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      1.4 + r.next() * 0.8,
    );
  });
  return over(body, ...drops);
}

/** A small pixel canvas for the end pictures, drawn shape by shape and outlined once. */
class Canvas {
  private px: Px[] = Array<Px>(S * S).fill(null);

  get(x: number, y: number): Px {
    return x < 0 || y < 0 || x >= S || y >= S ? null : this.px[y * S + x]!;
  }

  set(x: number, y: number, c: string): void {
    if (x >= 0 && y >= 0 && x < S && y < S) this.px[y * S + x] = c;
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: string): void {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }

  disc(cx: number, cy: number, r: number, c: string): void {
    this.shape((x, y) => (Math.hypot(x - cx, y - cy) <= r ? c : null));
  }

  /** [f] sees pixel centres. */
  shape(f: (x: number, y: number) => Px): void {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const c = f(x + 0.5, y + 0.5);
        if (c) this.set(x, y, c);
      }
  }

  /** One dark pixel around everything drawn so far. */
  outline(): this {
    const ring: [number, number][] = [];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (this.get(x, y)) continue;
        const touches = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => {
          const c = this.get(x + dx!, y + dy!);
          return c !== null && c !== OUT;
        });
        if (touches) ring.push([x, y]);
      }
    for (const [x, y] of ring) this.set(x, y, OUT);
    return this;
  }

  painter(): Painter {
    return (x, y) => this.get(x, y);
  }
}

const STONE = "#8d8a84";
const STONE_HI = "#aaa69e";
const STONE_LO = "#6d6a64";
const BRASS = "#c9a24a";
const BRASS_LO = "#a07a2a";

/** The inlet: a stone pillar with a brass spout, pouring into a walled basin. */
function fountain(): Painter {
  const c = new Canvas();
  c.rect(14, 6, 18, 19, STONE);
  c.rect(14, 6, 14, 19, STONE_HI);
  c.rect(13, 5, 19, 6, STONE_LO);
  c.rect(9, 10, 14, 11, BRASS);
  c.rect(9, 10, 9, 12, BRASS_LO);
  c.rect(9, 13, 10, 19, WATER);
  c.rect(9, 13, 9, 19, WATER_HI);
  c.rect(6, 19, 26, 27, STONE);
  for (const y of [22, 25]) c.rect(6, y, 26, y, STONE_LO);
  for (const x of [11, 17, 22]) c.rect(x, 20, x, 21, STONE_LO);
  for (const x of [8, 14, 20]) c.rect(x, 23, x, 24, STONE_LO);
  c.rect(7, 19, 25, 20, WATER);
  c.rect(12, 19, 15, 19, WATER_HI);
  return c.outline().painter();
}

const WOOD = "#9a6a36";
const WOOD_LO = "#86592a";
const WOOD_RIM = "#b07a42";
const HOOP = "#3a3a42";
const FLUE = "#2e2f36";
const FLUE_HI = "#4a4c56";
const EMPTY = "#3a2a1a";

const ICE = "#e8f7ff";
const ICE_LO = "#a9d3ee";

/**
 * The outlet: a round wooden hot tub with its stove pipe. Hot, it steams and the stove smokes —
 * drawn after the outline, so the wisps stay soft. Cold — the water came but missed pipes — it is
 * frozen over, snow lies on the rim and the stove's cap, icicles hang down; no steam, no smoke.
 */
function tub(water: "none" | "hot" | "cold"): Painter {
  const c = new Canvas();
  c.rect(23, 7, 25, 17, FLUE);
  c.rect(23, 7, 23, 17, FLUE_HI);
  c.rect(22, 6, 26, 6, FLUE);
  c.rect(23, 5, 25, 5, FLUE);
  if (water === "cold") {
    c.rect(22, 5, 26, 5, ICE);
    c.rect(23, 4, 25, 4, ICE);
  }
  c.shape((x, y) =>
    y >= 15 && y <= 27 && x >= 5 && x <= 24
      ? Math.floor(x / 3) % 2
        ? WOOD
        : WOOD_LO
      : null,
  );
  c.rect(5, 18, 24, 18, HOOP);
  c.rect(5, 24, 24, 24, HOOP);
  c.shape((x, y) => {
    if (Math.hypot((x - 14.5) / 10, (y - 15) / 2.6) >= 1) return null;
    if (Math.hypot((x - 14.5) / 8.4, (y - 15.2) / 1.7) >= 1)
      return water === "cold" ? ICE : WOOD_RIM;
    return { none: EMPTY, hot: WATER, cold: ICE_LO }[water];
  });
  if (water === "hot") c.rect(10, 15, 13, 15, WATER_HI);

  if (water === "cold") {
    // Cracks in the ice.
    for (const [x, y] of [
      [9, 15],
      [10, 14],
      [11, 15],
      [12, 16],
      [14, 15],
      [16, 14],
      [17, 15],
      [18, 15],
      [19, 16],
    ] as const)
      c.set(x, y, ICE);
    // Icicles of different lengths under the rim: [x, length].
    for (const [x, length] of [
      [7, 3],
      [10, 5],
      [13, 2],
      [17, 4],
      [21, 3],
    ] as const) {
      c.rect(x, 18, x + 1, 18, ICE);
      for (let y = 19; y < 18 + length; y++)
        c.set(x, y, y === 17 + length ? ICE_LO : ICE);
    }
  }
  c.outline();

  if (water === "hot") {
    for (const x0 of [10, 15, 19])
      for (let y = 6; y <= 12; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.9) * 1.1);
        c.set(x, y, "#ffffffa0");
        c.set(x + 1, y, "#ffffff50");
      }
    for (const [cx, cy, r] of [
      [25, 2.5, 1.8],
      [27, 0.5, 1.4],
    ] as const)
      c.disc(cx, cy, r, "#9aa0aab0");
  }
  return c.painter();
}

/** 8-bit RGBA, no filter; an unpainted pixel stays transparent. */
function png(paint: Painter): Buffer {
  const row = 1 + S * 4;
  const raw = Buffer.alloc(S * row);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = paint(x, y);
      if (c === null) continue;
      const alpha = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255;
      raw.set(
        [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(alpha),
        y * row + 1 + x * 4,
      );
    }
  }

  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(S, 0);
  header.writeUInt32BE(S, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TILES: Record<string, Painter> = {
  "plate.png": plate(COOL),
  "plate-hot.png": plate(HOT),
  "straight-dry.png": straight(false),
  "straight-wet.png": straight(true),
  "elbow-dry.png": elbow(false),
  "elbow-wet.png": elbow(true),
  // The fountain's stub holds water from the start.
  "stub-dry.png": stub(false),
  "stub-wet.png": stub(true),
  "fountain.png": fountain(),
  "tub-dry.png": tub("none"),
  "tub-wet.png": tub("hot"),
  "tub-cold.png": tub("cold"),
  // Seeds picked on the contact sheet (2026-11-19).
  "puddle-1.png": puddle(23),
  "puddle-2.png": puddle(40),
  "puddle-3.png": puddle(57),
};

const outDir = process.argv[2] ?? "webapp-vue/src/games/turnpipes/tiles";
for (const [name, paint] of Object.entries(TILES))
  writeFileSync(`${outDir}/${name}`, png(paint));
