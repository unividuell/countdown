// Remembers where a user was headed when the auth guard bounced them to /login, so the
// post-login resolver can return them there. Uses sessionStorage so it survives the full-page
// OAuth / test-picker round-trip (same tab, same origin). Only internal paths are accepted
// (open-redirect guard), and never `/` or `/login*` (no point / would loop).
const KEY = 'postLoginRedirect'

function isSafeInternalPath(path: string): boolean {
  return (
    path.startsWith('/') && !path.startsWith('//') && path !== '/' && !path.startsWith('/login')
  )
}

export function stashPostLoginRedirect(path: string): void {
  if (!isSafeInternalPath(path)) return
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    // sessionStorage unavailable — silently fall back to the default landing
  }
}

/** Returns the stashed destination once (clearing it), or null. Re-validates for safety. */
export function consumePostLoginRedirect(): string | null {
  let value: string | null = null
  try {
    value = sessionStorage.getItem(KEY)
    if (value !== null) sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  return value !== null && isSafeInternalPath(value) ? value : null
}
