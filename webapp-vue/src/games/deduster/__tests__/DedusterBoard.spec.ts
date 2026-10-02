import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DedusterBoard from '../DedusterBoard.vue'
import RevealCover from '@/ui/RevealCover.vue'
import type { DedusterPayload } from '../types'

vi.mock('../photo', () => ({ loadPhoto: vi.fn(() => Promise.resolve()) }))

enableAutoUnmount(afterEach)

const SCENE = { cols: 2, rows: 2, intervalMs: 1000 }
const PAYLOAD: DedusterPayload = { ...SCENE, order: [3, 1, 0, 2] }

function mountBoard(props: Partial<InstanceType<typeof DedusterBoard>['$props']> = {}) {
  return mount(DedusterBoard, {
    props: {
      payload: null,
      scene: SCENE,
      sealed: true,
      disabled: false,
      submitted: false,
      photoUrl: '/asset/98',
      awardRule: null,
      awardPoints: null,
      ...props,
    },
  })
}

const cells = (w: ReturnType<typeof mountBoard>) => w.findAll('[data-test="deduster-cell"]')
const cleared = (w: ReturnType<typeof mountBoard>) =>
  cells(w).filter((c) => c.classes().includes('opacity-0'))

/** happy-dom has no layout; a 200 × 200 field puts cell (col, row) at (50 + 100·col, 50 + 100·row). */
function stubField(w: ReturnType<typeof mountBoard>): void {
  const field = w.get('[data-test="deduster-field"]').element
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

async function tapCell(w: ReturnType<typeof mountBoard>, index: number): Promise<void> {
  const col = index % 2
  const row = Math.floor(index / 2)
  await w.get('[data-test="deduster-field"]').trigger('pointerdown', {
    clientX: 50 + 100 * col,
    clientY: 50 + 100 * row,
    isPrimary: true,
    button: 0,
  })
}

/** Holds, reveals, and ends the run on a wrong first tap: one guess emitted. */
async function endRun(w: ReturnType<typeof mountBoard>): Promise<void> {
  await flushPromises()
  w.getComponent(RevealCover).vm.$emit('start')
  await w.setProps({ sealed: false, payload: PAYLOAD })
  stubField(w)
  vi.advanceTimersByTime(1250)
  await w.vm.$nextTick()
  await tapCell(w, 0)
}

const resend = (w: ReturnType<typeof mountBoard>) => w.find('[data-test="deduster-resend"]')

describe('DedusterBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('lays the dusted grid out from the scene, under a cover that counts in at the beat', async () => {
    const w = mountBoard()
    await flushPromises()

    expect(cells(w)).toHaveLength(4)
    expect(cleared(w)).toHaveLength(0)
    const cover = w.getComponent(RevealCover)
    expect(cover.props('timed')).toBe(false)
    expect(cover.props('beatMs')).toBe(1000)
    expect(cover.props('note')).toBeNull()
  })

  it('draws the grid lines above every tile, a fallen one included, and a crosshair while running', async () => {
    const w = mountBoard()
    await flushPromises()
    const field = w.get('[data-test="deduster-field"]')
    const lines = () => w.findAll('[data-test="deduster-line"]')
    expect(field.classes()).not.toContain('cursor-crosshair')

    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()

    expect(cleared(w)).toHaveLength(1)
    expect(lines()).toHaveLength(4)
    expect(lines().every((l) => !l.classes().includes('opacity-0'))).toBe(true)
    expect(w.get('[data-test="deduster-lines"]').classes()).toEqual(
      expect.arrayContaining(['pointer-events-none', 'z-10']),
    )
    expect(field.classes()).toContain('cursor-crosshair')
  })

  it('dusts the field in one layer: each tile shows its own place in the texture', async () => {
    const w = mountBoard()
    await flushPromises()

    expect(cells(w)[0]!.element.parentElement!.getAttribute('style')).toContain('--dust: url(')
    const at = (index: number) => (cells(w)[index]!.element as HTMLElement).style.backgroundPosition
    expect(at(0)).toBe('calc(0 * 100cqw / 2) calc(0 * 100cqh / 2)')
    expect(at(3)).toBe('calc(-1 * 100cqw / 2) calc(-1 * 100cqh / 2)')
  })

  it('offers the hold only once the photo is decoded', async () => {
    const w = mountBoard()
    expect(w.getComponent(RevealCover).props('state')).toBe('preparing')

    await flushPromises()
    expect(w.getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('drops the cover with the full ring and asks for the reveal, every tile still dust', async () => {
    const w = mountBoard()
    await flushPromises()

    w.getComponent(RevealCover).vm.$emit('start')
    await w.vm.$nextTick()

    expect(w.emitted('reveal')).toHaveLength(1)
    expect(w.findComponent(RevealCover).exists()).toBe(false)
    expect(cleared(w)).toHaveLength(0)
  })

  it('drops tile 0 one beat after the full ring, however fast the payload came', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    vi.advanceTimersByTime(300)
    await w.setProps({ sealed: false, payload: PAYLOAD })

    vi.advanceTimersByTime(699)
    await w.vm.$nextTick()
    expect(cleared(w)).toHaveLength(0)

    vi.advanceTimersByTime(1)
    await w.vm.$nextTick()
    expect(cleared(w)).toHaveLength(1)
  })

  it('puts the cover back when the reveal fails', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(w.getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('hands in a finished run, with the wrong tile it ended on', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    stubField(w)

    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()
    vi.advanceTimersByTime(250)
    await tapCell(w, 3)
    await tapCell(w, 0)

    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.endedBy).toBe('WRONG_TILE')
    expect(guess.wrongTileIndex).toBe(0)
    expect((guess.reactionsMs as number[]).length).toBe(1)
    expect(guess.restarted).toBe(false)
  })

  it('ends the run too late when the tab goes away', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    vi.advanceTimersByTime(1000)

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })

    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.endedBy).toBe('TOO_LATE')
  })

  it('after a reload lays its own cover, starts without a reveal, and marks the run', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD, scene: SCENE })
    await flushPromises()

    const cover = w.getComponent(RevealCover)
    expect(cover.props('note')).toBe('Neu geladen — dein Lauf wird markiert.')
    cover.vm.$emit('start')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('reveal')).toBeUndefined()
    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.restarted).toBe(true)
  })

  it('never puts the order into the DOM', async () => {
    const w = mountBoard()
    await flushPromises()
    const styles = cells(w).map((c) => c.attributes('style'))
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()

    // One tile is off; nothing marks the three still to come. A tile's style is its place in the
    // texture, fixed by the layout: unchanged by the run, so it carries nothing of the order.
    expect(cleared(w)).toHaveLength(1)
    for (const [i, cell] of cells(w).entries()) {
      expect(Object.keys(cell.attributes()).sort()).toEqual(['class', 'data-test', 'style'])
      expect(cell.attributes('style')).toBe(styles[i])
    }
  })

  it('offers to send the same guess again when the submit failed', async () => {
    const w = mountBoard()
    await endRun(w)
    const [first] = w.emitted('guess')![0] as [unknown]

    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })
    await resend(w).trigger('click')

    expect(w.emitted('guess')).toHaveLength(2)
    expect(w.emitted('guess')![1]).toEqual([first])
  })

  it('hides the resend while the submit is in flight and once the guess is in', async () => {
    const w = mountBoard()
    await endRun(w)
    await w.setProps({ disabled: true })
    expect(resend(w).exists()).toBe(false)

    await w.setProps({ disabled: false })
    await resend(w).trigger('click')
    await w.setProps({ disabled: true })
    expect(resend(w).exists()).toBe(false)

    await w.setProps({ disabled: false, submitted: true })
    expect(resend(w).exists()).toBe(false)
  })

  it('offers no resend before the run ended', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(w.emitted('guess')).toBeUndefined()
    expect(resend(w).exists()).toBe(false)
  })

  it('takes no taps once a guess is in', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD, submitted: true })
    await flushPromises()

    expect(w.findComponent(RevealCover).exists()).toBe(false)
    stubField(w)
    await tapCell(w, 3)
    expect(w.emitted('guess')).toBeUndefined()
  })
})
