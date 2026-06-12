package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

@Service
class UserProfileService(private val repository: UserRepository) {
    /**
     * Updates the caller's profile fields [displayName] and [bgColorHex]; `null` clears a field.
     * All other fields (GitHub-sourced and system fields) are preserved unchanged.
     */
    @Transactional
    fun update(userId: UUID, displayName: String?, bgColorHex: String?): User {
        val user = repository.findByIdOrNull(userId)
            ?: throw NoSuchElementException("user $userId not found")
        return repository.save(
            user.copy(displayName = displayName, bgColorHex = bgColorHex, updatedAt = Instant.now())
        )
    }
}
