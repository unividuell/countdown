import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const THIRD_PARTY = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) return sources(path)

    return /\.(css|vue|ts)$/.test(entry.name) ? [path] : []
  })
}

describe('fonts', () => {
  it('are never fetched from a third party', () => {
    const files = [join(process.cwd(), 'index.html'), ...sources(join(process.cwd(), 'src'))]
    // This spec holds the pattern itself.
    const offender = files
      .filter((file) => !file.endsWith('ownFonts.spec.ts'))
      .find((file) => THIRD_PARTY.test(readFileSync(file, 'utf8')))

    expect(offender ?? null).toBeNull()
  })
})
