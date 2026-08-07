import { describe, expect, it, vi } from 'vitest'
import { useAction } from '@/ui/useAction'

/** A promise plus the handles to settle it, so a test can inspect the in-flight state. */
function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAction', () => {
  it('marks the action busy while it is in flight and clears it after', async () => {
    const { busy, run } = useAction()
    const d = deferred()

    const call = run(() => d.promise)
    expect(busy.value).toBe(true)

    d.resolve()
    await call
    expect(busy.value).toBe(false)
  })

  it('clears busy after a rejection so the button does not stay disabled', async () => {
    const { busy, error, run } = useAction()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('boom')))

    expect(busy.value).toBe(false)
    expect(error.value).toBe('Aktion fehlgeschlagen.')
  })

  it('drops a second call while one is in flight', async () => {
    const { run } = useAction()
    const d = deferred()
    const fn = vi.fn(() => d.promise)

    const first = run(fn)
    await run(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    d.resolve()
    await first
  })

  it('derives the message from the error', async () => {
    const { error, run } = useAction((e) => (e instanceof Error ? `kaputt: ${e.message}` : 'egal'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('409')))

    expect(error.value).toBe('kaputt: 409')
  })

  it('clears a previous error when the next call starts', async () => {
    const { error, run } = useAction()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await run(() => Promise.reject(new Error('boom')))
    expect(error.value).not.toBeNull()

    await run(() => Promise.resolve())
    expect(error.value).toBeNull()
  })
})
