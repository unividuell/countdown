package org.unividuell.countdown.core.game.internal

import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.game.GameWeight
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.isSuperAdmin

/** The games of a community and how often it wants each. */
@RestController
@RequestMapping("/api/communities/{slug}/games")
class GameController(private val service: GameWeightService) {

    @GetMapping
    fun games(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): List<GameEntry> =
        service.games(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)

    /** The full set, e.g. `{"song-snippet": "OFF", "echo-locate": "OFTEN"}`; missing games are normal. */
    @PutMapping("/weights")
    fun setWeights(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: Map<String, GameWeight>,
    ): ResponseEntity<Void> {
        service.setWeights(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin, weights = body)
        return ResponseEntity.noContent().build()
    }
}
