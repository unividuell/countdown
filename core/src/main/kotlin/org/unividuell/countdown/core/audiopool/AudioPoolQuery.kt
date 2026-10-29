package org.unividuell.countdown.core.audiopool

import java.util.UUID

/**
 * The pool as other modules see it: which clips there are, and what one sounds like. Read-only,
 * and without a word of game knowledge — which clips a community plays is [playableIds].
 */
interface AudioPoolQuery {
    /** This pool's clip ids in a stable order. `null` addresses the global pool. */
    fun candidateIds(communityId: UUID?): List<UUID>

    /** The stored WAV, whole. `null` when the clip is gone. */
    fun wav(id: UUID): ByteArray?
}
