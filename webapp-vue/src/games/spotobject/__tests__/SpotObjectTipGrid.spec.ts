import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RoundReview } from '@/rounds/review'
import SpotObjectTipGrid from '../SpotObjectTipGrid.vue'
import type { TipTile } from '../tips'

function tile(over: Partial<TipTile> & { userId: string }): TipTile {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    tip: { panoId: 'pano-1', heading: 10, pitch: -5, zoom: 1 },
    flag: '🇩🇪',
    confirms: [],
    flags: [],
    myVote: null,
    struck: false,
    adminOverride: null,
    mine: false,
    ...over,
  }
}

function mountGrid(
  tiles: TipTile[],
  over: Partial<{ canVote: boolean; review: Partial<RoundReview> }> = {},
) {
  const review: RoundReview = {
    open: true,
    canOverride: false,
    vote: vi.fn().mockResolvedValue(undefined),
    override: vi.fn().mockResolvedValue(undefined),
    ...over.review,
  }
  const wrapper = mount(SpotObjectTipGrid, {
    props: { tiles, canVote: over.canVote ?? true, review },
  })
  return { wrapper, review }
}

describe('SpotObjectTipGrid', () => {
  it('renders one tile per tip in two columns', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a' }), tile({ userId: 'b' })])

    expect(wrapper.findAll('[data-test="tip-tile"]')).toHaveLength(2)
    expect(wrapper.get('[data-test="tip-grid"]').classes()).toContain('grid-cols-2')
  })

  it('names everybody who voted, on both sides', () => {
    const { wrapper } = mountGrid([
      tile({
        userId: 'a',
        confirms: [{ userId: 'b', username: 'Bianca', value: 'CONFIRM' }],
        flags: [{ userId: 'c', username: 'Caro', value: 'FLAG' }],
      }),
    ])

    expect(wrapper.text()).toContain('Bianca')
    expect(wrapper.text()).toContain('Caro')
  })

  it('strikes the name through instead of explaining the strike', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', struck: true })])

    expect(wrapper.get('[data-test="tip-name"]').classes()).toContain('line-through')
    expect(wrapper.text()).not.toContain('gestrichen')
  })

  /**
   * The corner itself is Google's own wordmark, and covering it breaks the terms of service. It
   * measures the bottom 3% of a still, so the offset is a percentage: a pixel value would have to
   * be re-guessed for every tile size this grid is shown at.
   */
  it('keeps the Google link clear of the attribution burnt into the still', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a' })])

    const link = wrapper.get('[data-test="tip-google"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.classes()).toContain('bottom-[6%]')
  })

  /** A neighbour with more voters makes the row taller; the colour has to follow it down. */
  it('fills the foot to the bottom of the row, however tall the row got', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a' })])

    expect(wrapper.get('[data-test="tip-tile"]').classes()).toEqual(
      expect.arrayContaining(['flex', 'h-full', 'flex-col']),
    )
    expect(wrapper.get('[data-test="tip-foot"]').classes()).toContain('flex-1')
  })

  /** On a saturated player colour a bare emoji sits in the background rather than on it. */
  it('sets the country off from the player colour, outside the strike-through', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', struck: true })])

    const country = wrapper.get('[data-test="tip-country"]')
    expect(country.text()).toBe('🇩🇪')
    expect(country.classes()).not.toContain('line-through')
    expect(wrapper.get('[data-test="tip-name"]').classes()).toContain('line-through')
  })

  /** Half a phone wide: a comma list truncated at the second name and lost the rest of the vote. */
  it('gives every voter a line of their own', () => {
    const { wrapper } = mountGrid([
      tile({
        userId: 'a',
        confirms: [
          { userId: 'b', username: 'Bianca', value: 'CONFIRM' },
          { userId: 'd', username: 'Dora', value: 'CONFIRM' },
        ],
      }),
    ])

    const lines = wrapper.findAll('[data-test="tip-confirms"]')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text()).toContain('Bianca')
    expect(lines[1]!.text()).toContain('Dora')
  })

  /**
   * The whole reason the single-tip page went away: judging means comparing, and every ballot used
   * to take the rest of the round off screen and back.
   */
  it('casts a ballot from the tile itself', async () => {
    const { wrapper, review } = mountGrid([tile({ userId: 'a' })])

    await wrapper.get('[data-test="tip-flag"]').trigger('click')

    expect(review.vote).toHaveBeenCalledWith('a', 'FLAG')
  })

  it('withdraws the ballot it already holds', async () => {
    const { wrapper, review } = mountGrid([tile({ userId: 'a', myVote: 'CONFIRM' })])

    await wrapper.get('[data-test="tip-confirm"]').trigger('click')

    expect(review.vote).toHaveBeenCalledWith('a', null)
  })

  it('shows the held ballot as pressed', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', myVote: 'FLAG' })])

    expect(wrapper.get('[data-test="tip-flag"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="tip-confirm"]').attributes('aria-pressed')).toBe('false')
  })

  /**
   * The override overrules the vote; it does not erase it. Striking the names it beat keeps the
   * review that happened visible beside the verdict — and says which way the verdict went.
   */
  it('strikes through the names an override overruled', () => {
    const votes = {
      confirms: [{ userId: 'b', username: 'Bianca', value: 'CONFIRM' as const }],
      flags: [{ userId: 'c', username: 'Caro', value: 'FLAG' as const }],
    }

    const struck = mountGrid([tile({ userId: 'a', ...votes, adminOverride: false })])
    expect(struck.wrapper.get('[data-test="tip-confirms"]').classes()).toContain('line-through')
    expect(struck.wrapper.get('[data-test="tip-flags"]').classes()).not.toContain('line-through')

    const counted = mountGrid([tile({ userId: 'a', ...votes, adminOverride: true })])
    expect(counted.wrapper.get('[data-test="tip-flags"]').classes()).toContain('line-through')
    expect(counted.wrapper.get('[data-test="tip-confirms"]').classes()).not.toContain(
      'line-through',
    )
  })

  /** Four controls do not fit across a phone's half-width tile; two columns of two do. */
  it('stacks each control group down its own edge', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a' })], { review: { canOverride: true } })

    expect(wrapper.get('[data-test="tip-vote"]').classes()).toContain('flex-col')
    expect(wrapper.get('[data-test="tip-override"]').classes()).toContain('flex-col')
  })

  it('offers no ballot on my own tip', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', mine: true })])

    expect(wrapper.find('[data-test="tip-vote"]').exists()).toBe(false)
  })

  /**
   * The server's review window is the running round and the one before it; it refuses anything
   * older. Controls on a round nobody can vote on any more produced a 404 per press.
   */
  it('offers nothing to press on a round that is past its review window', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', adminOverride: true })], {
      review: { open: false, canOverride: true },
    })

    expect(wrapper.find('[data-test="tip-vote"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tip-override"]').exists()).toBe(false)
    // What happened is still shown — only what can no longer happen is gone.
    expect(wrapper.find('[data-test="tip-override-badge"]').exists()).toBe(true)
  })

  it('offers no ballot to somebody who did not play the round', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a' })], { canVote: false })

    expect(wrapper.find('[data-test="tip-vote"]').exists()).toBe(false)
  })

  it('offers the override only where the server allows it', () => {
    const plain = mountGrid([tile({ userId: 'a' })])
    expect(plain.wrapper.find('[data-test="tip-override"]').exists()).toBe(false)

    const admin = mountGrid([tile({ userId: 'a' })], { review: { canOverride: true } })
    expect(admin.wrapper.find('[data-test="tip-override"]').exists()).toBe(true)
  })

  it('hands a tip back to the vote when the standing verdict is pressed again', async () => {
    const { wrapper, review } = mountGrid([tile({ userId: 'a', adminOverride: false })], {
      review: { canOverride: true },
    })

    await wrapper.get('[data-test="tip-override-strike"]').trigger('click')

    expect(review.override).toHaveBeenCalledWith('a', null)
  })

  /**
   * The override is the one movement in an otherwise fully open procedure, so it may not be silent
   * for the people who cannot press it — and it says so without a sentence.
   */
  it('shows a standing override to everyone, as a badge rather than a button', () => {
    const { wrapper } = mountGrid([tile({ userId: 'a', adminOverride: true })])

    expect(wrapper.find('[data-test="tip-override-badge"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('vom Spielleiter')
  })

  /** Every ballot rewrites the round's scoring, so the second click has to see the first's answer. */
  it('holds every other control while a ballot is in flight', async () => {
    let release = (): void => {}
    const { wrapper } = mountGrid([tile({ userId: 'a' }), tile({ userId: 'b' })], {
      review: { vote: vi.fn(() => new Promise<void>((resolve) => (release = resolve))) },
    })

    await wrapper.findAll('[data-test="tip-confirm"]')[0]!.trigger('click')

    const others = wrapper.findAll('[data-test="tip-flag"]')
    expect(others[1]!.attributes('disabled')).toBeDefined()

    release()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-test="tip-flag"]')[1]!.attributes('disabled')).toBeUndefined()
  })
})
