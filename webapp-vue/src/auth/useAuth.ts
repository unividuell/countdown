import { readonly, ref } from 'vue'
import { ApiError, apiFetch } from '@/api/client'
import type { MeResponse } from '@/api/types'

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

const user = ref<MeResponse | null>(null)
const status = ref<AuthStatus>('unknown')

export function useAuth() {
  async function bootstrap(): Promise<void> {
    try {
      user.value = await apiFetch<MeResponse>('/api/me')
      status.value = 'authenticated'
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        user.value = null
        status.value = 'anonymous'
        return
      }
      throw error
    }
  }

  function loginWithGitHub(): void {
    window.location.assign('/oauth2/authorization/github')
  }

  async function logout(): Promise<void> {
    await apiFetch<void>('/logout', { method: 'POST' })
    user.value = null
    status.value = 'anonymous'
  }

  return { user: readonly(user), status: readonly(status), bootstrap, loginWithGitHub, logout }
}
