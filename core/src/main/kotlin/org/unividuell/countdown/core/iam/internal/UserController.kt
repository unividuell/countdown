package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import java.time.Instant
import java.util.UUID

data class MeResponse(
    val id: UUID,
    val username: String,
    /** The raw chosen name; null means none was chosen. `username` is what to show. */
    val displayName: String?,
    val githubLogin: String,
    val githubName: String?,
    val email: String?,
    /** The colour the user picked; null means they picked none. Not what to paint with. */
    val bgColorHex: String?,
    /** What to paint with — the same avatar the roster draws for this user. */
    val avatar: Avatar,
    val isSuperAdmin: Boolean,
    val mayCreateCommunities: Boolean,
    val createdAt: Instant?,
)

/** Full desired state of the user-owned fields (null clears a field). */
data class UpdateProfileRequest(
    val displayName: String?,
    val bgColorHex: String?,
)

private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, displayName = displayName,
    githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, avatar = Avatar.of(this),
    isSuperAdmin = isSuperAdmin, mayCreateCommunities = mayCreateCommunities,
    createdAt = createdAt,
)

@RestController
@RequestMapping("/api/me")
class UserController(private val profileService: UserProfileService) {

    @GetMapping
    fun me(@AuthenticationPrincipal principal: CountdownOAuth2User): MeResponse =
        profileService.current(principal.user.id!!).toMeResponse()

    @PatchMapping
    fun update(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): MeResponse =
        profileService.update(principal.user.id!!, body.displayName, body.bgColorHex).toMeResponse()
}
