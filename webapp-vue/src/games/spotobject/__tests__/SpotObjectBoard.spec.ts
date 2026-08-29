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
  currentTip: ReturnType<typeof vi.fn>
  toWorldMap: ReturnType<typeof vi.fn>
} {
  const double = {
    error: ref<string | null>(null),
    mount: vi.fn(),
    pano: reactive<StreetViewState>({ visible: false, panoId: null, ...overrides }),
    currentTip: vi.fn().mockReturnValue(null),
    toWorldMap: vi.fn(),
  }
  vi.mocked(useStreetView).mockReturnValue(double)
  return double
}

function mountBoard(payload = { term: 'Rosa Gartenzwerg' }, disabled = false) {
  return mount(SpotObjectBoard, { props: { payload, disabled } })
}

describe('SpotObjectBoard', () => {
  beforeEach(() => {
    mockStreetView()
  })

  it('shows the searched term', () => {
    const w = mountBoard({ term: 'Roter Briefkasten' })

    expect(w.get('[data-test="spot-term"]').text()).toContain('Roter Briefkasten')
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

    const row = w.get('[data-test="spot-actions"]')
    expect(row.classes()).toContain('top-0')
    expect(row.classes()).not.toContain('bottom-0')
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

  it('says so when the map could not be loaded', async () => {
    const double = mockStreetView()
    double.error.value = 'boom'
    const w = mountBoard()
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-error"]').exists()).toBe(true)
  })
})
