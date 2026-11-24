import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import VolumeControl from '@/ui/VolumeControl.vue'
import { soundOnStage } from '@/ui/useSoundAwake'

enableAutoUnmount(afterEach)

describe('VolumeControl', () => {
  // It ratchets, so it knocks: like a sparking hold, it puts its page on stage and a tap there wakes
  // the graph (Anspielung has nothing else that knocks).
  it('puts sound on stage while it is mounted', () => {
    const w = mount(VolumeControl)
    expect(soundOnStage.value).toBe(true)

    w.unmount()
    expect(soundOnStage.value).toBe(false)
  })

  // Silent, it knocks nothing; its game says for itself whether it is on stage (Peilung's hold).
  it('stays off stage when silent', () => {
    mount(VolumeControl, { props: { silent: true } })

    expect(soundOnStage.value).toBe(false)
  })
})
