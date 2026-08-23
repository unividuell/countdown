package org.unividuell.countdown.core.game.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

@RestController
@RequestMapping("/api/communities/{slug}/rounds")
class RoundController(
    private val announcements: AnnouncementService,
    private val plays: PlayService,
    private val histories: HistoryService,
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

    /**
     * A round of this community's history. Only rounds **strictly older** than the running one —
     * the running round's own answer is `/current`, and the service refuses anything else with 404.
     */
    @GetMapping("/{roundNumber}")
    fun past(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
    ): RoundResponse = histories.pastRound(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        roundNumber = roundNumber,
    )

    /** Starts the viewer's clock and hands out the payload. Idempotent. */
    @PostMapping("/current/reveal")
    fun reveal(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): RoundResponse = plays.reveal(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)

    /** The one guess. The body is the game's own shape, plus the round it is meant for. */
    @PostMapping("/current/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: GuessRequest,
    ): RoundResponse = plays.guess(
        slug = slug,
        userId = me.id,
        isSuperAdmin = me.isSuperAdmin,
        roundNumber = body.roundNumber,
        guess = body.guess,
    )

    /** Voluntary stage advance — „mehr hören“. Guarded by the stage the client believes it is on. */
    @PostMapping("/current/skip")
    fun skip(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: SkipRequest,
    ): RoundResponse = plays.skip(
        slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin,
        roundNumber = body.roundNumber, fromStage = body.fromStage,
    )

    /** The explicit exit without an answer. */
    @PostMapping("/current/give-up")
    fun giveUp(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: GiveUpRequest,
    ): RoundResponse = plays.giveUp(
        slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin, roundNumber = body.roundNumber,
    )

    /**
     * The round's binary assets, stage-gated. Round number and key ride in the URL so each pair is
     * its own privately cacheable resource — without the round number, yesterday's cache would
     * replay the wrong round.
     */
    @GetMapping("/current/assets/{roundNumber}/{key}")
    fun asset(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable roundNumber: Int,
        @PathVariable key: Int,
    ): ResponseEntity<ByteArray> {
        val asset = plays.asset(
            slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin,
            roundNumber = roundNumber, key = key,
        )
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, asset.mediaType)
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400, immutable")
            .body(asset.bytes)
    }
}
