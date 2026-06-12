package org.unividuell.countdown.core.iam.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant

@Service
open class UserProvisioningService(
    private val repository: UserRepository,
    private val superAdminProperties: SuperAdminProperties,
) {
    /** Upserts the user from GitHub claims; never touches user-owned fields. */
    @Transactional
    open fun provision(githubId: Long, login: String, name: String?, email: String?): User {
        val isSuperAdmin = superAdminProperties.isSuperAdmin(login)
        repository.findByGithubId(githubId)?.let { existing ->
            return repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
        return try {
            repository.save(
                User(
                    githubId = githubId,
                    githubLogin = login,
                    githubName = name,
                    email = email,
                    isSuperAdmin = isSuperAdmin,
                )
            )
        } catch (e: DuplicateKeyException) {
            // a concurrent login already inserted the row: re-fetch and sync
            val existing = repository.findByGithubId(githubId)
                ?: throw IllegalStateException(
                    "DuplicateKeyException on insert but no row found for githubId=$githubId", e
                )
            repository.save(sync(existing, login, name, email, isSuperAdmin))
        }
    }

    private fun sync(existing: User, login: String, name: String?, email: String?, isSuperAdmin: Boolean): User =
        existing.copy(
            githubLogin = login,
            githubName = name,
            email = email,
            isSuperAdmin = isSuperAdmin,
            updatedAt = Instant.now(),
        )
}
