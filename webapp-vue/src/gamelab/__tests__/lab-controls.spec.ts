import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LabControls from '@/gamelab/LabControls.vue'

describe('LabControls', () => {
  it('sends "Spieler wechseln" through the sign-in picker and back to the exact lab URL', () => {
    // `?` and `&` belong to the lab URL itself; `{` once broke the server-side redirect.
    const returnPath = '/c/team/lab/stub?seed=42&phase=TWO&note={x}'
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'TWO', returnPath, busy: false },
    })

    const href = wrapper.get('[data-test="lab-switch-player"]').attributes('href')
    const url = new URL(href!, 'https://example.test')

    expect(url.pathname).toBe('/login/start')
    expect(url.searchParams.get('redirect')).toBe(returnPath)
  })
})
