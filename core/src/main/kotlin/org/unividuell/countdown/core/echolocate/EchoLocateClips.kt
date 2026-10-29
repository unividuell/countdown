package org.unividuell.countdown.core.echolocate

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.audiopool.AudioPoolQuery
import org.unividuell.countdown.core.audiopool.playableIds
import java.util.UUID

/**
 * The game's way into the audio pool: which clips a community can play, and a clip as the round
 * stores it. The only place `echolocate` knows the pool.
 */
@Component
class EchoLocateClips(private val pool: AudioPoolQuery) {

    fun playable(communityId: UUID): List<UUID> = pool.playableIds(communityId)

    /** `null` when the clip has been deleted since it was drawn. */
    fun prepared(id: UUID): ByteArray? = pool.wav(id)?.let(ClipPrep::prepare)
}
