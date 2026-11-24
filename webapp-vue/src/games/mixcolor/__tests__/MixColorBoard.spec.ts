import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { StepView } from '@/api/types'
import MixColorBoard from '@/games/mixcolor/MixColorBoard.vue'
import MixerGlass from '@/games/mixcolor/MixerGlass.vue'
import type { MixColorPayload } from '@/games/mixcolor/types'
import HoldButton from '@/ui/HoldButton.vue'
import { CURTAIN_KEY } from '@/ui/curtain'

enableAutoUnmount(afterEach)

const PAYLOAD: MixColorPayload = {
  targetHex: '#336699',
  capacity: 3,
  pigments: [
    { key: 'c', name: 'Cyan', hex: '#00AEEF' },
    { key: 'm', name: 'Magenta', hex: '#EC008C' },
    { key: 'y', name: 'Gelb', hex: '#FFF200' },
    { key: 'w', name: 'Weiß', hex: '#FFFFFF' },
    { key: 'k', name: 'Schwarz', hex: '#111111' },
  ],
}

type Board = ReturnType<typeof mountBoard>

function mountBoard(over: Record<string, unknown> = {}, curtain?: { value: boolean }) {
  return mount(MixColorBoard, {
    global: curtain ? { provide: { [CURTAIN_KEY as symbol]: curtain } } : {},
    props: {
      payload: PAYLOAD,
      steps: [] as StepView[],
      disabled: false,
      awardRule: null,
      awardPoints: null,
      myColorHex: '#7c3aed',
      ...over,
    },
  })
}

function step(hex: string, base = 'c'): StepView {
  return { input: { base }, answer: { hex } }
}

function steps(n: number): StepView[] {
  return Array.from({ length: n }, () => step('#445566'))
}

/** The host while a drop is out: busy, then the round with the new step, then idle again. */
async function answer(w: Board, next: StepView[]) {
  await w.setProps({ disabled: true })
  await w.setProps({ steps: next })
  await w.setProps({ disabled: false })
  await flushPromises()
}

const nozzle = (w: Board, name: string) => w.get(`button[aria-label="${name}"]`)
const hold = (w: Board) => w.getComponent(HoldButton)

describe('MixColorBoard', () => {
  it('a tap emits one drop at the current stage', async () => {
    const w = mountBoard()

    await nozzle(w, 'Cyan').trigger('click')

    expect(w.emitted('skip')).toEqual([[0, { base: 'c' }]])
  })

  it('one tap in flight', async () => {
    const w = mountBoard()

    await nozzle(w, 'Cyan').trigger('click')
    await nozzle(w, 'Gelb').trigger('click')

    expect(w.emitted('skip')).toHaveLength(1)

    await answer(w, [step('#00AEEF')])
    await nozzle(w, 'Gelb').trigger('click')

    expect(w.emitted('skip')![1]).toEqual([1, { base: 'y' }])
  })

  it('a refused drop frees the nozzles again', async () => {
    const w = mountBoard()

    await nozzle(w, 'Cyan').trigger('click')
    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })
    await nozzle(w, 'Cyan').trigger('click')

    expect(w.emitted('skip')).toHaveLength(2)
  })

  it('nozzles and Fertig are locked while disabled', async () => {
    const w = mountBoard({ steps: steps(1), disabled: true })

    for (const p of PAYLOAD.pigments) {
      expect(nozzle(w, p.name).attributes('disabled')).toBeDefined()
    }
    expect(hold(w).props('disabled')).toBe(true)
  })

  it('the glass shows the last answer', async () => {
    const w = mountBoard()
    expect(w.getComponent(MixerGlass).props('fill')).toBeNull()

    await w.setProps({ steps: [step('#111111'), step('#abcdef')] })

    expect(w.getComponent(MixerGlass).props('fill')).toBe('#abcdef')
  })

  it('Fertig sends the confirmed drop count', async () => {
    const w = mountBoard({ steps: steps(2) })

    hold(w).vm.$emit('confirm')

    expect(w.emitted('guess')).toEqual([[{ drops: 2 }]])
  })

  it('Fertig is disabled without drops', () => {
    expect(hold(mountBoard()).props('disabled')).toBe(true)
  })

  it('the last drop holds Fertig by itself', async () => {
    const w = mountBoard({ steps: steps(2) })
    expect(hold(w).props('autoHold')).toBe(false)

    await nozzle(w, 'Cyan').trigger('click')
    await answer(w, steps(3))

    expect(hold(w).props('autoHold')).toBe(true)
    for (const p of PAYLOAD.pigments) {
      expect(nozzle(w, p.name).attributes('disabled')).toBeDefined()
    }

    hold(w).vm.$emit('confirm')

    expect(w.emitted('guess')).toEqual([[{ drops: 3 }]])
  })

  it('a full glass waits for the curtain before holding', async () => {
    const curtain = ref(false)
    const w = mountBoard({ steps: steps(3) }, curtain)
    expect(hold(w).props('autoHold')).toBe(false)

    curtain.value = true
    await w.vm.$nextTick()

    expect(hold(w).props('autoHold')).toBe(true)
  })

  it('auto-hold once', async () => {
    const w = mountBoard({ steps: steps(3) })
    expect(hold(w).props('autoHold')).toBe(true)

    hold(w).vm.$emit('confirm')
    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(hold(w).props('autoHold')).toBe(false)
  })

  it('the fill bar reads n / capacity', () => {
    expect(mountBoard({ steps: steps(2) }).text()).toContain('2 / 3')
  })

  it('player text never names a glass', () => {
    const w = mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 5 })

    expect(w.text()).not.toMatch(/Glas|Reagenz/)
    expect(w.html()).not.toMatch(/Glas|Reagenz/)
  })
})
