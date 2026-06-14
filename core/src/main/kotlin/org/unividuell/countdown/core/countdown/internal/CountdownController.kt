package org.unividuell.countdown.core.countdown.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

@RestController
@RequestMapping("/api/communities")
class CountdownController(private val service: CountdownService) {
    @GetMapping("/{slug}/countdown")
    fun get(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): CountdownResponse =
        service.forSlug(slug, me.id, me.isSuperAdmin)
}
