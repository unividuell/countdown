import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import { START_CAMERA } from '@/games/copyblocks/view'

describe('BlockScene', () => {
  it('says so when the device cannot draw 3D, instead of an empty card', async () => {
    // happy-dom has no WebGL: this is exactly the device that cannot. Three.js logs why.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => quiet.mockRestore())

    const wrapper = mount(BlockScene, {
      props: {
        blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
        field: { lo: [0, 0, 0], hi: [5, 5, 5] },
        background: '#cfe2f4',
        camera: START_CAMERA,
      },
    })
    await nextTick()

    expect(wrapper.text()).toContain('Dein Gerät kann die 3D-Ansicht nicht zeigen.')
  })
})
