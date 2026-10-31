import type { RoundAssets } from '@/api/assets'
import type { AwardRule, StepView } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import type { RoundReview } from '@/rounds/review'

/**
 * What a host — the round card, the lab — hands every game: `defineProps<GameProps>()`.
 *
 * One declaration rather than one per game, because `<component :is>` checks none of it: a prop a
 * game leaves out falls through to its root as an attribute (`review="[object Object]"`). A game
 * reads what it needs and declares the rest anyway.
 */
export interface GameProps {
  /** The game's own shape, `unknown` by contract — each game narrows it. `null` while sealed. */
  payload: unknown
  /** What the game said about the viewer's guess. */
  outcome: unknown
  /** The viewer's own stored guess, in whatever shape the game recorded it. */
  myGuess: unknown
  /** What the server revealed once the viewer had spent their guess, or `null`. */
  solution: unknown
  /** The visible entries, in the order the caller already builds — mine first. */
  entries: GameEntry[]
  /** Which of them is mine. Never the position: that is a display decision. */
  mineUserId: string | null
  /** The rule this round was frozen with. `null` where there is no round. */
  awardRule: AwardRule | null
  /** What this round is worth — the winner box states it. `null` only without a game. */
  awardPoints: number | null
  disabled: boolean
  stage?: number
  /** The viewer's own steps, each with the answer the game gave. Empty before the first step. */
  steps?: StepView[]
  assets?: RoundAssets | undefined
  /** The round is over for everyone. */
  closed?: boolean
  /** Peer review. Every host supplies it; only a game that opens a review renders it. */
  review: RoundReview
  /** Sealed: mounted under the cover before the reveal, `payload` still `null`. */
  sealed?: boolean
  /** The layout the empty board is set up in while sealed. */
  scene?: unknown
}

/**
 * What a game tells its host. A one-stage game never emits `skip` or `giveUp`: both are the framework's.
 * `skip` carries the step's input, if the game has one.
 */
export type GameEmits = {
  guess: [value: unknown]
  skip: [stage: number, input?: unknown]
  giveUp: []
  reveal: []
}
