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
    // One button everywhere; the server decides (real GitHub in prod, test-user picker in non-prod).
    window.location.assign('/login/github')
  }

  async function logout(): Promise<void> {
    // Intentional: on a failed server call we do NOT reset local state — the session
    // may still be alive server-side, so we keep status 'authenticated' and let the
    // caller surface the error / retry.
    await apiFetch<void>('/logout', { method: 'POST' })
    user.value = null
    status.value = 'anonymous'
  }

  // A 401 means the session is dead server-side: drop local auth state.
  // (Distinct from logout failure, where we intentionally keep state.)
  function markAnonymous(): void {
    user.value = null
    status.value = 'anonymous'
  }

  return {
    user: readonly(user),
    status: readonly(status),
    bootstrap,
    loginWithGitHub,
    logout,
    markAnonymous,
  }
}

/** Test-only: reset the module-level singleton between test cases. */
export function _resetAuthState(): void {
  user.value = null
  status.value = 'unknown'
}
