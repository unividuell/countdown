package org.unividuell.countdown.core.iam.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * No authorization check and no principal parameter on purpose: the super-admin path prefix is
 * gated centrally by `hasRole("SUPER_ADMIN")` in SecurityConfig.
 *
 * Note: do not write the glob form of that path inside this KDoc — Kotlin block comments nest,
 * so an embedded slash-star-star opens a nested comment and leaves the file unclosed.
 */
@RestController
@RequestMapping("/api/super-admin/super-admins")
class SuperAdminRosterController(private val roster: SuperAdminRosterService) {
    @GetMapping
    fun superAdmins(): List<SuperAdminUserResponse> = roster.roster()
}
