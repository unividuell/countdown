import { expect, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { VERDICT_MS } from '@/games/revealChoreography'
import { playVerdict } from '@/ui/verdictSound'

/**
 * The rule every reveal keeps, checked the same way for each: what judges my tip comes with the
 * verdict. Each game's reveal spec runs it on its own fixture — `judgingCoverage.spec.ts` fails a
 * registered game whose spec does not.
 *
 * The caller mocks `@/ui/verdictSound` and fakes `TIMELINE_TIMERS` (plus `setInterval` where the
 * story needs it), matchMedia saying motion is fine.
 */
export interface JudgingCheck {
  /** The reveal, `animate: true`, my row among others. */
  mount: () => VueWrapper
  mineUserId: string
  /** Whether anything that judges my tip is visible — in the game's own terms. */
  judging: (wrapper: VueWrapper) => boolean
  /** `silent` where the reveal sounds none: the board judged, or there is no verdict. */
  verdict: 'sound' | 'silent'
}

const STEP_MS = 50
const UNTIL_MS = 10_000

/** The head's facts — „Lösung“, „Toleranz“ — judge in every game that has them. */
function factsShown(wrapper: VueWrapper): boolean {
  return wrapper.findAll('thead [id$="-fact"]').some((cell) => cell.classes('opacity-100'))
}

function rowShown(wrapper: VueWrapper, userId: string): boolean {
  const cell = wrapper.find(`[data-test="row-${userId}"] th`)
  return cell.exists() && cell.classes('opacity-100')
}

function othersShown(wrapper: VueWrapper, mineUserId: string): boolean {
  return wrapper
    .findAll('tbody tr[data-test^="row-"]')
    .filter((row) => row.attributes('data-test') !== `row-${mineUserId}`)
    .some((row) => row.find('th').classes('opacity-100'))
}

export async function expectJudgesWithVerdict(check: JudgingCheck): Promise<void> {
  vi.mocked(playVerdict).mockClear()
  const wrapper = check.mount()

  let mine: number | null = null
  let judged: number | null = null
  let others: number | null = null
  let sounded: number | null = null

  for (let at = 0; at <= UNTIL_MS; at += STEP_MS) {
    if (at > 0) await vi.advanceTimersByTimeAsync(STEP_MS)

    if (mine === null && rowShown(wrapper, check.mineUserId)) mine = at
    if (judged === null && (check.judging(wrapper) || factsShown(wrapper))) judged = at
    if (others === null && othersShown(wrapper, check.mineUserId)) others = at
    if (sounded === null && vi.mocked(playVerdict).mock.calls.length > 0) sounded = at
  }

  expect(mine, 'my row lands').not.toBeNull()
  expect(judged ?? Infinity, 'nothing judges before my row').toBeGreaterThanOrEqual(mine!)

  if (check.verdict === 'sound') expect(sounded, 'the verdict sounds with my row').toBe(mine)
  else expect(sounded, 'no verdict sounds').toBeNull()

  // One step of slack: the beat may fall anywhere inside a step.
  if (others !== null) expect(others).toBeGreaterThanOrEqual(mine! + VERDICT_MS - STEP_MS)

  wrapper.unmount()
}
