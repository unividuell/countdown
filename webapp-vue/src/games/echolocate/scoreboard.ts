/**
 * The ranking of „Peilung“: which rows exist, in which order, what each cell says. Pure, like the
 * other games' `scoreboard.ts`.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { asEchoLocateGuess, asEchoLocateOutcome, asPing } from './types'
import type { EchoLocateGuess, EchoLocatePayload, Point } from './types'

export interface ScoreRow extends ScoreboardRow {
  /** The distance in cells, e.g. `2,3` or `Ø 2,3`; `null` for a row without a readable play. */
  distanceLabel: string | null
  /** The player's pins and rings; `null` for a row that gave up or cannot be read. */
  guess: EchoLocateGuess | null
  /** Where the player pinged, in ping order; empty for a row without a readable play. */
  pings: Point[]
  /** `pinOf[i]` is the pin assigned to clip `i`; `null` for a row without a readable play. */
  pinOf: number[] | null
  /** Every ping the player sent, readable or not; `null` for a row without a readable play. */
  pingCount: number | null
  /** Phase two: `0,8 + 9 Pings × 0,1 = 1,7`, the bar's caption; `null` in phase one and without a play. */
  scoreLabel: string | null
  /**
   * Phase two: the bar's two parts as fractions of the round's longest score, e.g. distance 0.4
   * and pings 1.5 of 1.9 → `{ distance: 0.21, pings: 0.79 }`. `null` in phase one and without a play.
   */
  bar: { distance: number; pings: number } | null
}

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** `2.345` → `2,3`; the mean of two clips is marked, `Ø 2,3`. */
export function formatDistance(distance: number, clips: number): string {
  const label = oneDecimal.format(distance)

  return clips > 1 ? `Ø ${label}` : label
}

const costFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

/** `0,1`, `0,05`: a ping's price as the legend and the bar write it. */
export function formatPingCost(cost: number): string {
  return costFormat.format(cost)
}

/** The whole sum, `0,8 + 9 Pings × 0,1 = 1,7`; two clips `Ø 0,8 + 1 Ping × 0,1 = 0,9`. */
function scoreLabelOf(input: {
  distance: number
  clips: number
  pings: number
  cost: number
  score: number
}): string {
  const pings = `${input.pings} ${input.pings === 1 ? 'Ping' : 'Pings'}`

  return `${formatDistance(input.distance, input.clips)} + ${pings} × ${formatPingCost(input.cost)} = ${oneDecimal.format(input.score)}`
}

/** All pings or none: dropping one would shift the others off the rings that belong to them. */
function pingsOf(steps: readonly unknown[] | undefined, grid: number): Point[] {
  const pings: Point[] = []
  for (const step of steps ?? []) {
    const ping = asPing(step, grid)
    if (ping === null) return []

    pings.push(ping)
  }

  return pings
}

/**
 * Every entry of the round as a row, the nearest to the clips first. A row that cannot be shown
 * goes last and ties go by user id, so a reload shows the same picture.
 *
 * Such a row — a give-up, or a guess or outcome that cannot be read — stays, but says nothing
 * about distance and brings no pins, rings or pings: half a play is not drawn.
 */
export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  /** Passed through to `tickOfRow`, which decides when my own row may land. */
  mineUserId: string | null
  /** The round's: it says how many clips, how big the field is, how many pings there are. */
  payload: EchoLocatePayload
}): ScoreRow[] {
  const { payload } = input

  const ranked = input.entries.map((entry) => {
    const outcome = asEchoLocateOutcome(entry.outcome, payload.clips)
    const guess = asEchoLocateGuess(entry.guess, payload)
    const shown = outcome !== null && guess !== null
    const pingCount = shown ? (entry.steps?.length ?? 0) : null
    const score = shown ? outcome.score : null

    return {
      // Phase two ranks by the score, phase one by the distance.
      distance: shown ? (score ?? outcome.distance) : null,
      score,
      outcomeDistance: shown ? outcome.distance : null,
      row: {
        ...rowHead(entry, input.awardRule),
        distanceLabel: shown ? formatDistance(outcome.distance, payload.clips) : null,
        guess: shown ? guess : null,
        pings: shown ? pingsOf(entry.steps, payload.grid) : [],
        pinOf: shown ? outcome.pinOf : null,
        pingCount,
        scoreLabel:
          shown && score !== null && payload.pingCost !== null
            ? scoreLabelOf({
                distance: outcome.distance,
                clips: payload.clips,
                pings: pingCount ?? 0,
                cost: payload.pingCost,
                score,
              })
            : null,
        bar: null as ScoreRow['bar'],
      },
    }
  })

  // Every bar against the longest; a round where everybody scored 0 draws empty bars.
  const longest = Math.max(0, ...ranked.map(({ score }) => score ?? 0))
  for (const { score, outcomeDistance, row } of ranked) {
    if (score === null || outcomeDistance === null) continue

    row.bar =
      longest === 0
        ? { distance: 0, pings: 0 }
        : { distance: outcomeDistance / longest, pings: (score - outcomeDistance) / longest }
  }

  ranked.sort(
    (a, b) =>
      Number(a.distance === null) - Number(b.distance === null) ||
      (a.distance ?? 0) - (b.distance ?? 0) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  return withTicks(
    ranked.map(({ row }) => row),
    input.mineUserId,
  )
}
