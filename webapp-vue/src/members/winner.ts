import type { RosterMemberResponse } from '@/api/types'

export function rankOf(member: RosterMemberResponse): number {
  return member.points.stable + (member.points.live?.points ?? 0)
}

export function winners(members: readonly RosterMemberResponse[]): RosterMemberResponse[] {
  const top = members.reduce((max, member) => Math.max(max, rankOf(member)), 0)
  if (top <= 0) return []
  return members.filter((member) => rankOf(member) === top)
}

export function formatWinnerNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const last = names[names.length - 1] ?? ''
  return `${names.slice(0, -1).join(', ')} und ${last}`
}
