package org.unividuell.countdown.core

import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.unividuell.auth.AuthPrincipal
import org.unividuell.countdown.core.iam.User
import java.util.UUID

/** Stable id for the authenticated test principal, so tests can assert against a fixed UUID. */
val TEST_USER_ID: UUID = UUID.fromString("018f0000-0000-7000-8000-000000000000")

/**
 * Authenticates a MockMvc request as [user], in the shape the auth lib's sign-in produces: an
 * [AuthPrincipal] whose roles are what the allowlist granted — SUPER_ADMIN exactly when the row is
 * flagged.
 */
fun principalFor(user: User): RequestPostProcessor {
    val principal = AuthPrincipal(
        id = requireNotNull(user.id) { "principalFor needs a saved user (id is null)" },
        provider = user.provider,
        login = user.githubLogin,
        roles = if (user.isSuperAdmin) setOf("SUPER_ADMIN") else emptySet(),
    )
    return authentication(OAuth2AuthenticationToken(principal, principal.authorities, user.provider))
}

/** For tests that care only about the role, not the user's other fields. */
fun principalFor(
    id: UUID = TEST_USER_ID,
    superAdmin: Boolean = false,
    githubLogin: String = "octocat",
) = principalFor(User(id = id, subject = "1", githubLogin = githubLogin, isSuperAdmin = superAdmin))
