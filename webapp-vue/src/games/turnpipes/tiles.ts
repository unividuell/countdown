import elbowDry from './tiles/elbow-dry.png?url'
import elbowWet from './tiles/elbow-wet.png?url'
import inlet from './tiles/inlet.png?url'
import outletDry from './tiles/outlet-dry.png?url'
import outletWet from './tiles/outlet-wet.png?url'
import plate from './tiles/plate.png?url'
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

/** The tile at rotation 0; the board turns it with CSS. */
export function tileUrl(kind: PipeKindCode, wet: boolean): string {
  return wet ? TILES[kind].wet : TILES[kind].dry
}
