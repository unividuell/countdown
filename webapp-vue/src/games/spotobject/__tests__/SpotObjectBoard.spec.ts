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
  heading: Ref<number | null>
  currentTip: ReturnType<typeof vi.fn>
  toWorldMap: ReturnType<typeof vi.fn>
  toPanorama: ReturnType<typeof vi.fn>
  openMiniMap: ReturnType<typeof vi.fn>
  jumpMissed: Ref<boolean>
} {
  const double = {
    error: ref<string | null>(null),
    mount: vi.fn(),
    pano: reactive<StreetViewState>({ visible: false, panoId: null, ...overrides }),
    noCoverage: ref(false),
    heading: ref<number | null>(null),
    currentTip: vi.fn().mockReturnValue(null),
    toWorldMap: vi.fn(),
    toPanorama: vi.fn(),
    openMiniMap: vi.fn().mockResolvedValue(undefined),
    jumpMissed: ref(false),
  }
  vi.mocked(useStreetView).mockReturnValue(double)
  return double
}

function mountBoard(disabled = false) {
  return mount(SpotObjectBoard, { props: { disabled, trailColor: '#8e44ad' } })
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

  /** The map has three sizes and the largest one *is* the world map — there is no other way out. */
  it('reaches the world map by growing the mini-map to full screen', async () => {
    const double = mockStreetView({ visible: true })
    const w = mountBoard()
    await w.get('[data-test="spot-mini-open"]').trigger('click')

    await w.get('[data-test="spot-mini-full"]').trigger('click')

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
      props: { disabled: false, trailColor: '#8e44ad' },
      slots: { default: '<p data-test="slotted">„Rosa Gartenzwerg“</p>' },
    })

    const slot = w.get('[data-test="slotted"]').element
    const actions = w.get('[data-test="spot-actions"]').element
    expect(slot.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
   * The crosshair is one thing now, not two: the centre the object has to be in before „Gefunden“.
   * On the map it used to be the aim as well, and a press lands where the finger is.
   */
  it('marks the centre of the panorama, and nothing on the map', async () => {
    const double = mockStreetView({ visible: false })
    const w = mountBoard()

    expect(w.find('[data-test="spot-crosshair"]').exists()).toBe(false)

    double.pano.visible = true
    await w.vm.$nextTick()

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
  /** Submitting stays possible at every size: the map is a view onto the round, not a modal. */
  it('keeps „Gefunden“ while the mini-map is open', async () => {
    mockStreetView({ visible: true, panoId: 'pano-1' })
    const w = mountBoard()

    await w.get('[data-test="spot-mini-open"]').trigger('click')

    expect(w.get('[data-test="spot-guess-button"]').attributes('disabled')).toBeUndefined()
  })

  it('opens the panel from the slot „Weltkarte“ used to hold', async () => {
    const double = mockStreetView({ visible: true })
    const w = mountBoard()

    await w.get('[data-test="spot-mini-open"]').trigger('click')

    expect(double.openMiniMap).toHaveBeenCalledWith(w.get('[data-test="spot-mini-stage"]').element)
    // One control per step: the way down is the panel's own, so this button steps aside.
    expect(w.find('[data-test="spot-mini-open"]').exists()).toBe(false)
  })

  /**
   * No layout in happy-dom, so the structural proxy. The icon rides in the term's row, over it
   * rather than in it, because the term keeps the middle of the board. The panel cannot join it
   * there — centred, the term would lie across the panel and across its own two corner buttons —
   * so it opens one row below, at the same gutter, out of the control it grows from.
   */
  it('keeps the icon in the term’s row and opens the panel under it', async () => {
    mockStreetView({ visible: true })
    const w = mountBoard()
    const actions = w.get('[data-test="spot-actions"]').element
    const icon = w.get('[data-test="spot-mini-open"]').element

    await w.get('[data-test="spot-mini-open"]').trigger('click')

    expect(actions.contains(icon)).toBe(false)
    const panel = w.get('[data-test="spot-mini-panel"]').element
    expect(actions.contains(panel)).toBe(true)
    expect(icon.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closes the mini-map on its own button', async () => {
    mockStreetView({ visible: true })
    const w = mountBoard()
    await w.get('[data-test="spot-mini-open"]').trigger('click')

    await w.get('[data-test="spot-mini-close"]').trigger('click')

    expect(w.find('[data-test="spot-mini-open"]').exists()).toBe(true)
  })

  /**
   * Shrinking is not re-entering: the panorama was only hidden, so it comes back where it was left
   * rather than wherever a fresh search around the map's centre lands.
   */
  it('shrinks back into the panorama it left, and lands on the panel again', async () => {
    const double = mockStreetView({ visible: true })
    const w = mountBoard()
    await w.get('[data-test="spot-mini-open"]').trigger('click')
    await w.get('[data-test="spot-mini-full"]').trigger('click')

    double.pano.visible = false
    double.pano.panoId = 'pano-1'
    await w.vm.$nextTick()
    await w.get('[data-test="spot-street-view"]').trigger('click')

    expect(double.toPanorama).toHaveBeenCalledOnce()

    double.pano.visible = true
    await w.vm.$nextTick()

    // `v-show`, so presence proves nothing — the panel is in the DOM at every size.
    expect(w.get<HTMLElement>('[data-test="spot-mini-panel"]').element.style.display).not.toBe(
      'none',
    )
  })

  it('has no size to step between before the first panorama', () => {
    mockStreetView({ visible: false, panoId: null })
    const w = mountBoard()

    expect(w.find('[data-test="spot-mini-open"]').exists()).toBe(false)
    expect(w.find('[data-test="spot-street-view"]').exists()).toBe(false)
  })
})
