import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImagePool from '@/images/ImagePool.vue'
import * as api from '@/api/images'
import * as upload from '@/api/upload'
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

  it("uploads through uploadFile under the file's own name", async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    const send = vi.spyOn(upload, 'uploadFile').mockResolvedValue(listResponse.images[0]!)

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    const picked = file('a.jpg')
    await exposed(w).enqueue([picked])
    await flushPromises()

    expect(send).toHaveBeenCalledWith(
      '/api/communities/alpha/images',
      picked,
      'a.jpg',
      expect.any(Function),
    )
    expect(w.get('[data-test="queue-row"]').text()).toContain('Fertig')
  })

  it("words a refusal with the image pool's own reasons", async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    vi.spyOn(upload, 'uploadFile').mockRejectedValue(
      new upload.UploadError('HEIC_UNSUPPORTED', 415),
    )

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await exposed(w).enqueue([file('a.heic')])
    await flushPromises()

    expect(w.get('[data-test="queue-row"]').text()).toContain('HEIC')
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
