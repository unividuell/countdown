import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * One audio element, owned here. `restart()` is the play button's whole semantics: always from the
 * start, never a toggle — pausing is a separate, smaller control. Position is sampled with
 * requestAnimationFrame while playing, because `timeupdate` (~4 Hz) is too coarse for a progress
 * bar over a 0.1s clip.
 */
export function usePlayback(): {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: (url: string) => void
  restart: () => void
  pause: () => void
  dispose: () => void
} {
  const audio = new Audio()
  audio.preload = 'auto'
  const positionSeconds = ref(0)
  const playing = ref(false)
  let raf = 0

  const sample = (): void => {
    positionSeconds.value = audio.currentTime
    if (!audio.paused) raf = requestAnimationFrame(sample)
  }
  audio.addEventListener('play', () => {
    playing.value = true
    raf = requestAnimationFrame(sample)
  })
  const stop = (): void => {
    playing.value = false
    cancelAnimationFrame(raf)
    positionSeconds.value = audio.currentTime
  }
  audio.addEventListener('pause', stop)
  audio.addEventListener('ended', stop)

  function setSource(url: string): void {
    audio.pause()
    audio.src = url
    audio.load()
    positionSeconds.value = 0
  }
  function restart(): void {
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Autoplay policy or a torn-down element - the button stays pressable, nothing to surface.
    })
  }
  function pause(): void {
    audio.pause()
  }
  function dispose(): void {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  onUnmounted(dispose)

  return { positionSeconds, playing, setSource, restart, pause, dispose }
}
