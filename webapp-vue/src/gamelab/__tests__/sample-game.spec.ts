import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SampleGame from '@/gamelab/SampleGame.vue'
import type { SamplePayload } from '@/gamelab/types'

const PAYLOAD: SamplePayload = { lowerBound: 100, upperBound: 199 }

function mountGame(props: Record<string, unknown> = {}) {
  return mount(SampleGame, {
    props: { payload: PAYLOAD, outcome: null, disabled: false, myGuess: null, ...props },
  })
}

describe('SampleGame', () => {
  it('prefills the input from a stored guess', () => {
    const w = mountGame({ myGuess: { value: 150 } })

    expect((w.get('[data-test="sample-input"]').element as HTMLInputElement).value).toBe('150')
  })

  it('follows a new stored guess after a seed change keeps the instance alive', async () => {
    // The lab page renders games through `<component :is="…">`, so a seed change swaps props on
    // the same instance rather than remounting it — the prefill must track the prop, not just
    // read it once at setup, or a new round would keep showing the previous round's guess.
    const w = mountGame({ myGuess: { value: 150 } })

    await w.setProps({ myGuess: { value: 175 } })
    expect((w.get('[data-test="sample-input"]').element as HTMLInputElement).value).toBe('175')

    await w.setProps({ myGuess: null })
    expect((w.get('[data-test="sample-input"]').element as HTMLInputElement).value).toBe('')
  })

  it('rejects a non-finite stored guess rather than resubmitting it', async () => {
    // `typeof NaN === 'number'`, so a plain `typeof` guard lets it through; `submit()`'s own guard
    // (`typeof value.value !== 'number'`) would then wave a `NaN` guess straight back out.
    const w = mountGame({ myGuess: { value: NaN } })

    await w.get('[data-test="sample-submit"]').trigger('submit')

    expect(w.emitted('guess')).toBeUndefined()
  })
})
