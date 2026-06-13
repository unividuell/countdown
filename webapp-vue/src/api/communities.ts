import { apiFetch } from '@/api/client'
import type { AcceptResponse, CommunityResponse, CommunitySummary, InviteResponse, MemberResponse } from '@/api/types'

export const listCommunities = () => apiFetch<CommunitySummary[]>('/api/communities')
export const getSelection = () => apiFetch<{ communityId: string | null }>('/api/communities/selection')
export const setSelection = (communityId: string) =>
  apiFetch<void>('/api/communities/selection', { method: 'PUT', body: JSON.stringify({ communityId }) })
export const createCommunity = (name: string) =>
  apiFetch<CommunityResponse>('/api/communities', { method: 'POST', body: JSON.stringify({ name }) })
export const getCommunity = (slug: string) => apiFetch<CommunityResponse>(`/api/communities/${slug}`)
export const updateCommunity = (slug: string, body: Partial<{ name: string; startsAt: string; phaseTwoStartRound: number }>) =>
  apiFetch<CommunityResponse>(`/api/communities/${slug}`, { method: 'PATCH', body: JSON.stringify(body) })
export const generateInvite = (slug: string) =>
  apiFetch<InviteResponse>(`/api/communities/${slug}/invite`, { method: 'POST' })
export const joinByToken = (token: string) =>
  apiFetch<AcceptResponse>(`/api/communities/join/${token}`, { method: 'POST' })
export const listMembers = (slug: string) => apiFetch<MemberResponse[]>(`/api/communities/${slug}/members`)
export const approveMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/approve`, { method: 'POST' })
export const promoteMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/promote`, { method: 'POST' })
export const demoteMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}/demote`, { method: 'POST' })
export const removeMember = (slug: string, userId: string) =>
  apiFetch<void>(`/api/communities/${slug}/members/${userId}`, { method: 'DELETE' })
