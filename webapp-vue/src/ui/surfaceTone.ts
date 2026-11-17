import { computed, type ComputedRef } from 'vue'
import { useDarkScheme } from '@/ui/colorScheme'

/**
 * `--color-surface-container` as hex, for grounds painted outside CSS — a 2D canvas, a WebGL
 * scene — where the role cannot reach. A step off the card in either mode, so such a view shows
 * where it ends. Twin of `main.css`: whoever changes one changes the other.
 */
export const SURFACE_CONTAINER = { light: '#f5f5f5', dark: '#2a2826' } as const

/** The container tone of the mode in force. */
export function useSurfaceContainer(): ComputedRef<string> {
  const dark = useDarkScheme()
  return computed(() => (dark.value ? SURFACE_CONTAINER.dark : SURFACE_CONTAINER.light))
}
