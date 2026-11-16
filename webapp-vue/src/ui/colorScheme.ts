import { useLocalStorage } from '@vueuse/core'
import { computed, watchEffect, type WritableComputedRef } from 'vue'

export type ColorScheme = 'light' | 'dark' | 'system'

/** Twin: the inline script in `index.html` reads the same key, so the first paint is right. */
export const COLOR_SCHEME_KEY = 'color-scheme'

/**
 * The user's light/dark choice, per device. A pick is pinned as `data-color-scheme` on <html>,
 * which `main.css` turns into `color-scheme` for every `light-dark()` role; „system“ removes the
 * pin and the stylesheet's `color-scheme: light dark` follows the OS again.
 *
 * An attribute, not an inline `color-scheme`: the build polyfills `light-dark()` (Lightning CSS)
 * with variables it sets only from `color-scheme` rules in the stylesheet. An inline style works
 * in dev and silently does nothing in the build.
 *
 *   localStorage ──► index.html script (before paint) ──► <html data-color-scheme="dark">
 *        ▲                                                   ▲
 *        └──────────── this composable (on a pick) ──────────┘
 */
export function useColorScheme(): WritableComputedRef<ColorScheme> {
  const stored = useLocalStorage<string>(COLOR_SCHEME_KEY, 'system')

  const scheme = computed<ColorScheme>({
    get: () => (stored.value === 'light' || stored.value === 'dark' ? stored.value : 'system'),
    set: (value) => {
      stored.value = value
    },
  })

  watchEffect(() => {
    const root = document.documentElement
    if (scheme.value === 'system') delete root.dataset.colorScheme
    else root.dataset.colorScheme = scheme.value
  })

  return scheme
}
