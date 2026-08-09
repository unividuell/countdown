import { describe, expect, it } from 'vitest'
import { labShortcut } from '@/gamelab/shortcuts'

describe('labShortcut', () => {
  it('recognizes Meta+Shift+Z as forgetMine', () => {
    expect(
      labShortcut(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true })),
    ).toBe('forgetMine')
  })

  it('recognizes Meta+Shift+X as reset', () => {
    expect(
      labShortcut(new KeyboardEvent('keydown', { key: 'x', metaKey: true, shiftKey: true })),
    ).toBe('reset')
  })

  it.each([
    { key: 'z', metaKey: false, shiftKey: true, ctrlKey: false, altKey: false },
    { key: 'z', metaKey: true, shiftKey: false, ctrlKey: false, altKey: false },
    { key: 'z', metaKey: true, shiftKey: true, ctrlKey: true, altKey: false },
    { key: 'z', metaKey: true, shiftKey: true, ctrlKey: false, altKey: true },
    { key: 'q', metaKey: true, shiftKey: true, ctrlKey: false, altKey: false },
  ])('ignores every other modifier or key combination', (options) => {
    expect(labShortcut(new KeyboardEvent('keydown', options))).toBeNull()
  })
})
