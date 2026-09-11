import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImagePool from '@/images/ImagePool.vue'
import * as api from '@/api/images'
import type { VueWrapper } from '@vue/test-utils'

/** `defineExpose` is invisible to the wrapper's type, so reach for it once, here. */
const exposed = (w: VueWrapper) => w.vm as unknown as { enqueue: (files: File[]) => Promise<void> }

const listResponse = {
  images: [
    {
      id: 'i1',
      width: 800,
      height: 600,
      byteSize: 4_500_000,
      createdAt: '2026-09-01T10:00:00Z',
      uploadedBy: 'alice',
    },
  ],
  used: 12,
  limit: 150,
  // An admin's listing: the whole pool, so the quota and the uploader's name both mean something.
  viewerIsAdmin: true,
}

const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/jpeg' })

describe('ImagePool', () => {
  it('shows the quota and links the original to a new tab', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue(listResponse)
    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()

    expect(w.get('[data-test="quota"]').text()).toContain('12 von 150')
    const link = w.get('[data-test="original-link"]')
    expect(link.attributes('href')).toBe('/api/communities/alpha/images/i1')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('hides the quota and the uploader from someone who only sees their own', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, viewerIsAdmin: false })
    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()

    expect(w.find('[data-test="quota"]').exists()).toBe(false)
    // The image is still there -- only the name under it goes.
    expect(w.get('[data-test="original-link"]').attributes('href')).toBe(
      '/api/communities/alpha/images/i1',
    )
    expect(w.text()).not.toContain('alice')
  })

  it('uploads the picked files one after another, not in parallel', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    let inFlight = 0
    let maxInFlight = 0
    const upload = vi.spyOn(api, 'uploadImage').mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return listResponse.images[0]!
    })

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await exposed(w).enqueue([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    await flushPromises()

    expect(upload).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
  })

  it('names the reason on the failing file and carries on with the rest', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    vi.spyOn(api, 'uploadImage')
      .mockRejectedValueOnce(new api.UploadError('HEIC_UNSUPPORTED', 415))
      .mockResolvedValueOnce(listResponse.images[0]!)

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await exposed(w).enqueue([file('a.heic'), file('b.jpg')])
    await flushPromises()

    const rows = w.findAll('[data-test="queue-row"]')
    expect(rows[0]!.text()).toContain('HEIC')
    expect(rows[1]!.text()).toContain('Fertig')
  })

  it('asks before deleting, because it is final', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue(listResponse)
    const remove = vi.spyOn(api, 'deleteImage').mockResolvedValue(undefined as never)
    // happy-dom has no window.confirm at all; vi.spyOn needs a function there to wrap.
    window.confirm ??= () => false
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await w.get('[data-test="delete"]').trigger('click')

    expect(remove).not.toHaveBeenCalled()
  })

  it('deletes on a confirmed click and reloads the listing', async () => {
    vi.spyOn(api, 'listImages')
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValueOnce({ ...listResponse, images: [], used: 11 })
    const remove = vi.spyOn(api, 'deleteImage').mockResolvedValue(undefined as never)
    window.confirm ??= () => false
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await w.get('[data-test="delete"]').trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith('/api/communities/alpha/images', 'i1')
    expect(w.get('[data-test="quota"]').text()).toContain('11 von 150')
  })

  it('shows a message when the initial listing fails to load', async () => {
    vi.spyOn(api, 'listImages').mockRejectedValue(new Error('boom'))

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()

    expect(w.text()).toContain('Bilder konnten nicht geladen werden.')
  })
})
