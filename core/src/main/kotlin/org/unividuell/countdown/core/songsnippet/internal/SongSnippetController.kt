package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import org.unividuell.countdown.core.songsnippet.SongCatalog

data class SongSearchResultDto(val trackId: Long, val artist: String, val title: String, val coverUrl: String?)
data class TrackDto(
    val trackId: Long, val artist: String, val title: String,
    val coverUrl: String?, val link: String, val previewUrl: String,
)

/**
 * Catalogue-wide, round-free — which is why it lives here and not next to the round endpoints:
 * a search over the whole public catalogue reveals nothing about the chosen song.
 */
@RestController
@RequestMapping("/api/song-snippet")
class SongSnippetController(private val catalog: SongCatalog) {

    /** Below three characters the answer is an empty list, not an error — cheap and honest. */
    @GetMapping("/search")
    fun search(@RequestParam q: String): List<SongSearchResultDto> {
        if (q.trim().length < 3) return emptyList()
        return catalog.search(q.trim()).map {
            SongSearchResultDto(trackId = it.trackId, artist = it.artist, title = it.title, coverUrl = it.coverUrl)
        }
    }

    /** Fresh resolution — the reveal uses this to make wrong guesses playable straight from Deezer. */
    @GetMapping("/tracks/{trackId}")
    fun track(@PathVariable trackId: Long): TrackDto {
        val resolved = catalog.track(trackId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "no such track")
        return TrackDto(
            trackId = resolved.track.trackId,
            artist = resolved.track.artist,
            title = resolved.track.title,
            coverUrl = resolved.track.coverUrl,
            link = resolved.track.link,
            previewUrl = resolved.previewUrl,
        )
    }
}
