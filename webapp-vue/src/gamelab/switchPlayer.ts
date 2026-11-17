/** The player picker, coming back to [returnPath]: shared by the drawer link and W. */
export function switchPlayerHref(returnPath: string): string {
  return `/login/start?redirect=${encodeURIComponent(returnPath)}`
}
