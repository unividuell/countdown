import type { Component } from 'vue'
import type { RosterMemberResponse } from '@/api/types'
import { hash32 } from '@/lib/hash32'
import PodiumPoster from './PodiumPoster.vue'

/** What every poster is given. Shaped by the first one; the next widens it when it needs more. */
export interface PosterProps {
  /** The edition's label, else the community's name. */
  title: string
  members: readonly RosterMemberResponse[]
  /** Rounds that carried a game. */
  gameRounds: number
}

export interface PosterEntry {
  id: string
  title: string
  component: Component
}

/**
 * The closing posters. Append only: the pick is `hash % length`, so a new entry may move the
 * edition that is closing right now onto another poster — never one that is still counting down.
 */
export const posterList: readonly PosterEntry[] = [
  { id: 'podium', title: 'Siegerpodest', component: PodiumPoster },
]

/**
 * One poster per edition, the same on every device. The edition id is public and the pick is
 * only looks, so the client may draw it.
 */
export function pickPoster(editionId: string): PosterEntry {
  return posterList[hash32(editionId) % posterList.length]!
}
