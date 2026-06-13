import { afterEach, describe, expect, it } from 'vitest'
import { consumePostLoginRedirect, stashPostLoginRedirect } from '@/auth/postLoginRedirect'

describe('postLoginRedirect', () => {
  afterEach(() => sessionStorage.clear())

  it('stashes and consumes an internal path once', () => {
    stashPostLoginRedirect('/join/tok123')
    expect(consumePostLoginRedirect()).toBe('/join/tok123')
    // consumed → cleared
    expect(consumePostLoginRedirect()).toBeNull()
  })

  it('ignores unsafe or pointless paths', () => {
    for (const p of ['/', '/login', '/login/github', '//evil.example', 'https://evil.example']) {
      stashPostLoginRedirect(p)
      expect(consumePostLoginRedirect()).toBeNull()
    }
  })

  it('re-validates on consume (tampered sessionStorage)', () => {
    sessionStorage.setItem('postLoginRedirect', '//evil.example')
    expect(consumePostLoginRedirect()).toBeNull()
  })
})
