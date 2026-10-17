package org.unividuell.countdown.core.imagepool.internal

import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * Plain class, like `game`'s RoundAssetRow: ByteArray equality is identity, and nothing ever
 * compares two images. [communityId] null means the global pool.
 */
@Table(schema = "imagepool", name = "images")
class Image(
    @Id
    val id: UUID? = null,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val mediaType: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val sha256: ByteArray,
    val bytes: ByteArray,
    val thumbBytes: ByteArray,
    @CreatedDate
    val createdAt: Instant? = null,
)
