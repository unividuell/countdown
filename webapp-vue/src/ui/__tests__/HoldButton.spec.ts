import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HoldButton from '@/ui/HoldButton.vue'
import { DEFAULT_HOLD_MS } from '@/ui/useHoldProgress'

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

/**
 * happy-dom computes no layout: `getBoundingClientRect()` answers all zeroes, which would make the
 * button's own circular hit test degenerate (a zero-radius circle centred on the origin). A
 * pointer-position test is worthless without a real box to measure against.
 */
function stubButtonRect(el: Element): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
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
    // reveal — happy-dom has no WAAPI to paper over this, so this is the structural proxy. It
    // lives on the wrapper (`hold-pop`) rather than the button itself, because the wrapper is
    // also what the entrance animation moves — ring and button hide and arrive as one object.
    const w = mountButton({ ready: false })

    const style = w.get('[data-test="hold-pop"]').attributes('style')
    expect(style).toContain('scale(0)')
    expect(style).toContain('opacity: 0')
  })

  it('rests visible once it is ready', () => {
    const w = mountButton({ ready: true })

    const style = w.get('[data-test="hold-pop"]').attributes('style')
    expect(style).not.toContain('scale(0)')
    expect(style).toContain('opacity: 1')
  })

  it('shows the outline at rest, before any hold has started', () => {
    // One element, two jobs: the thin outline reads as the button's own rim at rest, and doubles
    // as the hold-progress track once a hold starts. It must be visible from the start, not only
    // once `progress` leaves zero, or the button never reads as a button in the first place.
    const w = mountButton()

    const style = w.get('[data-test="hold-ring"]').attributes('style')

    expect(style).toContain('d4d4d4')
    // Progress starts at 0, so the fill stop sits at 0deg — nothing is filled in yet, but the ring
    // itself (the grey base above) is already there to be filled.
    expect(style).toContain('currentColor 0deg')
  })

  it('fills the outline with colour as the hold runs', async () => {
    const w = mountButton()
    const ring = w.get('[data-test="hold-ring"]')
    const atRest = ring.attributes('style')

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(500)
    await w.vm.$nextTick()

    expect(ring.attributes('style')).not.toBe(atRest)
  })

  it('holds for DEFAULT_HOLD_MS when the caller passes no holdMs at all', async () => {
    // mountButton always supplies a holdMs, so a caller with no opinion (the real default path)
    // was never exercised, and nothing pinned DEFAULT_HOLD_MS's actual value.
    const w = mount(HoldButton, {
      props: {
        ready: true,
        disabled: false,
        label: 'Tipp bestätigen',
        color: 'hsl(210 60% 45%)',
      },
    })

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(DEFAULT_HOLD_MS - 100)
    expect(w.emitted('confirm')).toBeUndefined()

    vi.advanceTimersByTime(200)
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('confirms after the full hold', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not confirm when released early', async () => {
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
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

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('does not start a hold on a right-button press', async () => {
    // A right mouse-down must get no response at all — not even a swallowed one. Without this
    // check the hold starts the same as a left press, `@contextmenu.prevent` eats the browser's
    // own context menu, and the combination reads as total silence: having seen nothing happen,
    // the user naturally holds a moment longer and submits by accident.
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { button: 2, isPrimary: true })
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('does not start a hold from a non-primary pointer', async () => {
    // A second, simultaneous touch point (e.g. a stray finger resting on the screen) reports
    // `isPrimary: false`; it must not be able to start or contribute to a hold either.
    const w = mountButton()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { button: 0, isPrimary: false })
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('springs in when it becomes ready, animating the ring and button as one object', async () => {
    const animate = installAnimate()
    const w = mountButton({ ready: false })

    await w.setProps({ ready: true })

    expect(animate).toHaveBeenCalledTimes(1)
    // The outline is a sibling of the button, not a child — the only way for it to arrive
    // together with the button is for a shared ancestor to be what actually gets animated.
    expect(animate.mock.contexts[0]).toBe(w.get('[data-test="hold-pop"]').element)
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
    expect(w.get('[data-test="hold-button"]').attributes('inert')).toBeUndefined()
    // This is the regression the animation-only version could not catch: with the transition
    // skipped, the resting style is the only thing left to show the control at all.
    const style = w.get('[data-test="hold-pop"]').attributes('style')
    expect(style).not.toContain('scale(0)')
    expect(style).toContain('opacity: 1')
  })

  it('suppresses the context menu, so a long press cannot pop it mid-hold', () => {
    // Reproduced with a plain mouse: a long left-press near selectable text opens the browser's
    // context menu partway through the hold. The menu steals focus, `pointerup` never reaches the
    // button, and the hold ran to completion — submitting a guess the user was trying to abort.
    const w = mountButton()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })

    w.get('[data-test="hold-button"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('cancels a hold on blur, and a fresh hold afterwards still completes', async () => {
    // The second route to the same bug: hold Space, Cmd-Tab away, release. The window loses focus
    // but stays visible, so `visibilitychange` never fires and the background guard in
    // `useHoldProgress` does not cover it — only `blur` does. The second half of this test is the
    // regression that matters just as much: an abort must not wedge the control.
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    await el.trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(400)
    await el.trigger('blur')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()

    await el.trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('cancels a hold when the browser takes pointer capture away', async () => {
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    await el.trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(400)
    await el.trigger('lostpointercapture')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('aborts the hold when a touch slides off the button, since pointerleave never fires for it', async () => {
    // Implicit pointer capture (set by the browser on `pointerdown` for direct manipulation) means
    // `pointerleave`/`pointerout` are not dispatched while the point moves — only once capture is
    // released, at `pointerup`. So on a phone the universal "slide the thumb off to cancel" gesture
    // reaches nothing at all without a `pointermove`-driven hit test: the hold would otherwise run
    // to completion regardless of how far the thumb has drifted.
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')
    stubButtonRect(el.element)

    await el.trigger('pointerdown', { isPrimary: true, clientX: 50, clientY: 50 })
    vi.advanceTimersByTime(400)
    // The button's stubbed box is 100×100 at the origin, radius 50 about (50, 50) — (99, 99) sits
    // well outside that circle (distance ≈ 69), on the wheel surrounding the button.
    await el.trigger('pointermove', { clientX: 99, clientY: 99 })
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('keeps holding while the pointer stays within the button, even off-centre', async () => {
    // The counterpart to the test above: the hit test must not be so eager that ordinary jitter
    // within the button's own bounds aborts a hold that was never meant to cancel.
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')
    stubButtonRect(el.element)

    await el.trigger('pointerdown', { isPrimary: true, clientX: 50, clientY: 50 })
    // (80, 80) is distance ≈ 42 from the centre — inside the radius-50 circle.
    await el.trigger('pointermove', { clientX: 80, clientY: 80 })
    vi.advanceTimersByTime(1200)

    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('cancels an in-flight hold when disabled turns on mid-hold', async () => {
    // A `disabled` element stops dispatching pointer events, so flipping `disabled` mid-hold would
    // otherwise mean `pointerup` never fires and the hold completes on top of whatever caused the
    // disable in the first place — typically a request already in flight.
    const w = mountButton()
    const el = w.get('[data-test="hold-button"]')

    await el.trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(400)
    await w.setProps({ disabled: true })
    vi.advanceTimersByTime(3000)

    expect(w.emitted('confirm')).toBeUndefined()
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
