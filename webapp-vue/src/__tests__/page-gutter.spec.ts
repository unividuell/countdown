import { describe, expect, it } from 'vitest'

/**
 * `<main>` in `App.vue` owns the side gutter (`p-4`), the same 16px the header and footer keep. A
 * page's centred column sets its width and vertical rhythm only; a `px-*` of its own doubles the
 * gutter and puts the content out of line with the header. Read from source, as happy-dom lays
 * nothing out.
 */
const sources = {
  ...import.meta.glob<string>('/src/pages/**/*.vue', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>(['/src/images/ImagePool.vue', '/src/audio/AudioPool.vue'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

describe('page columns', () => {
  it('reads every page', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it.each(Object.entries(sources))('%s leaves the side gutter to <main>', (_, source) => {
    const columns = [...source.matchAll(/class="(mx-auto max-w-[^"]*)"/g)].map((m) => m[1]!)
    for (const column of columns) expect(column).not.toMatch(/(^|\s)px-\d/)
  })
})
