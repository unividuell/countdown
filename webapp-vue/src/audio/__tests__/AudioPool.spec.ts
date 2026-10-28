import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Mock } from 'vitest'
import type { Ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import AudioPool from '@/audio/AudioPool.vue'
import * as api from '@/api/audio'
import * as upload from '@/api/upload'
import * as intake from '@/audio/intake'

interface PlaybackStub {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: Mock
  restart: Mock
  pause: Mock
  dispose: Mock
}

const { playbacks } = vi.hoisted(() => ({ playbacks: [] as PlaybackStub[] }))
vi.mock('@/ui/usePlayback', async () => {
  const { ref } = await import('vue')
  const { vi: vitest } = await import('vitest')
  return {
    usePlayback: () => {
      const stub: PlaybackStub = {
        positionSeconds: ref(0),
        playing: ref(false),
        setSource: vitest.fn(),
        restart: vitest.fn(),
        pause: vitest.fn(),
        dispose: vitest.fn(),
      }
      playbacks.push(stub)
      return stub
    },
  }
})

/** `defineExpose` is invisible to the wrapper's type, so reach for it once, here. */
const exposed = (w: VueWrapper) => w.vm as unknown as { enqueue: (files: File[]) => Promise<void> }

const BASE = '/api/communities/alpha/audio'

const clip = (id: string, fileName: string, durationMs: number): api.AudioClipResponse => ({
  id,
  fileName,
  durationMs,
  channels: 2,
  byteSize: 288_044,
  createdAt: '2026-10-01T10:00:00Z',
  uploadedBy: 'alice',
})

const listResponse: api.AudioListResponse = {
  clips: [clip('c1', 'spruch.wav', 1500), clip('c2', 'jingle.wav', 800)],
  used: 12,
  limit: 200,
  // An admin's listing: the whole pool, so the quota and the uploader's name both mean something.
  viewerIsAdmin: true,
  maxBytes: 5_242_880,
}

const emptyList: api.AudioListResponse = { ...listResponse, clips: [] }

const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'audio/mp4' })
const wav = new Blob([new Uint8Array([2])], { type: 'audio/wav' })

async function mounted(response: api.AudioListResponse = listResponse) {
  vi.spyOn(api, 'listClips').mockResolvedValue(response)
  const w = mount(AudioPool, { props: { base: BASE } })
  await flushPromises()
  return w
}

/** The play/stop buttons, one per row in listing order. */
const playButtons = (w: VueWrapper) => w.findAll('[data-test="play"]')

describe('AudioPool', () => {
  beforeEach(() => {
    playbacks.length = 0
    vi.restoreAllMocks()
    // happy-dom has no window.confirm at all; vi.spyOn needs a function there to wrap.
    window.confirm ??= () => false
  })

  describe('listing', () => {
    it('shows the quota, file names and durations', async () => {
      const w = await mounted()

      expect(w.get('[data-test="quota"]').text()).toContain('12 von 200')
      const rows = w.findAll('[data-test="clip-row"]')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.text()).toContain('spruch.wav')
      expect(rows[0]!.text()).toContain('1,5 s')
      expect(rows[1]!.text()).toContain('0,8 s')
    })

    it('hides the quota and the uploader from someone who only sees their own', async () => {
      const w = await mounted({ ...listResponse, viewerIsAdmin: false })

      expect(w.find('[data-test="quota"]').exists()).toBe(false)
      // The clip is still there -- only the name under it goes.
      expect(w.text()).toContain('spruch.wav')
      expect(w.text()).not.toContain('alice')
    })

    it('names the uploader to an admin', async () => {
      const w = await mounted()

      expect(w.findAll('[data-test="clip-row"]')[0]!.text()).toContain('alice')
    })

    it('shows a message when the initial listing fails to load', async () => {
      vi.spyOn(api, 'listClips').mockRejectedValue(new Error('boom'))

      const w = mount(AudioPool, { props: { base: BASE } })
      await flushPromises()

      expect(w.text()).toContain('Audio konnte nicht geladen werden.')
    })
  })

  describe('playback', () => {
    it('loads nothing until a play button is tapped', async () => {
      const w = await mounted()
      const [playback] = playbacks
      expect(playback!.setSource).not.toHaveBeenCalled()

      await playButtons(w)[0]!.trigger('click')

      expect(playback!.setSource).toHaveBeenCalledWith('/api/communities/alpha/audio/c1')
      expect(playback!.restart).toHaveBeenCalledTimes(1)
      // The source has to be there before the start, or the start has nothing to play.
      expect(playback!.setSource.mock.invocationCallOrder[0]).toBeLessThan(
        playback!.restart.mock.invocationCallOrder[0]!,
      )
    })

    it('a second tap on the same row stops it', async () => {
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      expect(playButtons(w)[0]!.attributes('aria-label')).toBe('Anhalten')
      await playButtons(w)[0]!.trigger('click')

      expect(playback!.pause).toHaveBeenCalledTimes(1)
      expect(playback!.restart).toHaveBeenCalledTimes(1)
      expect(playButtons(w)[0]!.attributes('aria-label')).toBe('Abspielen')
    })

    it('tapping another row switches to it', async () => {
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      await playButtons(w)[1]!.trigger('click')

      expect(playback!.setSource).toHaveBeenLastCalledWith('/api/communities/alpha/audio/c2')
      expect(playback!.restart).toHaveBeenCalledTimes(2)
      expect(playback!.pause).not.toHaveBeenCalled()
      expect(playButtons(w)[0]!.attributes('aria-label')).toBe('Abspielen')
      expect(playButtons(w)[1]!.attributes('aria-label')).toBe('Anhalten')
    })

    it('keeps the new row marked when loading its source silences the old one', async () => {
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      playback!.playing.value = true
      await flushPromises()
      // What the real `setSource` does to a clip that is sounding.
      playback!.setSource.mockImplementation(() => {
        playback!.playing.value = false
      })

      await playButtons(w)[1]!.trigger('click')
      await flushPromises()

      expect(playButtons(w)[1]!.attributes('aria-label')).toBe('Anhalten')
    })

    it('goes back to the play symbol when the clip ends by itself', async () => {
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      playback!.playing.value = true
      await flushPromises()
      playback!.playing.value = false
      await flushPromises()

      expect(playButtons(w)[0]!.attributes('aria-label')).toBe('Abspielen')
    })
  })

  describe('deleting', () => {
    it('asks before deleting, because it is final', async () => {
      const remove = vi.spyOn(api, 'deleteClip').mockResolvedValue(undefined as never)
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const w = await mounted()

      await w.get('[data-test="delete"]').trigger('click')

      expect(confirm).toHaveBeenCalledWith('Diese Datei endgültig löschen?')
      expect(remove).not.toHaveBeenCalled()
    })

    it('deletes on a confirmed click and reloads the listing', async () => {
      const remove = vi.spyOn(api, 'deleteClip').mockResolvedValue(undefined as never)
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const w = await mounted()
      vi.spyOn(api, 'listClips').mockResolvedValue({
        ...listResponse,
        clips: [listResponse.clips[1]!],
        used: 11,
      })

      await w.get('[data-test="delete"]').trigger('click')
      await flushPromises()

      expect(remove).toHaveBeenCalledWith(BASE, 'c1')
      expect(w.get('[data-test="quota"]').text()).toContain('11 von 200')
      expect(w.findAll('[data-test="clip-row"]')).toHaveLength(1)
    })

    it('deleting the clip that is playing stops it first', async () => {
      const remove = vi.spyOn(api, 'deleteClip').mockResolvedValue(undefined as never)
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      await w.get('[data-test="delete"]').trigger('click')
      await flushPromises()

      expect(playback!.pause).toHaveBeenCalledTimes(1)
      expect(playback!.pause.mock.invocationCallOrder[0]).toBeLessThan(
        remove.mock.invocationCallOrder[0]!,
      )
    })

    it('leaves a clip that is not the deleted one playing', async () => {
      vi.spyOn(api, 'deleteClip').mockResolvedValue(undefined as never)
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[1]!.trigger('click')
      await w.get('[data-test="delete"]').trigger('click')
      await flushPromises()

      expect(playback!.pause).not.toHaveBeenCalled()
    })

    it('does not stop a clip when the question is declined', async () => {
      vi.spyOn(api, 'deleteClip').mockResolvedValue(undefined as never)
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const w = await mounted()
      const [playback] = playbacks

      await playButtons(w)[0]!.trigger('click')
      await w.get('[data-test="delete"]').trigger('click')

      expect(playback!.pause).not.toHaveBeenCalled()
    })

    it('says so when the deletion fails', async () => {
      vi.spyOn(api, 'deleteClip').mockRejectedValue(new Error('boom'))
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const w = await mounted()

      await w.get('[data-test="delete"]').trigger('click')
      await flushPromises()

      expect(w.text()).toContain('Löschen fehlgeschlagen.')
    })
  })

  describe('uploading', () => {
    it('offers the system picker for audio, several files at once', async () => {
      const w = await mounted()

      const picker = w.get('[data-test="picker"]')
      expect(picker.attributes('accept')).toBe('audio/*')
      expect(picker.attributes('multiple')).toBeDefined()
      expect(w.text()).toContain('Audiodateien auswählen')
    })

    it("keeps the picker disabled until the pool's limit is known", async () => {
      let answer: (response: api.AudioListResponse) => void = () => {}
      vi.spyOn(api, 'listClips').mockReturnValue(new Promise((resolve) => (answer = resolve)))

      const w = mount(AudioPool, { props: { base: BASE } })
      await flushPromises()
      expect(w.get('[data-test="picker"]').attributes('disabled')).toBeDefined()

      answer(listResponse)
      await flushPromises()
      expect(w.get('[data-test="picker"]').attributes('disabled')).toBeUndefined()
    })

    it('a picked file goes through prepareWav and uploads under its own name', async () => {
      const prepare = vi.spyOn(intake, 'prepareWav').mockResolvedValue(wav)
      const send = vi.spyOn(upload, 'uploadFile').mockResolvedValue(listResponse.clips[0]!)
      const w = await mounted(emptyList)
      const listing = vi.mocked(api.listClips)
      listing.mockClear()

      const picked = file('a.m4a')
      await exposed(w).enqueue([picked])
      await flushPromises()

      expect(prepare).toHaveBeenCalledWith(picked, 5_242_880)
      expect(send).toHaveBeenCalledWith(BASE, wav, 'a.m4a', expect.any(Function))
      expect(w.get('[data-test="queue-row"]').text()).toContain('Fertig')
      // The whole batch is through: the listing and the quota catch up.
      expect(listing).toHaveBeenCalledTimes(1)
    })

    it('a browser-side refusal names its reason and sends nothing', async () => {
      vi.spyOn(intake, 'prepareWav')
        .mockRejectedValueOnce(new upload.UploadError('UNDECODABLE', 0))
        .mockResolvedValueOnce(wav)
      const send = vi.spyOn(upload, 'uploadFile').mockResolvedValue(listResponse.clips[0]!)
      const w = await mounted(emptyList)

      await exposed(w).enqueue([file('bad.m4a'), file('good.m4a')])
      await flushPromises()

      const rows = w.findAll('[data-test="queue-row"]')
      expect(rows[0]!.text()).toContain('Dein Browser kann diese Datei nicht abspielen.')
      // The second file runs on: one refusal does not take the rest of the queue with it.
      expect(rows[1]!.text()).toContain('Fertig')
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(BASE, wav, 'good.m4a', expect.any(Function))
    })

    it("the size refusal names the pool's own limit", async () => {
      vi.spyOn(intake, 'prepareWav').mockRejectedValue(new upload.UploadError('TOO_LARGE', 0))
      const send = vi.spyOn(upload, 'uploadFile')
      const w = await mounted(emptyList)

      await exposed(w).enqueue([file('long.m4a')])
      await flushPromises()

      expect(w.get('[data-test="queue-row"]').text()).toContain(
        'Zu lang (höchstens 5 MB als WAV, etwa 27 s Stereo).',
      )
      expect(send).not.toHaveBeenCalled()
    })

    it('builds the size refusal from whatever limit the listing reported', async () => {
      vi.spyOn(intake, 'prepareWav').mockRejectedValue(new upload.UploadError('TOO_LARGE', 0))
      const w = await mounted({ ...emptyList, maxBytes: 3 * 1024 * 1024 })

      await exposed(w).enqueue([file('long.m4a')])
      await flushPromises()

      expect(w.get('[data-test="queue-row"]').text()).toContain(
        'Zu lang (höchstens 3 MB als WAV, etwa 16 s Stereo).',
      )
    })

    it.each([
      ['UNSUPPORTED_FORMAT', 'Dieses Format nimmt der Server nicht an.'],
      ['BROKEN_AUDIO', 'Die Datei ließ sich nicht lesen.'],
      ['TOO_LONG', 'Zu lang (höchstens 60 s).'],
      ['POOL_FULL', 'Der Pool ist voll.'],
      ['DUPLICATE', 'Diese Datei ist schon im Pool.'],
      ['NETWORK', 'Verbindung unterbrochen.'],
      ['SOMETHING_NEW', 'Upload fehlgeschlagen.'],
    ])('words %s as „%s“', async (code, sentence) => {
      vi.spyOn(intake, 'prepareWav').mockResolvedValue(wav)
      vi.spyOn(upload, 'uploadFile').mockRejectedValue(new upload.UploadError(code, 422))
      const w = await mounted(emptyList)

      await exposed(w).enqueue([file('a.m4a')])
      await flushPromises()

      expect(w.get('[data-test="queue-row"]').text()).toContain(sentence)
    })
  })
})
