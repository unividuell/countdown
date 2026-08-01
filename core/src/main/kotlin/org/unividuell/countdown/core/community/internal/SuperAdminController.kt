package org.unividuell.countdown.core.community.internal

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * System-wide community view for the super-admin area.
 *
 * No authorization check and no principal parameter on purpose: the whole `/api/super-admin`
 * tree is gated centrally by `hasRole("SUPER_ADMIN")` in iam's SecurityConfig, so anything that
 * reaches this controller is already a super-admin.
 */
@RestController
@RequestMapping("/api/super-admin/communities")
class SuperAdminController(private val overview: SuperAdminOverviewService) {
    @GetMapping
    fun communities(): List<SuperAdminCommunityResponse> = overview.overview()
}
