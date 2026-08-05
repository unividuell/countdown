export const PITCH = 4
export const RADIUS = 1.5
export const DOT_ON = '#fafaf9'
export const DOT_OFF = '#292524'
export const FLIP_MS = 170
export const STAGGER_MS = 9
// Chosen: long enough to register as "off" before the board slams on, short enough to read as the
// first beat of switching on rather than as a loading state.
export const BOOT_DARK_MS = 100
// Chosen: long enough that the all-white board reads as a deliberate switch-on rather than a paint
// glitch, short enough not to withhold the first real reading.
export const BOOT_HOLD_MS = 300
export const BOOT_RESOLVE_AT_MS = BOOT_DARK_MS + BOOT_HOLD_MS
