package org.unividuell.countdown.core.audiopool.internal

import java.util.UUID

/** Which pool a request addresses, and whether the caller may see all of it. */
data class AudioPoolContext(val communityId: UUID?, val viewerIsAdmin: Boolean)
