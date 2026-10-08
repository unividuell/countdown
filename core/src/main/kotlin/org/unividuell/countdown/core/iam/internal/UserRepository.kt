package org.unividuell.countdown.core.iam.internal

import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.iam.User
import java.util.UUID

interface UserRepository : CrudRepository<User, UUID> {
    fun findByProviderAndSubject(provider: String, subject: String): User?

    /**
     * One sign-in in one statement: inserts the identity's row, or updates the provider's fields and
     * the super-admin flag of the existing one. Two first sign-ins of one identity meet in the
     * unique key instead of in a `DuplicateKeyException`, which would abort the Postgres transaction
     * it ran in. The user's own fields (`display_name`, `bg_color_hex`, `community_creation_allowed`)
     * are never written. No `@Modifying`: the statement returns the row's id.
     */
    @Query(
        """
        INSERT INTO iam.users (provider, subject, github_login, github_name, email, is_super_admin)
        VALUES (:provider, :subject, :login, :name, :email, :isSuperAdmin)
        ON CONFLICT (provider, subject) DO UPDATE SET
            github_login = EXCLUDED.github_login,
            github_name = EXCLUDED.github_name,
            email = EXCLUDED.email,
            is_super_admin = EXCLUDED.is_super_admin,
            updated_at = now()
        RETURNING id
        """,
    )
    fun upsertIdentity(
        provider: String,
        subject: String,
        login: String,
        name: String?,
        email: String?,
        isSuperAdmin: Boolean,
    ): UUID

    /**
     * Explicit SQL rather than a derived `findByIsSuperAdminTrue()`: the property is already
     * named `isSuperAdmin`, and Spring Data strips a leading `Is` as a keyword, so the derived
     * name is ambiguous.
     */
    @Query("SELECT * FROM iam.users WHERE is_super_admin = true")
    fun findSuperAdmins(): List<User>

    /**
     * Lowercased match within one provider, because the allowlist grants the role per provider and
     * case-insensitively — `github:BossUser` must find a stored GitHub `bossuser`, never a test user
     * of that name. Never call with an empty collection: it renders `IN ()`, which is a SQL syntax
     * error.
     */
    @Query("SELECT * FROM iam.users WHERE provider = :provider AND lower(github_login) IN (:logins)")
    fun findByProviderAndGithubLoginLowercaseIn(provider: String, logins: Collection<String>): List<User>
}
