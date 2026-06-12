package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

data class MeResponse(
    val id: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val email: String?,
    val bgColorHex: String?,
    val isSuperAdmin: Boolean,
    val createdAt: Instant?,
)

/** Full desired state of the user-owned fields (null clears a field). */
data class UpdateProfileRequest(
    val displayName: String?,
    val bgColorHex: String?,
)

private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, isSuperAdmin = isSuperAdmin, createdAt = createdAt,
)

@RestController
@RequestMapping("/api/me")
class UserController(private val profileService: UserProfileService) {

    @GetMapping
    fun me(@AuthenticationPrincipal principal: CountdownOAuth2User): MeResponse =
        principal.user.toMeResponse()

    @PatchMapping
    fun update(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): MeResponse =
        profileService.update(principal.user.id!!, body.displayName, body.bgColorHex).toMeResponse()
}
