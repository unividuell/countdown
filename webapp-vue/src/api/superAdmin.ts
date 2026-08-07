import { apiFetch } from '@/api/client'
import type {
  SuperAdminCommunity,
  SuperAdminUser,
  SuperAdminUserDetail,
  SuperAdminUserListEntry,
} from '@/api/types'

export const listSuperAdmins = () => apiFetch<SuperAdminUser[]>('/api/super-admin/super-admins')
export const listAllCommunities = () =>
  apiFetch<SuperAdminCommunity[]>('/api/super-admin/communities')

export const listUsers = () => apiFetch<SuperAdminUserListEntry[]>('/api/super-admin/users')
export const getUser = (id: string) =>
  apiFetch<SuperAdminUserDetail>(`/api/super-admin/users/${id}`)
export const setCommunityCreation = (id: string, allowed: boolean) =>
  apiFetch<SuperAdminUserDetail>(`/api/super-admin/users/${id}/community-creation`, {
    method: 'PUT',
    body: JSON.stringify({ allowed }),
  })
