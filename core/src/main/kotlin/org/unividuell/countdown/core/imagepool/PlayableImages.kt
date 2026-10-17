package org.unividuell.countdown.core.imagepool

import java.util.UUID

/**
 * The images a community plays with: its own, and the global ones only when it has none — how
 * every game picks. An extension, not an interface method: tests that mock [ImagePoolQuery] keep
 * working with `candidateIds` stubbed alone.
 */
fun ImagePoolQuery.playableIds(communityId: UUID): List<UUID> =
    candidateIds(communityId).ifEmpty { candidateIds(null) }
