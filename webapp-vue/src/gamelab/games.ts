import type { Component } from 'vue'
import { gameComponents } from '@/games/registry'

/** Lookup by URL segment, for the game page. */
export const labGames: Record<string, Component> = gameComponents
