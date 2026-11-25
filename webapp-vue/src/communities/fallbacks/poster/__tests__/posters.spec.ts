import { describe, expect, it } from 'vitest'
import { hash32 } from '@/lib/hash32'
import { pickPoster, posterList } from '@/communities/fallbacks/poster/posters'

describe('pickPoster', () => {
  it('draws from the edition id', () => {
    const id = '0193f1c2-7a4b-7c3d-9e8f-0123456789ab'
    expect(pickPoster(id)).toBe(posterList[hash32(id) % posterList.length])
  })

  it('picks the same poster for the same edition every time', () => {
    const id = '0193f1c2-7a4b-7c3d-9e8f-0123456789ab'
    expect(pickPoster(id)).toBe(pickPoster(id))
  })

  it('has unique ids', () => {
    const ids = posterList.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
