/**
 * The closing poster as a picture, and the way it leaves the phone.
 *
 *   poster settled ──► renderPoster ──► File (held) ──tap──► share sheet
 *                                                     └────► download (no share sheet, or refused)
 *
 * Rendered ahead of the tap, not on it: iOS Safari takes `navigator.share` only straight from the
 * tap, and a render in between can cost that.
 */

/** Marks what the poster shows on screen but leaves out of its picture: the share button. */
export const CHROME_ATTR = 'data-poster-chrome'

/** Whether a node belongs in the picture. */
export function isPictured(node: Node): boolean {
  return !(node instanceof Element && node.hasAttribute(CHROME_ATTR))
}

/** Every animation on the poster has run: the end state, the one worth a picture. */
export async function settled(el: HTMLElement): Promise<void> {
  const running = el.getAnimations?.({ subtree: true }) ?? []
  await Promise.all(running.map((a) => a.finished.catch(() => undefined)))
}

/**
 * The poster as a PNG at three times its CSS size. The library is loaded only here, so nobody
 * downloads it before a poster stands on their page.
 */
export async function renderPoster(el: HTMLElement): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot')

  return domToBlob(el, {
    scale: 3,
    type: 'image/png',
    // System faces only: nothing to fetch and embed.
    font: false,
    // The bleed's negative margins would shift the copy inside its frame.
    style: { margin: '0' },
    filter: isPictured,
  })
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * The share sheet where the browser offers one for files, else a download. Over plain HTTP (a
 * phone on the LAN) there is no `navigator.share` at all; a share refused for a lost tap falls back
 * the same way.
 */
export async function sharePicture(file: File, title: string): Promise<ShareOutcome> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error
    }
  }

  download(file)
  return 'downloaded'
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // After the click has handed the URL over; revoking at once can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
