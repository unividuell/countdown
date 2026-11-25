import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { cardLabList } from '@/cardlab/cards'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'
import { posterList } from '@/communities/fallbacks/poster/posters'
import { checkLabGate } from '@/gamelab/api'

const params = reactive<Record<string, string>>({ card: 'countdown' })

vi.mock('vue-router', () => ({
  useRoute: () => ({ params }),
}))

vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({ community: ref({ slug: 'team', name: 'Team' }) }),
}))

vi.mock('@/gamelab/api', () => ({ checkLabGate: vi.fn() }))

const stubs = { RouterLink: RouterLinkStub }

/** The list's links, without the cross-link to the other lab beside the heading. */
const listLinks = (w: VueWrapper) =>
  w
    .findAllComponents(RouterLinkStub)
    .filter((l) => l.attributes('data-test') !== 'lab-other')
    .map((l) => String(l.props().to))

async function mountIndex() {
  const Page = (await import('@/pages/c/[slug]/card-lab/index.vue')).default
  const w = mount(Page, { global: { stubs } })
  await flushPromises()
  return w
}

async function mountCard(card: string) {
  params.card = card
  const Page = (await import('@/pages/c/[slug]/card-lab/[card]/index.vue')).default
  const w = mount(Page, { global: { stubs } })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.mocked(checkLabGate).mockReset().mockResolvedValue(undefined)
})

describe('card lab index', () => {
  it('links every card into the community in context', async () => {
    const w = await mountIndex()
    const links = listLinks(w)
    expect(links).toEqual(cardLabList.map((c) => `/c/team/card-lab/${c.id}`))
    for (const card of cardLabList) expect(w.text()).toContain(card.title)
  })

  it('links to the game lab beside its heading', async () => {
    const w = await mountIndex()
    const link = w.getComponent<typeof RouterLinkStub>('[data-test="lab-other"]')
    expect(link.props().to).toBe('/c/team/lab')
    expect(link.text()).toBe('Spiel-Labor')
  })

  it('stays behind the lab gate', async () => {
    const { ApiError } = await import('@/api/client')
    vi.mocked(checkLabGate).mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountIndex()
    expect(w.findAllComponents(RouterLinkStub)).toHaveLength(0)
    expect(w.get('[data-test="lab-unavailable"]').text()).toContain('Karten-Labor')
  })
})

describe('card lab card page', () => {
  afterEach(() => vi.useRealTimers())

  it('stays behind the lab gate', async () => {
    const { ApiError } = await import('@/api/client')
    vi.mocked(checkLabGate).mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountCard('countdown')
    expect(w.find('[data-test="countdown-card"]').exists()).toBe(false)
  })

  it('names an unknown card', async () => {
    const w = await mountCard('nope')
    expect(w.get('[data-test="card-lab-unknown"]').text()).toContain('„nope“')
  })

  it('shows the countdown at the chosen day count', async () => {
    const w = await mountCard('countdown')
    await w.get('[data-test="card-lab-days"]').setValue('123')
    expect(w.get('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '123 Tage bis zum Ziel',
    )
  })

  it('pads a single-digit day count as the community page does', async () => {
    const w = await mountCard('countdown')
    await w.get('[data-test="card-lab-days"]').setValue('7')
    expect(w.get('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '7 Tage bis zum Ziel',
    )
    expect(w.getComponent(CountdownCard).props('days')).toBe('07')
  })

  it('ticks while running and rolls into the next day', async () => {
    vi.useFakeTimers()
    const w = await mountCard('countdown')
    await w.get('[data-test="card-lab-days"]').setValue('5')
    await w.get('[data-test="card-lab-near-boundary"]').trigger('click')
    expect(w.get('[data-test="countdown-strip"]').attributes('aria-label')).toBe(
      'Verbleibende Zeit 00:00:03',
    )

    await vi.advanceTimersByTimeAsync(4000)

    expect(w.get('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '4 Tage bis zum Ziel',
    )
    expect(w.get('[data-test="countdown-strip"]').attributes('aria-label')).toBe(
      'Verbleibende Zeit 23:59:59',
    )
  })

  it('holds still when paused', async () => {
    vi.useFakeTimers()
    const w = await mountCard('countdown')
    await w.get('[data-test="card-lab-running"]').setValue(false)
    const before = w.get('[data-test="countdown-strip"]').attributes('aria-label')
    await vi.advanceTimersByTimeAsync(3000)
    expect(w.get('[data-test="countdown-strip"]').attributes('aria-label')).toBe(before)
  })

  it('takes the time left from the time field', async () => {
    const w = await mountCard('countdown')
    await w.get('[data-test="card-lab-running"]').setValue(false)
    await w.get('[data-test="card-lab-time"]').setValue('01:02:03')
    expect(w.get('[data-test="countdown-strip"]').attributes('aria-label')).toBe(
      'Verbleibende Zeit 01:02:03',
    )
  })

  it('closes on the players typed in', async () => {
    const w = await mountCard('poster')
    await w.get('[data-test="card-lab-members"]').setValue('Fry 3, Leela 7,  Bender 7 ')
    expect(w.text()).toContain('Herzlichen Glückwunsch, Leela und Bender!')
    expect(w.findAll('[data-test="poster-row"]').map((r) => r.text())).toEqual([
      expect.stringContaining('Leela'),
      expect.stringContaining('Bender'),
      expect.stringContaining('Fry'),
    ])
  })

  it('names the seed’s pick and lets a variant override it', async () => {
    const w = await mountCard('poster')
    const variant = w.get('[data-test="card-lab-variant"]')
    expect(variant.find('option[value=""]').text()).toBe(`Aus Seed: ${posterList[0]!.title}`)
    await variant.setValue(posterList[0]!.id)
    expect(w.find('[data-test="poster-podium"]').exists()).toBe(true)
  })

  it('shows the message cards without controls', async () => {
    const noDate = await mountCard('no-date')
    expect(noDate.text()).toContain('Noch kein Termin')
    const running = await mountCard('running')
    expect(running.text()).toContain('Und jetzt viel Spaß zusammen!')
  })
})
