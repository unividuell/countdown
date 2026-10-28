import { describe, expect, it, vi } from 'vitest'
import { UploadError } from '@/api/upload'
import { useUploadQueue } from '@/ui/useUploadQueue'

const file = (name: string) => new File([new Uint8Array([1])], name)

describe('useUploadQueue', () => {
  it('uploads one after another, not in parallel', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const upload = vi.fn(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })
    const { enqueue } = useUploadQueue({
      upload,
      reasonFor: () => undefined,
      afterAll: async () => {},
    })

    await enqueue([file('a.jpg'), file('b.jpg'), file('c.jpg')])

    expect(upload).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
  })

  it('names the reason on the failing file and carries on with the rest', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new UploadError('HEIC_UNSUPPORTED', 415))
      .mockResolvedValueOnce(undefined)
    const { queue, enqueue } = useUploadQueue({
      upload,
      reasonFor: (code) =>
        code === 'HEIC_UNSUPPORTED' ? 'HEIC wird nicht unterstützt.' : undefined,
      afterAll: async () => {},
    })

    await enqueue([file('a.heic'), file('b.jpg')])

    expect(queue.value[0]).toMatchObject({
      name: 'a.heic',
      state: 'failed',
      message: 'HEIC wird nicht unterstützt.',
    })
    expect(queue.value[1]).toMatchObject({ name: 'b.jpg', state: 'done' })
  })

  it('an unknown code and a non-UploadError both fall back to „Upload fehlgeschlagen.“', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new UploadError('SOMETHING_NEW', 500))
      .mockRejectedValueOnce(new TypeError('boom'))
    const { queue, enqueue } = useUploadQueue({
      upload,
      reasonFor: () => undefined,
      afterAll: async () => {},
    })

    await enqueue([file('a.jpg'), file('b.jpg')])

    expect(queue.value.map((row) => row.message)).toEqual([
      'Upload fehlgeschlagen.',
      'Upload fehlgeschlagen.',
    ])
  })

  it('reports the progress of the running file on its row', async () => {
    let report: (fraction: number) => void = () => {}
    let finish: () => void = () => {}
    const upload = vi.fn(
      (_file: File, onProgress: (fraction: number) => void) =>
        new Promise<void>((resolve) => {
          report = onProgress
          finish = resolve
        }),
    )
    const { queue, enqueue } = useUploadQueue({
      upload,
      reasonFor: () => undefined,
      afterAll: async () => {},
    })

    const done = enqueue([file('a.jpg')])
    report(0.4)
    expect(queue.value[0]).toMatchObject({ state: 'running', progress: 0.4 })

    finish()
    await done
    expect(queue.value[0]).toMatchObject({ state: 'done' })
  })

  it('calls afterAll once, after the last file', async () => {
    const order: string[] = []
    const { enqueue } = useUploadQueue({
      upload: async (f) => {
        order.push(f.name)
      },
      reasonFor: () => undefined,
      afterAll: async () => {
        order.push('afterAll')
      },
    })

    await enqueue([file('a.jpg'), file('b.jpg')])

    expect(order).toEqual(['a.jpg', 'b.jpg', 'afterAll'])
  })
})
