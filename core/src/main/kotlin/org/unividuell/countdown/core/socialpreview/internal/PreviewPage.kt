package org.unividuell.countdown.core.socialpreview.internal

/**
 * One link preview, as a document with nothing but a head.
 *
 * No human ever sees this: the edge sends browsers to the SPA and only crawlers here. A crawler
 * reads the first response and stops — it runs no JavaScript — so everything it may learn has to
 * stand in this markup.
 */
data class PreviewPage(val title: String, val description: String, val path: String) {

    fun html(baseUrl: String): String {
        val safeTitle = escapeHtml(title)
        val safeDescription = escapeHtml(description)
        return """
            <!doctype html>
            <html lang="de">
            <head>
            <meta charset="utf-8">
            <title>$safeTitle</title>
            <meta name="description" content="$safeDescription">
            <meta property="og:title" content="$safeTitle">
            <meta property="og:description" content="$safeDescription">
            <meta property="og:url" content="$baseUrl$path">
            <meta property="og:type" content="website">
            <meta property="og:locale" content="de_DE">
            <meta name="twitter:card" content="summary">
            </head>
            <body></body>
            </html>
        """.trimIndent()
    }

    private fun escapeHtml(input: String): String {
        return input
            .replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
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
