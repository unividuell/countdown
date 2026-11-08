import { describe, expect, it } from 'vitest'
import { labShortcut } from '@/gamelab/shortcuts'

describe('labShortcut', () => {
  it.each([
    { key: 'r', shortcut: 'roll' },
    { key: 'w', shortcut: 'switchPlayer' },
    { key: 'x', shortcut: 'reset' },
    { key: 'z', shortcut: 'forgetMine' },
    { key: 'R', shortcut: 'roll' },
  ])('recognizes the bare key $key as $shortcut', ({ key, shortcut }) => {
    expect(labShortcut(new KeyboardEvent('keydown', { key }))).toBe(shortcut)
  })

  // Every modifier belongs to the browser: ⌘R reloads, ⌘⇧W closes the window.
  it.each([
    { key: 'r', metaKey: true },
    { key: 'r', ctrlKey: true },
    { key: 'r', altKey: true },
    { key: 'r', shiftKey: true },
    { key: 'r', repeat: true },
    { key: 'q' },
  ])('ignores modifiers, held keys and other keys: %o', (options) => {
    expect(labShortcut(new KeyboardEvent('keydown', options))).toBeNull()
  })
})
