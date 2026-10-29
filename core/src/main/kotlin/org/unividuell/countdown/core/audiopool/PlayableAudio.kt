package org.unividuell.countdown.core.audiopool

import java.util.UUID

/**
 * The clips a community plays with: its own, and the global ones only when it has none. An
 * extension, not an interface method: tests that mock [AudioPoolQuery] keep working with
 * `candidateIds` stubbed alone.
 */
fun AudioPoolQuery.playableIds(communityId: UUID): List<UUID> =
    candidateIds(communityId).ifEmpty { candidateIds(null) }
