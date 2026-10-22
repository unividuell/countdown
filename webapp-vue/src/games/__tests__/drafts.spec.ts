import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, deviceStorage, fingerprint, sweepDrafts } from '@/games/drafts'

const PREFIX = 'some-game:draft:u1:'
const KEEP = `${PREFIX}aaaaaaaa`
const NOW = Date.UTC(2026, 9, 16, 12)
const HOUR = 60 * 60 * 1000

function saved(at: number): string {
  return JSON.stringify({ v: 1, at })
}

function deniedStorage(): Storage {
  const denied = () => {
    throw new Error('denied')
  }

  return {
    getItem: denied,
    setItem: denied,
    removeItem: denied,
    key: denied,
    clear: denied,
    get length(): number {
      return denied()
    },
  } as unknown as Storage
}

describe('fingerprint', () => {
  it('is FNV-1a over the UTF-8 bytes, so a stored key outlives a deploy', () => {
    expect(fingerprint('')).toBe('811c9dc5')
    expect(fingerprint('a')).toBe('e40c292c')
    expect(fingerprint('foobar')).toBe('bf9cf968')
    expect(fingerprint('ä')).toBe('199de0e2')
  })

  it('tells two texts apart', () => {
    expect(fingerprint('/assets/target?round=r1')).not.toBe(fingerprint('/assets/target?round=r2'))
  })
})

describe('sweepDrafts', () => {
  beforeEach(() => localStorage.clear())

  it('removes only keys of the prefix, never the kept one', () => {
    const stale = `${PREFIX}bbbbbbbb`
    const other = 'some-game:draft:u2:bbbbbbbb'
    localStorage.setItem(KEEP, saved(NOW - 49 * HOUR))
    localStorage.setItem(stale, saved(NOW - 49 * HOUR))
    localStorage.setItem(other, saved(NOW - 49 * HOUR))
    localStorage.setItem('infobox:some-game', 'true')

    sweepDrafts(localStorage, PREFIX, KEEP, NOW)

    expect(localStorage.getItem(KEEP)).not.toBeNull()
    expect(localStorage.getItem(stale)).toBeNull()
    expect(localStorage.getItem(other)).not.toBeNull()
    expect(localStorage.getItem('infobox:some-game')).toBe('true')
  })

  it('spares a draft that is not older than two days', () => {
    const fresh = `${PREFIX}bbbbbbbb`
    const edge = `${PREFIX}cccccccc`
    const old = `${PREFIX}dddddddd`
    localStorage.setItem(fresh, saved(NOW - 47 * HOUR))
    localStorage.setItem(edge, saved(NOW - 48 * HOUR))
    localStorage.setItem(old, saved(NOW - 49 * HOUR))

    sweepDrafts(localStorage, PREFIX, KEEP, NOW)

    expect(localStorage.getItem(fresh)).not.toBeNull()
    expect(localStorage.getItem(edge)).not.toBeNull()
    expect(localStorage.getItem(old)).toBeNull()
  })

  it('removes a draft without a readable time, and every stale one in a run', () => {
    const keys = ['b', 'c', 'd', 'e', 'f', 'g'].map((c) => `${PREFIX}${c.repeat(8)}`)
    localStorage.setItem(keys[0]!, '{"v":1}')
    localStorage.setItem(keys[1]!, '{"v":1,"at":"soon"}')
    localStorage.setItem(keys[2]!, '{')
    localStorage.setItem(keys[3]!, 'null')
    localStorage.setItem(keys[4]!, saved(NOW - 50 * HOUR))
    localStorage.setItem(keys[5]!, saved(NOW - 90 * HOUR))

    sweepDrafts(localStorage, PREFIX, KEEP, NOW)

    expect(keys.filter((key) => localStorage.getItem(key) !== null)).toEqual([])
  })

  it('reads the clock by default', () => {
    const stale = `${PREFIX}bbbbbbbb`
    localStorage.setItem(stale, saved(Date.now() - 49 * HOUR))

    sweepDrafts(localStorage, PREFIX, KEEP)

    expect(localStorage.getItem(stale)).toBeNull()
  })

  it('plays on without a storage that works', () => {
    expect(() => sweepDrafts(null, PREFIX, KEEP, NOW)).not.toThrow()
    expect(() => sweepDrafts(deniedStorage(), PREFIX, KEEP, NOW)).not.toThrow()
  })
})

describe('clearDraft', () => {
  beforeEach(() => localStorage.clear())

  it('removes one entry and leaves the rest', () => {
    localStorage.setItem(KEEP, 'a')
    localStorage.setItem(`${PREFIX}bbbbbbbb`, 'b')

    clearDraft(localStorage, KEEP)

    expect(localStorage.getItem(KEEP)).toBeNull()
    expect(localStorage.getItem(`${PREFIX}bbbbbbbb`)).toBe('b')
  })

  it('plays on without a storage that works', () => {
    expect(() => clearDraft(null, KEEP)).not.toThrow()
    expect(() => clearDraft(deniedStorage(), KEEP)).not.toThrow()
  })
})

describe('deviceStorage', () => {
  it('hands out the local storage', () => {
    expect(deviceStorage()).toBe(window.localStorage)
  })

  it('is null where even reaching the storage throws', () => {
    const reach = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(deviceStorage()).toBeNull()

    reach.mockRestore()
  })
})
