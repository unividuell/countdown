import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as client from '@/api/client'
import { ApiError } from '@/api/client'
import LabGate from '@/gamelab/LabGate.vue'

function mountGate() {
  return mount(LabGate, {
    props: { title: 'Karten-Labor' },
    slots: { default: '<p data-test="inside">drin</p>' },
  })
}

describe('LabGate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('asks the server once', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never)
    mountGate()
    await flushPromises()
    expect(spy).toHaveBeenCalledExactlyOnceWith('/api/lab')
  })

  it('shows nothing while the answer is pending', () => {
    vi.spyOn(client, 'apiFetch').mockReturnValue(new Promise(() => {}))
    const w = mountGate()
    expect(w.text()).toBe('')
  })

  it('shows the lab where the server has it', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never)
    const w = mountGate()
    await flushPromises()
    expect(w.find('[data-test="inside"]').exists()).toBe(true)
  })

  it('says the lab is off on 404', async () => {
    vi.spyOn(client, 'apiFetch').mockRejectedValue(new ApiError(404, 'not found'))
    const w = mountGate()
    await flushPromises()
    expect(w.find('[data-test="inside"]').exists()).toBe(false)
    expect(w.get('[data-test="lab-unavailable"]').text()).toContain('Karten-Labor nicht verfügbar')
  })

  // A 500 or a timeout says nothing about the environment, so it must not claim the lab is off.
  it('reports any other failure as such', async () => {
    vi.spyOn(client, 'apiFetch').mockRejectedValue(new ApiError(500, 'boom'))
    const w = mountGate()
    await flushPromises()
    expect(w.find('[data-test="inside"]').exists()).toBe(false)
    expect(w.find('[data-test="lab-unavailable"]').exists()).toBe(false)
    expect(w.get('[data-test="lab-gate-error"]').text()).toContain('nicht erreichbar')
  })
})
