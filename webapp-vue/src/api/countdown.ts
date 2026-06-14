import { apiFetch } from '@/api/client'
import type { CountdownResponse } from '@/api/types'

export const getCountdown = (slug: string) =>
  apiFetch<CountdownResponse>(`/api/communities/${slug}/countdown`)
