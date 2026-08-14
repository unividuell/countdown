/** How this user is drawn — resolved by the server, identical to what the roster shows. */
export interface AvatarView {
  shortName: string
  bgColorHex: string
}

export interface MeResponse {
  id: string
  username: string
  githubLogin: string
  githubName: string | null
  email: string | null
  /** The colour the user picked; null means they picked none. Not what to paint with. */
  bgColorHex: string | null
  avatar: AvatarView
  isSuperAdmin: boolean
  /** Effective permission: the stored clearance, or super-admin. */
  mayCreateCommunities: boolean
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
  startsAtTimezone: string
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

export interface RosterPoints {
  stable: number
  /** Absent when the viewer may not see live points, or when the member has not played the round. */
  live?: number
}
export interface RosterMemberResponse {
  userId: string
  shortName: string
  fullName: string
  bgColorHex: string
  points: RosterPoints
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

/**
 * Shared by `CountdownResponse` and `RoundResponse`, whose server-side DTOs
 * (`countdown.internal.RoundDto` and `game.internal.RoundDto`) are deliberately two separate
 * Kotlin types — each module's wire format may drift from the other's without a shared type
 * forcing them together. The client has one consumer, and the shapes are identical today; if
 * that ever stops being true, TypeScript will say so at the call site that first disagrees.
 */
export interface Round {
  /** Signed T-offset. A larger number is *earlier* in time. */
  number: number
  label: string
  start: string
  end: string
}
export interface CountdownResponse {
  serverNow: string
  startsAt: string | null
  startsAtTimezone: string
  round: Round | null
  nextRound: Round | null
}

export interface SuperAdminMember {
  userId: string
  username: string
  githubLogin: string
  status: 'PENDING' | 'ACTIVE'
  isAdmin: boolean
  joinedAt: string | null
}
export interface SuperAdminCommunity {
  id: string
  name: string
  slug: string
  startsAt: string | null
  startsAtTimezone: string
  createdAt: string | null
  members: SuperAdminMember[]
}
/**
 * `flagged` is the is_super_admin column, `allowlisted` is membership in
 * SUPER_ADMIN_GITHUB_LOGINS. They drift because the flag is re-derived on every login.
 */
export interface SuperAdminUser {
  githubLogin: string
  username: string | null
  userId: string | null
  flagged: boolean
  allowlisted: boolean
  createdAt: string | null
}

/**
 * `communityCreationAllowed` is the raw column, not the effective permission — a super-admin may
 * create communities regardless, which `isSuperAdmin` reports separately.
 */
export interface SuperAdminUserListEntry {
  userId: string
  username: string
  githubLogin: string
  isSuperAdmin: boolean
  communityCreationAllowed: boolean
  createdAt: string | null
}
export interface SuperAdminUserDetail {
  userId: string
  username: string
  githubLogin: string
  githubName: string | null
  displayName: string | null
  email: string | null
  bgColorHex: string | null
  isSuperAdmin: boolean
  communityCreationAllowed: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type NoGameReason = 'NOT_SCHEDULED' | 'BEFORE_WINDOW' | 'AFTER_WINDOW' | 'NO_GAME_TYPE'
export type AwardRule = 'ALL_QUALIFYING' | 'CLOSEST_ONLY'

export interface GameDto {
  id: string
  displayName: string
  /** True when this round wants a deliberate reveal — then it may be revealed exactly once. */
  requiresReveal: boolean
}

export interface PlayDto {
  userId: string
  username: string
  avatar: AvatarView
  revealedAt: string
  guessedAt: string | null
  guess: unknown
  /** The game's own shape. `null` for a game that judges without saying anything. */
  outcome: unknown
  /** `null` until the round is scored; `0` means „played and came away empty“. */
  points: number | null
}

export interface RoundResponse {
  /** `null` when there is no grid at all — no run, or no target date. */
  round: Round | null
  game: GameDto | null
  noGameReason: NoGameReason | null
  /** Only once the viewer has revealed. The shape belongs to the game. */
  payload: unknown
  /** Only once the viewer has guessed. */
  solution: unknown
  me: PlayDto | null
  /** Empty until the viewer has guessed — withheld by the server, not filtered here. */
  others: PlayDto[]
  /** `null` exactly when there is no game. Under `CLOSEST_ONLY` a score is provisional. */
  awardRule: AwardRule | null
  awardPoints: number | null
}
