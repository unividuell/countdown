import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import type { Ref } from 'vue'
import SpotObjectBoard from '../SpotObjectBoard.vue'
import { useStreetView } from '../useStreetView'
import type { StreetViewState } from '../useStreetView'

// happy-dom has no Google Maps: everything Google lives in `useStreetView`, so the board's own
// spec only ever sees the composable's public shape, never the API it wraps.
vi.mock('../useStreetView', () => ({ useStreetView: vi.fn() }))

enableAutoUnmount(afterEach)

function mockStreetView(overrides: Partial<StreetViewState> = {}): {
  error: Ref<string | null>
  mount: ReturnType<typeof vi.fn>
  pano: StreetViewState
  noCoverage: Ref<boolean>
  pegmanDragging: Ref<boolean>
  heading: Ref<number | null>
  currentTip: ReturnType<typeof vi.fn>
  toStreetView: ReturnType<typeof vi.fn>
  toWorldMap: ReturnType<typeof vi.fn>
} {
  const double = {
    error: ref<string | null>(null),
    mount: vi.fn(),
    pano: reactive<StreetViewState>({ visible: false, panoId: null, ...overrides }),
    noCoverage: ref(false),
    pegmanDragging: ref(false),
    heading: ref<number | null>(null),
    currentTip: vi.fn().mockReturnValue(null),
    toStreetView: vi.fn(),
    toWorldMap: vi.fn(),
  }
  vi.mocked(useStreetView).mockReturnValue(double)
  return double
}

function mountBoard(disabled = false) {
  return mount(SpotObjectBoard, { props: { disabled } })
}

describe('SpotObjectBoard', () => {
  beforeEach(() => {
    mockStreetView()
  })

  it('disables „Gefunden“ until a panorama is open', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    expect(w.get('[data-test="spot-guess-button"]').attributes('disabled')).toBeDefined()

    double.pano.visible = true
    double.pano.panoId = 'pano-1'
    await w.vm.$nextTick()

    expect(w.get('[data-test="spot-guess-button"]').attributes('disabled')).toBeUndefined()
  })

  it('emits the view read at the click, not one it kept', async () => {
    const double = mockStreetView({ visible: true, panoId: 'pano-42' })
    double.currentTip.mockReturnValue({ panoId: 'pano-42', heading: 212, pitch: -3, zoom: 2 })
    const w = mountBoard()
    await w.vm.$nextTick()

    await w.get('[data-test="spot-guess-button"]').trigger('click')

    expect(double.currentTip).toHaveBeenCalledOnce()
    expect(w.emitted('guess')).toEqual([[{ panoId: 'pano-42', heading: 212, pitch: -3, zoom: 2 }]])
  })

  it('emits nothing when there is no open panorama to read', async () => {
    mockStreetView({ visible: true, panoId: 'pano-42' })
    const w = mountBoard()

    await w.get('[data-test="spot-guess-button"]').trigger('click')

    expect(w.emitted('guess')).toBeUndefined()
  })

  it('offers a way back to the world map while a panorama is open', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    expect(w.find('[data-test="spot-world-map"]').exists()).toBe(false)

    double.pano.visible = true
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-world-map"]').exists()).toBe(true)

    await w.get('[data-test="spot-world-map"]').trigger('click')

    expect(double.toWorldMap).toHaveBeenCalledOnce()
  })

  /**
   * Google's logo is fixed to the bottom-left of both the map and the panorama and cannot be moved
   * or hidden; the „Map data ©… / Terms“ text sits bottom-right. Covering either breaks the terms
   * of service, so the whole bottom band is Google's and our controls live in the top row.
   */
  it('keeps its controls out of Google’s bottom band', () => {
    const w = mountBoard()

    // The row sits inside the stack that is anchored to the top edge, below whatever the slot put
    // there — so what has to hold is that the stack starts at the top and nothing reaches the
    // bottom.
    const stack = w.get('[data-test="spot-actions"]').element.parentElement!
    expect(stack.className).toContain('top-0')
    expect(w.html()).not.toContain('bottom-0')
  })

  /** The term rides over the map while searching; the reveal puts the same band in the card. */
  it('stacks the slot above its own controls', () => {
    const w = mount(SpotObjectBoard, {
      props: { disabled: false },
      slots: { default: '<p data-test="slotted">„Rosa Gartenzwerg“</p>' },
    })

    const stack = w.get('[data-test="spot-actions"]').element.parentElement!
    expect(stack.firstElementChild!.getAttribute('data-test')).toBe('slotted')
  })

  /**
   * The panorama's chrome carries z-indexes in the millions. Without a stacking context around
   * the map element they compete in the root context and win, and the whole overlay row — term,
   * „Zur Weltkarte“, „Gefunden“ — disappears the moment somebody drops the Pegman.
   */
  it('isolates the map element so the panorama cannot paint over the controls', () => {
    const w = mountBoard()

    expect(w.get('[data-test="spot-map"]').classes()).toContain('isolate')
  })

  /**
   * The crosshair is the aim for both halves of the board: on the map it is where the Pegman will
   * land, in the panorama it is where the object has to be before „Gefunden“.
   */
  it('marks the centre of the stage in both halves', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    expect(w.find('[data-test="spot-crosshair"]').exists()).toBe(true)

    double.pano.visible = true
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-crosshair"]').exists()).toBe(true)
  })

  /**
   * As a hit target the ring shadowed the map's own gestures at the one spot they matter most: a
   * double click there no longer zoomed, and a wheel over it scrolled the page instead of the map.
   * It takes no pointer events at all now — the press is read off the map below.
   */
  it('lets the map keep every gesture at its own centre', async () => {
    const w = mountBoard()

    expect(w.get('[data-test="spot-enter"]').classes()).toContain('pointer-events-none')
  })

  /** The one path no pointer gesture stands in for — the ring is still a real button. */
  it('enters Street View from the keyboard, and only while there is a map to aim at', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    await w.get('[data-test="spot-enter"]').trigger('click')
    expect(double.toStreetView).toHaveBeenCalledOnce()

    double.pano.visible = true
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-enter"]').exists()).toBe(false)
  })

  describe('the press on the crosshair', () => {
    /**
     * happy-dom measures every element as 0×0 at the origin, so the stage's centre is (0,0) and a
     * press is „inside the ring“ by how far its own coordinates are from there.
     */
    function press(w: ReturnType<typeof mountBoard>, from: [number, number], to = from): void {
      const stage = w.get('[data-test="spot-map"]').element
      stage.dispatchEvent(new MouseEvent('pointerdown', { clientX: from[0], clientY: from[1] }))
      stage.dispatchEvent(new MouseEvent('pointerup', { clientX: to[0], clientY: to[1] }))
    }

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('waits out the double click before acting on a single one', () => {
      const double = mockStreetView({ visible: false })
      const w = mountBoard()

      press(w, [0, 0])
      // Google zooms on a double click at this very spot, so nothing may have happened yet.
      expect(double.toStreetView).not.toHaveBeenCalled()

      vi.advanceTimersByTime(300)
      expect(double.toStreetView).toHaveBeenCalledOnce()
    })

    /**
     * Both halves have to give way, not just the first: cancelling the first press's action and
     * then letting the second schedule its own turns a double click into a single one with a
     * delay — which is what it did, and it zoomed *and* travelled.
     */
    it('hands a double click to the map and keeps nothing back', () => {
      const double = mockStreetView({ visible: false })
      const w = mountBoard()

      press(w, [0, 0])
      press(w, [0, 0])
      vi.advanceTimersByTime(1000)

      expect(double.toStreetView).not.toHaveBeenCalled()
    })

    it('leaves a pan that began at the centre alone', () => {
      const double = mockStreetView({ visible: false })
      const w = mountBoard()

      press(w, [0, 0], [0, 40])
      vi.advanceTimersByTime(1000)

      expect(double.toStreetView).not.toHaveBeenCalled()
    })

    it('claims only presses inside the ring', () => {
      const double = mockStreetView({ visible: false })
      const w = mountBoard()

      press(w, [120, 90])
      vi.advanceTimersByTime(1000)

      expect(double.toStreetView).not.toHaveBeenCalled()
    })

    it('takes no press while the round is locked', () => {
      const double = mockStreetView({ visible: false })
      const w = mountBoard(true)

      press(w, [0, 0])
      vi.advanceTimersByTime(1000)

      expect(double.toStreetView).not.toHaveBeenCalled()
    })
  })

  /**
   * The ring sits where a dropped Pegman most often lands. The Pegman is the way in past the 50 m
   * the press reaches, so a shortcut that blocks it is worse than no shortcut.
   */
  it('gets its ring out of the way of a Pegman in the air, but keeps the mark', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    double.pegmanDragging.value = true
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-enter"]').exists()).toBe(false)
    expect(w.find('[data-test="spot-crosshair"]').exists()).toBe(true)
  })

  /** North is already up on the world map; in the panorama it is the one thing you cannot see. */
  it('names the direction only where there is a direction to name', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    expect(w.find('[data-test="spot-compass"]').exists()).toBe(false)

    double.pano.visible = true
    double.heading.value = 90
    await w.vm.$nextTick()

    const band = w.get('[data-test="spot-compass"]')
    expect(band.text()).toContain('O')
    // Above the term, which is above the actions: the band is the top edge of the stage.
    expect(band.element.parentElement).toBe(
      w.get('[data-test="spot-actions"]').element.parentElement,
    )
    expect(band.element.previousElementSibling).toBeNull()
  })

  it('says when the aimed point has no panorama to walk into', async () => {
    const double = mockStreetView()
    const w = mountBoard()

    expect(w.find('[data-test="spot-no-coverage"]').exists()).toBe(false)

    double.noCoverage.value = true
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-no-coverage"]').exists()).toBe(true)
  })

  it('says so when the map could not be loaded', async () => {
    const double = mockStreetView()
    double.error.value = 'boom'
    const w = mountBoard()
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-error"]').exists()).toBe(true)
  })
})
