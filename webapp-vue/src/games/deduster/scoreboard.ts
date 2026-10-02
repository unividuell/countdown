/**
 * „Auswertung“ for Entstauber: which rows exist, in which order, what each cell says. Pure, like
 * Musterung's — the half a test can assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { asDedusterGuess, asDedusterOutcome, type DedusterEnd } from './types'

export type OutLabel = 'mit Applaus' | 'zu spät' | 'verklickt'

const OUT: Record<DedusterEnd, OutLabel> = {
  COMPLETE: 'mit Applaus',
  TOO_LATE: 'zu spät',
  WRONG_TILE: 'verklickt',
}

export interface DedusterRow extends ScoreboardRow {
  reactionsMs: number[]
  tilesCleared: number
  /** Whole milliseconds, or „—“ for a run without a single hit — as the original showed it. */
  averageLabel: string
  levelLabel: string
  /** `null` for a row without a readable run, a give-up among them. */
  out: OutLabel | null
  endedBy: DedusterEnd | null
  /** As the server kept it: only a usable one survives `judge`. */
  wrongTileIndex: number | null
  /** The wrong tap's time, for the curve; `null` when the run did not end on one or had none. */
  wrongReactionMs: number | null
  implausible: boolean
  restarted: boolean
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  tiles: number
  awardRule: AwardRule | null
  mineUserId: string | null
}): DedusterRow[] {
  const ranked = input.entries.map((entry) => {
    const guess = asDedusterGuess(entry.guess)
    const outcome = asDedusterOutcome(entry.outcome)
    const reactionsMs = guess?.reactionsMs ?? []
    const average = outcome?.averageReactionMs ?? null
    const row: DedusterRow = {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
      tick: 0,
      reactionsMs,
      tilesCleared: reactionsMs.length,
      averageLabel: average === null ? '—' : String(Math.round(average)),
      levelLabel: String(Math.round((reactionsMs.length / input.tiles) * 100)),
      out: outcome === null ? null : OUT[outcome.endedBy],
      endedBy: outcome?.endedBy ?? null,
      wrongTileIndex: outcome?.wrongTileIndex ?? null,
      wrongReactionMs: guess?.wrongReactionMs ?? null,
      implausible: outcome?.implausible ?? false,
      restarted: outcome?.restarted ?? false,
    }
    return { row, average }
  })

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      b.row.tilesCleared - a.row.tilesCleared ||
      averageOrder(a.average, b.average) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  const myRank = ranked.findIndex((item) => item.row.userId === input.mineUserId)
  return ranked.map(({ row }, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

/** Faster first; a row without an average sorts after one with it rather than winning by default. */
function averageOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}
