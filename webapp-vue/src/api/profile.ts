import { apiFetch } from '@/api/client'
import type {
  IdentityView,
  MeResponse,
  MemberProfileResponse,
  UpdateProfileRequest,
} from '@/api/types'

export const updateProfile = (body: UpdateProfileRequest) =>
  apiFetch<MeResponse>('/api/me', { method: 'PATCH', body: JSON.stringify(body) })

export const previewAvatar = (body: UpdateProfileRequest) =>
  apiFetch<IdentityView>('/api/me/avatar-preview', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const getMemberProfile = (slug: string) =>
  apiFetch<MemberProfileResponse>(`/api/communities/${slug}/me/profile`)

export const putMemberProfile = (slug: string, body: UpdateProfileRequest) =>
  apiFetch<MemberProfileResponse>(`/api/communities/${slug}/me/profile`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteMemberProfile = (slug: string) =>
  apiFetch<void>(`/api/communities/${slug}/me/profile`, { method: 'DELETE' })

export const previewMemberAvatar = (slug: string, body: UpdateProfileRequest) =>
  apiFetch<IdentityView>(`/api/communities/${slug}/me/avatar-preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
