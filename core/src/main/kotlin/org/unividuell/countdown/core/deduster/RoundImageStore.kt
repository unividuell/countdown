package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.deduster.internal.RoundImageRepository
import java.util.UUID

/** A round's frozen photo. Plain class: ByteArray equality is identity. */
class StoredImage(val mediaType: String, val bytes: ByteArray)

/**
 * Written once at announcement, read by every viewer, kept as long as the round is shown: the
 * history renders past rounds, and an Entstauber without its photo is an empty grid.
 */
@Component
class RoundImageStore(private val repository: RoundImageRepository) {

    @Transactional
    fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID): StoredImage? =
        repository.findBytes(roundGameId)?.let { StoredImage(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
