import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import * as api from '@/gamelab/api'
import { labRoundEnd, labRoundNumber } from '@/gamelab/header'
import { initialSeed } from '@/gamelab/seed'
import MemberRow from '@/members/MemberRow.vue'
import { FLARE_MS } from '@/members/streak'
import { VERDICT_MS } from '@/games/revealChoreography'
import { playTriangle } from '@/ui/triangleSound'
import { announceResults } from '@/ui/resultsLanding'
import GameHeader from '@/ui/GameHeader.vue'
import RoundRamp from '@/ui/ramp/RoundRamp.vue'
import { _resetSharedClock } from '@/ui/sharedClock'
import type { RoundAssets } from '@/api/assets'
import type { IdentityView } from '@/api/types'
import type { LabRoundResponse } from '@/gamelab/types'

/**
 * A stub, not a real game: the page test must exercise the page's own wiring — which prop gets
 * which value, which action calls which endpoint — without depending on any particular game's
 * component. Retargeting at `guess-hue` instead of the old stand-in would only trade one
 * dependency for another, breaking this file every time that component's rendering changes.
 *
 * `vi.hoisted` rather than a file-scope constant: `vi.mock` below is hoisted above every import,
 * so a plain `const StubGame = defineComponent(...)` would not be initialised yet when the mock
 * factory runs. Following the same pattern as `src/nav/__tests__/NavDrawer.spec.ts`.
 */
const { StubGame } = await vi.hoisted(async () => {
  const { defineComponent } = await import('vue')
  return {
    StubGame: defineComponent({
      name: 'StubGame',
      props: {
        payload: { type: null, default: null },
        outcome: { type: null, default: null },
        myGuess: { type: null, default: null },
        solution: { type: null, default: null },
        entries: { type: Array, default: () => [] },
        mineUserId: { type: String, default: null },
        disabled: { type: Boolean, default: false },
        awardRule: { type: String, default: null },
        awardPoints: { type: Number, default: null },
        review: { type: Object, default: null },
        assets: { type: Object, default: null },
        // Defaulted the wrong way round on purpose: the lab's honest answer is `false`, so a
        // default of `false` would let the case below pass with the binding missing entirely.
        closed: { type: Boolean, default: true },
        sealed: { type: Boolean, default: false },
        scene: { type: null, default: null },
        steps: { type: null, default: null },
      },
      emits: ['guess', 'reveal', 'skip'],
      template:
        '<button data-test="stub-guess" @click="$emit(\'guess\', { value: 123 })">guess</button>' +
        '<button data-test="stub-skip" @click="$emit(\'skip\', 0, { x: 1, y: 2 })">skip</button>' +
        '<button data-test="stub-reveal" @click="$emit(\'reveal\')">reveal</button>',
    }),
  }
})

vi.mock('@/ui/triangleSound', () => ({ playTriangle: vi.fn() }))

vi.mock('@/gamelab/games', () => ({
  labGameList: [{ id: 'stub', title: 'Stub' }],
  labGames: { stub: StubGame },
}))

const replace = vi.fn()
/**
 * Reactive, and mutated in place rather than reassigned, because one test relies on the same
 * caveat the real bug hinges on: Vue Router's `route.query` updates in place for a query-only
 * navigation (no remount of the page), which is exactly what lets `router.replace({ query })` race
 * ahead of a round response landing. A plain reassigned object here would not track at all.
 */
const currentQuery = reactive<Record<string, unknown>>({ seed: '42' })
let currentParams: Record<string, string> = { slug: 'team', game: 'stub' }

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
    path: '/c/team/lab/stub',
  }),
}))
/** How the viewer appears in this community; null leaves the global profile. */
let viewerIdentity: IdentityView | null = null
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: {
      get value() {
        return { slug: 'team', name: 'Team', viewerIdentity }
      },
    },
    refresh: vi.fn(),
  }),
}))

/**
 * The lab is only reachable already authenticated (the auth guard sees to that), so the real
 * `useAuth` singleton always holds a user here too — this stands in for that, one fixed tester.
 */
const authUser = {
  id: 'auth-me',
  username: 'Auth Me',
  avatar: { shortName: 'AM', bgColorHex: '#123456' },
}
// A ref, not `{ value }`: the template unwraps it into the row's `meId`.
vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref(authUser) }) }
})

const round: LabRoundResponse<{ lowerBound: number; upperBound: number }> = {
  seed: 42,
  game: 'stub',
  displayName: 'Stub',
  phase: 'ONE',
  scene: null,
  payload: { lowerBound: 100, upperBound: 199 },
  solution: null,
  me: null,
  others: [],
  tookOverRound: false,
  awardRule: 'ALL_QUALIFYING',
  awardPoints: 1,
  scoresOnDuration: false,
  myStage: 0,
  // Every existing test in this file plays a game that never asked for a deliberate reveal — the
  // stub stands in for one of those, so it stays mounted from the first response, same as before
  // the reveal gate existed. The gate itself gets its own tests below, with `revealed: false`.
  revealed: true,
  canOverride: true,
  assetKeys: {},
  difficulty: 0.7,
  mySteps: [],
}

/**
 * Tracked and unmounted after every test (see the `afterEach` below). `currentQuery` is a single
 * reactive object shared across the whole file — a page left mounted from an earlier test would
 * keep its `watch(seed, …)` live, and a later test's `setQuery` would fire it too, stealing
 * `vi.spyOn` `mockResolvedValueOnce`/`mockImplementationOnce` slots meant for the current test.
 */
const mountedPages: VueWrapper[] = []

async function mountPage() {
  const Page = (await import('@/pages/c/[slug]/lab/[game]/index.vue')).default
  // Attached, so the document-level shortcuts reach an input inside the page.
  const wrapper = mount(Page, { attachTo: document.body })
  mountedPages.push(wrapper)
  await flushPromises()
  return wrapper
}

/** A lab control, from the section under the game card. */
function tool(testId: string) {
  return mountedPages.at(-1)!.get(`[data-test="lab-controls"] [data-test="${testId}"]`)
}

/** The game asks for the reveal the way a real one does once its cover's hold completes. */
async function revealFromGame(w: VueWrapper): Promise<void> {
  await w.get('[data-test="stub-reveal"]').trigger('click')
  await flushPromises()
}

describe('lab page', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    replace.mockReset()
    setQuery({ seed: '42' })
    currentParams = { slug: 'team', game: 'stub' }
    viewerIdentity = null
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
    vi.spyOn(api, 'revealLabRound')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
    vi.spyOn(api, 'castLabVote')
      .mockReset()
      .mockResolvedValue({ ...round } as never)
  })

  afterEach(() => {
    // Unconditional, so a case that fails between `useFakeTimers` and its last assertion cannot
    // leave the rest of the file on a frozen clock. A no-op when the timers are already real.
    vi.useRealTimers()
    for (const w of mountedPages.splice(0)) w.unmount()
    // The band holds a subscription on the shared clock for as long as it is mounted; the pages are
    // released just above, so this is the point where the interval behind them can be cleared.
    _resetSharedClock()
  })

  it('opens the round at the seed from the URL', async () => {
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
    expect(replace).not.toHaveBeenCalled()
  })

  it('replaces a missing seed with the stable initial seed', async () => {
    setQuery({})
    await mountPage()
    expect(replace).toHaveBeenCalledWith({
      query: { seed: String(initialSeed('stub')) },
    })
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('replaces an unusable seed with the stable initial seed', async () => {
    setQuery({ seed: 'not-a-number' })
    await mountPage()
    expect(replace).toHaveBeenCalledWith({
      query: { seed: String(initialSeed('stub')) },
    })
    expect(api.openLabRound).not.toHaveBeenCalled()
  })

  it('passes the round payload to the game component', async () => {
    const w = await mountPage()
    expect(w.findComponent(StubGame).props('payload')).toEqual(round.payload)
  })

  it("hands the lab round's award rule to the game", async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      awardRule: 'CLOSEST_ONLY',
    } as never)

    const w = await mountPage()

    expect(w.findComponent(StubGame).props('awardRule')).toBe('CLOSEST_ONLY')
  })

  it('hands the lab game what the round is worth', async () => {
    const w = await mountPage()

    expect(w.getComponent(StubGame).props('awardPoints')).toBe(round.awardPoints)
  })

  // The product's row, fed by the lab: the tester is seated before guessing, without a chip.
  it('seats the tester in the member row before their first guess', async () => {
    const w = await mountPage()

    const members = w.getComponent(MemberRow).props('members')
    expect(members.map((m) => [m.userId, m.points])).toEqual([['auth-me', { stable: 0 }]])
  })

  // Same hold as the community page's `refreshAfterGuess`: the row moves with the verdict.
  it('holds the member row back after a guess, until the reveal’s results land', async () => {
    const w = await mountPage()
    const me = { userId: 'auth-me', username: 'Auth Me', avatar: authUser.avatar, points: 1 }
    vi.mocked(api.submitLabGuess).mockResolvedValueOnce({ ...round, me } as never)

    vi.useFakeTimers()
    await w.get('[data-test="stub-guess"]').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(w.getComponent(MemberRow).props('members')[0]!.points.live).toBeUndefined()

    announceResults()
    await vi.advanceTimersByTimeAsync(0)
    expect(w.getComponent(MemberRow).props('members')[0]!.points.live).toEqual({
      points: 1,
      provisional: false,
    })
  })

  // A roll is a new round, not a rise: seed 42 seats the tester at 25, seed 47 at 49.
  it('flares the tester s streak for a guess, not for a roll', async () => {
    const w = await mountPage()
    const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    const animate = vi.fn(() => ({ finished: Promise.resolve() }))
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      configurable: true,
      writable: true,
    })
    // Other parts of the page animate too; only the badge's own flare counts.
    const flares = () =>
      animate.mock.contexts.filter((el) => (el as Element).matches('[data-test="streak-mark"]'))
        .length
    vi.mocked(playTriangle).mockClear()
    vi.useFakeTimers()
    try {
      vi.mocked(api.openLabRound).mockResolvedValueOnce({ ...round, seed: 47 } as never)
      setQuery({ seed: '47' })
      await vi.advanceTimersByTimeAsync(VERDICT_MS + FLARE_MS)

      expect(w.getComponent(MemberRow).props('members')[0]!.streak).toBe(49)
      expect(playTriangle).not.toHaveBeenCalled()
      expect(flares()).toBe(0)

      const me = { userId: 'auth-me', username: 'Auth Me', avatar: authUser.avatar, points: 1 }
      vi.mocked(api.submitLabGuess).mockResolvedValueOnce({ ...round, seed: 47, me } as never)
      await w.get('[data-test="stub-guess"]').trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      announceResults()
      await vi.advanceTimersByTimeAsync(VERDICT_MS)

      expect(playTriangle).toHaveBeenCalledTimes(1)
      expect(flares()).toBe(1)

      // A reset keeps the seed, so the row stays: the streak drops silently, the next guess flares.
      const row = w.getComponent(MemberRow).vm.$.uid
      vi.mocked(api.resetLabRound).mockResolvedValueOnce({ ...round, seed: 47 } as never)
      await tool('lab-reset').trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(w.getComponent(MemberRow).vm.$.uid).toBe(row)
    } finally {
      if (saved) Object.defineProperty(Element.prototype, 'animate', saved)
      else Reflect.deleteProperty(Element.prototype, 'animate')
    }
  })

  // A failed guess brings no round, so nothing may be left waiting for one.
  it('shows the next round at once after a failed guess', async () => {
    const w = await mountPage()
    const me = { userId: 'auth-me', username: 'Auth Me', avatar: authUser.avatar, points: 1 }
    vi.mocked(api.submitLabGuess).mockRejectedValueOnce(new ApiError(409, 'conflict'))
    vi.mocked(api.resetLabRound).mockResolvedValueOnce({ ...round, me } as never)

    vi.useFakeTimers()
    await w.get('[data-test="stub-guess"]').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    await tool('lab-reset').trigger('click')
    await vi.advanceTimersByTimeAsync(0)

    expect(w.getComponent(MemberRow).props('members')[0]!.points.live?.points).toBe(1)
  })

  it('submits a guess from the game', async () => {
    const w = await mountPage()
    await w.get('[data-test="stub-guess"]').trigger('click')
    await flushPromises()
    expect(api.submitLabGuess).toHaveBeenCalledWith('team', 'stub', 42, 'ONE', { value: 123 })
  })

  // `StepView[]` fits `unknown[]`, so the compiler cannot tell the answers from the inputs the
  // placeholder row must carry — and `<component :is>` checks no prop at all.
  it('hands the game mySteps and passes a skip input to the lab', async () => {
    const mySteps = [{ input: { x: 3, y: 4 }, answer: [{ delayMs: 400 }] }]
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, mySteps } as never)
    vi.spyOn(api, 'skipLabStage')
      .mockReset()
      .mockResolvedValue({ ...round } as never)

    const w = await mountPage()
    const stub = w.getComponent(StubGame)

    expect(stub.props('steps')).toEqual(mySteps)
    expect((stub.props('entries') as { steps: unknown[] }[])[0]?.steps).toEqual([{ x: 3, y: 4 }])

    await w.get('[data-test="stub-skip"]').trigger('click')
    await flushPromises()

    expect(api.skipLabStage).toHaveBeenCalledWith('team', 'stub', 42, 'ONE', 0, { x: 1, y: 2 })
  })

  it('reads a round without mySteps, as a server from before them sends it, as none', async () => {
    const older: Partial<LabRoundResponse> = { ...round }
    delete older.mySteps
    vi.spyOn(api, 'openLabRound').mockResolvedValue(older as never)

    const stub = (await mountPage()).getComponent(StubGame)

    expect(stub.props('steps')).toEqual([])
    expect((stub.props('entries') as { steps: unknown[] }[])[0]?.steps).toEqual([])
  })

  it("shows the loaded round's difficulty", async () => {
    await mountPage()

    expect(tool('lab-difficulty').text()).toBe('Schwierigkeit 0,7')
  })

  it('resets the round', async () => {
    await mountPage()
    await tool('lab-reset').trigger('click')
    await flushPromises()
    expect(api.resetLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
  })

  it('forgets my own entry', async () => {
    await mountPage()
    await tool('lab-forget-mine').trigger('click')
    await flushPromises()
    expect(api.forgetMyLabEntry).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
  })

  it('rolls a new seed into the URL', async () => {
    await mountPage()
    await tool('lab-roll').trigger('click')
    const seed = Number((replace.mock.calls[0]![0] as { query: { seed: number } }).query.seed)
    expect(Number.isInteger(seed)).toBe(true)
  })

  it('rolls a new seed into the URL on R', async () => {
    await mountPage()
    const event = new KeyboardEvent('keydown', {
      key: 'r',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
    const seed = Number((replace.mock.calls[0]![0] as { query: { seed: number } }).query.seed)
    expect(Number.isInteger(seed)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it('refreshes to pick up another window s guess', async () => {
    await mountPage()
    await tool('lab-refresh').trigger('click')
    await flushPromises()
    expect(api.openLabRound).toHaveBeenCalledTimes(2)
  })

  it('writes the phase to the url and reopens the round', async () => {
    await mountPage()

    await tool('lab-phase-TWO').trigger('click')

    expect(replace).toHaveBeenCalledWith({ query: { seed: '42', phase: 'TWO' } })
  })

  it('opens the round at the phase from the URL, defaulting to ONE', async () => {
    setQuery({ seed: '42', phase: 'TWO' })
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'TWO')
  })

  it('reads any phase value other than TWO as ONE', async () => {
    setQuery({ seed: '42', phase: 'junk' })
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
  })

  it('carries the phase into the switch-player return path, so a phase-two round survives it', async () => {
    // LabControls builds the "Spieler wechseln" link's href from this path, and LabRoundStore evicts
    // on seed OR phase mismatch — a return path that drops phase reopens phase one on the same key
    // and destroys the phase-two round the other tester is still looking at.
    setQuery({ seed: '42', phase: 'TWO' })
    await mountPage()

    const href = tool('lab-switch-player').attributes('href')
    const redirect = new URL(href!, 'https://example.test').searchParams.get('redirect')

    expect(redirect).toBe('/c/team/lab/stub?seed=42&phase=TWO')
  })

  it('carries the ramp into the switch-player return path', async () => {
    setQuery({ seed: '42', phase: 'ONE', ramp: '1' })
    await mountPage()

    const href = tool('lab-switch-player').attributes('href')
    const redirect = new URL(href!, 'https://example.test').searchParams.get('redirect')

    expect(redirect).toBe('/c/team/lab/stub?seed=42&phase=ONE&ramp=1')
  })

  it('switches player on W, back to the same seed and phase', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    setQuery({ seed: '42', phase: 'TWO' })
    await mountPage()

    const event = new KeyboardEvent('keydown', {
      key: 'w',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(assign).toHaveBeenCalledWith(tool('lab-switch-player').attributes('href'))
    expect(event.defaultPrevented).toBe(true)
    vi.unstubAllGlobals()
  })

  it('reopens the round when only the phase changes', async () => {
    // The two mocked round shapes differ so the assertion cannot pass on the first response alone.
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValueOnce({ ...round, phase: 'ONE' } as never)
      .mockResolvedValueOnce({ ...round, phase: 'TWO' } as never)
    await mountPage()
    expect(api.openLabRound).toHaveBeenCalledTimes(1)

    setQuery({ seed: '42', phase: 'TWO' })
    await flushPromises()

    expect(api.openLabRound).toHaveBeenCalledTimes(2)
    expect(api.openLabRound).toHaveBeenLastCalledWith('team', 'stub', 42, 'TWO')
  })

  it('keeps the rule line describing the round on screen while a phase switch is in flight', async () => {
    // The two responses carry different award pairings (phase one: ALL_QUALIFYING/1, phase two:
    // CLOSEST_ONLY/2) and the second is held open by hand — a test that reused one pairing for
    // both, or let both resolve immediately, could not tell a correct implementation (rule line
    // sourced from the response) from a broken one (rule line sourced from the URL's `phase`,
    // which updates synchronously and would already say "Phase 2" here).
    let resolveSecond: (value: unknown) => void = () => {}
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValueOnce({
        ...round,
        phase: 'ONE',
        awardRule: 'ALL_QUALIFYING',
        awardPoints: 1,
      } as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)) as never)

    const w = await mountPage()
    expect(tool('lab-award-rule').text()).toBe('Phase 1 · jeder Treffer 1 Punkt')

    setQuery({ seed: '42', phase: 'TWO' })
    await w.vm.$nextTick()

    // The button already follows the URL; the rule line does not yet — the phase-one round is
    // still what is actually on screen.
    expect(tool('lab-phase-TWO').attributes('aria-pressed')).toBe('true')
    expect(tool('lab-award-rule').text()).toBe('Phase 1 · jeder Treffer 1 Punkt')

    resolveSecond({ ...round, phase: 'TWO', awardRule: 'CLOSEST_ONLY', awardPoints: 2 })
    await flushPromises()

    expect(tool('lab-award-rule').text()).toBe('Phase 2 · nur der Beste, 2 Punkte')
  })

  it('announces a round takeover', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, tookOverRound: true } as never)
    await mountPage()
    expect(document.querySelector('[data-test="lab-takeover"]')).not.toBeNull()
  })

  it('puts the lab controls under the game card', async () => {
    const w = await mountPage()
    const card = w.findComponent(RoundRamp).element
    const controls = w.get('[data-test="lab-controls"]').element

    expect(card.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keys the game component by seed, so a new round remounts it instead of patching props', async () => {
    // Without the key, a seed change swaps props on the same instance instead of remounting it: a
    // game that keeps any per-round local state would carry it across a round it should not see.
    const w = await mountPage()

    expect(w.findComponent(StubGame).vm.$.vnode.key).toBe('42-0')
  })

  it('says the lab is unavailable when the backend does not have it', async () => {
    // On production the beans do not exist, so the whole tree answers 404. That is the only
    // signal the SPA gets — the bundle is identical in every environment.
    vi.spyOn(api, 'openLabRound').mockRejectedValue(new ApiError(404, 'not found'))
    const w = await mountPage()
    expect(w.find('[data-test="lab-unavailable"]').exists()).toBe(true)
  })

  it('reports an unknown game id without blowing up', async () => {
    currentParams = { slug: 'team', game: 'nosuchgame' }
    const w = await mountPage()
    expect(w.find('[data-test="lab-unknown-game"]').exists()).toBe(true)
  })

  it('hands the viewer their own stored guess to the game component', async () => {
    // The payload carries the round, not the player: whatever the tester submitted must come
    // back as `myGuess`, or a reload of an already-spent round would start the game from scratch.
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: {
        userId: 'u1',
        username: 'Fry',
        avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
        guess: { value: 150 },
        outcome: { correct: false, distance: 5, direction: 'LOWER' },
        at: '2026-08-08T12:00:00Z',
        points: 0,
      },
    } as never)

    const w = await mountPage()

    expect(w.findComponent(StubGame).props('myGuess')).toEqual({ value: 150 })
  })

  it("gives the game component the viewer's own row before any guess exists, in their own colour", async () => {
    // Nothing was actually stored yet — this is about what the *game* sees, which is what a real
    // reveal would have produced: the viewer, revealed and not yet guessed.
    const w = await mountPage()
    const stub = w.findComponent(StubGame)

    expect(stub.props('mineUserId')).toBe('auth-me')
    expect(stub.props('entries')).toEqual([
      {
        userId: 'auth-me',
        username: 'Auth Me',
        stage: 0,
        guess: null,
        outcome: null,
        points: null,
        durationMs: null,
        avatar: { shortName: 'AM', bgColorHex: '#123456' },
        votes: [],
        struck: false,
        adminOverride: null,
        steps: [],
      },
    ])
  })

  // The server draws every entry in the community's identity; the viewer's own seat before a guess
  // has to match it, or the avatar changes colour the moment the guess lands.
  it('seats the viewer before any guess the way this community draws them', async () => {
    const here = { shortName: 'HERE', bgColorHex: '#9daec7' }
    viewerIdentity = { username: 'Here Me', avatar: here }
    const w = await mountPage()

    expect(w.findComponent(StubGame).props('entries')).toMatchObject([
      { username: 'Here Me', avatar: here },
    ])
    const seat = w.getComponent(MemberRow).props('members')[0]!
    expect(seat).toMatchObject({
      fullName: 'Here Me',
      shortName: 'HERE',
      bgColorHex: '#9daec7',
    })
  })

  it('keys the game component on the round the response carries, not the seed in the URL', async () => {
    // The bug this guards: rolling writes the new seed to the URL first, and the page keys the
    // game component on that URL seed. Vue Router updates `route.query` in place for a query-only
    // change — no remount of the page itself — so the game component would remount right then,
    // still holding the *previous* round's payload and capture the wrong entrance state. Keying
    // on `round.seed` instead means the remount cannot happen until the matching payload is here.
    const first = { ...round, seed: 42, payload: { lowerBound: 1, upperBound: 2 } }
    const second = { ...round, seed: 99, payload: { lowerBound: 3, upperBound: 4 } }
    let resolveSecond: (value: unknown) => void = () => {}
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValueOnce(first as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)) as never)

    const w = await mountPage()
    expect(w.findComponent(StubGame).props('payload')).toEqual(first.payload)
    expect(w.findComponent(StubGame).vm.$.vnode.key).toBe('42-0')

    // The URL seed changes ahead of the response — the exact race from the bug report. Asserting the
    // vnode key (not just props) is what makes this discriminate the bug: keying on the URL's seed
    // would remount right here, but the remounted instance would still receive `first.payload` since
    // `round.value` has not changed yet — the props assertion alone cannot tell the two apart.
    setQuery({ seed: '99' })
    await w.vm.$nextTick()
    expect(w.findComponent(StubGame).props('payload')).toEqual(first.payload)
    expect(w.findComponent(StubGame).vm.$.vnode.key).toBe('42-0')

    resolveSecond(second)
    await flushPromises()
    expect(w.findComponent(StubGame).vm.$.vnode.key).toBe('99-0')

    expect(w.findComponent(StubGame).props('payload')).toEqual(second.payload)
  })

  const mine = {
    userId: 'u1',
    username: 'Fry',
    avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
    guess: { value: 150 },
    outcome: null,
    at: '2026-08-08T12:00:00Z',
    points: 0,
  }
  const theirs = {
    userId: 'u2',
    username: 'Bender',
    avatar: { shortName: 'BEND', bgColorHex: '#123456' },
    guess: { value: 160 },
    outcome: null,
    at: '2026-08-08T12:00:00Z',
    points: 0,
  }

  it('shows no raw guess list, not even once others have guessed', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      me: mine,
      others: [theirs],
    } as never)

    const w = await mountPage()

    expect(w.text()).not.toContain('"value"')
    expect(w.find('[data-test="lab-entries"]').exists()).toBe(false)
  })

  it('renders decorative keycaps on the round action buttons', async () => {
    await mountPage()
    const resetBtn = tool('lab-reset')
    const forgetBtn = tool('lab-forget-mine')

    expect(tool('lab-roll').find('kbd').text()).toBe('R')
    expect(tool('lab-switch-player').find('kbd').text()).toBe('W')
    expect(resetBtn.find('kbd').text()).toBe('X')
    expect(forgetBtn.find('kbd').text()).toBe('Z')
    expect(resetBtn.find('[aria-hidden="true"]').exists()).toBe(true)
    expect(forgetBtn.find('[aria-hidden="true"]').exists()).toBe(true)
  })

  it('executes shortcuts Z and X when not in an editable target and not busy', async () => {
    await mountPage()

    const eventZ = new KeyboardEvent('keydown', {
      key: 'z',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventZ)
    await flushPromises()
    expect(api.forgetMyLabEntry).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
    expect(eventZ.defaultPrevented).toBe(true)

    const eventX = new KeyboardEvent('keydown', {
      key: 'x',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventX)
    await flushPromises()
    expect(api.resetLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
    expect(eventX.defaultPrevented).toBe(true)
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
      bubbles: true,
      cancelable: true,
    })
    seedInput.dispatchEvent(eventInInput)
    await flushPromises()
    expect(eventInInput.defaultPrevented).toBe(false)

    await tool('lab-reset').trigger('click')
    const eventBusy = new KeyboardEvent('keydown', {
      key: 'z',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(eventBusy)
    await flushPromises()
    expect(eventBusy.defaultPrevented).toBe(false)

    resolveAction(round)
    await flushPromises()
  })

  it('hands the game every prop the component contract promises', async () => {
    // The page is the only place that knows all three: what the server revealed, who is in the
    // round, and which of them is the viewer — this pins the whole assembly in one place, on the
    // props actually received rather than on any one game's rendering of them.
    const mineEntry = {
      userId: 'u1',
      username: 'Fry',
      avatar: { shortName: 'FRY', bgColorHex: '#abcdef' },
      guess: { value: 150 },
      outcome: null,
      at: '2026-08-09T12:00:00Z',
      points: 0,
    }
    const theirEntry = { ...mineEntry, userId: 'u2', username: 'Bender', guess: { value: 40 } }
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      solution: { some: 'solution' },
      me: mineEntry,
      others: [theirEntry],
    } as never)

    const w = await mountPage()
    const stub = w.findComponent(StubGame)

    expect(stub.props('payload')).toEqual(round.payload)
    expect(stub.props('outcome')).toBeNull()
    expect(stub.props('myGuess')).toEqual({ value: 150 })
    expect(stub.props('solution')).toEqual({ some: 'solution' })
    expect(stub.props('mineUserId')).toBe('u1')
    expect(stub.props('entries')).toEqual([mineEntry, theirEntry])
    expect(stub.props('disabled')).toBe(true)
  })

  // `<component :is>` on a `Component`-typed value is not prop-checked by vue-tsc (see the
  // task-15 report) — a test is the only thing that would catch this binding going missing.
  it('hands the game a review that everybody in the lab may override', async () => {
    const w = await mountPage()
    const review = w.findComponent(StubGame).props('review') as {
      canOverride: boolean
      vote: (userId: string, value: unknown) => Promise<void>
    }

    expect(review.canOverride).toBe(true)

    await review.vote('u9', 'FLAG')

    expect(api.castLabVote).toHaveBeenCalledWith('team', 'stub', 42, 'ONE', 'u9', 'FLAG')
  })

  // Same trap: `<component :is>` does not check props, so an `assets` the lab forgot would only show
  // up as a game that cannot find its photo or its clips.
  it("hands the game the lab round's assets, addressed by seed and phase", async () => {
    const key = { key: 'a2V5', mediaType: 'audio/mpeg' }
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      assetKeys: { 'clip-0': key },
    } as never)

    const w = await mountPage()
    const assets = w.findComponent(StubGame).props('assets') as RoundAssets

    expect(assets.url('photo')).toBe('/api/lab/team/stub/assets/photo?seed=42&phase=ONE')
    expect(assets.key('clip-0')).toEqual(key)
    expect(assets.key('clip-1')).toBeNull()
  })

  // The URL's phase runs ahead of the round: assets named after it would reach the game one render
  // before the round's steps, and Peilung would load the new phase's draft against the old pings.
  it('addresses the assets by the phase of the loaded round, not the URL', async () => {
    let resolveSecond: (value: unknown) => void = () => {}
    vi.spyOn(api, 'openLabRound')
      .mockReset()
      .mockResolvedValueOnce({ ...round, phase: 'ONE' } as never)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)) as never)
    const w = await mountPage()
    const assetUrl = () => (w.findComponent(StubGame).props('assets') as RoundAssets).url('clip-0')

    setQuery({ seed: '42', phase: 'TWO' })
    await w.vm.$nextTick()
    expect(assetUrl()).toBe('/api/lab/team/stub/assets/clip-0?seed=42&phase=ONE')

    resolveSecond({ ...round, phase: 'TWO' })
    await flushPromises()
    expect(assetUrl()).toBe('/api/lab/team/stub/assets/clip-0?seed=42&phase=TWO')
  })

  // Same call site, same trap: a prop the product passes and the lab omits is how `tipPath` broke.
  // A lab round is never over — it is rolled again, not closed — so the honest answer is `false`.
  it('tells the game the round is not closed, the way a real card does', async () => {
    const w = await mountPage()

    expect(w.findComponent(StubGame).props('closed')).toBe(false)
  })

  // The lab exists so that a game under review looks exactly as it will in a real round. If the
  // page forgot the surface, it would look right in the game and wrong here — which is the one
  // failure mode this page must not have.
  it('mounts the game on the same surface a real round uses', async () => {
    const w = await mountPage()

    expect(
      w.get('[data-test="stub-guess"]').element.closest('[data-test="round-surface"]'),
    ).not.toBeNull()
  })

  // Same reasoning as the surface above, and the band is the more visible half of it: a reviewer
  // judges the look of the whole card, so the lab wears the product's header rather than a heading
  // of its own.
  it('wears the same header band a real round does', async () => {
    const w = await mountPage()
    const band = w.get('[data-test="game-header"]').element

    expect(band.closest('[data-test="round-surface"]')).not.toBeNull()
    expect(band.closest('[data-test="round-surface-body"]')).toBeNull()
  })

  it('names the game in the band and nowhere else', async () => {
    const w = await mountPage()

    expect(w.getComponent(GameHeader).props('title')).toBe('Stub')
    expect(w.find('h1:not([data-test="game-header-title"])').exists()).toBe(false)
  })

  it('takes the round number from the seed, so a reload replays the same round', async () => {
    const w = await mountPage()

    expect(w.getComponent(GameHeader).props('roundNumber')).toBe(labRoundNumber(42))
  })

  // Stamped once when the round opens, not recomputed per render: an end that moved with the clock
  // would leave the readout frozen at the same reading forever, which is the one thing the band is
  // there to disprove.
  it('stamps the round end when the round opens, so the readout actually counts down', async () => {
    const now = Date.parse('2026-08-23T12:00:00Z')
    vi.useFakeTimers({ now })
    try {
      const w = await mountPage()
      expect(w.getComponent(GameHeader).props('endsAt')).toBe(labRoundEnd(42, now))

      vi.advanceTimersByTime(5000)
      await flushPromises()

      expect(w.getComponent(GameHeader).props('endsAt')).toBe(labRoundEnd(42, now))
    } finally {
      vi.useRealTimers()
    }
  })

  // --- Task 20: the reveal gate, mirroring the real round's `sealed` face -----------------------

  it('mounts the game sealed while the round is not yet revealed', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
      scene: { cols: 8 },
    } as never)

    const w = await mountPage()
    const stub = w.getComponent(StubGame)

    expect(stub.props('sealed')).toBe(true)
    expect(stub.props('payload')).toBeNull()
    expect(stub.props('scene')).toEqual({ cols: 8 })
  })

  it('never seals a game that has not asked for a deliberate reveal', async () => {
    const w = await mountPage()

    expect(w.getComponent(StubGame).props('sealed')).toBe(false)
    expect(api.revealLabRound).not.toHaveBeenCalled()
  })

  it('reveals the round when the game asks, and unseals it', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)

    const w = await mountPage()
    await revealFromGame(w)

    expect(api.revealLabRound).toHaveBeenCalledWith('team', 'stub', 42, 'ONE')
    expect(w.getComponent(StubGame).props('sealed')).toBe(false)
  })

  it('puts the tester back in front of the gate after a reset, without a dead end', async () => {
    // A reset does not re-stamp the clock (see LabRoundStore.resetRound) — it genuinely clears the
    // stamp, so the response comes back unrevealed. The tester must be able to reveal again, not
    // only by reloading the page.
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)
    vi.spyOn(api, 'resetLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)

    const w = await mountPage()
    await revealFromGame(w)
    expect(w.getComponent(StubGame).props('sealed')).toBe(false)

    await tool('lab-reset').trigger('click')
    await flushPromises()

    const stub = w.getComponent(StubGame)
    expect(stub.props('sealed')).toBe(true)
    expect(stub.props('disabled')).toBe(false)

    await revealFromGame(w)
    expect(api.revealLabRound).toHaveBeenCalledTimes(2)
    expect(w.getComponent(StubGame).props('sealed')).toBe(false)
  })

  it('remounts the game when a reset reseals an already-revealed round', async () => {
    // A remount is what used to unseal a half-made selection or an open panorama for free, back
    // when the reveal screen unmounted the game entirely — see the `resealCount` key in the page.
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)
    vi.spyOn(api, 'resetLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)

    const w = await mountPage()
    await revealFromGame(w)
    const beforeReset = w.getComponent(StubGame).vm

    await tool('lab-reset').trigger('click')
    await flushPromises()

    expect(w.getComponent(StubGame).vm).not.toBe(beforeReset)
  })

  it('runs the tester clock from the reveal on', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      scoresOnDuration: true,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({
      ...round,
      scoresOnDuration: true,
      revealed: true,
    } as never)

    const w = await mountPage()
    expect(w.getComponent(GameHeader).props('play')).toBeNull()

    await revealFromGame(w)

    expect(w.getComponent(GameHeader).props('play')).toMatchObject({ phase: 'running' })
  })

  // Reset, „Meinen Guess löschen“ and a new seed all come back `revealed: false` for a gated game
  // — the server clears its own `openedAt` on every one of them — so one check retires the stamp
  // on all of them.
  it('retires the tester clock when the round is opened again', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      scoresOnDuration: true,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({
      ...round,
      scoresOnDuration: true,
      revealed: true,
    } as never)
    vi.spyOn(api, 'resetLabRound').mockResolvedValue({
      ...round,
      scoresOnDuration: true,
      revealed: false,
      payload: null,
    } as never)

    const w = await mountPage()
    await revealFromGame(w)
    expect(w.getComponent(GameHeader).props('play')).toMatchObject({ phase: 'running' })

    await tool('lab-reset').trigger('click')
    await flushPromises()

    expect(w.getComponent(GameHeader).props('play')).toBeNull()
  })

  describe('ramp switch', () => {
    const unplayed = { ...round, revealed: false, payload: null }
    const played = {
      userId: 'auth-me',
      username: 'Auth Me',
      avatar: { shortName: 'AM', bgColorHex: '#123456' },
      guess: { value: 150 },
      outcome: null,
      at: '2026-08-08T12:00:00Z',
      points: 0,
    }

    it('stands no ramp without ?ramp=1', async () => {
      vi.spyOn(api, 'openLabRound').mockResolvedValue(unplayed as never)

      const w = await mountPage()

      expect(w.getComponent(RoundRamp).props('scene')).toBeNull()
      expect(w.find('[data-test="ramp"]').exists()).toBe(false)
    })

    it('stands the ramp in front of an unplayed round with ?ramp=1', async () => {
      setQuery({ seed: '42', ramp: '1' })
      vi.spyOn(api, 'openLabRound').mockResolvedValue(unplayed as never)

      const w = await mountPage()

      expect(w.getComponent(RoundRamp).props('scene')).toEqual({
        game: 'Stub',
        roundNumber: labRoundNumber(42),
        phaseTwo: false,
        points: null,
      })
      expect(w.find('[data-test="ramp"]').exists()).toBe(true)
    })

    it('names the points on a phase-two round', async () => {
      setQuery({ seed: '42', ramp: '1', phase: 'TWO' })
      vi.spyOn(api, 'openLabRound').mockResolvedValue({
        ...unplayed,
        phase: 'TWO',
        awardRule: 'CLOSEST_ONLY',
        awardPoints: 12,
      } as never)

      const w = await mountPage()

      expect(w.getComponent(RoundRamp).props('scene')).toMatchObject({
        phaseTwo: true,
        points: 12,
      })
    })

    it('stands no ramp in front of a round the tester already played', async () => {
      setQuery({ seed: '42', ramp: '1' })
      vi.spyOn(api, 'openLabRound').mockResolvedValue({
        ...round,
        me: played,
      } as never)

      const w = await mountPage()

      expect(w.getComponent(RoundRamp).props('scene')).toBeNull()
      expect(w.find('[data-test="ramp"]').exists()).toBe(false)
    })

    it('stands the ramp again once a reset clears the tester s entry', async () => {
      setQuery({ seed: '42', ramp: '1' })
      vi.spyOn(api, 'openLabRound').mockResolvedValue({
        ...round,
        me: played,
      } as never)
      vi.spyOn(api, 'resetLabRound').mockResolvedValue(unplayed as never)

      const w = await mountPage()
      expect(w.find('[data-test="ramp"]').exists()).toBe(false)

      await tool('lab-reset').trigger('click')
      await flushPromises()

      expect(w.getComponent(RoundRamp).props('scene')).not.toBeNull()
      expect(w.find('[data-test="ramp"]').exists()).toBe(true)
    })

    it('keeps the game mounted through a reset while the switch is off', async () => {
      vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...round, me: played } as never)
      vi.spyOn(api, 'resetLabRound').mockResolvedValue(unplayed as never)

      const w = await mountPage()
      const before = w.getComponent(StubGame).element

      await tool('lab-reset').trigger('click')
      await flushPromises()

      expect(w.getComponent(StubGame).element).toBe(before)
    })

    it('stands the ramp again after a tap took it away and a reset resealed the round', async () => {
      setQuery({ seed: '42', ramp: '1' })
      vi.spyOn(api, 'openLabRound').mockResolvedValue(unplayed as never)
      vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)
      vi.spyOn(api, 'resetLabRound').mockResolvedValue(unplayed as never)

      const w = await mountPage()
      await revealFromGame(w)
      await tool('lab-reset').trigger('click')
      await flushPromises()

      expect(w.find('[data-test="ramp"]').exists()).toBe(true)
    })

    it('stands the ramp again after a roll, and after the switch', async () => {
      vi.spyOn(api, 'openLabRound').mockResolvedValue(unplayed as never)
      setQuery({ seed: '42', ramp: '1' })

      const w = await mountPage()
      const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
      Object.defineProperty(Element.prototype, 'animate', {
        value: undefined,
        configurable: true,
        writable: true,
      })
      try {
        await w.get('[data-test="ramp-poster"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-test="ramp"]').exists()).toBe(false)

        setQuery({ seed: '43', ramp: '1' })
        vi.spyOn(api, 'openLabRound').mockResolvedValue({ ...unplayed, seed: 43 } as never)
        await flushPromises()
        expect(w.find('[data-test="ramp"]').exists()).toBe(true)

        // Off and on again: the switch alone stands the ramp again on an unplayed round.
        await w.get('[data-test="ramp-poster"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-test="ramp"]').exists()).toBe(false)

        setQuery({ seed: '43' })
        await flushPromises()
        setQuery({ seed: '43', ramp: '1' })
        await flushPromises()
        expect(w.find('[data-test="ramp"]').exists()).toBe(true)
      } finally {
        if (saved) Object.defineProperty(Element.prototype, 'animate', saved)
        else delete (Element.prototype as { animate?: unknown }).animate
      }
    })

    it('writes ramp=1 into the route, and removes it again', async () => {
      await mountPage()

      await tool('lab-ramp').setValue(true)
      expect(replace).toHaveBeenLastCalledWith({ query: { seed: '42', ramp: '1' } })

      setQuery({ seed: '42', ramp: '1' })
      await flushPromises()
      await tool('lab-ramp').setValue(false)
      expect(replace).toHaveBeenLastCalledWith({ query: { seed: '42' } })
    })
  })
})
