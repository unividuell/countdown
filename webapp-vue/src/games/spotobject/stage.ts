/**
 * The two numbers both full-bleed stages of this game share — the board's map and a single tip's
 * still. `TipDetail` states it keeps the board's measurements; this is where that promise lives,
 * rather than in two identical class strings that drift apart.
 */

/** Page left free below the stage, so a phone still has somewhere to start a scroll. */
export const STAGE_STRIP = 48

/** Below this the stage is useless anyway, and overflowing beats a letterbox. */
export const STAGE_MIN_HEIGHT = 320
