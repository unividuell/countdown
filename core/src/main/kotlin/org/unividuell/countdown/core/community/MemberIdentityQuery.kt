package org.unividuell.countdown.core.community

import java.util.UUID

/**
 * How members of a community appear there, for consumption by other modules.
 *
 * Replaces the combination of `UserQuery` + `Avatar.of` at every call site that draws a person
 * inside a community — the roster, the round payload, the game lab. Those three must not be able
 * to disagree about what the same person looks like.
 */
interface MemberIdentityQuery {
    /** Batch lookup. Callers rendering many rows must use this instead of one call per row. */
    fun of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity>

    /** `null` when there is no user row for [userId]. */
    fun of(communityId: UUID, userId: UUID): MemberIdentity?
}
