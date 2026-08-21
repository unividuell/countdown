package org.unividuell.countdown.core.songsnippet.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.CatalogTrack
import org.unividuell.countdown.core.songsnippet.ResolvedTrack
import org.unividuell.countdown.core.songsnippet.SongCatalog
import java.time.Clock
import java.time.Duration
import java.time.Instant

/** Property names mirror Deezer's JSON verbatim so binding needs no annotations. */
internal data class DeezerArtistJson(val name: String = "")
internal data class DeezerAlbumJson(val cover_medium: String? = null)
internal data class DeezerTrackJson(
    val id: Long = 0,
    val title_short: String = "",
    val readable: Boolean = true,
    val preview: String? = null,
    val link: String = "",
    val artist: DeezerArtistJson = DeezerArtistJson(),
    val album: DeezerAlbumJson? = null,
)
internal data class DeezerTrackListJson(
    val data: List<DeezerTrackJson> = emptyList(),
    val next: String? = null,
)

@Component
class DeezerSongCatalog(
    @Qualifier("deezerRestClient") private val client: RestClient,
    private val properties: SongSnippetProperties,
    private val clock: Clock,
) : SongCatalog {

    private val logger = KotlinLogging.logger {}

    private data class CachedPool(val at: Instant, val tracks: List<CatalogTrack>)

    @Volatile
    private var cachedPool: CachedPool? = null

    /** Tiny LRU so thirty people typing the same evening do not multiply into Deezer's rate limit. */
    private val searchCache = object : LinkedHashMap<String, List<CatalogTrack>>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<CatalogTrack>>) =
            size > 512
    }

    override fun poolTracks(): List<CatalogTrack> {
        val now = clock.instant()
        cachedPool
            ?.takeIf { Duration.between(it.at, now) < properties.poolCacheTtl }
            ?.let { return it.tracks }
        val fresh = properties.playlistIds
            .flatMap { fetchPlaylistTracks(it) }
            .distinctBy { it.trackId }
        if (fresh.isNotEmpty()) cachedPool = CachedPool(at = now, tracks = fresh)
        return fresh
    }

    override fun search(query: String): List<CatalogTrack> {
        synchronized(searchCache) { searchCache[query] }?.let { return it }
        val body = client.get()
            .uri { it.path("/search").queryParam("q", query).queryParam("limit", SEARCH_LIMIT).build() }
            .retrieve()
            .body(DeezerTrackListJson::class.java) ?: DeezerTrackListJson()
        val hits = body.data.mapNotNull { it.toCatalogTrack() }
        synchronized(searchCache) { searchCache[query] = hits }
        return hits
    }

    override fun track(trackId: Long): ResolvedTrack? {
        val json = client.get().uri("/track/{id}", trackId).retrieve()
            .body(DeezerTrackJson::class.java) ?: return null
        val track = json.toCatalogTrack() ?: return null
        val preview = json.preview ?: return null
        return ResolvedTrack(track = track, previewUrl = preview)
    }

    private fun fetchPlaylistTracks(playlistId: Long): List<CatalogTrack> {
        val body = client.get()
            .uri("/playlist/{id}/tracks?limit=400", playlistId)
            .retrieve()
            .body(DeezerTrackListJson::class.java) ?: DeezerTrackListJson()
        if (body.next != null) {
            logger.warn { "playlist $playlistId has more than 400 tracks; pool is truncated" }
        }
        return body.data.mapNotNull { it.toCatalogTrack() }
    }

    /** Null for a track the game cannot use — no preview, or not readable. */
    private fun DeezerTrackJson.toCatalogTrack(): CatalogTrack? {
        if (!readable || preview.isNullOrBlank() || id == 0L) return null
        return CatalogTrack(
            trackId = id,
            artist = artist.name,
            title = title_short,
            coverUrl = album?.cover_medium,
            link = link,
        )
    }

    private companion object {
        /**
         * How many hits a search answers with. Deezer imposes no such bound — this one is the
         * webapp's: it lays the hits out three to a row and shows every one it gets, so a multiple
         * of three is what fills the last row. Nine is three such rows, of which the strip shows
         * two and a sliver, and scrolls to the rest.
         */
        const val SEARCH_LIMIT = 9
    }
}
