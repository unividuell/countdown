package org.unividuell.countdown.core.iam

import java.util.UUID

/** Read-only access to users, for consumption by other modules. */
interface UserQuery {
    fun findById(id: UUID): User?

    /** Batch lookup. Callers rendering many rows must use this instead of a findById per row. */
    fun findAllById(ids: Collection<UUID>): List<User>

    /**
     * Effective permission to create communities: the stored clearance, or super-admin.
     * Read live and never from [AuthenticatedUser] — the principal is JDK-serialized into the
     * session, so a clearance granted after sign-in would not be visible there. Unknown id: false.
     */
    fun mayCreateCommunities(id: UUID): Boolean
}
