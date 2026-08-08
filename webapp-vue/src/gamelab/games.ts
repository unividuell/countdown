import type { Component } from 'vue'
import SampleGame from './SampleGame.vue'

/**
 * Game id (the `:game` URL segment, matching `LabGame.id` on the server) to the component that
 * draws it. A real game adds one entry here and one component; nothing else in the lab changes.
 */
export const labGames: Record<string, Component> = {
  sample: SampleGame,
}
