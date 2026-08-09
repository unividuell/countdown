import { readonly, ref, type Ref } from 'vue'

const DEFAULT_MESSAGE = 'Aktion fehlgeschlagen.'

/**
 * Wraps a mutating call so a button can show that it is in flight.
 *
 * `busy` is cleared in a `finally`: a rejected call must not leave the button disabled forever.
 * A second `run` while one is in flight is dropped rather than queued — guarding the double click
 * is the point, and queueing would fire the same mutation twice a moment later.
 */
export function useAction(toMessage: (e: unknown) => string = () => DEFAULT_MESSAGE): {
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  run: (fn: () => Promise<void>) => Promise<void>
} {
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      await fn()
    } catch (e) {
      console.error('action failed', e)
      error.value = toMessage(e)
    } finally {
      busy.value = false
    }
  }

  return { busy: readonly(busy), error: readonly(error), run }
}

export function useKeyedAction(toMessage: (e: unknown) => string = () => DEFAULT_MESSAGE): {
  isBusy: (key: string) => boolean
  error: Readonly<Ref<string | null>>
  run: (key: string, fn: () => Promise<void>) => Promise<void>
} {
  const busyKeys = ref(new Set<string>())
  const error = ref<string | null>(null)

  function isBusy(key: string): boolean {
    return busyKeys.value.has(key)
  }

  async function run(key: string, fn: () => Promise<void>): Promise<void> {
    if (busyKeys.value.has(key)) return
    busyKeys.value.add(key)
    error.value = null
    try {
      await fn()
    } catch (e) {
      console.error('action failed', e)
      error.value = toMessage(e)
    } finally {
      busyKeys.value.delete(key)
    }
  }

  return { isBusy, error: readonly(error), run }
}
