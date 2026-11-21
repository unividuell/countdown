// The PNGs are drawn by scripts/turn-pipes-tiles.mts: change the look there, then re-run it.
import elbowDry from './tiles/elbow-dry.png?url'
import elbowWet from './tiles/elbow-wet.png?url'
import fountain from './tiles/fountain.png?url'
import plateHot from './tiles/plate-hot.png?url'
import plate from './tiles/plate.png?url'
import puddle1 from './tiles/puddle-1.png?url'
import puddle2 from './tiles/puddle-2.png?url'
import puddle3 from './tiles/puddle-3.png?url'
import straightDry from './tiles/straight-dry.png?url'
import straightWet from './tiles/straight-wet.png?url'
import stubDry from './tiles/stub-dry.png?url'
import stubWet from './tiles/stub-wet.png?url'
import tubCold from './tiles/tub-cold.png?url'
import tubDry from './tiles/tub-dry.png?url'
import tubWet from './tiles/tub-wet.png?url'
import type { PipeKindCode } from './types'

/** The plate under every cell; it glows where the water ran, because every tile heats the tub. */
export function plateUrl(hot: boolean): string {
  return hot ? plateHot : plate
}

const TILES: Record<PipeKindCode, { dry: string; wet: string }> = {
  STRAIGHT: { dry: straightDry, wet: straightWet },
  ELBOW: { dry: elbowDry, wet: elbowWet },
  // An end turns only its stub; the fountain's carries water from the start.
  INLET: { dry: stubWet, wet: stubWet },
  OUTLET: { dry: stubDry, wet: stubWet },
}

/** The tile at rotation 0; the board turns it with CSS. */
export function tileUrl(kind: PipeKindCode, wet: boolean): string {
  return wet ? TILES[kind].wet : TILES[kind].dry
}

/**
 * The upright picture on an end — the fountain, the tub filling up — and none on a pipe. A [cold]
 * tub is full but icy: the water reached it and missed pipes.
 */
export function motifUrl(kind: PipeKindCode, wet: boolean, cold = false): string | null {
  if (kind === 'INLET') return fountain
  if (kind === 'OUTLET') return wet ? (cold ? tubCold : tubWet) : tubDry
  return null
}

const PUDDLES = [puddle1, puddle2, puddle3]

/** The dirty puddle over a burst or a missed pipe; the cell picks one of three, so neighbours differ. */
export function puddleUrl(cell: number): string {
  return PUDDLES[cell % PUDDLES.length]!
}
