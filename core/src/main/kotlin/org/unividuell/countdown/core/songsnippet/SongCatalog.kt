package org.unividuell.countdown.core.songsnippet

data class CatalogTrack(
    val trackId: Long,
    val artist: String,
    /** Deezer's title_short — the version-free title („Hotel California“, not „… (2013 Remaster)“). */
    val title: String,
    val coverUrl: String?,
    /** Permanent web link for humans — the admin's way back to the song. */
    val link: String,
)

data class ResolvedTrack(val track: CatalogTrack, val previewUrl: String)

/** The catalogue vendor, behind an interface so the implementation can be swapped — and so no test
 *  ever touches the network. */
interface SongCatalog {
    /** The merged, preview-filtered pool of the configured playlists. Cached by the implementation. */
    fun poolTracks(): List<CatalogTrack>
    fun search(query: String): List<CatalogTrack>
    /** Fresh resolution by permanent track id — the preview URL inside is signed and short-lived. */
    fun track(trackId: Long): ResolvedTrack?
}

/** Downloads one preview file. Separate from the catalogue: a different vendor may serve the bytes. */
interface PreviewSource {
    fun download(previewUrl: String): ByteArray
}
