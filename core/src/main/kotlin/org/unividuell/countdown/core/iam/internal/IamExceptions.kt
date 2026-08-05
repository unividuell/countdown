package org.unividuell.countdown.core.iam.internal

/**
 * The session carries a principal whose user row is gone → 401. The SPA's 401 handler drops the
 * local auth state and routes to login, which is exactly the right outcome for a dead session.
 */
class StaleSessionException(message: String) : RuntimeException(message)

/** No user with that id → 404. */
class UserNotFoundException(message: String) : RuntimeException(message)
