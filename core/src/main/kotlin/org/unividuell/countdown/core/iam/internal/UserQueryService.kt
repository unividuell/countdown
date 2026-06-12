package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

@Service
class UserQueryService(private val repository: UserRepository) : UserQuery {
    @Transactional(readOnly = true)
    override fun findById(id: UUID): User? = repository.findByIdOrNull(id)
}
