package org.unividuell.countdown.core.game.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * One frozen asset of a round. Plain class: ByteArray equality is identity. Written only through
 * the repository's insert; [visibility] is the column's text, mapped to a type by [RoundAssetStore].
 */
@Table(schema = "game", name = "round_assets")
class RoundAssetRow(
    @Id
    val id: UUID? = null,
    val roundGameId: UUID,
    val name: String,
    val visibility: String,
    val stage: Int?,
    val mediaType: String,
    val encryptionKey: ByteArray?,
    val bytes: ByteArray,
    val createdAt: Instant? = null,
)

/** Everything but the bytes, no id: see `RoundImageBytes`. Lets the rule and the keys read without the payload. */
class RoundAssetHeaderRow(
    val name: String,
    val visibility: String,
    val stage: Int?,
    val mediaType: String,
    val encryptionKey: ByteArray?,
)
