import { describe, expect, it } from 'vitest'
import { RouterLinkStub, config, mount } from '@vue/test-utils'
import LabControls from '@/gamelab/LabControls.vue'

config.global.stubs = { RouterLink: RouterLinkStub }

describe('LabControls', () => {
  it('links the heading to the lab index', () => {
    const indexPath = '/c/team/lab?phase=TWO'
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'TWO', returnPath: '/x', indexPath, busy: false, ramp: false },
    })

    const link = wrapper.get('[data-test="lab-index-link"]').findComponent(RouterLinkStub)

    expect(link.props().to).toBe(indexPath)
    expect(link.text()).toBe('Spiel-Labor')
  })

  it('sends "Spieler wechseln" through the sign-in picker and back to the exact lab URL', () => {
    // `?` and `&` belong to the lab URL itself; `{` once broke the server-side redirect.
    const returnPath = '/c/team/lab/stub?seed=42&phase=TWO&note={x}'
    const wrapper = mount(LabControls, {
      props: { seed: 42, phase: 'TWO', returnPath, indexPath: '/i', busy: false, ramp: false },
    })

    const href = wrapper.get('[data-test="lab-switch-player"]').attributes('href')
    const url = new URL(href!, 'https://example.test')

    expect(url.pathname).toBe('/login/start')
    expect(url.searchParams.get('redirect')).toBe(returnPath)
  })

  it("shows the loaded round's difficulty under the seed", () => {
    const wrapper = mount(LabControls, {
      props: {
        seed: 42,
        phase: 'ONE',
        returnPath: '/x',
        indexPath: '/i',
        busy: false,
        ramp: false,
        difficulty: 0.7,
      },
    })

    expect(wrapper.get('[data-test="lab-difficulty"]').text()).toBe('Schwierigkeit 0,7')
  })

  it('writes the extremes with one decimal, zero included', () => {
    const at = (difficulty: number) =>
      mount(LabControls, {
        props: {
          seed: 42,
          phase: 'ONE',
          returnPath: '/x',
          indexPath: '/i',
          busy: false,
          ramp: false,
          difficulty,
        },
      })
        .get('[data-test="lab-difficulty"]')
        .text()

    expect(at(0)).toBe('Schwierigkeit 0,0')
    expect(at(1)).toBe('Schwierigkeit 1,0')
  })

  it('shows no difficulty line without a round', () => {
    const wrapper = mount(LabControls, {
      props: {
        seed: 42,
        phase: 'ONE',
        returnPath: '/x',
        indexPath: '/i',
        busy: false,
        ramp: false,
      },
    })

    expect(wrapper.find('[data-test="lab-difficulty"]').exists()).toBe(false)
  })

  it('reflects the ramp switch in its checkbox', () => {
    const at = (ramp: boolean) =>
      mount(LabControls, {
        props: { seed: 42, phase: 'ONE', returnPath: '/x', indexPath: '/i', busy: false, ramp },
      }).get<HTMLInputElement>('[data-test="lab-ramp"]')

    expect(at(true).element.checked).toBe(true)
    expect(at(false).element.checked).toBe(false)
  })

  it('emits the new value when the ramp checkbox changes', async () => {
    const wrapper = mount(LabControls, {
      props: {
        seed: 42,
        phase: 'ONE',
        returnPath: '/x',
        indexPath: '/i',
        busy: false,
        ramp: false,
      },
    })

    await wrapper.get('[data-test="lab-ramp"]').setValue(true)

    expect(wrapper.emitted('rampChange')).toEqual([[true]])
  })
})
