/**
 * What a game component needs to know about one player's entry — and nothing more.
 *
 * Deliberately narrower than either wire type: the lab's `LabEntryDto` and the round's `PlayDto` both
 * satisfy this structurally, so neither world has to map, and the component stays ignorant of which
 * one it renders for. Widening it is how a game would start depending on the lab.
 */
export type GameEntry = {
  userId: string
  guess: unknown
  avatar: { bgColorHex: string }
}
