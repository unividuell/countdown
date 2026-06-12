package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.GitHubOAuth2UserService
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import java.util.UUID

class GitHubOAuth2UserServiceTest {

    @Test
    fun `extracts github claims, provisions, and returns our principal`() {
        val attrs = mapOf<String, Any>(
            "id" to 4711, "login" to "octocat", "name" to "The Octocat", "email" to "cat@example.com",
        )
        val provisioned = User(
            id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
            githubId = 4711L, githubLogin = "octocat", githubName = "The Octocat", email = "cat@example.com",
        )

        val provisioning = mockk<UserProvisioningService>()
        every { provisioning.provision(4711L, "octocat", "The Octocat", "cat@example.com") } returns provisioned

        // delegate returns canned GitHub attributes regardless of the (unused) request
        // Using SAM lambda: DefaultOAuth2UserService.loadUser is final in Spring Security 7
        val delegate = OAuth2UserService<OAuth2UserRequest, OAuth2User> { DefaultOAuth2User(emptyList(), attrs, "id") }
        val service = GitHubOAuth2UserService(provisioning, delegate)

        // userRequest is passed through to the delegate, which ignores it
        val result = service.loadUser(mockk<OAuth2UserRequest>())

        result.shouldBeInstanceOf<CountdownOAuth2User>()
        result.user shouldBe provisioned
        verify(exactly = 1) { provisioning.provision(4711L, "octocat", "The Octocat", "cat@example.com") }
    }

    @Test
    fun `missing id claim throws OAuth2AuthenticationException`() {
        val delegate = OAuth2UserService<OAuth2UserRequest, OAuth2User> {
            DefaultOAuth2User(emptyList(), mapOf<String, Any>("login" to "octocat"), "login")
        }
        val provisioning = mockk<UserProvisioningService>()
        val service = GitHubOAuth2UserService(provisioning, delegate)
        shouldThrow<OAuth2AuthenticationException> { service.loadUser(mockk()) }
    }

    @Test
    fun `missing login claim throws OAuth2AuthenticationException`() {
        val delegate = OAuth2UserService<OAuth2UserRequest, OAuth2User> {
            DefaultOAuth2User(emptyList(), mapOf<String, Any>("id" to 4711), "id")
        }
        val provisioning = mockk<UserProvisioningService>()
        val service = GitHubOAuth2UserService(provisioning, delegate)
        shouldThrow<OAuth2AuthenticationException> { service.loadUser(mockk()) }
    }
}
