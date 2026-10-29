import { ref, type Ref } from 'vue'
import { UploadError } from '@/api/upload'

export interface QueueRow {
  name: string
  progress: number
  state: 'queued' | 'running' | 'done' | 'failed'
  message?: string
}

/**
 * The sequential upload queue both pools show. The page brings what differs: how one file goes up,
 * the German sentence for a server code, and what to refresh once the whole batch is through.
 */
export function useUploadQueue(options: {
  upload: (file: File, onProgress: (fraction: number) => void) => Promise<unknown>
  reasonFor: (code: string) => string | undefined
  afterAll: () => Promise<void>
}): { queue: Ref<QueueRow[]>; enqueue: (files: File[]) => Promise<void> } {
  const queue = ref<QueueRow[]>([])

  /**
   * One after another, on purpose: parallel uploads share the same mobile connection, so everything
   * takes just as long and five bars move at once without saying anything.
   */
  async function enqueue(files: File[]): Promise<void> {
    // Read the row back from `queue.value` rather than keeping the plain object `.map()` made:
    // only the reactive proxy's own setters notify the template, so a later `row.state = ...`
    // on the un-proxied object would silently never repaint.
    const start = queue.value.length
    queue.value.push(...files.map((f) => ({ name: f.name, progress: 0, state: 'queued' as const })))

    for (const [i, file] of files.entries()) {
      const row = queue.value[start + i]
      if (!row) continue
      row.state = 'running'
      try {
        await options.upload(file, (fraction) => (row.progress = fraction))
        row.state = 'done'
      } catch (e) {
        row.state = 'failed'
        row.message =
          e instanceof UploadError
            ? (options.reasonFor(e.code) ?? 'Upload fehlgeschlagen.')
            : 'Upload fehlgeschlagen.'
      }
    }
    await options.afterAll()
  }

  return { queue, enqueue }
}
