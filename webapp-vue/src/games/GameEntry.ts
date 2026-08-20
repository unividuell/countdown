/**
 * What a game component needs to know about one player's entry — and nothing more.
 *
 * Deliberately narrower than any wire type: the lab's `LabEntryDto` and the round's `MyPlayDto` and
 * `OtherPlayDto` all satisfy this structurally, so no world has to map, and the component stays
 * ignorant of which one it renders for.
 *
 * A field may be added here only when *every* world already carries it. That is the line: a field
 * only one of them has is how a game would start depending on the lab.
 */
export type GameEntry = {
  userId: string
  /** The display name, as the server resolved it. */
  username: string
  /** Final stage of a finished play. */
  stage: number
  guess: unknown
  /** What the game said about this guess. `null` for a game that judges without saying anything. */
  outcome: unknown
  /** `null` until the round is scored; `0` means „played and came away empty“. */
  points: number | null
  avatar: { bgColorHex: string }
}
