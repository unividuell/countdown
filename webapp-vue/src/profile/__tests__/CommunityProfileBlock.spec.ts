import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import * as api from '@/api/profile'

enableAutoUnmount(afterEach)

vi.mock('@/api/profile', () => ({
  getMemberProfile: vi.fn(),
  putMemberProfile: vi.fn(),
  deleteMemberProfile: vi.fn(),
  previewMemberAvatar: vi.fn(),
}))

const inherited = {
  displayName: null,
  bgColorHex: null,
  identity: { username: 'Amy Wong', avatar: { shortName: 'AMYW', bgColorHex: '#123456' } },
}
const overridden = {
  displayName: 'Zwerg',
  bgColorHex: '#8e44ad',
  identity: { username: 'Zwerg', avatar: { shortName: 'ZWRG', bgColorHex: '#8e44ad' } },
}

const render = () =>
  mount(CommunityProfileBlock, { props: { slug: 'team', communityName: 'Team' } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getMemberProfile).mockResolvedValue({ ...inherited })
  vi.mocked(api.putMemberProfile).mockResolvedValue({ ...overridden })
  vi.mocked(api.deleteMemberProfile).mockResolvedValue(undefined)
  vi.mocked(api.previewMemberAvatar).mockResolvedValue({ ...overridden.identity })
})

describe('CommunityProfileBlock', () => {
  it('starts switched off when nothing is overridden, and shows what applies instead', async () => {
    const w = render()
    await flushPromises()

    expect((w.get('[data-test="override-switch"]').element as HTMLInputElement).checked).toBe(false)
    expect(w.find('[data-test="override-name"]').exists()).toBe(false)
    expect(w.get('[data-test="override-inherited"]').text()).toContain('Amy Wong')
  })

  it('starts switched on and prefilled when an override is stored', async () => {
    vi.mocked(api.getMemberProfile).mockResolvedValue({ ...overridden })
    const w = render()
    await flushPromises()

    expect((w.get('[data-test="override-switch"]').element as HTMLInputElement).checked).toBe(true)
    expect((w.get('[data-test="override-name"]').element as HTMLInputElement).value).toBe('Zwerg')
  })

  it('switching on prefills with what applies today rather than emptying the field', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)

    expect((w.get('[data-test="override-name"]').element as HTMLInputElement).value).toBe(
      'Amy Wong',
    )
    expect((w.get('[data-test="override-color"]').element as HTMLInputElement).value).toBe(
      '#123456',
    )
  })

  it('the switch alone writes nothing', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)

    expect(api.putMemberProfile).not.toHaveBeenCalled()
    expect(api.deleteMemberProfile).not.toHaveBeenCalled()
  })

  it('saving while switched on writes the override', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)
    await w.get('[data-test="override-name"]').setValue('Zwerg')
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(api.putMemberProfile).toHaveBeenCalledWith('team', {
      displayName: 'Zwerg',
      bgColorHex: '#123456',
    })
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('saving while switched off clears the override', async () => {
    vi.mocked(api.getMemberProfile).mockResolvedValue({ ...overridden })
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(false)
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(api.deleteMemberProfile).toHaveBeenCalledWith('team')
    expect(api.putMemberProfile).not.toHaveBeenCalled()
  })

  it('shows a message when saving fails', async () => {
    vi.mocked(api.putMemberProfile).mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-test="override-error"]').text()).toContain('fehlgeschlagen')
  })
})
