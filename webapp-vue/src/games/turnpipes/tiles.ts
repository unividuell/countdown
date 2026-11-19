// The PNGs are drawn by scripts/turn-pipes-tiles.mts: change the look there, then re-run it.
import elbowDry from './tiles/elbow-dry.png?url'
import elbowWet from './tiles/elbow-wet.png?url'
import inlet from './tiles/inlet.png?url'
import outletDry from './tiles/outlet-dry.png?url'
import outletWet from './tiles/outlet-wet.png?url'
import plate from './tiles/plate.png?url'
import puddle1 from './tiles/puddle-1.png?url'
import puddle2 from './tiles/puddle-2.png?url'
import puddle3 from './tiles/puddle-3.png?url'
import straightDry from './tiles/straight-dry.png?url'
import straightWet from './tiles/straight-wet.png?url'
import type { PipeKindCode } from './types'

/** The empty plate under a closed board. */
export const PLATE_URL = plate

const TILES: Record<PipeKindCode, { dry: string; wet: string }> = {
  STRAIGHT: { dry: straightDry, wet: straightWet },
  ELBOW: { dry: elbowDry, wet: elbowWet },
  // The inlet is the tap: it carries water from the start, wet or not.
  INLET: { dry: inlet, wet: inlet },
  OUTLET: { dry: outletDry, wet: outletWet },
}

const PUDDLES = [puddle1, puddle2, puddle3]

/** The dirty puddle over a burst or a missed pipe; the cell picks one of three, so neighbours differ. */
export function puddleUrl(cell: number): string {
  return PUDDLES[cell % PUDDLES.length]!
}

/** The tile at rotation 0; the board turns it with CSS. */
export function tileUrl(kind: PipeKindCode, wet: boolean): string {
  return wet ? TILES[kind].wet : TILES[kind].dry
}
