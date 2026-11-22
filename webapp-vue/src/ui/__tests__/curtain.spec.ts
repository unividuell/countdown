import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { provideCurtain, useCurtainOpen } from '@/ui/curtain'

const Probe = defineComponent({
  setup: () => ({ open: useCurtainOpen() }),
  template: '<i>{{ open }}</i>',
})

describe('curtain', () => {
  it('is open where nothing provides one', () => {
    expect(mount(Probe).text()).toBe('true')
  })

  it('follows the provider', async () => {
    const open = ref(false)
    const Host = defineComponent({
      components: { Probe },
      setup: () => provideCurtain(open),
      template: '<Probe />',
    })
    const w = mount(Host)

    expect(w.text()).toBe('false')

    open.value = true
    await nextTick()

    expect(w.text()).toBe('true')
  })
})
