package org.unividuell.countdown.core.game

import java.util.Base64

/** URL-safe asset name, unique per round: `clip-0`, `board`. */
val ASSET_NAME = Regex("[a-z0-9-]+")

/**
 * Who may see an asset, frozen with its bytes. It also decides how the asset is delivered: only
 * [FromStage] travels as ciphertext with a key, the others as plain bytes.
 */
sealed interface AssetVisibility {

    /** Open to every member from the start, no key. */
    data object Scene : AssetVisibility

    /** Ciphertext open to every member; its key opens at [stage] (`0` = at the reveal). */
    data class FromStage(val stage: Int) : AssetVisibility {
        init {
            require(stage >= 0) { "stage must not be negative: $stage" }
        }
    }

    /** Open only to a player who has spent the guess (guessed or gave up), no key. */
    data object AfterGuess : AssetVisibility
}

/**
 * The viewer's state as each caller reads it from its own source (play row in a real round, snapshot
 * in the lab). [closed] means the round is over.
 */
data class AssetViewer(val closed: Boolean, val revealed: Boolean, val stage: Int, val guessed: Boolean)

/**
 * Whether the viewer may fetch the asset's bytes (ciphertext for [AssetVisibility.FromStage]).
 *
 * ```
 *               fetch
 * closed        everything
 * Scene         yes
 * FromStage     yes
 * AfterGuess    guessed
 * ```
 */
fun AssetVisibility.mayFetch(viewer: AssetViewer): Boolean {
    if (viewer.closed) return true

    return when (this) {
        AssetVisibility.Scene -> true
        is AssetVisibility.FromStage -> true
        AssetVisibility.AfterGuess -> viewer.guessed
    }
}

/**
 * Whether the viewer gets the asset's key.
 *
 * ```
 *               key
 * closed        all stage keys
 * Scene         -
 * FromStage(n)  revealed && stage >= n
 * AfterGuess    -
 * ```
 *
 * A guess does not open a stage the player never reached: it counts as nothing here.
 */
fun AssetVisibility.opensKey(viewer: AssetViewer): Boolean = when (this) {
    is AssetVisibility.FromStage -> viewer.closed || (viewer.revealed && viewer.stage >= stage)
    AssetVisibility.Scene, AssetVisibility.AfterGuess -> false
}

/**
 * An asset without its bytes. A class, not a data class: [key] is a [ByteArray], whose equality is
 * identity.
 */
class AssetHeader(val name: String, val visibility: AssetVisibility, val mediaType: String, val key: ByteArray?) {
    init {
        require((visibility is AssetVisibility.FromStage) == (key != null)) {
            "only a stage asset carries a key: $name"
        }
    }
}

/** A header with its stored bytes: ciphertext for a stage asset, plain otherwise. */
class StoredAsset(val header: AssetHeader, val bytes: ByteArray)

/** What the client needs to open a stage asset: its [key] (Base64, with padding) and the real [mediaType]. */
data class AssetKey(val key: String, val mediaType: String)

/** The keys the viewer gets, by asset name: exactly those [opensKey] opens. */
fun keysFor(headers: List<AssetHeader>, viewer: AssetViewer): Map<String, AssetKey> =
    headers
        .filter { it.visibility.opensKey(viewer) }
        .associate { header ->
            header.name to AssetKey(
                key = Base64.getEncoder().encodeToString(requireNotNull(header.key)),
                mediaType = header.mediaType,
            )
        }

/**
 * One asset as a game produces it, in plain bytes; sealing is the framework's job ([sealed]). A
 * class, not a data class: [bytes] is a [ByteArray], whose equality is identity.
 */
class RoundAsset(val name: String, val visibility: AssetVisibility, val mediaType: String, val bytes: ByteArray) {
    init {
        require(ASSET_NAME.matches(name)) { "asset name must match ${ASSET_NAME.pattern}: '$name'" }
    }
}

/** A stage asset under its own fresh key; every other asset stays plain, without a key. */
fun RoundAsset.sealed(): StoredAsset {
    if (visibility !is AssetVisibility.FromStage) {
        return StoredAsset(
            header = AssetHeader(name = name, visibility = visibility, mediaType = mediaType, key = null),
            bytes = bytes,
        )
    }

    val sealed = AssetSeal.sealFresh(bytes)

    return StoredAsset(
        header = AssetHeader(name = name, visibility = visibility, mediaType = mediaType, key = sealed.key),
        bytes = sealed.bytes,
    )
}

/** What the asset travels as: ciphertext is opaque until its key arrives, plain bytes carry their type. */
val StoredAsset.contentType: String
    get() = if (header.key != null) "application/octet-stream" else header.mediaType
