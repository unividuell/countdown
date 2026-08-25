package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.GameCatalog

@Import(TestcontainersConfiguration::class)
@SpringBootTest
class SongSnippetBootTest(@Autowired val catalog: GameCatalog) {

    @Test
    fun `the catalogue carries all three real games, sorted`() {
        catalog.ids() shouldBe listOf("find-pattern", "guess-hue", "song-snippet")
    }
}
