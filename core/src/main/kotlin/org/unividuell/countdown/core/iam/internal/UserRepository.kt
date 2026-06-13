package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.CrudRepository
import org.unividuell.countdown.core.iam.User
import java.util.UUID

interface UserRepository : CrudRepository<User, UUID> {
    fun findByGithubId(githubId: Long): User?
    fun findByGithubLogin(githubLogin: String): User?
}
