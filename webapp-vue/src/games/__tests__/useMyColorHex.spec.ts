import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { GameEntry } from '@/games/GameEntry'
import { useMyColorHex } from '@/games/useMyColorHex'

function entry(userId: string, bgColorHex: string): GameEntry {
  return {
    userId,
    username: userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: null,
    durationMs: null,
    avatar: { bgColorHex },
    votes: [],
    struck: false,
    adminOverride: null,
  }
}

describe('useMyColorHex', () => {
  it('is my avatar colour, grey until my row arrives', () => {
    const entries = ref<GameEntry[]>([entry('other', '#0ea5e9')])
    const color = useMyColorHex(
      () => entries.value,
      () => 'me',
    )

    expect(color.value).toBe('#525252')

    entries.value = [...entries.value, entry('me', '#7c3aed')]

    expect(color.value).toBe('#7c3aed')
  })

  it('is grey for a viewer without a seat', () => {
    const color = useMyColorHex(
      () => [entry('other', '#0ea5e9')],
      () => null,
    )

    expect(color.value).toBe('#525252')
  })
})
