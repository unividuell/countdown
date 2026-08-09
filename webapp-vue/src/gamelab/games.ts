import type { Component } from 'vue'
import GuessHueLabGame from './GuessHueLabGame.vue'
import SampleGame from './SampleGame.vue'

export interface LabGameEntry {
  /** Matches `LabGame.id` on the server — it is the `:game` URL segment. */
  id: string
  /**
   * Shown by the index only. The server owns the authoritative name and sends it as
   * `LabRoundResponse.displayName`, which is what the game page's heading renders — so a drift
   * between the two shows up the moment you open the game, rather than hiding.
   */
  title: string
  component: Component
}

/**
 * Every game the lab can draw. A real game adds one entry here and one component; nothing else
 * in the lab changes.
 *
 * An entry without a matching server-side `LabGame` yields a 404 on open, and a server game
 * missing from here has no index entry and no renderer — the two lists are kept in step by hand
 * because there are, and will be, few of them.
 */
export const labGameList: readonly LabGameEntry[] = [
  { id: 'sample', title: 'Zahlenraten (Attrappe)', component: SampleGame },
  { id: 'guess-hue', title: 'Farbausmalung', component: GuessHueLabGame },
]

/** Lookup by URL segment, for the game page. */
export const labGames: Record<string, Component> = Object.fromEntries(
  labGameList.map((g) => [g.id, g.component]),
)
