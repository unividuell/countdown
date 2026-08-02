import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotFound from '@/pages/[...path].vue'

const RouterLinkStub = { template: '<a :href="to"><slot/></a>', props: ['to'] }

describe('the 404 page', () => {
  it('says the address does not exist and offers a way back', () => {
    const w = mount(NotFound, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('Seite nicht gefunden')
    expect(w.find('a').attributes('href')).toBe('/')
  })

  // definePage is a build-time macro and Vitest runs without the plugin that transforms it,
  // so the meta cannot be read from the mounted component — the source is the only witness.
  it('is public, so a mistyped URL never routes through the login round-trip', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const pagePath = join(dir, '../[...path].vue')
    const src = readFileSync(pagePath, 'utf8')
    expect(src).toMatch(/definePage\(\s*\{\s*meta:\s*\{[^}]*public:\s*true/)
  })
})
