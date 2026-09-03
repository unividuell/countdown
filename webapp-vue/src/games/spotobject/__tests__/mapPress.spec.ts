import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onMapPress } from '../mapPress'

/** Just enough map to be pressed: the listeners it took, and a way to fire them. */
class FakeMap {
  private readonly handlers = new Map<string, Array<(event?: unknown) => void>>()

  addListener = vi.fn((event: string, callback: (event?: unknown) => void) => {
    const list = this.handlers.get(event) ?? []
    list.push(callback)
    this.handlers.set(event, list)
  })

  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((callback) => callback(payload))
  }
}

const HERE = { lat: 41.4, lng: 2.2 }

function pressed(): { map: FakeMap; press: ReturnType<typeof vi.fn> } {
  const map = new FakeMap()
  const press = vi.fn()
  onMapPress(map as unknown as google.maps.Map, press)
  return { map, press }
}

describe('onMapPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('acts on a single press, once the double click has had its chance', () => {
    const { map, press } = pressed()

    map.fire('click', { latLng: HERE })
    expect(press).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)

    expect(press).toHaveBeenCalledWith(HERE)
  })

  /** Google's own zoom. The two presses it is made of must not add up to a press of ours. */
  it('hands a double click to the map and keeps nothing back', () => {
    const { map, press } = pressed()

    map.fire('click', { latLng: HERE })
    map.fire('click', { latLng: HERE })
    map.fire('dblclick', { latLng: HERE })
    vi.advanceTimersByTime(300)

    expect(press).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a press Google could not place', () => {
    const { map, press } = pressed()

    map.fire('click', { latLng: null })
    vi.advanceTimersByTime(300)

    expect(press).not.toHaveBeenCalled()
  })
})
