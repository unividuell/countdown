import type { Component } from 'vue'
import GuessHueGame from './guesshue/GuessHueGame.vue'
import SongSnippetGame from './songsnippet/SongSnippetGame.vue'

/**
 * Every game the client can render, by the id the server announces (`GameDto.id` for a real round,
 * `LabRoundResponse.game` in the lab).
 *
 * One registry for both, because two would be two adapters that can drift — the argument that deleted
 * the lab's own Kotlin adapter. A game missing here has no renderer, and both callers say so rather
 * than rendering a blank card.
 */
export const gameComponents: Record<string, Component> = {
  'guess-hue': GuessHueGame,
  'song-snippet': SongSnippetGame,
}
