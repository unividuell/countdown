package org.unividuell.countdown.core.audiopool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.audiopool.AudioPoolQuery
import java.util.UUID

@Service
class AudioPoolQueryService(private val clips: AudioClipRepository) : AudioPoolQuery {

    @Transactional(readOnly = true)
    override fun candidateIds(communityId: UUID?): List<UUID> = clips.idsInPool(communityId)

    @Transactional(readOnly = true)
    override fun wav(id: UUID): ByteArray? = clips.findWav(id)
}
