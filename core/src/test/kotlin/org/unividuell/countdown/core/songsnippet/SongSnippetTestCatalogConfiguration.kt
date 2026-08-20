package org.unividuell.countdown.core.songsnippet

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary

/**
 * A fixed, three-track pool standing in for the real Deezer catalogue, and a preview source that
 * hands out the bundled fixture MP3 for every track regardless of its (fake) preview URL — so a
 * context that materialises `song-snippet` through the real [org.unividuell.countdown.core.game.internal.GameSelection]
 * never reaches the network and never sees the empty pool `DeezerSongCatalog` returns when
 * `app.song-snippet.playlist-ids` is unset, which it is on the test classpath.
 *
 * Deliberately its own `@TestConfiguration`, mirroring `GuessHueTestDatasetConfiguration`: not folded
 * into `TestcontainersConfiguration`, because that would silently switch every context test onto this
 * fixture, including ones that mean to exercise the real (empty, in test) Deezer catalogue. Imported
 * only by the tests that actually materialise or address `song-snippet` through the real catalogue.
 */
@TestConfiguration(proxyBeanMethods = false)
class SongSnippetTestCatalogConfiguration {

    private fun track(id: Long, artist: String, title: String) = CatalogTrack(
        trackId = id, artist = artist, title = title,
        coverUrl = "https://cdn.example/cover.jpg", link = "https://www.deezer.com/track/$id",
    )

    private val pool = listOf(
        track(id = 426703682L, artist = "Eagles", title = "Hotel California"),
        track(id = 1L, artist = "Juli", title = "Perfekte Welle"),
        track(id = 2L, artist = "Peter Fox", title = "Schüttel deinen Speck"),
    )

    @Bean
    @Primary
    fun songSnippetTestCatalog(): SongCatalog = object : SongCatalog {
        override fun poolTracks(): List<CatalogTrack> = pool

        override fun search(query: String): List<CatalogTrack> = pool.filter {
            it.title.contains(other = query, ignoreCase = true) || it.artist.contains(other = query, ignoreCase = true)
        }

        override fun track(trackId: Long): ResolvedTrack? = pool.find { it.trackId == trackId }
            ?.let { ResolvedTrack(track = it, previewUrl = "https://cdn.example/preview/$trackId.mp3") }
    }

    @Bean
    @Primary
    fun songSnippetTestPreviewSource(): PreviewSource = object : PreviewSource {
        override fun download(previewUrl: String): ByteArray =
            requireNotNull(javaClass.getResource("/songsnippet/fixture-tone.mp3")) {
                "test fixture missing: songsnippet/fixture-tone.mp3"
            }.readBytes()
    }
}
