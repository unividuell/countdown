package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.iam.AuthenticatedUser
import java.util.UUID

/**
 * The lab's HTTP surface. Seed **and** phase ride on every call: together they are the round key, and
 * the store's auto-eviction hangs off exactly that pair. `phase` defaults to `ONE`, so a link without
 * it still opens a phase-one round.
 *
 * No authorization annotation here: `SecurityConfig`'s `anyRequest authenticated` covers this path,
 * and membership is `LabService`'s job. When the lab is switched off the bean does not exist at
 * all, so the whole tree answers 404 — deliberately not 403, which would advertise the feature.
 */
@RestController
@RequestMapping("/api/lab/{slug}/{game}")
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabController(private val service: LabService) {

    @GetMapping
    fun open(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.open(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )

    /** The explicit reveal — starts this tester's clock, once. Mirrors `PlayService.reveal`. */
    @PostMapping("/reveal")
    fun reveal(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.reveal(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )

    @PostMapping("/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
        @RequestBody guess: JsonNode,
    ) = service.guess(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin, guess = guess,
    )

    @PostMapping("/reset")
    fun reset(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.resetRound(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )

    @DeleteMapping("/me")
    fun forgetMine(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.forgetMine(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )

    /** Voluntary stage advance — „mehr hören“. Guarded by the stage the client believes it is on. */
    @PostMapping("/skip")
    fun skip(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
        @RequestBody body: LabSkipRequest,
    ) = service.skip(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin, fromStage = body.fromStage,
    )

    /** The explicit exit without an answer. */
    @PostMapping("/give-up")
    fun giveUp(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.giveUp(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )

    /** Casting, changing, or withdrawing a ballot on somebody else's tip. */
    @PutMapping("/plays/{userId}/vote")
    fun vote(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @PathVariable userId: UUID,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
        @RequestBody body: LabVoteRequest,
    ) = service.vote(
        slug = slug, gameId = game, seed = seed, phase = phase,
        voterUserId = me.id, isSuperAdmin = me.isSuperAdmin, targetUserId = userId, value = body.value,
    )

    /** The game master's verdict on one tip. `null` hands the decision back to the vote. */
    @PutMapping("/plays/{userId}/override")
    fun override(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @PathVariable userId: UUID,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
        @RequestBody body: LabOverrideRequest,
    ) = service.override(
        slug = slug, gameId = game, seed = seed, phase = phase,
        adminId = me.id, isSuperAdmin = me.isSuperAdmin, targetUserId = userId, value = body.value,
    )

    /** The round's binary assets, stage-gated exactly like the real round's. */
    @GetMapping("/assets/{key}")
    fun asset(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @PathVariable key: Int,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ): ResponseEntity<ByteArray> {
        val asset = service.asset(
            slug = slug, gameId = game, seed = seed, phase = phase,
            userId = me.id, isSuperAdmin = me.isSuperAdmin, key = key,
        )
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, asset.mediaType)
            .body(asset.bytes)
    }
}
