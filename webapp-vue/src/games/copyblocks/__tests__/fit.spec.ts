import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IDENTITY, toGuess, toTemplate } from '@/games/copyblocks/fit'
import type { Fit } from '@/games/copyblocks/fit'

// The file FitGoldenVectorTest asserts against: one side cannot drift without the other going red.
const VECTORS_PATH = '../shared/copy-blocks/fit.json'

type Triple = [number, number, number]
interface Case {
  fit: Fit
  guess: Triple
  template: Triple
}
const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as { cases: Case[] }

describe('fit', () => {
  it.each(vectors.cases)('maps $guess onto $template', ({ fit, guess, template }) => {
    expect(toTemplate(fit, guess)).toEqual(template)
  })

  it.each(vectors.cases)('maps $template back onto $guess', ({ fit, guess, template }) => {
    expect(toGuess(fit, template)).toEqual(guess)
  })

  it('the identity moves nothing', () => {
    expect(toTemplate(IDENTITY, [4, -1, 9])).toEqual([4, -1, 9])
  })
})
