package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app")
open class SuperAdminProperties(
    /** GitHub logins granted ROLE_SUPER_ADMIN. Re-evaluated on every login. */
    val superAdminGithubLogins: List<String> = emptyList(),
) {
    /**
     * [superAdminGithubLogins] trimmed and with blank entries dropped — the one normalised view
     * every consumer should compare or key against, so "alice, bob" (space left after the comma)
     * still grants bob the role instead of silently denying it and leaking a phantom " bob" row
     * from the roster endpoint.
     */
    open val normalizedSuperAdminGithubLogins: List<String>
        get() = superAdminGithubLogins.map { it.trim() }.filter { it.isNotBlank() }

    open fun isSuperAdmin(login: String): Boolean =
        normalizedSuperAdminGithubLogins.any { it.equals(login, ignoreCase = true) }
}
