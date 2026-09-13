package org.unividuell.countdown.core.socialpreview

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage

class PreviewPageTest {

    @Test
    fun `renders the tags a messenger reads`() {
        val html = PreviewPage(title = "Hütte Hütte", description = "T-58: Spiel mit!", path = "/c/huettehuette")
            .html(baseUrl = "https://countdown.unividuell.org")

        html shouldContain "<title>Hütte Hütte</title>"
        html shouldContain """<meta property="og:title" content="Hütte Hütte">"""
        html shouldContain """<meta property="og:description" content="T-58: Spiel mit!">"""
        html shouldContain """<meta property="og:url" content="https://countdown.unividuell.org/c/huettehuette">"""
        html shouldContain """<html lang="de">"""
    }

    @Test
    fun `escapes a name that would otherwise break out of the attribute`() {
        val html = PreviewPage(title = """Team "X" <b>""", description = "Spiel mit!", path = "/c/x")
            .html(baseUrl = "https://example.org")

        html shouldNotContain """content="Team "X""""
        html shouldContain "&quot;"
        html shouldNotContain "<b>"
    }

    @Test
    fun `the generic page speaks for the app and points at the root`() {
        val page = PreviewPage.generic()
        page.title shouldBe "Countdown"
        page.description shouldBe "Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern"
        page.path shouldBe "/"
    }

    @Test
    fun `escapes hostile path to prevent og-url attribute breakout`() {
        val html = PreviewPage(title = "Event", description = "Join!", path = """/join/"<script>""")
            .html(baseUrl = "https://example.org")

        html shouldNotContain """content="https://example.org/join/"<script>"""
        html shouldContain """content="https://example.org/join/&quot;&lt;script&gt;"""
    }
}
