package org.unividuell.countdown.core

import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

/** Stable id for the authenticated test principal, so tests can assert against a fixed UUID. */
val TEST_USER_ID: UUID = UUID.fromString("018f0000-0000-7000-8000-000000000000")

/** Authenticates a MockMvc request as [user], the shape the real OAuth2 login produces. */
fun principalFor(user: User) =
    authentication(
        OAuth2AuthenticationToken(
            CountdownOAuth2User(user, mapOf("login" to user.githubLogin)),
            CountdownOAuth2User(user, emptyMap()).authorities,
            "github",
        )
    )

/** For tests that care only about the role, not the user's other fields. */
fun principalFor(
    id: UUID = TEST_USER_ID,
    superAdmin: Boolean = false,
    githubLogin: String = "octocat",
) = principalFor(User(id = id, githubId = 1L, githubLogin = githubLogin, isSuperAdmin = superAdmin))
