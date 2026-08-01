import { apiFetch } from '@/api/client'
import type { SuperAdminCommunity, SuperAdminUser } from '@/api/types'

export const listSuperAdmins = () => apiFetch<SuperAdminUser[]>('/api/super-admin/super-admins')
export const listAllCommunities = () =>
  apiFetch<SuperAdminCommunity[]>('/api/super-admin/communities')
