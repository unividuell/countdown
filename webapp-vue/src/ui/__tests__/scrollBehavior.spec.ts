import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { HASH_WAIT_TIMEOUT_MS, scrollBehavior, waitForElementById } from '@/ui/scrollBehavior'

function toWithHash(hash: string): RouteLocationNormalizedLoaded {
  return { hash } as RouteLocationNormalizedLoaded
}

describe('waitForElementById', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('resolves immediately when the element is already there', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="round-3"></div>')
    await expect(waitForElementById('round-3')).resolves.toBe(true)
  })

  it('resolves true once an element that mounts after a delay appears', async () => {
    const promise = waitForElementById('round-3')
    setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="round-3"></div>')
    }, 120)
    await vi.advanceTimersByTimeAsync(200)
    await expect(promise).resolves.toBe(true)
  })

  it('gives up and resolves false once the timeout elapses', async () => {
    const promise = waitForElementById('round-3', 500)
    await vi.advanceTimersByTimeAsync(600)
    await expect(promise).resolves.toBe(false)
  })
})

describe('scrollBehavior', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('honours a saved position over any hash', async () => {
    const result = scrollBehavior(toWithHash('#round-3'), toWithHash(''), { left: 0, top: 42 })
    await expect(result).resolves.toEqual({ left: 0, top: 42 })
  })

  it('lands at the top when there is no hash', async () => {
    const result = scrollBehavior(toWithHash(''), toWithHash(''), null)
    await expect(result).resolves.toEqual({ top: 0 })
  })

  // vue-router itself resolves these two shapes for a trailing '#' and an unescaped space, and
  // both make `document.querySelector` throw a SyntaxError — the guard has to reject them before
  // any selector call is made, not merely catch the throw.
  it.each(['#', '#a b'])(
    'lands at the top for the unsafe hash %j without throwing',
    async (hash) => {
      const result = scrollBehavior(toWithHash(hash), toWithHash(''), null)
      await expect(result).resolves.toEqual({ top: 0 })
    },
  )

  it('scrolls to the anchor once it mounts after the navigation resolves', async () => {
    const promise = scrollBehavior(toWithHash('#round-3'), toWithHash(''), null)
    setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="round-3"></div>')
    }, 120)
    await vi.advanceTimersByTimeAsync(200)
    await expect(promise).resolves.toEqual({ el: '#round-3' })
  })

  it('falls back to the top when the anchor never mounts', async () => {
    const promise = scrollBehavior(toWithHash('#round-3'), toWithHash(''), null)
    await vi.advanceTimersByTimeAsync(HASH_WAIT_TIMEOUT_MS + 100)
    await expect(promise).resolves.toEqual({ top: 0 })
  })
})
