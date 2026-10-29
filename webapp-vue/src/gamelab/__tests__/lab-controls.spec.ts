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

  it("shows the loaded round's difficulty under the seed", () => {
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'ONE', returnPath: '/x', busy: false, difficulty: 0.7 },
    })

    expect(wrapper.get('[data-test="lab-difficulty"]').text()).toBe('Schwierigkeit 0,7')
  })

  it('writes the extremes with one decimal, zero included', () => {
    const at = (difficulty: number) =>
      mount(LabControls, {
        props: { seed: 42, phase: 'ONE', returnPath: '/x', busy: false, difficulty },
      })
        .get('[data-test="lab-difficulty"]')
        .text()

    expect(at(0)).toBe('Schwierigkeit 0,0')
    expect(at(1)).toBe('Schwierigkeit 1,0')
  })

  it('shows no difficulty line without a round', () => {
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'ONE', returnPath: '/x', busy: false },
    })

    expect(wrapper.find('[data-test="lab-difficulty"]').exists()).toBe(false)
  })
})
