import { onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useWindowSize } from '@vueuse/core'

/**
 * The height that keeps an element inside the viewport: everything below its own top edge, less a
 * strip that stays free.
 *
 * Measured, not computed from constants. The alternative is an element that knows the app header's
 * height, the round card's header and every gap between them — three numbers it does not own and
 * would be wrong about the day one of them changes.
 *
 * The strip matters most where the element swallows gestures: a map that reaches the bottom screen
 * edge leaves a phone with nowhere to start a page scroll, because every drag inside it pans the
 * map instead.
 */
export function useViewportFill(
  element: Ref<HTMLElement | null>,
  options: { strip: number; min: number },
): Ref<number | null> {
  const height = ref<number | null>(null)
  const { height: viewport } = useWindowSize()

  function measure(): void {
    const el = element.value
    if (!el) return

    // From the top of the *document*, so a scrolled page measures the same as an unscrolled one —
    // otherwise the element would shrink as the reader scrolls it into view.
    const top = el.getBoundingClientRect().top + window.scrollY
    height.value = Math.max(options.min, window.innerHeight - top - options.strip)
  }

  onMounted(measure)

  // A rotation, a keyboard opening, a desktop window dragged taller — all of them move the floor
  // this was measured against.
  watch(viewport, measure)

  return height
}
