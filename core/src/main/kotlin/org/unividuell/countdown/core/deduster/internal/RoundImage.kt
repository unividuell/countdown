package org.unividuell.countdown.core.deduster.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/** Plain class: ByteArray equality is identity. Written only through the repository's insert. */
@Table(schema = "deduster", name = "round_images")
class RoundImage(
    @Id
    val roundGameId: UUID,
    val mediaType: String,
    val bytes: ByteArray,
    val createdAt: Instant? = null,
)

/** Two columns, no id: see `songsnippet`'s and `imagepool`'s byte projections. */
class RoundImageBytes(val mediaType: String, val bytes: ByteArray)
