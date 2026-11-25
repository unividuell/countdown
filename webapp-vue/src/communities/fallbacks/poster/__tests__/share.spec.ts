import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHROME_ATTR, isPictured, sharePicture } from '@/communities/fallbacks/poster/share'

const file = new File(['png'], 'poster.png', { type: 'image/png' })

function stubShare(share: () => Promise<void>) {
  vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: vi.fn(share) })
}

function spyDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:poster')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isPictured', () => {
  it('leaves the chrome out and keeps everything else', () => {
    const button = document.createElement('button')
    button.setAttribute(CHROME_ATTR, '')
    expect(isPictured(button)).toBe(false)
    expect(isPictured(document.createElement('p'))).toBe(true)
    expect(isPictured(document.createTextNode('x'))).toBe(true)
  })
})

describe('sharePicture', () => {
  it('hands the file to the share sheet', async () => {
    stubShare(() => Promise.resolve())
    expect(await sharePicture(file, 'Team')).toBe('shared')
    expect(navigator.share).toHaveBeenCalledWith({ files: [file], title: 'Team' })
  })

  it('takes a closed share sheet as cancelled, not as a reason to download', async () => {
    stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')))
    const click = spyDownload()
    expect(await sharePicture(file, 'Team')).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('downloads when the share was refused', async () => {
    stubShare(() => Promise.reject(new DOMException('no tap', 'NotAllowedError')))
    const click = spyDownload()
    expect(await sharePicture(file, 'Team')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })

  // Plain HTTP on the LAN: no share sheet at all.
  it('downloads without a share sheet', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined })
    const click = spyDownload()
    expect(await sharePicture(file, 'Team')).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })
})
