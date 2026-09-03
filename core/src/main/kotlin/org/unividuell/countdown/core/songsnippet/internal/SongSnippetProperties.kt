package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/** Public editorial playlists the pool merges — a public catalogue, not game content. */
@ConfigurationProperties("app.song-snippet")
data class SongSnippetProperties(
    val playlistIds: List<Long> = emptyList(),
    val poolCacheTtl: Duration = Duration.ofHours(6),
)
