package org.unividuell.countdown.core.iam.internal

import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.ProfileFields
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
            user.copy(
                displayName = ProfileFields.normalizeName(displayName),
                bgColorHex = ProfileFields.normalizeColor(bgColorHex),
                updatedAt = Instant.now(),
            )
        )
    }

    /**
     * The caller's own row, read fresh. `GET /api/me` must not answer from the session principal:
     * it is JDK-serialized at login and never refreshed, so both a granted clearance and an
     * updated display name would be stale until the next sign-in.
     */
    @Transactional(readOnly = true)
    fun current(userId: UUID): User =
        repository.findByIdOrNull(userId)
            ?: throw StaleSessionException("user $userId from the session no longer exists")

    /**
     * What `PATCH` would produce, without producing it. The candidate values replace the user's own
     * before the very same resolution runs — a preview computed by any other route could disagree
     * with what a save then does.
     */
    @Transactional(readOnly = true)
    fun preview(userId: UUID, displayName: String?, bgColorHex: String?): AvatarPreviewResponse {
        val user = repository.findByIdOrNull(userId)
            ?: throw StaleSessionException("user $userId from the session no longer exists")
        val candidate = user.copy(
            displayName = ProfileFields.normalizeName(displayName),
            bgColorHex = ProfileFields.normalizeColor(bgColorHex),
        )
        return AvatarPreviewResponse(username = candidate.username, avatar = Avatar.of(candidate))
    }
}
