package org.unividuell.countdown.core.songsnippet

import io.kotest.inspectors.forAll
import io.kotest.matchers.collections.shouldHaveAtLeastSize
import io.kotest.matchers.comparables.shouldBeGreaterThan
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.FileSystemResource

/**
 * The shipped `application.yaml`, read as the file it is.
 *
 * No `@SpringBootTest` can do this: the test classpath's own `application.yaml` REPLACES the main
 * one, deliberately, so that no test ever loads a real pool and reaches for Deezer. That leaves the
 * production pool configuration unexercised — and a structural slip in it (a mis-indented sequence,
 * a renamed key) binds to an empty list instead of failing, which nothing would notice until a real
 * round drew this game and found no songs. So the file is bound here on its own, offline.
 */
class SongSnippetPoolConfigTest {

    private val configuration = FileSystemResource("src/main/resources/application.yaml")

    @Test
    fun `the shipped pool carries a playlist per decade, every id a positive number`() {
        val ids = idsUnder(key = "app.song-snippet.playlist-ids")

        ids shouldHaveAtLeastSize 5
        ids.forAll { it shouldBeGreaterThan 0L }
    }

    /** Reads the indexed form Spring's relaxed binding sees — `…playlist-ids[0]`, `[1]`, … */
    private fun idsUnder(key: String): List<Long> {
        val source = YamlPropertySourceLoader()
            .load("application", configuration)
            .single()
        return generateSequence(0) { it + 1 }
            .map { source.getProperty("$key[$it]") }
            .takeWhile { it != null }
            .map { requireNotNull(it).toString().toLong() }
            .toList()
    }
}
