<script setup lang="ts">
/**
 * The unividuell mark, punched out of the same dot grid the flip-dot board uses — PITCH and
 * RADIUS are imported rather than restated, so a change to the board's geometry carries over
 * instead of silently drifting apart from it.
 *
 * Derived from unividuell_logo_circle_wb.png (1042², 16-bit RGBA) by sampling each of 36×36
 * cells and lighting a dot where at least half the cell is opaque AND dark
 * (alpha > 127 && red < 128). The white letterform inside the disc is opaque white, not a hole,
 * so that rule is what turns it back into a cut-out. Nothing reads the PNG at runtime: the
 * image ships zero bytes and costs no request. A new logo has to be re-rastered by that rule.
 */
import { PITCH, RADIUS } from '@/ui/flipdot/board'

const BITMAP = [
  '..............##.....#..............',
  '...........#####.....####...........',
  '.........#######.....######.........',
  '.......#########......#######.......',
  '......##########......########......',
  '.....###########......#########.....',
  '....############.......#########....',
  '...#############.......##########...',
  '...#############.......##########...',
  '..##############........##########..',
  '..##############........##########..',
  '.###############.........##########.',
  '.###############....#....##########.',
  '.###############....#....##########.',
  '################....##....#########.',
  '################....##....#########.',
  '################....##....#########.',
  '################....###....#######..',
  '################....###....#######..',
  '################....###.....######..',
  '################....####....#####...',
  '################....####....#####...',
  '.###############....#####....####...',
  '.###############....#####....###....',
  '.##############.....#####....###....',
  '..#############.....######....##....',
  '..#############....#######....#.....',
  '...###########.....########...#.....',
  '...##########.....#########.........',
  '....#######.......#########.........',
  '.................###########........',
  '................############........',
  '..............##############........',
  '...........################.........',
  '...........##############...........',
  '..............########..............',
]

// Same metric as board.ts: dot i spans [i*PITCH, i*PITCH + 2*RADIUS], so the last dot's right
// edge — and the box — ends at (n-1)*PITCH + 2*RADIUS rather than n*PITCH.
const SIDE = (BITMAP.length - 1) * PITCH + 2 * RADIUS

const dots = BITMAP.flatMap((row, r) =>
  [...row].flatMap((ch, c) =>
    ch === '#' ? [{ cx: c * PITCH + RADIUS, cy: r * PITCH + RADIUS }] : [],
  ),
)
</script>

<template>
  <svg :viewBox="`0 0 ${SIDE} ${SIDE}`" fill="currentColor" aria-hidden="true">
    <circle v-for="(d, i) in dots" :key="i" :cx="d.cx" :cy="d.cy" :r="RADIUS" />
  </svg>
</template>
