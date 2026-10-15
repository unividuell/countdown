package org.unividuell.countdown.core.placepatch

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.placepatch.internal.PlacePatchRoundImageRepository
import java.util.UUID

/** A round's frozen photo. Plain class: ByteArray equality is identity. */
class FrozenPhoto(val mediaType: String, val bytes: ByteArray)

/**
 * Written once at announcement, read on every board or patch request, kept as long as the round is
 * shown: the history renders past rounds, and both pictures come from this one photo.
 */
@Component
class PlacePatchImageStore(private val repository: PlacePatchRoundImageRepository) {

    @Transactional
    fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID): FrozenPhoto? =
        repository.findBytes(roundGameId)?.let { FrozenPhoto(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
