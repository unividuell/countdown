package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import java.nio.charset.StandardCharsets
import java.time.Duration

/**
 * Link previews for crawlers. `countdown-web` rewrites e.g. `/c/huettehuette` to
 * `/api/preview/c/huettehuette` for known crawler user agents only — a browser never arrives
 * here. The SPA path it was rewritten from is therefore rebuilt for `og:url` rather than read
 * off this request.
 */
@RestController
@RequestMapping("/api/preview")
class PreviewController(private val preview: PreviewService) {

    @GetMapping("/c/{slug}", "/c/{slug}/**")
    fun community(@PathVariable slug: String): ResponseEntity<String> = render(preview.forCommunity(slug))

    @GetMapping("/join/{code}")
    fun invite(@PathVariable code: String): ResponseEntity<String> = render(preview.forInvite(code))

    /** The root, and anything else the edge sends here: the app speaks for itself. */
    @GetMapping("", "/", "/**")
    fun generic(): ResponseEntity<String> = render(PreviewPage.generic())

    private fun render(page: PreviewPage): ResponseEntity<String> {
        val baseUrl = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString()
        return ResponseEntity.ok()
            // Explicit charset: the title/description carry German umlauts, and without it the
            // response declares no charset at all, leaving byte interpretation to the client.
            .contentType(MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
            // A messenger caches a preview for days; ten minutes is the most we can ask of it.
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
            .body(page.html(baseUrl = baseUrl))
    }
}
