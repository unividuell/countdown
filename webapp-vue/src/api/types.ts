export interface MeResponse {
  id: string
  username: string
  githubLogin: string
  githubName: string | null
  email: string | null
  bgColorHex: string | null
  isSuperAdmin: boolean
  createdAt: string | null
}

export interface UpdateProfileRequest {
  displayName: string | null
  bgColorHex: string | null
}

export interface CommunityResponse {
  id: string
  name: string
  slug: string
  startsAt: string | null
  phaseTwoStartRound: number | null
  viewerIsAdmin: boolean
  pendingCount: number
}
export interface CommunitySummary {
  id: string
  name: string
  slug: string
}
export interface MemberResponse {
  userId: string
  username: string
  status: 'PENDING' | 'ACTIVE'
  isAdmin: boolean
}
export interface InviteResponse {
  url: string
  expiresAt: string
}
export interface AcceptResponse {
  status: 'JOINED_PENDING' | 'ALREADY_PENDING' | 'ALREADY_ACTIVE'
  name: string
  slug: string
}
