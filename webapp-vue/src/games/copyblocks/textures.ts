// Own 16×16 pixel textures (Minecraft's belong to Mojang) and Minecraft-style face shading:
// brightness baked per face, so no lights and the look survives any rotation.
import { CanvasTexture, Color, MeshBasicMaterial, NearestFilter, SRGBColorSpace } from 'three'
import { BLOCK_CODES } from './blockTypes'
import type { BlockCode } from './blockTypes'

const PX = 16

type Rgb = [number, number, number]
type Painter = (
  set: (x: number, y: number, c: Rgb, jitter?: number) => void,
  rnd: () => number,
) => void

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb

const fill =
  (base: string, jitter: number): Painter =>
  (set) => {
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) set(x, y, hex(base), jitter)
  }

const speckle =
  (color: string, share: number): Painter =>
  (set, rnd) => {
    for (let y = 0; y < PX; y++)
      for (let x = 0; x < PX; x++) if (rnd() < share) set(x, y, hex(color), 0.1)
  }

const PAINT: Record<BlockCode, Painter[]> = {
  DIRT: [fill('#866043', 0.18), speckle('#5d4128', 0.2), speckle('#a07a56', 0.06)],
  BRICKS: [
    fill('#a0503e', 0.14),
    (set) => {
      for (let row = 0; row < 4; row++) {
        for (let x = 0; x < PX; x++) set(x, row * 4 + 3, hex('#cbc2b6'), 0.06)
        for (const x of row % 2 ? [3, 11] : [7, 15])
          for (let y = row * 4; y < row * 4 + 3; y++) set(x, y, hex('#cbc2b6'), 0.06)
      }
    },
  ],
  LEAVES: [fill('#3e8a2c', 0.3), speckle('#245a18', 0.18)],
  PACKED_ICE: [fill('#8fb3ec', 0.06), speckle('#c4d8f8', 0.12), speckle('#7096d8', 0.05)],
  STONE: [fill('#8c8c8c', 0.22), speckle('#6a6a6a', 0.12)],
  HAY_BALE: [
    fill('#c9a22e', 0.12),
    (set, rnd) => {
      // Vertical straw, held by two dark bands.
      for (let x = 0; x < PX; x++)
        for (let y = 0; y < PX; y++)
          if ((x + (rnd() < 0.2 ? 1 : 0)) % 3 === 0) set(x, y, hex('#a88420'), 0.08)
      for (const y of [3, 4, 11, 12]) for (let x = 0; x < PX; x++) set(x, y, hex('#7a5a22'), 0.08)
    },
  ],
  LAPIS: [fill('#2c4fa8', 0.18), speckle('#e2c25a', 0.06)],
}

/** Small seeded PRNG: a type looks the same on every device and every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const canvases = new Map<BlockCode, HTMLCanvasElement | null>()

/**
 * One canvas per type, null without a 2D context. The frame darkens the edge so neighbours of one
 * type stay countable.
 */
function textureCanvas(code: BlockCode): HTMLCanvasElement | null {
  const cached = canvases.get(code)
  if (cached !== undefined) return cached

  const canvas = document.createElement('canvas')
  canvas.width = PX
  canvas.height = PX
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvases.set(code, null)
    return null
  }

  const img = ctx.createImageData(PX, PX)
  const rnd = mulberry32(1000 + BLOCK_CODES.indexOf(code))
  const set = (x: number, y: number, c: Rgb, jitter = 0): void => {
    const f = 1 + (rnd() - 0.5) * 2 * jitter
    const i = (y * PX + x) * 4
    for (const j of [0, 1, 2] as const) img.data[i + j] = Math.max(0, Math.min(255, c[j] * f))
    img.data[i + 3] = 255
  }
  for (const p of PAINT[code]) p(set, rnd)

  for (let y = 0; y < PX; y++)
    for (let x = 0; x < PX; x++)
      if (x === 0 || y === 0 || x === PX - 1 || y === PX - 1) {
        const i = (y * PX + x) * 4
        for (let j = 0; j < 3; j++) img.data[i + j] = img.data[i + j]! * 0.72
      }

  ctx.putImageData(img, 0, 0)
  canvases.set(code, canvas)
  return canvas
}

/** The hotbar's picture of a type; empty without a 2D context. */
export function iconUrl(code: BlockCode): string {
  return textureCanvas(code)?.toDataURL() ?? ''
}

/** The pickaxe's colours: a diamond head on a wooden handle, outlined dark. */
const PICKAXE = {
  head: '#33c3b2',
  light: '#a6f1e6',
  wood: '#b07a3e',
  woodDark: '#6b4423',
  outline: '#1c1c1c',
}

/**
 * The hotbar's pickaxe, our own 16 × 16 drawing (Minecraft's sprite is Mojang's). Handle and head
 * share one centre at the bottom left: the handle runs from it at 45°, the head is a ring arc
 * across the top right, at right angles to the handle, narrowing to points at both ends.
 */
export function pickaxePixels(): (string | null)[][] {
  const [cx, cy] = [2, 14]
  const grid = Array.from({ length: PX }, () => Array<string | null>(PX).fill(null))

  for (let y = 0; y < PX; y++)
    for (let x = 0; x < PX; x++) {
      const dx = x + 0.5 - cx
      const dy = cy - (y + 0.5)
      const d = Math.hypot(dx, dy)
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const across = dx - dy
      if (Math.abs(across) < 1.1 && d > 0.9 && d < 9.4)
        grid[y]![x] = across > 0 ? PICKAXE.woodDark : PICKAXE.wood

      const taper = Math.max(0, Math.abs(angle - 45) - 33) * 0.09
      if (angle > -6 && angle < 96 && d > 9.3 + taper && d < 11.5)
        grid[y]![x] = d > 10.7 ? PICKAXE.light : PICKAXE.head
    }

  // A dark rim around everything drawn, as on Minecraft's item sprites.
  const drawn = (x: number, y: number) => {
    const c = grid[y]?.[x]
    return c != null && c !== PICKAXE.outline
  }
  for (let y = 0; y < PX; y++)
    for (let x = 0; x < PX; x++)
      if (
        grid[y]![x] === null &&
        [drawn(x + 1, y), drawn(x - 1, y), drawn(x, y + 1), drawn(x, y - 1)].some(Boolean)
      )
        grid[y]![x] = PICKAXE.outline

  return grid
}

let pickaxeUrl: string | null = null

/** The hotbar's picture of the pickaxe; empty without a 2D context. */
export function pickaxeIconUrl(): string {
  if (pickaxeUrl !== null) return pickaxeUrl

  const canvas = document.createElement('canvas')
  canvas.width = PX
  canvas.height = PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  pickaxePixels().forEach((row, y) =>
    row.forEach((colour, x) => {
      if (colour === null) return
      ctx.fillStyle = colour
      ctx.fillRect(x, y, 1, 1)
    }),
  )
  pickaxeUrl = canvas.toDataURL()
  return pickaxeUrl
}

/** BoxGeometry's group order: +x, −x, +y, −y, +z, −z. Top brightest, bottom darkest. */
const FACE_SHADE = [0.62, 0.62, 1, 0.5, 0.82, 0.82]

const materials = new Map<BlockCode, MeshBasicMaterial[]>()

/** Shared by every view: never dispose them. */
export function blockMaterials(code: BlockCode): MeshBasicMaterial[] {
  const cached = materials.get(code)
  if (cached) return cached

  const canvas = textureCanvas(code)
  const map = canvas && new CanvasTexture(canvas)
  if (map) {
    map.magFilter = NearestFilter
    map.minFilter = NearestFilter
    map.colorSpace = SRGBColorSpace
  }
  const list = FACE_SHADE.map(
    (s) => new MeshBasicMaterial({ map, color: new Color().setRGB(s, s, s, SRGBColorSpace) }),
  )
  materials.set(code, list)
  return list
}
