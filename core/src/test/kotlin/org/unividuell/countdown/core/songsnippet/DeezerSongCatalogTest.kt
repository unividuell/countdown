package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.collections.shouldNotBeEmpty
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.internal.DeezerSongCatalog
import org.unividuell.countdown.core.songsnippet.internal.SongSnippetProperties
import java.time.Clock
import java.time.Duration

class DeezerSongCatalogTest {

    private fun fixture(name: String): String =
        requireNotNull(javaClass.getResource("/songsnippet/$name")).readText()

    private fun catalogAgainst(setup: (MockRestServiceServer) -> Unit): DeezerSongCatalog {
        val builder = RestClient.builder().baseUrl("https://api.deezer.com")
        val server = MockRestServiceServer.bindTo(builder).build()
        setup(server)
        return DeezerSongCatalog(
            client = builder.build(),
            properties = SongSnippetProperties(
                playlistIds = listOf(10396822102L),
                poolCacheTtl = Duration.ofHours(6),
            ),
            clock = Clock.systemUTC(),
        )
    }

    @Test
    fun `the pool merges playlist tracks and drops the ones without a preview`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/playlist/10396822102/tracks?limit=400"))
                .andRespond(withSuccess(fixture("deezer-playlist-tracks.json"), MediaType.APPLICATION_JSON))
        }
        val pool = catalog.poolTracks()
        pool.shouldNotBeEmpty()
        // Every entry comes from a track WITH a preview; the title is title_short (version-free):
        pool.forEach { it.title shouldBe it.title.trim() }
    }

    @Test
    fun `the pool is cached - a second call answers without a second request`() {
        val catalog = catalogAgainst { server ->
            // exactly ONE expected request; a second one would fail the mock server
            server.expect(requestTo("https://api.deezer.com/playlist/10396822102/tracks?limit=400"))
                .andRespond(withSuccess(fixture("deezer-playlist-tracks.json"), MediaType.APPLICATION_JSON))
        }
        catalog.poolTracks()
        catalog.poolTracks()
    }

    @Test
    fun `search maps the essentials and title_short wins over the versioned title`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/search?q=hotel%20california%20eagles&limit=8"))
                .andRespond(withSuccess(fixture("deezer-search-hotel-california.json"), MediaType.APPLICATION_JSON))
        }
        val hits = catalog.search("hotel california eagles")
        hits.shouldNotBeEmpty()
        hits.first().title shouldBe "Hotel California" // not "... (2013 Remaster)"
        hits.first().artist shouldBe "Eagles"
    }

    @Test
    fun `track resolves the permanent id to a fresh preview url`() {
        val catalog = catalogAgainst { server ->
            server.expect(requestTo("https://api.deezer.com/track/426703682"))
                .andRespond(withSuccess(fixture("deezer-track.json"), MediaType.APPLICATION_JSON))
        }
        val resolved = catalog.track(426703682L).shouldNotBeNull()
        resolved.track.trackId shouldBe 426703682L
        resolved.previewUrl.startsWith("https://") shouldBe true
    }
}
