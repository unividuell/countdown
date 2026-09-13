import type { Component } from 'vue'
import FindPatternBriefing from './findpattern/FindPatternBriefing.vue'
import FindPatternGame from './findpattern/FindPatternGame.vue'
import GuessHueBriefing from './guesshue/GuessHueBriefing.vue'
import GuessHueGame from './guesshue/GuessHueGame.vue'
import SongSnippetBriefing from './songsnippet/SongSnippetBriefing.vue'
import SongSnippetGame from './songsnippet/SongSnippetGame.vue'
import SpotObjectBriefing from './spotobject/SpotObjectBriefing.vue'
import SpotObjectGame from './spotobject/SpotObjectGame.vue'

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
  'find-pattern': FindPatternGame,
  'spot-object': SpotObjectGame,
}

/**
 * The same games' explanation and award boxes, mountable without the game.
 *
 * A reveal screen has no game yet — that is the whole point of the gate — but it is exactly where
 * the player has time to read, because the clock starts when they leave it. So the boxes are their
 * own components, keyed here by the same id, and the board and the reveal screen mount the same
 * file. A game missing here simply shows no boxes ahead of the reveal; the reveal still works.
 */
export const gameBriefings: Record<string, Component> = {
  'guess-hue': GuessHueBriefing,
  'song-snippet': SongSnippetBriefing,
  'find-pattern': FindPatternBriefing,
  'spot-object': SpotObjectBriefing,
}
