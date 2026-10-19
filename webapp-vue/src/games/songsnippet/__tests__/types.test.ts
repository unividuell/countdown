import { describe, expect, it } from 'vitest'
import { asSongSnippetPayload, asSongSnippetSolution } from '../types'

describe('asSongSnippetPayload', () => {
  it('takes stage durations that are all numbers', () => {
    expect(asSongSnippetPayload({ stageDurationsSeconds: [0.1, 15] })).toEqual({
      stageDurationsSeconds: [0.1, 15],
    })
  })

  it('refuses anything else', () => {
    expect(asSongSnippetPayload({ stageDurationsSeconds: [0.1, 'x'] })).toBeNull()
    expect(asSongSnippetPayload({})).toBeNull()
    expect(asSongSnippetPayload(null)).toBeNull()
  })
})

describe('asSongSnippetSolution', () => {
  const SOLUTION = { artist: 'Eagles', title: 'Hotel California', coverUrl: null, link: 'x' }

  it('takes the server’s shape, a missing cover as none', () => {
    expect(asSongSnippetSolution(SOLUTION)).toEqual(SOLUTION)
    expect(asSongSnippetSolution({ ...SOLUTION, coverUrl: undefined })).toEqual(SOLUTION)
  })

  it('refuses a solution without its text', () => {
    expect(asSongSnippetSolution({ ...SOLUTION, title: 42 })).toBeNull()
    expect(asSongSnippetSolution({ artist: 'Eagles', title: 'Hotel California' })).toBeNull()
    expect(asSongSnippetSolution('Hotel California')).toBeNull()
  })
})
