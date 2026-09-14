package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.web.util.HtmlUtils

/**
 * One link preview, as a document with nothing but a head.
 *
 * No human ever sees this: the edge sends browsers to the SPA and only crawlers here. A crawler
 * reads the first response and stops — it runs no JavaScript — so everything it may learn has to
 * stand in this markup.
 */
data class PreviewPage(val title: String, val description: String, val path: String) {

    fun html(baseUrl: String): String {
        // HtmlUtils.htmlEscape defaults to ISO-8859-1, which would render German umlauts as
        // named entities. Pass UTF-8 explicitly to preserve them as-is.
        val safeTitle = HtmlUtils.htmlEscape(title, "UTF-8")
        val safeDescription = HtmlUtils.htmlEscape(description, "UTF-8")
        val safeUrl = HtmlUtils.htmlEscape(baseUrl + path, "UTF-8")
        return """
            <!doctype html>
            <html lang="de">
            <head>
            <meta charset="utf-8">
            <title>$safeTitle</title>
            <meta name="description" content="$safeDescription">
            <meta property="og:title" content="$safeTitle">
            <meta property="og:description" content="$safeDescription">
            <meta property="og:url" content="$safeUrl">
            <meta property="og:type" content="website">
            <meta property="og:locale" content="de_DE">
            <meta name="twitter:card" content="summary">
            </head>
            <body></body>
            </html>
        """.trimIndent()
    }

    companion object {
        /**
         * The app talking about itself — and the answer to every case that must not reveal
         * whether a community or an invite exists at all. Both are the same bytes on purpose.
         */
        fun generic() = PreviewPage(
            title = "Countdown",
            description = "Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern",
            path = "/",
        )
    }
}
