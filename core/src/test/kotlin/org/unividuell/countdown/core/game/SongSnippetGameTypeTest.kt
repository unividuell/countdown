package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.SongSnippetGameType
import org.unividuell.countdown.core.game.internal.SongSnippetParams
import org.unividuell.countdown.core.rng.SeededRandom
import org.unividuell.countdown.core.songsnippet.CatalogTrack
import org.unividuell.countdown.core.songsnippet.PreviewSource
import org.unividuell.countdown.core.songsnippet.SnippetCutter
import org.unividuell.countdown.core.songsnippet.SongCatalog
import org.unividuell.countdown.core.songsnippet.SongSnippetAudioStore
import tools.jackson.databind.json.JsonMapper

class SongSnippetGameTypeTest {

    private val mapper = JsonMapper.builder().build()

    /** Real captured shapes: title is title_short, link is the permanent web URL. */
    private fun track(id: Long, artist: String, title: String) = CatalogTrack(
        trackId = id, artist = artist, title = title,
        coverUrl = "https://cdn.example/cover.jpg", link = "https://www.deezer.com/track/$id",
    )

    private val pool = listOf(
        track(id = 426703682L, artist = "Eagles", title = "Hotel California"),
        track(id = 1L, artist = "Juli", title = "Perfekte Welle"),
        track(id = 2L, artist = "Peter Fox", title = "Schüttel deinen Speck"),
    )

    private val catalog = mockk<SongCatalog> { every { poolTracks() } returns pool }
    private val game = SongSnippetGameType(
        catalog = catalog,
        previews = mockk<PreviewSource>(),
        cutter = mockk<SnippetCutter>(),
        audio = mockk<SongSnippetAudioStore>(),
        mapper = mapper,
    )

    private fun draw(previous: List<SongSnippetParams> = emptyList()) = game.draw(
        random = GameRandom(
            solution = SeededRandom.fromSeed(4711),
            presentation = SeededRandom.fromSeed(0x1234),
        ),
        context = RoundContext(
            roundNumber = 12,
            phase = Phase.ONE,
            previousParams = previous.map { mapper.valueToTree(it) },
        ),
    )

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "song-snippet"
        game.displayName shouldBe "Anspielung"
    }

    @Test
    fun `the draw avoids every track this edition already played`() {
        val first = draw()
        val second = draw(previous = listOf(first))
        second.trackId shouldBe draw(previous = listOf(first)).trackId // deterministic
        (second.trackId == first.trackId) shouldBe false
    }

    @Test
    fun `an exhausted pool allows repeats instead of failing the round`() {
        val all = pool.map { SongSnippetParams(trackId = it.trackId, artist = it.artist, title = it.title, coverUrl = it.coverUrl, link = it.link) }
        draw(previous = all) // must not throw
    }

    @Test
    fun `the payload carries exactly the stage durations and nothing else`() {
        val json = mapper.writeValueAsString(game.present(draw()))
        mapper.readTree(json).propertyNames().toSet() shouldBe setOf("stageDurationsSeconds")
    }

    @Test
    fun `the solution carries exactly the four reveal fields`() {
        val json = mapper.writeValueAsString(game.solution(draw()))
        mapper.readTree(json).propertyNames().toSet() shouldBe
            setOf("artist", "title", "coverUrl", "link")
    }

    private fun judge(params: SongSnippetParams, guess: String) =
        game.judge(params = params, guess = mapper.readTree(guess))

    @Test
    fun `a matching track id is correct`() {
        val params = draw()
        judge(params = params, guess = """{"trackId":${params.trackId}}""").qualifies shouldBe true
    }

    @Test
    fun `normalized artist and title match even when the case and spacing drift`() {
        val params = SongSnippetParams(trackId = 9, artist = "Eagles", title = "Hotel California", coverUrl = null, link = "x")
        judge(params = params, guess = """{"artist":"  eagles ","title":"hotel   california"}""").qualifies shouldBe true
        judge(params = params, guess = """{"artist":"Eagles","title":"Hotel Kalifornien"}""").qualifies shouldBe false
    }

    @Test
    fun `deviation is zero - the framework owns the stage`() {
        val params = draw()
        judge(params = params, guess = """{"trackId":${params.trackId}}""").deviation shouldBe 0.0
    }

    @Test
    fun `a guess with neither id nor pair is rejected before anything is written`() {
        shouldThrow<InvalidGuessException> { judge(params = draw(), guess = """{}""") }
        shouldThrow<InvalidGuessException> { judge(params = draw(), guess = """{"artist":"Eagles"}""") }
    }

    @Test
    fun `five stages, no deliberate reveal`() {
        game.stages(draw()) shouldBe 5
        game.requiresReveal(draw()) shouldBe false
    }

    @Test
    fun `nothing the player sees moves when only the secret stream changes`() {
        val payloads = (1..10).map { seed ->
            game.present(game.draw(
                random = GameRandom(solution = SeededRandom.fromSeed(seed), presentation = SeededRandom.fromSeed(7)),
                context = RoundContext(roundNumber = 12, phase = Phase.ONE),
            ))
        }
        payloads.distinct().size shouldBe 1
    }
}
