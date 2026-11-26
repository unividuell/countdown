/**
 * One Hochstapler run, as logic without a screen. Floor `k` begins at `start`, then at each
 * stop's time plus the pause; a click is the whole milliseconds since its floor began.
 *
 * The sliding bar follows the clock, not the frames: a hidden tab does not freeze it. The resting
 * bar is computed from the click time by the tower function, never read from the animated
 * pixel, so the screen shows what the server will count.
 */
import { readonly, ref, shallowRef } from 'vue'
import { browserClock, type RunClock } from '@/games/runClock'
import { foundation, place, position, type Bar, type TowerGeometry } from './tower'

/** A piece cut off a bar; it falls. */
export interface Cut {
  floor: number
  left: number
  width: number
}

export interface Slider {
  floor: number
  width: number
  x: number
}

export type StackTap = 'placed' | 'missed' | 'ignored'

export function useStackRun(input: {
  geometry: TowerGeometry
  pauseMs: number
  onEnd: (clicks: number[]) => void
  clock?: RunClock
}) {
  const clock = input.clock ?? browserClock
  const bars = shallowRef<Bar[]>([foundation(input.geometry)])
  const cuts = shallowRef<Cut[]>([])
  const slider = shallowRef<Slider | null>(null)
  const running = ref(false)
  const ended = ref(false)
  const clicks: number[] = []

  let floorBegin = 0

  function below(): Bar {
    return bars.value[bars.value.length - 1]!
  }

  /** The foundation is floor 0, so the sliding bar's floor is `bars.length`. */
  function sliderNow(): Slider {
    const floor = bars.value.length
    const width = below().width
    const ms = Math.max(0, clock.now() - floorBegin)

    return { floor, width, x: position(input.geometry, floor - 1, width, ms) }
  }

  function start(at: number): void {
    if (running.value || ended.value) return

    running.value = true
    floorBegin = Math.max(at, clock.now())
    slider.value = sliderNow()
  }

  function frame(): void {
    if (running.value) slider.value = sliderNow()
  }

  function finish(): void {
    running.value = false
    ended.value = true
    slider.value = null
    input.onEnd([...clicks])
  }

  function tap(): StackTap {
    if (!running.value || clock.now() < floorBegin) return 'ignored'

    const click = Math.round(clock.now() - floorBegin)
    const floor = bars.value.length
    const rest = below()
    const x = position(input.geometry, floor - 1, rest.width, click)
    const bar = place(rest, x, rest.width)
    clicks.push(click)

    if (bar === null) {
      cuts.value = [...cuts.value, { floor, left: x, width: rest.width }]
      finish()
      return 'missed'
    }

    bars.value = [...bars.value, bar]
    if (bar.width < rest.width) {
      const left = bar.left === x ? bar.left + bar.width : x
      cuts.value = [...cuts.value, { floor, left, width: rest.width - bar.width }]
    }

    floorBegin += click + input.pauseMs
    if (bars.value.length - 1 >= input.geometry.maxFloors) finish()
    else slider.value = sliderNow()

    return 'placed'
  }

  return {
    bars: readonly(bars),
    cuts: readonly(cuts),
    slider: readonly(slider),
    running: readonly(running),
    ended: readonly(ended),
    start,
    tap,
    frame,
  }
}
