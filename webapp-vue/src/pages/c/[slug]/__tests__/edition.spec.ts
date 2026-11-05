import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'
import type { CommunityResponse, EditionResponse } from '@/api/types'

const { push, refresh, ctx } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  ctx: { community: { value: {} as CommunityResponse } },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/communities/useAdminGuard', () => ({ useAdminGuard: vi.fn() }))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({ community: ctx.community, refresh }),
}))

const edition: EditionResponse = {
  label: 'Hüttenwochenende',
  startsAt: '2026-12-20T17:00:00.000Z',
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: -7,
  gamesFromRound: -30,
  gamesUntilRound: 0,
  frozen: false,
}

function community(e: EditionResponse | null): CommunityResponse {
  return {
    id: '1',
    name: 'Hütte Hütte',
    slug: 'hh',
    edition: e,
    viewerIsAdmin: true,
    pendingCount: 0,
    viewerIdentity: null,
  }
}

async function mountPage(e: EditionResponse | null) {
  ctx.community = { value: community(e) }
  const Page = (await import('@/pages/c/[slug]/edition.vue')).default
  const w = mount(Page)
  await flushPromises()

  return w
}

const sel = (name: string) => `[data-test=${name}]`

async function fillNew(w: Awaited<ReturnType<typeof mountPage>>) {
  await w.get(sel('date')).setValue('2026-12-20')
  await w.get(sel('time')).setValue('18:00')
  await w.get(sel('first-round')).setValue('-30')
}

describe('edition page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T11:00:00Z'))
    vi.spyOn(api, 'createEdition').mockResolvedValue(community(edition))
    vi.spyOn(api, 'replaceEdition').mockResolvedValue(community(edition))
    push.mockReset()
    refresh.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('creates an edition from the entered wall-clock time in the zone', async () => {
    const w = await mountPage(null)
    expect(w.get(sel('label')).attributes('placeholder')).toBe('Hütte Hütte')

    await fillNew(w)
    await w.get(sel('phase-two')).setValue('-7')
    await w.get('form').trigger('submit')
    await flushPromises()

    expect(api.createEdition).toHaveBeenCalledWith('hh', {
      label: null,
      startsAt: '2026-12-20T17:00:00.000Z',
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: -7,
      gamesFromRound: -30,
    })
    expect(api.replaceEdition).not.toHaveBeenCalled()
  })

  it('refreshes and goes to the settings after success', async () => {
    const w = await mountPage(null)
    await fillNew(w)
    await w.get('form').trigger('submit')
    await flushPromises()

    expect(refresh).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/c/hh/settings')
  })

  it('prefills an existing edition and replaces it', async () => {
    const w = await mountPage(edition)

    expect((w.get(sel('label')).element as HTMLInputElement).value).toBe('Hüttenwochenende')
    expect((w.get(sel('date')).element as HTMLInputElement).value).toBe('2026-12-20')
    expect((w.get(sel('time')).element as HTMLInputElement).value).toBe('18:00')
    expect((w.get(sel('phase-two')).element as HTMLInputElement).value).toBe('-7')

    await w.get(sel('phase-two')).setValue('')
    await w.get('form').trigger('submit')
    await flushPromises()

    expect(api.replaceEdition).toHaveBeenCalledWith('hh', {
      label: 'Hüttenwochenende',
      startsAt: '2026-12-20T17:00:00.000Z',
      startsAtTimezone: 'Europe/Berlin',
      phaseTwoStartRound: null,
      gamesFromRound: -30,
    })
  })

  it('previews the header line, with the label if set', async () => {
    const w = await mountPage(null)
    await fillNew(w)
    expect(w.get(sel('preview')).text()).toBe("Hütte Hütte '26")

    await w.get(sel('label')).setValue('Hüttenwochenende')
    expect(w.get(sel('preview')).text()).toBe("Hüttenwochenende '26")
  })

  it('shows when the entered rounds begin', async () => {
    const w = await mountPage(edition)

    expect(w.get(sel('first-round-date')).text()).toBe('beginnt Do., 19. Nov. 18:00')
    expect(w.get(sel('phase-two-date')).text()).toBe('beginnt Sa., 12. Dez. 18:00')
  })

  it('warns in red when the freeze has passed, but still submits', async () => {
    const w = await mountPage(null)
    await w.get(sel('date')).setValue('2026-11-10')
    await w.get(sel('time')).setValue('18:00')
    await w.get(sel('first-round')).setValue('-30')

    expect(w.find(sel('freeze-warning')).exists()).toBe(true)
    expect(w.get(sel('freeze-warning')).classes()).toContain('text-red-600')

    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.createEdition).toHaveBeenCalled()
  })

  it('locks date, time and zone of a frozen edition, without a warning', async () => {
    const w = await mountPage({ ...edition, frozen: true })

    for (const f of ['date', 'time', 'zone']) {
      expect(w.get(sel(f)).attributes('disabled')).toBeDefined()
    }
    expect(w.find(sel('freeze-warning')).exists()).toBe(false)
  })

  it('quotes the server detail on a rejected save', async () => {
    vi.spyOn(api, 'replaceEdition').mockRejectedValue(
      new ApiError(409, 'Conflict', { detail: 'Der Lauf ist fix.' }),
    )
    const w = await mountPage(edition)
    await w.get('form').trigger('submit')
    await flushPromises()

    expect(w.get(sel('error')).text()).toBe('Speichern fehlgeschlagen: „Der Lauf ist fix.“')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a hint instead of the calendar and blocks submit without start or first round', async () => {
    const w = await mountPage(null)

    expect(w.find('[data-test=edition-grid]').exists()).toBe(false)
    expect(w.find(sel('calendar-hint')).exists()).toBe(true)
    expect(w.get(sel('submit')).attributes('disabled')).toBeDefined()

    await fillNew(w)
    expect(w.find('[data-test=edition-grid]').exists()).toBe(true)
    expect(w.find(sel('calendar-hint')).exists()).toBe(false)
    expect(w.get(sel('submit')).attributes('disabled')).toBeUndefined()
  })
})
