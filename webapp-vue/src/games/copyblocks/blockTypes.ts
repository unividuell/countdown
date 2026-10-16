/** The wire codes, in the server's order: a round plays the first N of them. */
export const BLOCK_CODES = [
  'DIRT',
  'BRICKS',
  'LEAVES',
  'PACKED_ICE',
  'STONE',
  'HAY_BALE',
  'LAPIS',
] as const

export type BlockCode = (typeof BLOCK_CODES)[number]

/** Which sample family a block sounds like (Minecraft's: dirt sounds like gravel). */
export type SoundSet = 'stone' | 'grass' | 'gravel' | 'glass'

export const BLOCK_TYPES: Record<BlockCode, { name: string; place: SoundSet; break: SoundSet }> = {
  DIRT: { name: 'Erde', place: 'gravel', break: 'gravel' },
  BRICKS: { name: 'Ziegel', place: 'stone', break: 'stone' },
  LEAVES: { name: 'Laub', place: 'grass', break: 'grass' },
  PACKED_ICE: { name: 'Packeis', place: 'stone', break: 'glass' },
  STONE: { name: 'Stein', place: 'stone', break: 'stone' },
  HAY_BALE: { name: 'Heuballen', place: 'grass', break: 'grass' },
  LAPIS: { name: 'Lapis', place: 'stone', break: 'stone' },
}

export function isBlockCode(value: unknown): value is BlockCode {
  return typeof value === 'string' && (BLOCK_CODES as readonly string[]).includes(value)
}
