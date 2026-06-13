package org.unividuell.countdown.core.iam

import java.util.UUID

/** Minimal identity of the authenticated principal, exposed for other modules' controllers. */
interface AuthenticatedUser {
    val id: UUID
    val isSuperAdmin: Boolean
}
