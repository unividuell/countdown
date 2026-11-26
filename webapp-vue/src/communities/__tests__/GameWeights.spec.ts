import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GameWeights from '@/communities/GameWeights.vue'
import type { GameEntry, GameWeight } from '@/api/types'

const games: GameEntry[] = [
  { id: 'echo-locate', displayName: 'Peilung', weight: 'NORMAL' },
  { id: 'song-snippet', displayName: 'Anspielung', weight: 'OFF' },
]

function mountWeights(modelValue: Record<string, GameWeight>) {
  return mount(GameWeights, { props: { games, modelValue } })
}

describe('GameWeights', () => {
  it('shows one group of four stages per game', () => {
    const w = mountWeights({ 'echo-locate': 'NORMAL', 'song-snippet': 'OFF' })

    const groups = w.findAll('fieldset')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.find('legend').text()).toBe('Peilung')
    expect(groups[0]!.findAll('label').map((l) => l.text())).toEqual([
      'aus',
      'selten',
      'normal',
      'häufig',
    ])
  })

  it('checks the current stage', () => {
    const w = mountWeights({ 'echo-locate': 'NORMAL', 'song-snippet': 'OFF' })

    const checked = w.findAll<HTMLInputElement>('input:checked').map((i) => i.element.value)
    expect(checked).toEqual(['NORMAL', 'OFF'])
  })

  it('emits the whole map with the changed stage', async () => {
    const w = mountWeights({ 'echo-locate': 'NORMAL', 'song-snippet': 'OFF' })

    await w.findAll('fieldset')[0]!.find('input[value=OFTEN]').setValue(true)

    expect(w.emitted('update:modelValue')?.[0]).toEqual([
      { 'echo-locate': 'OFTEN', 'song-snippet': 'OFF' },
    ])
  })
})
