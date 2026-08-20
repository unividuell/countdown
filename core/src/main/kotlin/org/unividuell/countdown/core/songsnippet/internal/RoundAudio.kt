package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.util.UUID

/** Plain class: ByteArray equality is identity, and nothing compares audio rows. */
@Table(schema = "songsnippet", name = "round_audio")
class RoundAudio(
    @Id
    val id: UUID? = null,
    val roundGameId: UUID,
    val stage: Int,
    val mediaType: String,
    val bytes: ByteArray,
)
