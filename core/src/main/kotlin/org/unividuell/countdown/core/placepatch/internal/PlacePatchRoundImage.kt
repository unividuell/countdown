package org.unividuell.countdown.core.placepatch.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/** Plain class: ByteArray equality is identity. Written only through the repository's insert. */
@Table(schema = "placepatch", name = "round_images")
class PlacePatchRoundImage(
    @Id
    val roundGameId: UUID,
    val mediaType: String,
    val bytes: ByteArray,
    val createdAt: Instant? = null,
)

/** Two columns, no id: see `deduster`'s byte projection. */
class PlacePatchRoundImageBytes(val mediaType: String, val bytes: ByteArray)
