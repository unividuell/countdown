import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SPOILER_HOLD_MS,
  _resetResultsLandingState,
  afterResultsLand,
  announceResults,
} from '@/ui/resultsLanding'

describe('afterResultsLand', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetResultsLandingState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies when a reveal announces its results', () => {
    const apply = vi.fn()
    afterResultsLand(apply)
    vi.advanceTimersByTime(SPOILER_HOLD_MS - 1)
    expect(apply).not.toHaveBeenCalled()

    announceResults()

    expect(apply).toHaveBeenCalledOnce()
  })

  it('applies at the ceiling when no reveal announces', () => {
    const apply = vi.fn()
    afterResultsLand(apply)
    vi.advanceTimersByTime(SPOILER_HOLD_MS - 1)
    expect(apply).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(apply).toHaveBeenCalledOnce()
  })

  it('applies once, whatever comes after', () => {
    const apply = vi.fn()
    afterResultsLand(apply)

    announceResults()
    announceResults()
    vi.advanceTimersByTime(SPOILER_HOLD_MS)

    expect(apply).toHaveBeenCalledOnce()
  })

  it('applies nothing once cancelled', () => {
    const apply = vi.fn()
    afterResultsLand(apply)()

    announceResults()
    vi.advanceTimersByTime(SPOILER_HOLD_MS)

    expect(apply).not.toHaveBeenCalled()
  })

  it('ignores an announcement from before it waited', () => {
    announceResults()
    const apply = vi.fn()
    afterResultsLand(apply)

    expect(apply).not.toHaveBeenCalled()
  })
})
