import { describe, expect, it } from 'vitest'
import { backendPathPrefixes } from '../../dev-proxy'

const isProxied = (url: string) => backendPathPrefixes.some((p) => url.startsWith(p))

describe('dev server proxy', () => {
  it.each(['/login', '/', '/c/some-community', '/join/some-token'])(
    'lets the dev server serve the SPA route %s',
    (url) => {
      expect(isProxied(url)).toBe(false)
    },
  )

  it.each([
    '/api/me',
    '/login/github',
    '/login/github/as',
    '/login/oauth2/code/github',
    '/oauth2/authorization/github',
    '/logout',
  ])('proxies the backend path %s', (url) => {
    expect(isProxied(url)).toBe(true)
  })
})
