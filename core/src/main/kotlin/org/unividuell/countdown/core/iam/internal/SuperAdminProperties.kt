package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app")
open class SuperAdminProperties(
    /** GitHub logins granted ROLE_SUPER_ADMIN. Re-evaluated on every login. */
    val superAdminGithubLogins: List<String> = emptyList(),
) {
    open fun isSuperAdmin(login: String): Boolean =
        superAdminGithubLogins.any { it.isNotBlank() && it.equals(login, ignoreCase = true) }
}
