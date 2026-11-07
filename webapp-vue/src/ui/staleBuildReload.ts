import type { Router } from 'vue-router'

// A tab open across a deploy still runs the old build, whose lazy route chunks
// (`super-admin-<oldhash>.js`) no longer exist. The import 404s, the router aborts
// the navigation, and the click does nothing. A full load of the target fetches
// the new index.html and with it the current chunk names.

// Each engine words the failed import differently.
const STALE_CHUNK = /dynamically imported module|Importing a module script failed/

const RELOADED_KEY = 'staleBuildReload'

export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && STALE_CHUNK.test(error.message)
}

export function registerStaleBuildReload(
  router: Router,
  reload: (path: string) => void = (path) => window.location.assign(path),
): void {
  router.onError((error, to) => {
    if (!isStaleChunkError(error)) return

    // One reload per target: if the chunk is missing after a fresh load too,
    // reloading again would loop forever. Without storage there is no guard,
    // so no reload either.
    if (read() === to.fullPath || !write(to.fullPath)) return

    reload(to.fullPath)
  })

  // A landed navigation re-arms the guard for the next deploy.
  router.afterEach((_to, _from, failure) => {
    if (!failure) remove()
  })
}

// Storage can throw (private mode, blocked site data).
function read(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_KEY)
  } catch {
    return null
  }
}

function write(path: string): boolean {
  try {
    sessionStorage.setItem(RELOADED_KEY, path)
    return true
  } catch {
    return false
  }
}

function remove(): void {
  try {
    sessionStorage.removeItem(RELOADED_KEY)
  } catch {
    // nothing to re-arm
  }
}
