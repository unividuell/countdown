import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'

function mountBox(awardRule: 'ALL_QUALIFYING' | 'CLOSEST_ONLY', awardPoints: number) {
  return mount(AwardBox, {
    props: { awardRule, awardPoints, gameId: 'guess-hue' },
    slots: {
      qualifies: '<span>Nah genug am Farbton</span>',
      closest: '<span>Am nächsten am Farbton</span>',
    },
  })
}

describe('AwardBox', () => {
  beforeEach(() => localStorage.clear())

  // Collapsed is the state the box spends most of its life in, and the point count is the one
  // thing that changes round to round — so it belongs in the abstract.
  it('puts the stake in the abstract, where a collapsed box still shows it', async () => {
    const w = mountBox('CLOSEST_ONLY', 7)
    await w.get('[data-test="info-box-toggle"]').trigger('click')

    expect(w.text()).toContain('7 Punkte')
  })

  it('names the phase one rule and its single point', () => {
    expect(mountBox('ALL_QUALIFYING', 1).text()).toContain('Jeder gültige Tipp: 1 Punkt')
  })

  it('names the phase two rule and the round own stake', () => {
    expect(mountBox('CLOSEST_ONLY', 7).text()).toContain('Winner takes it all: 7 Punkte')
  })

  // What "closest" means can only be answered by the game itself — and in phase one the question
  // isn't that one at all, it's "what counts as correct in the first place".
  it('shows the phase own sentence and only that one', () => {
    expect(mountBox('ALL_QUALIFYING', 1).text()).toContain('Nah genug am Farbton')
    expect(mountBox('ALL_QUALIFYING', 1).text()).not.toContain('Am nächsten am Farbton')

    expect(mountBox('CLOSEST_ONLY', 7).text()).toContain('Am nächsten am Farbton')
    expect(mountBox('CLOSEST_ONLY', 7).text()).not.toContain('Nah genug am Farbton')
  })

  it('wears the phase two tone only in phase two', () => {
    expect(mountBox('CLOSEST_ONLY', 7).getComponent(InfoBox).props('tone')).toBe('phase-two')
    expect(mountBox('ALL_QUALIFYING', 1).getComponent(InfoBox).props('tone')).toBe('info')
  })

  // The fold is remembered per game AND per phase: whoever collapsed the box in phase one gets it
  // open again on phase two's first round — where the rule changes completely.
  it('remembers the collapse per game and per phase', () => {
    expect(mountBox('ALL_QUALIFYING', 1).getComponent(InfoBox).props('storageKey')).toBe(
      'award:guess-hue:p1',
    )
    expect(mountBox('CLOSEST_ONLY', 7).getComponent(InfoBox).props('storageKey')).toBe(
      'award:guess-hue:p2',
    )
  })

  // The lab keys its page on the seed, not the phase, so the same AwardBox instance lives through
  // a phase change — no remount to re-evaluate the storage key from scratch. `storageKey` above
  // only pins the prop value; it cannot see a key that fails to follow a prop change in place.
  it('unfolds again on a phase change without remounting', async () => {
    const w = mountBox('ALL_QUALIFYING', 1)
    await w.get('[data-test="info-box-toggle"]').trigger('click')
    expect(w.find('[data-test="info-box-body"]').exists()).toBe(false)

    await w.setProps({ awardRule: 'CLOSEST_ONLY', awardPoints: 7 })
    expect(w.find('[data-test="info-box-body"]').exists()).toBe(true)

    await w.setProps({ awardRule: 'ALL_QUALIFYING', awardPoints: 1 })
    expect(w.find('[data-test="info-box-body"]').exists()).toBe(false)
  })
})
