package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

@Service
class UserProfileService(private val repository: UserRepository) {
    private val hexColorPattern = Regex("^#[0-9a-fA-F]{6}$")

    /**
     * Updates the caller's profile fields [displayName] and [bgColorHex]; `null` clears a field.
     * All other fields (GitHub-sourced and system fields) are preserved unchanged.
     * [bgColorHex] must match `#rrggbb` (case-insensitive); uppercase input is stored lowercased.
     */
    @Transactional
    fun update(userId: UUID, displayName: String?, bgColorHex: String?): User {
        val user = repository.findByIdOrNull(userId)
            ?: throw NoSuchElementException("user $userId not found")

        val normalizedColor = bgColorHex?.let {
            if (!hexColorPattern.matches(it)) {
                throw IllegalArgumentException("bgColorHex must be a valid hex colour in the form #rrggbb, got: $it")
            }
            it.lowercase()
        }

        return repository.save(
            user.copy(displayName = displayName, bgColorHex = normalizedColor, updatedAt = Instant.now())
        )
    }
}
