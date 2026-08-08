package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

/**
 * The lab's HTTP surface. Every call carries the seed, because the seed IS the round key and the
 * store's auto-eviction hangs off exactly that.
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
    ) = service.open(slug, game, seed, me.id, me.isSuperAdmin)

    @PostMapping("/guess")
    fun guess(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestBody guess: JsonNode,
    ) = service.guess(slug, game, seed, me.id, me.isSuperAdmin, guess)

    @PostMapping("/reset")
    fun reset(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
    ) = service.resetRound(slug, game, seed, me.id, me.isSuperAdmin)

    @DeleteMapping("/me")
    fun forgetMine(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
    ) = service.forgetMine(slug, game, seed, me.id, me.isSuperAdmin)
}
