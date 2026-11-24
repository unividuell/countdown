package org.unividuell.countdown.core.gamelab.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Whether the labs exist here at all. The SPA bundle is the same everywhere, so every lab page
 * (game lab index, card lab) asks this before rendering. Switched off, the bean is gone and the
 * path 404s like the rest of the lab.
 */
@RestController
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabGateController {

    @GetMapping("/api/lab")
    fun gate(): ResponseEntity<Void> = ResponseEntity.noContent().build()
}
