import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayButton from '@/games/songsnippet/PlayButton.vue'

describe('PlayButton', () => {
  // The amber fill is the same in both modes, so its ink is too: `on-surface` turns light in the
  // dark and the play sign all but vanishes on the yellow.
  it('inks its sign dark on the amber in both modes', () => {
    const button = mount(PlayButton, { props: { label: 'Abspielen', waiting: false } }).get(
      '[data-test="play"]',
    )

    expect(button.classes()).toContain('bg-amber-400')
    expect(button.classes()).toContain('text-neutral-950')
    expect(button.classes()).not.toContain('text-on-surface')
  })
})
