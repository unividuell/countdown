// What the poster needs: colours, its type, the fitting of the type and the way out.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import type { RampScene } from './posterText'
import './poster.css'

/** What a poster is handed: the scene, and how it looks and moves. */
export interface PosterProps extends RampScene {
  /** On screen and not yet opened: only then may the poster idle. */
  running: boolean
  /** In degrees: the lines rise to the right, lie level, or fall. */
  tilt: -9 | 0 | 9
}

/**
 * `open`: the tap is accepted.
 * `gone`: the way out has finished.
 */
export interface RampEmits {
  open: []
  gone: []
}

/** Whether a way out may animate; else the poster is simply gone. */
export function mayAnimate(el: { animate?: unknown }): boolean {
  return !prefersReducedMotion() && !inBackground() && typeof el.animate === 'function'
}

/** A typeface as the poster sets it: its CSS. */
export type Type = Record<string, string>

/** No font of the app's own: San Francisco on Apple, Roboto on Android. */
export const LETTERS: Type = { fontWeight: '900', letterSpacing: '-0.04em' }

/** A line's height, as a share of the font size: the capitals nearly touch. */
export const LINE = 0.86
/** The size the probes are set in. */
export const PROBE_PX = 100

/** The poster's ground is the phase's colour. */
export function posterColors(phaseTwo: boolean): { ground: string; ink: string } {
  return phaseTwo
    ? { ground: 'var(--color-phase-two)', ink: 'var(--color-on-phase-two)' }
    : { ground: 'var(--color-phase-one)', ink: 'var(--color-on-phase-one)' }
}

let host: HTMLElement | null = null

/**
 * Where the probes live: a box of no size that clips them. Set straight on the body, a name at
 * `PROBE_PX` is wider than a phone and makes the whole page scroll sideways.
 */
function probeHost(): HTMLElement {
  if (host === null || !host.isConnected) {
    host = document.createElement('div')
    host.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none'
    host.setAttribute('aria-hidden', 'true')
    document.body.append(host)
  }

  return host
}

/**
 * The width of `text` set in `type` at `PROBE_PX`. Measured, not estimated: a name has to end
 * exactly at the gutter on both sides.
 */
export function useTypeWidth(text: () => string, type: () => Type): Ref<number> {
  const width = ref(0)
  let probe: HTMLSpanElement | null = null

  function measure(): void {
    if (!probe) return
    probe.style.cssText = `font-size:${PROBE_PX}px`
    Object.assign(probe.style, type())
    probe.textContent = text()
    width.value = probe.getBoundingClientRect().width
  }

  onMounted(() => {
    probe = document.createElement('span')
    probe.className = 'poster-type'
    probeHost().append(probe)

    measure()
    // A late font changes every width when it arrives. Absent in old browsers and in happy-dom.
    document.fonts?.addEventListener('loadingdone', measure)
  })
  watch([text, type], measure)
  onBeforeUnmount(() => {
    document.fonts?.removeEventListener('loadingdone', measure)
    probe?.remove()
  })

  return width
}

export interface Strip {
  el: HTMLElement
  /** Which side it leaves by: an echo keeps the way it was drifting. */
  right: boolean
  /** Steps from the poster's edge: the edges go first, the name last. */
  rank: number
  /** How far it runs; a strip as wide as the poster clears it at `100%`. */
  travel?: string
}

const RUN_MS = 360
const RANK_GAP_MS = 24

/** A cancelled animation (the poster unmounted mid-run) is over, not failed. */
function ignoreCancel(error: unknown): void {
  if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
}

/**
 * The posters' one way out: every strip runs off sideways, as a block with its ground, and what
 * it covered is the card — so the caller's own ground has to go the moment this starts. Resolves
 * when the last strip is gone, at once where nothing may animate.
 */
export async function runOut(strips: Strip[]): Promise<void> {
  if (!mayAnimate(document.body)) return

  await Promise.all(
    strips.map(({ el, right, rank, travel = '100%' }) =>
      el
        .animate(
          [{ transform: 'none' }, { transform: `translateX(${right ? '' : '-'}${travel})` }],
          {
            duration: RUN_MS,
            delay: rank * RANK_GAP_MS,
            easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)',
            fill: 'forwards',
          },
        )
        .finished.catch(ignoreCancel),
    ),
  )
}
