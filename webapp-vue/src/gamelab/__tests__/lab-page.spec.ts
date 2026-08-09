import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import * as api from '@/gamelab/api'
import { initialSeed } from '@/gamelab/seed'
import * as drawerControl from '@/nav/drawerControl'
import SampleGame from '@/gamelab/SampleGame.vue'
import type { GuessHuePayload, LabRoundResponse, SamplePayload } from '@/gamelab/types'

const replace = vi.fn()
/**
 * Reactive, and mutated in place rather than reassigned, because one test relies on the same
 * caveat the real bug hinges on: Vue Router's `route.query` updates in place for a query-only
 * navigation (no remount of the page), which is exactly what lets `router.replace({ query })` race
 * ahead of a round response landing. A plain reassigned object here would not track at all.
 */
const currentQuery = reactive<Record<string, unknown>>({ seed: '42' })
let currentParams: Record<string, string> = { slug: 'team', game: 'sample' }

function setQuery(next: Record<string, unknown>): void {
  for (const key of Object.keys(currentQuery)) delete currentQuery[key]
  Object.assign(currentQuery, next)
}

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({
    get query() {
      return currentQuery
    },
    get params() {
      return currentParams
    },
    path: '/c/team/lab/sample',
  }),
}))
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team' } },
    refresh: vi.fn(),
  }),
}))

const round: LabRoundResponse<SamplePayload> = {
  seed: 42,
  game: 'sample',
  displayName: 'Zahlenraten (Attrappe)',
  payload: { lowerBound: 100, upperBound: 199 },
  me: null,
  others: [],
  tookOverRound: false,
}

/**
 * Tracked and unmounted after every test (see the `afterEach` below). `currentQuery` is a single
 * reactive object shared across the whole file — a page left mounted from an earlier test would
 * keep its `watch(seed, …)` live, and a later test's `setQuery` would fire it too, stealing
 * `vi.spyOn` `mockResolvedValueOnce`/`mockImplementationOnce` slots meant for the current test.
 */
const mountedPages: VueWrapper[] = []

async function mountPage() {
  const Page = (await import('@/pages/c/[slug]/lab/[game].vue')).default
  const wrapper = mount(Page)
  mountedPages.push(wrapper)
  await flushPromises()
  return wrapper
}

/**
 * The controls are teleported into the nav drawer, so they are NOT in the wrapper's tree — the
 * page under test renders only what a player would see. This reaches them where they actually
 * land. Mounting without the target is not merely unfindable but fatal: Vue's deferred teleport
 * throws on a missing target and the throw eats the pending render, so the page stays empty.
 */
function tool(testId: string): DOMWrapper<Element> {
  const el = document.querySelector(`[data-test="${testId}"]`)
  if (!el) throw new Error(`no teleported control [data-test="${testId}"] in the drawer container`)
  return new DOMWrapper(el)
}

describe('lab page', () => {
  beforeEach(() => {
    // NavDrawer owns this container in the running app; here it stands in for it, because the
    // page teleports its controls into it and a missing target aborts the render (see `tool`).
    document.body.innerHTML = '<div id="drawer-page-tools"></div>'
    replace.mockReset()
    setQuery({ seed: '42' })
    currentParams = { slug: 'team', game: 'sample' }
    // vi.spyOn reuses the same mock across tests once a method is already spied, so call counts
    // accumulate across the whole file unless cleared here too — same reasoning as replace above.
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'submitLabGuess')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'resetLabRound')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'forgetMyLabEntry')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(drawerControl, 'requestDrawerClose').mockReset()
  })

  afterEach(() => {
    for (const w of mountedPages.splice(0)) w.unmount()
  })

  it('opens the round at the seed from the URL', async () => {
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledWith('team', 'sample', 42)
    expect(replace).not.toHaveBeenCalled()
  })

  it('replaces a missing seed with the stable initial seed', async () => {
    setQuery({})
    await mountPage()
    expect(replace).toHaveBeenCalledWith({
      query: { seed: String(initialSeed('sample')) },
    })
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('replaces an unusable seed with the stable initial seed', async () => {
    setQuery({ seed: 'not-a-number' })
    await mountPage()
    expect(replace).toHaveBeenCalledWith({
      query: { seed: String(initialSeed('sample')) },
    })
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('renders the stand-in game with its bounds', async () => {
    const w = await mountPage()
    expect(w.get('[data-test="sample-bounds"]').text()).toContain('100')
    expect(w.get('[data-test="sample-bounds"]').text()).toContain('199')
  })

  it('submits a guess from the stand-in game', async () => {
    const w = await mountPage()
    await w.get('[data-test="sample-input"]').setValue('123')
    await w.get('[data-test="sample-submit"]').trigger('submit')
    await flushPromises()
    expect(api.submitLabGuess).toHaveBeenCalledWith('team', 'sample', 42, { value: 123 })
  })

  it('resets the round', async () => {
    await mountPage()
    await tool('lab-reset').trigger('click')
    await flushPromises()
    expect(api.resetLabRound).toHaveBeenCalledWith('team', 'sample', 42)
  })

  it('forgets my own entry', async () => {
    await mountPage()
    await tool('lab-forget-mine').trigger('click')
    await flushPromises()
    expect(api.forgetMyLabEntry).toHaveBeenCalledWith('team', 'sample', 42)
  })

  it('rolls a new seed into the URL', async () => {
    await mountPage()
    await tool('lab-roll').trigger('click')
    const seed = Number((replace.mock.calls[0][0] as { query: { seed: number } }).query.seed)
    expect(Number.isInteger(seed)).toBe(true)
  })

  it('refreshes to pick up another window s guess', async () => {
    await mountPage()
    await tool('lab-refresh').trigger('click')
    await flushPromises()
    expect(api.openLabRound).toHaveBeenCalledTimes(2)
  })

  it('announces a round takeover', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, tookOverRound: true } as never)
    await mountPage()
    expect(document.querySelector('[data-test="lab-takeover"]')).not.toBeNull()
  })

  it('lists the other testers', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { value: 150 },
          outcome: { correct: false, distance: 5, direction: 'LOWER' },
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)
    const w = await mountPage()
    expect(w.get('[data-test="lab-entries"]').text()).toContain('Bender')
  })

  it('keeps every lab control out of the content column', async () => {
    // The reason the controls are teleported at all: a game review judges the look of the page,
    // so the column must hold nothing a real player would not see. Asserting their absence here
    // is what stops someone re-adding one inline later.
    const w = await mountPage()
    for (const id of ['lab-seed', 'lab-roll', 'lab-refresh', 'lab-reset', 'lab-forget-mine']) {
      expect(w.find(`[data-test="${id}"]`).exists()).toBe(false)
      expect(document.querySelector(`[data-test="${id}"]`)).not.toBeNull()
    }
  })

  it('keys the game component by seed, so a new round remounts it instead of patching props', async () => {
    // Without the key, a seed change swaps props on the same instance: the wheel's entrance
    // animation never replays, and the sample game keeps a scratch value from the round before.
    const w = await mountPage()

    expect(w.findComponent(SampleGame).vm.$.vnode.key).toBe(42)
  })

  it('says the lab is unavailable when the backend does not have it', async () => {
    // On production the beans do not exist, so the whole tree answers 404. That is the only
    // signal the SPA gets — the bundle is identical in every environment.
    vi.spyOn(api, 'openLabRound').mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountPage()
    expect(w.get('[data-test="lab-unavailable"]').exists()).toBe(true)
  })

  it('reports an unknown game id without blowing up', async () => {
    currentParams = { slug: 'team', game: 'nosuchgame' }
    const w = await mountPage()
    expect(w.get('[data-test="lab-unknown-game"]').exists()).toBe(true)
  })

  it('hands the viewer their own stored guess to the game component', async () => {
    // The payload carries the round, not the player. Without this the sample's input would be
    // empty in a round the viewer has already spent — and the wheel of a real game would sit on
    // the starting angle instead of the angle that was submitted.
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: {
        userId: 'u1',
        username: 'Fry',
        avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
        guess: { value: 150 },
        outcome: { correct: false, distance: 5, direction: 'LOWER' },
        at: '2026-08-08T12:00:00Z',
      },
    } as never)

    const w = await mountPage()

    expect((w.get('[data-test="sample-input"]').element as HTMLInputElement).value).toBe('150')
  })

  it('prints no arrow for an entry the game did not score', async () => {
    // Guess Hue stores guesses without judging them, so `outcome` is legitimately null and the
    // debug line must not read "→ null".
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { hue: 214.3 },
          outcome: null,
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)

    const w = await mountPage()

    expect(w.get('[data-test="lab-entries"]').text()).toContain('214.3')
    expect(w.get('[data-test="lab-entries"]').text()).not.toContain('→')
  })

  it('renders no entries list at all before the viewer has guessed', async () => {
    // The backend withholds `others` until the viewer has guessed, and `me` is null until then
    // too — so the combined list is legitimately empty, and that must not show as an empty box.
    const w = await mountPage()

    expect(w.find('[data-test="lab-entries"]').exists()).toBe(false)
  })

  it("puts the viewer's own guess into the entries list, first", async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: {
        userId: 'u1',
        username: 'Fry',
        avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
        guess: { value: 150 },
        outcome: null,
        at: '2026-08-08T12:00:00Z',
      },
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { value: 160 },
          outcome: null,
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)

    const w = await mountPage()
    const rows = w.get('[data-test="lab-entries"]').findAll('li')

    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Fry')
    expect(rows[1]!.text()).toContain('Bender')
  })

  it('keys the game component on the round the response carries, not the seed in the URL', async () => {
    // The bug this guards: rolling writes the new seed to the URL first, and the page keys the
    // game component on that URL seed. Vue Router updates `route.query` in place for a query-only
    // change — no remount of the page itself — so the game component would remount right then,
    // still holding the *previous* round's payload, and capture the wrong entrance angle. Keying
    // on `round.seed` instead means the remount cannot happen until the matching payload is here.
    currentParams = { slug: 'team', game: 'guess-hue' }
    const first: LabRoundResponse<GuessHuePayload> = {
      seed: 42,
      game: 'guess-hue',
      displayName: 'Farbausmalung',
      payload: { description: 'Erste Runde.', initHue: 10, saturation: 0.6, lightness: 0.45 },
      me: null,
      others: [],
      tookOverRound: false,
    }
    const second: LabRoundResponse<GuessHuePayload> = {
      ...first,
      seed: 99,
      payload: { description: 'Zweite Runde.', initHue: 250, saturation: 0.6, lightness: 0.45 },
    }
    let resolveSecond: (value: unknown) => void = () => {}
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValueOnce(first as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)) as never)

    const w = await mountPage()
    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('from 10deg')

    // The URL seed changes ahead of the response — the exact race from the bug report.
    setQuery({ seed: '99' })
    await w.vm.$nextTick()
    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('from 10deg')

    resolveSecond(second)
    await flushPromises()

    expect(w.get('[data-test="hue-ring"]').attributes('style')).toContain('from 250deg')
  })

  it('renders a row delete button only for index zero and a reset button when entries exist', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: {
        userId: 'u1',
        username: 'Fry',
        avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
        guess: { value: 150 },
        outcome: null,
        at: '2026-08-08T12:00:00Z',
      },
      others: [
        {
          userId: 'u2',
          username: 'Bender',
          avatar: { shortName: 'BEND', bgColorHex: '#123456' },
          guess: { value: 160 },
          outcome: null,
          at: '2026-08-08T12:00:00Z',
        },
      ],
    } as never)

    const w = await mountPage()
    const rows = w.get('[data-test="lab-entries"]').findAll('li')
    expect(rows[0]!.find('[data-test="lab-entry-forget-mine"]').exists()).toBe(true)
    expect(rows[1]!.find('[data-test="lab-entry-forget-mine"]').exists()).toBe(false)
    expect(w.find('[data-test="lab-entries-reset"]').exists()).toBe(true)
  })

  it('renders decorative keycaps on drawer round action buttons', async () => {
    await mountPage()
    const resetBtn = tool('lab-reset')
    const forgetBtn = tool('lab-forget-mine')

    expect(resetBtn.find('kbd').text()).toBe('X')
    expect(forgetBtn.find('kbd').text()).toBe('Z')
    expect(resetBtn.find('[aria-hidden="true"]').exists()).toBe(true)
    expect(forgetBtn.find('[aria-hidden="true"]').exists()).toBe(true)
  })

  it('requests drawer close on successful drawer actions, but not on failure or list actions', async () => {
    const spy = vi.spyOn(drawerControl, 'requestDrawerClose')
    await mountPage()

    // Successful drawer refresh
    await tool('lab-refresh').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)

    // Successful drawer reset
    await tool('lab-reset').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(2)

    // Successful drawer forgetMine
    await tool('lab-forget-mine').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(3)

    // Failed drawer action does not close drawer
    vi.spyOn(api, 'resetLabRound').mockRejectedValueOnce(new ApiError(500, 'error'))
    await tool('lab-reset').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('executes shortcuts ⌘⇧Z and ⌘⇧X when not in an editable target and not busy', async () => {
    const spy = vi.spyOn(drawerControl, 'requestDrawerClose')
    await mountPage()

    const eventZ = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventZ)
    await flushPromises()
    expect(api.forgetMyLabEntry).toHaveBeenCalledWith('team', 'sample', 42)
    expect(eventZ.defaultPrevented).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)

    const eventX = new KeyboardEvent('keydown', {
      key: 'x',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventX)
    await flushPromises()
    expect(api.resetLabRound).toHaveBeenCalledWith('team', 'sample', 42)
    expect(eventX.defaultPrevented).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('ignores shortcuts in input fields or when busy', async () => {
    let resolveAction: (val: unknown) => void = () => {}
    vi.spyOn(api, 'resetLabRound').mockImplementationOnce(
      () => new Promise((res) => (resolveAction = res)) as never,
    )
    await mountPage()

    const seedInput = document.querySelector('[data-test="lab-seed"]') as HTMLInputElement
    const eventInInput = new KeyboardEvent('keydown', {
      key: 'x',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    seedInput.dispatchEvent(eventInInput)
    await flushPromises()
    expect(eventInInput.defaultPrevented).toBe(false)

    await tool('lab-reset').trigger('click')
    const eventBusy = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventBusy)
    await flushPromises()
    expect(eventBusy.defaultPrevented).toBe(false)

    resolveAction(round)
    await flushPromises()
  })
})
