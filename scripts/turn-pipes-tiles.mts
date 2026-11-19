#!/usr/bin/env node
/**
 * Draws Verrohrung's pixel tiles, each 32×32 RGBA PNG: the plate, the pipes, and three puddles of
 * dirty water that mark a burst pipe or a pipe the water never reached.
 *
 * Two layers per cell: the plate stands still, so it may carry light from the top left; the pipe
 * turns, so its shading is symmetric about the pipe's axis — it must look right in all four turns.
 * Every pipe is drawn at rotation 0 (straight N–S, elbow N–E, ends N), the convention the server and
 * the board share. The puddles never turn; they come in three seeded variants so a field of them
 * does not repeat. As it stands, it reproduces the committed webapp-vue/src/games/turnpipes/tiles/*.png
 * byte for byte.
 *
 * Usage: node scripts/turn-pipes-tiles.mts [outDir]   (default: webapp-vue/src/games/turnpipes/tiles)
 *
 * Node 24, no dependencies: types are stripped by Node, the PNG is written by hand (zlib).
 */
import { crc32, deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const S = 32
const C = S / 2

type Px = string | null
type Painter = (x: number, y: number) => Px

const OUT = '#151826'
const BODY = '#2c3454'
const HI = '#4a5680'
const FLANGE = '#3b4569'
const FLANGE_HI = '#5c6894'
const WATER = '#2f86e8'
const WATER_HI = '#8fd2ff'

const PLATE = '#b4b1be'
const PLATE_HI = '#d4d2dc'
const PLATE_LO = '#8f8c9b'
const PLATE_OUT = '#6c6979'
const RIVET = '#ecebf1'

const WHEEL = '#c8423c'
const WHEEL_HI = '#ee7a6e'
const HOLE = '#0b0d16'

/** Half-widths: pipe 7 (14 of 32 px), flange 8; water channel 4.5. */
const HW = 7
const FW = 8
const CH = 4.5
const FLANGE_LEN = 3

/** One cross-section of the pipe at distance [d] from its axis. */
function section(d: number, flange: boolean, face: boolean, water: boolean): Px {
  const hw = flange ? FW : HW
  if (d >= hw) return null
  if (d >= hw - 1 || face) return OUT
  if (water && d < CH) return d < 1.5 ? WATER_HI : WATER
  if (flange) return d < 1.5 ? FLANGE_HI : FLANGE
  return d < 1.5 ? HI : BODY
}

const straight =
  (water: boolean): Painter =>
  (x, y) => {
    const d = Math.abs(x + 0.5 - C)
    const t = Math.min(y, S - 1 - y)
    return section(d, t < FLANGE_LEN, t === FLANGE_LEN - 1, water)
  }

const elbow =
  (water: boolean): Painter =>
  (x, y) => {
    // Arc around the top-right corner, through both edge midpoints.
    const r = Math.hypot(x + 0.5 - S, y + 0.5)
    const d = Math.abs(r - C)
    const t = Math.min(y, S - 1 - x)
    return section(d, t < FLANGE_LEN, t === FLANGE_LEN - 1, water)
  }

/** The cap an end piece's pipe runs into: a rounded box below the centre. */
const CAP = { top: 13, bottom: 27, hw: 10, r: 3 }

function inCap(x: number, y: number): 'out' | 'in' | null {
  const px = x + 0.5
  const py = y + 0.5
  const left = C - CAP.hw
  const right = C + CAP.hw
  if (px < left || px > right || py < CAP.top || py > CAP.bottom) return null

  // Rounded corners.
  const cx = px < left + CAP.r ? left + CAP.r : px > right - CAP.r ? right - CAP.r : px
  const cy =
    py < CAP.top + CAP.r ? CAP.top + CAP.r : py > CAP.bottom - CAP.r ? CAP.bottom - CAP.r : py
  const k = Math.hypot(px - cx, py - cy)
  if (k > CAP.r) return null

  const edge = Math.min(px - left, right - px, py - CAP.top, CAP.bottom - py)
  return edge < 1 || k > CAP.r - 1 ? 'out' : 'in'
}

const end =
  (kind: 'inlet' | 'outlet', water: boolean): Painter =>
  (x, y) => {
    const cap = inCap(x, y)
    const cx = x + 0.5 - C
    const cy = y + 0.5 - 20.5
    const r = Math.hypot(cx, cy)

    if (cap === 'out') return OUT
    if (cap === 'in') {
      if (kind === 'inlet') {
        // A red hand wheel: rim, hub, four spokes.
        if (r < 6 && r >= 5) return OUT
        if (r < 5 && r >= 3.6) return cy < 0 ? WHEEL_HI : WHEEL
        if (r < 1.6) return WHEEL
        if (r < 3.6 && (Math.abs(cx) < 0.8 || Math.abs(cy) < 0.8)) return WHEEL
        if (r < 3.6) return water ? WATER : HOLE
      } else {
        // A drain hole, filled once the water arrives.
        if (r < 5 && r >= 4) return OUT
        if (r < 4) return water ? (r < 1.6 ? WATER_HI : WATER) : HOLE
      }
      return y === CAP.top + 1 ? FLANGE_HI : FLANGE
    }

    // The stub from the north edge into the cap.
    if (y > CAP.top + 1) return null
    const d = Math.abs(cx)
    return section(d, y < FLANGE_LEN, y === FLANGE_LEN - 1, water)
  }

const plate: Painter = (x, y) => {
  // 1 px gap all round, 3 px corner radius.
  const lo = 1
  const hi = S - 2
  if (x < lo || y < lo || x > hi || y > hi) return null
  const cx = x < lo + 3 ? lo + 3 : x > hi - 3 ? hi - 3 : x
  const cy = y < lo + 3 ? lo + 3 : y > hi - 3 ? hi - 3 : y
  if (Math.hypot(x - cx, y - cy) > 3.2) return null

  const edge = Math.min(x - lo, hi - x, y - lo, hi - y)
  if (edge === 0 || Math.hypot(x - cx, y - cy) > 2.4) return PLATE_OUT

  // Rivets in the corners: a light pixel with a shadow below right.
  for (const [rx, ry] of [
    [4, 4],
    [S - 6, 4],
    [4, S - 6],
    [S - 6, S - 6],
  ] as const) {
    if (x === rx && y === ry) return RIVET
    if (x === rx + 1 && y === ry + 1) return PLATE_LO
  }

  // Bevel: light top/left, dark bottom/right.
  if (edge === 1) return x - lo === 1 || y - lo === 1 ? PLATE_HI : PLATE_LO
  return PLATE
}

/** mulberry32: a few seeded numbers, the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (max: number) => Math.floor(next() * max) }
}

/** Smooth value noise on a grid of [cell] px, 0..1, wrapping. */
function noise(seed: number, cell: number) {
  const r = rng(seed)
  const n = Math.ceil(S / cell)
  const g = Array.from({ length: n }, () => Array.from({ length: n }, () => r.next()))
  const ease = (t: number) => t * t * (3 - 2 * t)
  const at = (i: number, j: number) => g[((j % n) + n) % n]![((i % n) + n) % n]!
  return (x: number, y: number) => {
    const gx = x / cell
    const gy = y / cell
    const ix = Math.floor(gx)
    const iy = Math.floor(gy)
    const fx = ease(gx - ix)
    const fy = ease(gy - iy)
    const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx
    const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx
    return top * (1 - fy) + bottom * fy
  }
}

// Dirty water, translucent (#rrggbbaa) so plate and pipe show through: murky brown-olive, a dark
// edge, light ripples, a few opaque glints.
const DIRTY = { edge: '#33291acc', deep: '#5c4b2bb8', mid: '#76653ea8', ripple: '#b0a074c8', glint: '#ece3c8' }

/** Water inside f < 0: an edge one pixel in, ripples where the wave crests. */
function water(f: (x: number, y: number) => number, wave: (x: number, y: number) => number, glints: [number, number][]): Painter {
  return (x, y) => {
    const v = f(x + 0.5, y + 0.5)
    if (v >= 0) return null
    if (glints.some(([gx, gy]) => gx === x && gy === y)) return DIRTY.glint
    if (v > -1.1) return DIRTY.edge
    const w = wave(x, y)
    if (w > 0.82) return DIRTY.ripple
    return w > 0.35 ? DIRTY.mid : DIRTY.deep
  }
}

const over =
  (...painters: Painter[]): Painter =>
  (x, y) => {
    for (const p of painters) {
      const c = p(x, y)
      if (c) return c
    }
    return null
  }

const drop = (dx: number, dy: number, rad: number): Painter =>
  water(
    (x, y) => Math.hypot(x - dx, y - dy) - rad,
    () => 0.5,
    [[Math.floor(dx - rad / 2), Math.floor(dy - rad / 2)]],
  )

/** A puddle of dirty water spreading over the plate, with ripples and four drops around it. */
function puddle(seed: number): Painter {
  const n = noise(seed, 8)
  const m = noise(seed + 50, 5)
  const r = rng(seed + 9)
  const cx = 15 + r.int(3)
  const cy = 16 + r.int(3)
  const body = water(
    (x, y) => Math.hypot(x - cx, (y - cy) * 1.1) - (10 + 5 * n(x, y)),
    (x, y) => 0.5 + 0.5 * Math.sin(Math.hypot(x - cx, y - cy) * 1.4 + m(x, y) * 7),
    [
      [cx - 5, cy - 4],
      [cx - 4, cy - 5],
      [cx + 4, cy + 2],
    ],
  )
  const drops = Array.from({ length: 4 }, () => {
    const a = r.next() * Math.PI * 2
    const d = 14.5 + r.next() * 1.5
    return drop(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + r.next() * 0.8)
  })
  return over(body, ...drops)
}

/** 8-bit RGBA, no filter; an unpainted pixel stays transparent. */
function png(paint: Painter): Buffer {
  const row = 1 + S * 4
  const raw = Buffer.alloc(S * row)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = paint(x, y)
      if (c === null) continue
      const alpha = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255
      raw.set([1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(alpha), y * row + 1 + x * 4)
    }
  }

  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(S, 0)
  header.writeUInt32BE(S, 4)
  header[8] = 8
  header[9] = 6

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const TILES: Record<string, Painter> = {
  'plate.png': plate,
  'straight-dry.png': straight(false),
  'straight-wet.png': straight(true),
  'elbow-dry.png': elbow(false),
  'elbow-wet.png': elbow(true),
  // The inlet is the tap: it holds water from the start.
  'inlet.png': end('inlet', true),
  'outlet-dry.png': end('outlet', false),
  'outlet-wet.png': end('outlet', true),
  // Seeds picked on the contact sheet (2026-11-19).
  'puddle-1.png': puddle(23),
  'puddle-2.png': puddle(40),
  'puddle-3.png': puddle(57),
}

const outDir = process.argv[2] ?? 'webapp-vue/src/games/turnpipes/tiles'
for (const [name, paint] of Object.entries(TILES)) writeFileSync(`${outDir}/${name}`, png(paint))
