import { defineAsyncComponent, h } from 'vue'
import type { AsyncComponentLoader, Component } from 'vue'
import DedusterGame from './deduster/DedusterGame.vue'
import FindPatternGame from './findpattern/FindPatternGame.vue'
import GuessHueGame from './guesshue/GuessHueGame.vue'
import PaintRatioGame from './paintratio/PaintRatioGame.vue'
import PlacePatchGame from './placepatch/PlacePatchGame.vue'
import SongSnippetGame from './songsnippet/SongSnippetGame.vue'
import SpotObjectGame from './spotobject/SpotObjectGame.vue'

const NOTE = 'text-sm text-neutral-600'

const Loading = () => h('p', { class: NOTE }, 'Lädt …')

const LoadFailed = () =>
  h('p', { class: NOTE }, 'Diese Runde lässt sich hier nicht anzeigen. Lade die Seite neu.')

/**
 * A game with a heavy dependency loads on demand. A tab open across a deploy asks for a chunk that
 * is gone: without `LoadFailed` the card stays empty. Exported so a test can inject a loader that
 * rejects.
 */
export function asyncGame(loader: AsyncComponentLoader): Component {
  return defineAsyncComponent({
    loader,
    loadingComponent: Loading,
    errorComponent: LoadFailed,
    delay: 200,
  })
}

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
  deduster: DedusterGame,
  'place-patch': PlacePatchGame,
  // Async: `three` should load only for whoever plays Blockierung.
  'copy-blocks': asyncGame(() => import('./copyblocks/CopyBlocksGame.vue')),
  'paint-ratio': PaintRatioGame,
}
