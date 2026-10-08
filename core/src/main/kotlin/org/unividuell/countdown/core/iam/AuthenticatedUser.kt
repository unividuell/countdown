package org.unividuell.countdown.core.iam

import org.unividuell.auth.AuthPrincipal

/**
 * The signed-in principal as other modules' controllers take it: the auth lib's session principal
 * (`id`, `provider`, `login`, `roles`). A snapshot from sign-in — read anything else live from the
 * row ([UserQuery]).
 */
typealias AuthenticatedUser = AuthPrincipal

/** Whether the allowlist (`unividuell.auth.roles.super-admin`) made this principal a super-admin at sign-in. */
val AuthPrincipal.isSuperAdmin: Boolean
    get() = "SUPER_ADMIN" in roles
