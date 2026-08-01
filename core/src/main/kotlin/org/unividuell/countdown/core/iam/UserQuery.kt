package org.unividuell.countdown.core.iam

import java.util.UUID

/** Read-only access to users, for consumption by other modules. */
interface UserQuery {
    fun findById(id: UUID): User?

    /** Batch lookup. Callers rendering many rows must use this instead of a findById per row. */
    fun findAllById(ids: Collection<UUID>): List<User>
}
