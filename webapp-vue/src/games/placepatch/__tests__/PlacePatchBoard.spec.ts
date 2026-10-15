import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacePatchBoard from '@/games/placepatch/PlacePatchBoard.vue'
import RevealCover from '@/ui/RevealCover.vue'
import { LONG_PRESS_MS } from '@/games/placepatch/stamp'
import { DEFAULT_HOLD_MS } from '@/ui/useHoldProgress'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(PlacePatchBoard, {
    props: {
      payload: PAYLOAD,
      scene: null,
      sealed: false,
      boardSrc: '/assets/0',
      patchSrc: '/assets/1',
      myColorHex: '#7c3aed',
      disabled: false,
      submitted: null,
      awardRule: null,
      awardPoints: null,
      ...over,
    },
  })
}

/** happy-dom lays nothing out: the field claims 400 × 300 px, so a cell is 10 px. */
function sized(wrapper: ReturnType<typeof mountBoard>) {
  const field = wrapper.get('[data-test="place-patch-field"]')
  vi.spyOn(field.element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  return field
}

describe('PlacePatchBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    // Reduced motion, so the hold button skips its entrance — as in GuessHueBoard.spec.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the grey board, the patch below it at board scale, and the rules', () => {
    const wrapper = mountBoard()

    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual([
      '/assets/0',
      '/assets/1',
    ])
    expect(wrapper.get('[data-test="place-patch-patch"]').attributes('style')).toContain(
      'width: 25%',
    )
    expect(wrapper.text()).toContain('Wo gehört dieser Ausschnitt hin?')
    expect(wrapper.find('[data-test="info-box"]').exists()).toBe(true)
  })

  it('keeps the board picture out of the gesture, so a long press cannot open the image menu', () => {
    const board = mountBoard().get('[data-test="place-patch-field"] img')

    expect(board.classes()).toContain('pointer-events-none')
  })

  it('puts the stamp under the finger on a tap and submits it on hold', async () => {
    const wrapper = mountBoard()
    const field = sized(wrapper)

    await field.trigger('pointerdown', { clientX: 123, clientY: 87, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 124, clientY: 87, pointerId: 1 })

    const stamp = wrapper.get('[data-test="place-patch-stamp"]').attributes('style')
    expect(stamp).toContain('left: 17.5%')
    expect(stamp).toContain('top: 13.3333')

    await wrapper.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(DEFAULT_HOLD_MS + 100)

    expect(wrapper.emitted('guess')).toEqual([[{ x: 7, y: 4 }]])
  })

  it('moves the stamp by the drag and keeps it where a cancelled gesture left it', async () => {
    const wrapper = mountBoard()
    const field = sized(wrapper)
    await field.trigger('pointerdown', { clientX: 123, clientY: 87, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 123, clientY: 87, pointerId: 1 })

    await field.trigger('pointerdown', { clientX: 300, clientY: 250, pointerId: 2 })
    await field.trigger('pointermove', { clientX: 334, clientY: 250, pointerId: 2 })
    await field.trigger('pointercancel', { pointerId: 2 })

    expect(wrapper.get('[data-test="place-patch-stamp"]').attributes('style')).toContain(
      'left: 25%',
    )
    expect(wrapper.emitted('guess')).toBeUndefined()
  })

  it('leaves the stamp where it was when a long press lifts without a drag', async () => {
    const wrapper = mountBoard()
    const field = sized(wrapper)
    await field.trigger('pointerdown', { clientX: 123, clientY: 87, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 123, clientY: 87, pointerId: 1 })

    let now = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    await field.trigger('pointerdown', { clientX: 300, clientY: 250, pointerId: 2 })
    now += LONG_PRESS_MS
    await field.trigger('pointerup', { clientX: 300, clientY: 250, pointerId: 2 })

    expect(wrapper.get('[data-test="place-patch-stamp"]').attributes('style')).toContain(
      'left: 17.5%',
    )
  })

  it('cannot submit without a stamp', () => {
    expect(mountBoard().get('[data-test="hold-button"]').attributes('disabled')).toBeDefined()
  })

  it('shows a submitted tip after a reload and does not move it', async () => {
    const wrapper = mountBoard({ submitted: { x: 3, y: 2 }, disabled: true })
    const field = sized(wrapper)

    await field.trigger('pointerdown', { clientX: 300, clientY: 250, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 300, clientY: 250, pointerId: 1 })

    expect(wrapper.get('[data-test="place-patch-stamp"]').attributes('style')).toContain(
      'left: 7.5%',
    )
  })

  it('says so when a picture does not load', async () => {
    const wrapper = mountBoard()

    await wrapper.get('img').trigger('error')

    expect(wrapper.get('[data-test="place-patch-image-error"]').text()).toBe(
      'Das Bild ließ sich nicht laden.',
    )
  })

  it('requests no picture while sealed, and offers the cover instead of the button', () => {
    const wrapper = mountBoard({
      payload: null,
      scene: { cols: 40, rows: 30 },
      sealed: true,
      boardSrc: null,
      patchSrc: null,
    })

    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.findComponent(RevealCover).exists()).toBe(true)
    // The cover brings a hold button of its own (START); the board's submit button must be gone.
    expect(wrapper.find('[aria-label="Tipp bestätigen — gedrückt halten"]').exists()).toBe(false)
  })
})
