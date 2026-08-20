package org.unividuell.countdown.core.songsnippet

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.songsnippet.internal.RoundAudioRepository
import java.util.UUID

/** The round-audio cache: written once at materialisation, read per stage, deleted with the round. */
@Component
class SongSnippetAudioStore(private val repository: RoundAudioRepository) {

    @Transactional
    fun store(roundGameId: UUID, key: Int, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, stage = key, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID, key: Int): AudioClip? =
        repository.findByRoundGameIdAndStage(roundGameId = roundGameId, stage = key)
            ?.let { AudioClip(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
