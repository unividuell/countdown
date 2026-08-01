package org.unividuell.countdown.core.iam.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.iam.User
import java.util.UUID

interface UserRepository : CrudRepository<User, UUID> {
    fun findByGithubId(githubId: Long): User?
    fun findByGithubLogin(githubLogin: String): User?
    fun findByGithubLoginIn(githubLogins: Collection<String>): List<User>

    /**
     * Explicit SQL rather than a derived `findByIsSuperAdminTrue()`: the property is already
     * named `isSuperAdmin`, and Spring Data strips a leading `Is` as a keyword, so the derived
     * name is ambiguous.
     */
    @Query("SELECT * FROM iam.users WHERE is_super_admin = true")
    fun findSuperAdmins(): List<User>

    /**
     * Lowercased match, because the allowlist grants the role case-insensitively — a configured
     * `BossUser` must find a stored `bossuser`. Never call with an empty collection: it renders
     * `IN ()`, which is a SQL syntax error.
     */
    @Query("SELECT * FROM iam.users WHERE lower(github_login) IN (:logins)")
    fun findByGithubLoginLowercaseIn(logins: Collection<String>): List<User>
}
