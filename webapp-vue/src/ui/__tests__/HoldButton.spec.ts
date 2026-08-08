import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'

function mountButton(props: Partial<InstanceType<typeof HoldButton>['$props']> = {}) {
  return mount(HoldButton, {
    props: {
      ready: true,
      disabled: false,
      label: 'Tipp bestätigen',
      color: 'hsl(210 60% 45%)',
      holdMs: 1000,
      ...props,
    },
  })
}

function installAnimate(): ReturnType<typeof vi.fn> {
  // happy-dom has no Web Animations API; a test that wants to observe it installs it itself.
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('HoldButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
    // @ts-expect-error — removing the stub again
    delete Element.prototype.animate
  })

  it('is inert while it is not ready', () => {
    const w = mountButton({ ready: false })

    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeDefined()
  })

  it('drops inert once it is ready', () => {
    const w = mountButton({ ready: true })

    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeUndefined()
  })

  it('rests hidden while it is not ready, regardless of the pop-in animation', () => {
    // `inert` only blocks interaction; nothing about it hides the button visually. The resting
    // style has to carry that on its own, or the button sits fully visible before its first
    // reveal — happy-dom has no WAAPI to paper over this, so this is the structural proxy.
    const w = mountButton({ ready: false })

    const style = w.get('[data-test="hold-button"]').attributes('style')
    expect(style).toContain('scale(0)')
    expect(style).toContain('opacity: 0')
  })

  it('rests visible once it is ready', () => {
    const w = mountButton({ ready: true })

    const style = w.get('[data-test="hold-button"]').attributes('style')
    expect(style).not.toContain('scale(0)')
    expect(style).toContain('opacity: 1')
  })

  it('confirms after the full hold', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not confirm when released early', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(400)
    await w.get('[data-test="hold-button"]').trigger('pointerup')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('holds on the keyboard too, and swallows the space key so the page does not scroll', async () => {
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')
    // A real event, because trigger() cannot report whether `.prevent` was applied.
    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    el.element.dispatchEvent(down)
    vi.advanceTimersByTime(1200)

    expect(down.defaultPrevented).toBe(true)
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not confirm on a synthetic click without a hold', async () => {
    // The whole point of the gesture: an assistive tool or a stray Enter must not submit.
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('click')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('abandons a keyboard hold when the key comes back up', async () => {
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    el.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    vi.advanceTimersByTime(400)
    el.element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('ignores a hold while disabled', async () => {
    const w = mountButton({ disabled: true })

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('springs in when it becomes ready', async () => {
    const animate = installAnimate()
    const w = mountButton({ ready: false })

    await w.setProps({ ready: true })

    expect(animate).toHaveBeenCalledTimes(1)
    const keyframes = animate.mock.calls[0]![0] as Array<{ transform: string }>
    expect(keyframes[0]!.transform).toContain('scale(0)')
    expect(keyframes.at(-1)!.transform).toContain('scale(1)')
  })

  it('does not spring in when motion is reduced, but still ends up visible and usable', async () => {
    const animate = installAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mountButton({ ready: false })

    await w.setProps({ ready: true })

    expect(animate).not.toHaveBeenCalled()
    const el = w.get('[data-test="hold-button"]')
    expect(el.attributes('inert')).toBeUndefined()
    // This is the regression the animation-only version could not catch: with the transition
    // skipped, the resting style is the only thing left to show the button at all.
    const style = el.attributes('style')
    expect(style).not.toContain('scale(0)')
    expect(style).toContain('opacity: 1')
  })

  it('resumes keyboard holds after the tab hides mid-hold', async () => {
    // The composable abandons the hold itself when the tab goes to the background, but does not
    // tell HoldButton. If `keyHeld` did not follow `holding` back down, the physical keyup — which
    // never reaches this document once focus has moved elsewhere — would never clear it, and every
    // later keydown would be swallowed by the repeat guard, permanently.
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    el.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    vi.advanceTimersByTime(400)

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    setHidden(false)
    // No matching keyup ever arrives: the key was physically released while the tab was hidden.

    el.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })
})
