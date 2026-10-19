import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { GameEntry } from '@/games/GameEntry'
import { useMyColorHex } from '@/games/useMyColorHex'
import { gameEntry } from '@/games/__tests__/gameFixtures'

describe('useMyColorHex', () => {
  it('is my avatar colour, grey until my row arrives', () => {
    const entries = ref<GameEntry[]>([
      gameEntry({ userId: 'other', avatar: { bgColorHex: '#0ea5e9' } }),
    ])
    const color = useMyColorHex(
      () => entries.value,
      () => 'me',
    )

    expect(color.value).toBe('#525252')

    entries.value = [
      ...entries.value,
      gameEntry({ userId: 'me', avatar: { bgColorHex: '#7c3aed' } }),
    ]

    expect(color.value).toBe('#7c3aed')
  })

  it('is grey for a viewer without a seat', () => {
    const color = useMyColorHex(
      () => [gameEntry({ userId: 'other', avatar: { bgColorHex: '#0ea5e9' } })],
      () => null,
    )

    expect(color.value).toBe('#525252')
  })
})
