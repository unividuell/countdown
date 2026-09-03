import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

const router = createRouter({ history: createMemoryHistory(), routes })

describe('generated route table', () => {
  it.each([
    ['/', '/'],
    ['/login', '/login'],
    ['/communities', '/communities/'],
    ['/communities/new', '/communities/new'],
    ['/super-admin', '/super-admin/'],
    ['/c/team/', '/c/[slug]/'],
    ['/join/some-token', '/join/[token]'],
    ['/legal', '/legal'],
  ])('%s resolves to its own route, not the catch-all', (path, expectedName) => {
    expect(router.resolve(path).name).toBe(expectedName)
  })

  // Terms and a privacy statement that only a signed-in user can read do not serve their purpose:
  // Google's terms require the app to bind *its* users, and the guard treats every route as
  // protected unless it says otherwise.
  it('serves the legal page to an anonymous visitor', () => {
    expect(router.resolve('/legal').meta.public).toBe(true)
  })

  it('an unmatched path falls through to the catch-all, marked public', () => {
    const resolved = router.resolve('/definitely-not-a-page')
    expect(resolved.name).toBe('/[...path]')
    expect(resolved.meta.public).toBe(true)
  })
})
