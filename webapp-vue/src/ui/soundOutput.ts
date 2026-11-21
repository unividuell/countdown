/**
 * Where every decoration sound goes, and the one place the sound switch is honoured. A game calls
 * its play function and nothing else: no check of the switch, no watcher to cut a sound on mute.
 *
 *   knocks ─┐
 *   pipes  ─┼─▶ output (gain: 1 on · 0 muted) ─▶ destination
 *   blocks ─┘
 *
 * Two halves, because muting has two: nothing new starts (`gameSoundOn`, `soundGraph`), and what is
 * already sounding falls silent (`soundOutput`). Not for a game whose sound is the game.
 */
import { effectScope, watch, type Ref } from 'vue'
import { runningGraph } from './audio'
import { useGameSound } from './useGameSound'

/** Long enough not to click, short enough to be „now“. */
const MUTE_RAMP_S = 0.02

/** Detached: the switch must outlive whichever component asked first. */
const scope = effectScope(true)
let switched: Ref<boolean> | null = null

function gameSound(): Ref<boolean> {
  switched ??= scope.run(() => useGameSound())!

  return switched
}

/** The shared switch, for code outside a component. */
export function gameSoundOn(): boolean {
  return gameSound().value
}

/**
 * The graph for a one-shot: running, and sound on — else `null`, and the one-shot stays silent.
 * Muted asks for no graph at all: a muted game leaves the device's audio alone.
 */
export function soundGraph(): AudioContext | null {
  return gameSoundOn() ? runningGraph() : null
}

let output: { graph: AudioContext; node: GainNode } | null = null

/** Connect here instead of `graph.destination`: muting closes it. */
export function soundOutput(graph: AudioContext): AudioNode {
  if (output?.graph === graph) return output.node

  const node = graph.createGain()
  node.gain.value = gameSoundOn() ? 1 : 0
  node.connect(graph.destination)
  output = { graph, node }

  scope.run(() =>
    watch(gameSound(), (on) => {
      const now = graph.currentTime
      node.gain.setValueAtTime(node.gain.value, now)
      node.gain.linearRampToValueAtTime(on ? 1 : 0, now + MUTE_RAMP_S)
    }),
  )

  return node
}
