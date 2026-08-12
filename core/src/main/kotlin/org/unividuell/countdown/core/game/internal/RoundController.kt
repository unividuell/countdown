package org.unividuell.countdown.core.game.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser
import tools.jackson.databind.JsonNode

@RestController
@RequestMapping("/api/communities/{slug}/rounds")
class RoundController(
    private val announcements: AnnouncementService,
    private val plays: PlayService,
) {

    @GetMapping("/current")
    fun current(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = announcements.currentRound(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
    )

    /** Starts the viewer's clock and hands out the payload. Idempotent. */
    @PostMapping("/current/reveal")
    fun reveal(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = plays.reveal(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)

    /** The one guess. The body is the game's own shape — the framework does not look inside. */
    @PostMapping("/current/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody guess: JsonNode,
    ): RoundResponse = plays.guess(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        guess = guess,
    )
}
