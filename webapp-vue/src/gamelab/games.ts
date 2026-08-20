import type { Component } from 'vue'
import { gameComponents } from '@/games/registry'

export interface LabGameEntry {
  /** Matches `GameType.id` on the server, surfaced as `LabRoundResponse.game` — the `:game` URL segment. */
  id: string
  /**
   * Shown by the index only. The server owns the authoritative name and sends it as
   * `LabRoundResponse.displayName`, which is what the game page's heading renders — so a drift
   * between the two shows up the moment you open the game, rather than hiding.
   */
  title: string
}

/**
 * The games the lab offers, in index order. The renderer comes from the shared registry — this
 * list keeps only what is the lab's own, the display title for its index page.
 *
 * An entry without a match in the server-side `GameCatalog` yields a 404 on open, and a server
 * game missing from here has no index entry and no renderer — the two lists are kept in step by
 * hand because there are, and will be, few of them.
 */
export const labGameList: readonly LabGameEntry[] = [
  { id: 'guess-hue', title: 'Farbausmalung' },
  { id: 'song-snippet', title: 'Anspielung' },
]

/** Lookup by URL segment, for the game page. */
export const labGames: Record<string, Component> = gameComponents
