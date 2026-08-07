/**
 * The only place that knows where community URLs live. Every link, redirect and guard goes
 * through here so the scheme is one edit, not a search across the app.
 */
export type CommunitySubPage = 'members' | 'requests' | 'settings'

export function communityPath(slug: string, sub?: CommunitySubPage): string {
  return sub ? `/c/${slug}/${sub}` : `/c/${slug}/`
}
