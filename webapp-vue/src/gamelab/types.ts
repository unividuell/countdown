import type { AssetKey } from '@/api/assets'
import type { AvatarView, StepView, Vote } from '@/api/types'

/**
 * Lab types live here rather than in `src/api/types.ts` so the whole non-prod harness is one
 * directory plus one page — deletable, or rewritten wholesale, without touching product types.
 */

/** Mirrors the server's `Phase`. The lab chooses it; a real round derives it from its round number. */
export type LabPhase = 'ONE' | 'TWO'

/** Mirrors the server's `AwardRule`. */
export type LabAwardRule = 'ALL_QUALIFYING' | 'CLOSEST_ONLY'

/** One vote cast on a lab tip, by name — mirrors `VoteView` in the real round's wire types. */
export interface LabVoteView {
  userId: string
  username: string
  value: Vote
}

export interface LabEntryDto {
  userId: string
  username: string
  avatar: AvatarView
  guess: unknown
  /** `null` where the game accepts guesses without scoring them. */
  outcome: unknown
  /** Display order only — never a score. */
  at: string
  /** The server always sends a number — `0` means "guessed and scored nothing". */
  points: number
  /** The stage this entry was recorded at — same idea as `LabRoundResponse.myStage`, per entry. */
  stage: number
  /** Reveal-to-guess in milliseconds; `null` for a game that does not score on time. */
  durationMs: number | null
  /** Every vote cast on this tip, by name. Empty for a game without peer review. */
  votes: LabVoteView[]
  /**
   * Whether this tip currently scores nothing because of the review — the server's own answer,
   * override included. The client never re-derives it.
   */
  struck: boolean
  /** The game master's verdict, shown openly — it would otherwise be the one hidden move. */
  adminOverride: boolean | null
  /** The inputs of this entry's steps, one per stage — never their answers. */
  steps: unknown[]
}

export interface LabRoundResponse<P = unknown> {
  seed: number
  game: string
  displayName: string
  phase: LabPhase
  /** Before the reveal and after it alike — mirrors `RoundResponse.scene`. */
  scene: unknown
  /**
   * `null` until `revealed` — withheld the same way `solution` already is: for a game that asked
   * for a deliberate reveal, the payload IS the board, so sending it early would defeat the click
   * that is supposed to gate it.
   */
  payload: P | null
  /**
   * What the game revealed once the viewer had spent their guess; `null` in front of that gate.
   * `unknown` for the same reason `payload` is generic — the shape belongs to the game.
   */
  solution: unknown
  me: LabEntryDto | null
  others: LabEntryDto[]
  /** True when this request displaced a round that was open on a different seed. */
  tookOverRound: boolean
  awardRule: LabAwardRule
  awardPoints: number
  scoresOnDuration: boolean
  /** The viewer's own stage — `0` for a single-stage game, or a staged one not yet advanced. */
  myStage: number
  /**
   * The viewer's own steps with the answers, recomputed by the server. Present before the viewer's
   * entry is stored, which is why they do not live on `me`.
   */
  mySteps: StepView[]
  /** Follows from the seed, `0` to `1` in tenths. A property of the loaded round, not of the URL. */
  difficulty: number
  /**
   * Whether the viewer may see the board. Always `true` for a game that never asked for a
   * deliberate reveal — there is nothing to gate. The one field the page acts on; it does not
   * derive this from anything else.
   */
  revealed: boolean
  /**
   * Whether the viewer may set the override. Always `true` — in the lab everybody is the game
   * master, the one deliberate difference from the product: the lab models no roles anywhere.
   */
  canOverride: boolean
  /** The assets this viewer may open right now, by name — mirrors `RoundResponse.assetKeys`. */
  assetKeys: Record<string, AssetKey>
}
