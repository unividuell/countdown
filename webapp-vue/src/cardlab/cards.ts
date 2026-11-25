import type { Component } from 'vue'
import CountdownLab from './CountdownLab.vue'
import NoDateLab from './NoDateLab.vue'
import PosterLab from './PosterLab.vue'
import RunningLab from './RunningLab.vue'

export interface CardLabEntry {
  /** The `:card` URL segment. */
  id: string
  title: string
  /** The card and, under it, whatever controls it needs. */
  component: Component
}

/** Every card the community page shows instead of a game, in index order. */
export const cardLabList: readonly CardLabEntry[] = [
  { id: 'countdown', title: 'Countdown', component: CountdownLab },
  { id: 'no-date', title: 'Noch kein Termin', component: NoDateLab },
  { id: 'poster', title: 'Abschlussposter', component: PosterLab },
  { id: 'running', title: 'Viel Spaß', component: RunningLab },
]
