import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Every case mounts with attachTo: document.body, so global listeners (the outside-click
// and Escape handlers) stay live on document after the test ends unless torn down — without
// this, a later case's Escape keystroke can be handled by an earlier case's still-open menu too.
enableAutoUnmount(afterEach)

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ fullPath: '/team/' })
  return { useRoute: () => route, __route: route }
})

// The mocked module exposes the same reactive object the component sees.
const { __route: route } = (await import('vue-router')) as unknown as {
  __route: { fullPath: string }
}

const mountMenu = async () => {
  const HeaderMenu = (await import('@/ui/HeaderMenu.vue')).default
  return mount(HeaderMenu, {
    attachTo: document.body,
    props: { label: 'Test-Menü' },
    slots: { trigger: '<span>icon</span>', default: '<a href="#">Eintrag</a>' },
  })
}

describe('HeaderMenu', () => {
  it('is closed initially and toggles on trigger clicks', async () => {
    const w = await mountMenu()
    expect(w.find('[data-test=menu-panel]').exists()).toBe(false)
    await w.find('button').trigger('click')
    expect(w.find('[data-test=menu-panel]').exists()).toBe(true)
    await w.find('button').trigger('click')
    expect(w.find('[data-test=menu-panel]').exists()).toBe(false)
  })

  it('exposes its state to assistive technology', async () => {
    const w = await mountMenu()
    const trigger = w.find('button')
    expect(trigger.attributes('aria-label')).toBe('Test-Menü')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.find('[data-test=menu-panel]').exists()).toBe(false)
    expect(document.activeElement).toBe(w.find('button').element)
  })

  it('closes on a click outside', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    outside.dispatchEvent(new Event('click', { bubbles: true }))
    await nextTick()
    expect(w.find('[data-test=menu-panel]').exists()).toBe(false)
  })

  it('closes when the route changes', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    route.fullPath = '/other/'
    await nextTick()
    expect(w.find('[data-test=menu-panel]').exists()).toBe(false)
  })

  // This is the mechanism the failed-logout story rests on: a non-navigating action inside
  // the panel (a failed logout showing its error line) must not be closed out from under itself
  // by a click-inside handler. Requires attachTo: document.body (see mountMenu) — the outside-click
  // listener is registered on `document`, so a detached tree could never exercise it either way.
  it('does not close when a click lands on content inside the panel', async () => {
    const w = await mountMenu()
    await w.find('button').trigger('click')
    await w.find('a').trigger('click')
    await nextTick()
    expect(w.find('[data-test=menu-panel]').exists()).toBe(true)
  })
})
