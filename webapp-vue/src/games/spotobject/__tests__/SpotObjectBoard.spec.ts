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
  ready: Ref<boolean>
  error: Ref<string | null>
  mount: ReturnType<typeof vi.fn>
  pano: StreetViewState
  toWorldMap: ReturnType<typeof vi.fn>
} {
  const double = {
    ready: ref(true),
    error: ref<string | null>(null),
    mount: vi.fn(),
    pano: reactive<StreetViewState>({
      visible: false,
      panoId: null,
      heading: 0,
      pitch: 0,
      zoom: 1,
      ...overrides,
    }),
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

  it('emits the tip the panorama is showing', async () => {
    mockStreetView({
      visible: true,
      panoId: 'pano-42',
      heading: 12,
      pitch: -3,
      zoom: 2,
    })
    const w = mountBoard()
    await w.vm.$nextTick()

    await w.get('[data-test="spot-guess-button"]').trigger('click')

    expect(w.emitted('guess')).toEqual([[{ panoId: 'pano-42', heading: 12, pitch: -3, zoom: 2 }]])
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

  it('says so when the map could not be loaded', async () => {
    const double = mockStreetView()
    double.error.value = 'boom'
    const w = mountBoard()
    await w.vm.$nextTick()

    expect(w.find('[data-test="spot-error"]').exists()).toBe(true)
  })
})
