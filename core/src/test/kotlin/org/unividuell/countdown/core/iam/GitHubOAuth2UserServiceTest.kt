package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.user.DefaultOAuth2User
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import org.unividuell.countdown.core.iam.internal.GitHubOAuth2UserService
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertIs

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

        var captured: List<Any?> = emptyList()
        val provisioning = object : UserProvisioningService(FakeRepo(), SuperAdminProperties(emptyList())) {
            override fun provision(githubId: Long, login: String, name: String?, email: String?): User {
                captured = listOf(githubId, login, name, email)
                return provisioned
            }
        }
        // delegate returns canned GitHub attributes regardless of the (unused) request
        // Using SAM lambda: DefaultOAuth2UserService.loadUser is final in Spring Security 7
        val delegate = OAuth2UserService<OAuth2UserRequest, OAuth2User> { DefaultOAuth2User(emptyList(), attrs, "id") }
        val service = GitHubOAuth2UserService(provisioning, delegate)

        // userRequest is passed through to the delegate, which ignores it
        val result = service.loadUser(mock(OAuth2UserRequest::class.java))

        assertIs<CountdownOAuth2User>(result)
        assertEquals(provisioned, result.user)
        assertEquals(listOf(4711L, "octocat", "The Octocat", "cat@example.com"), captured)
    }
}

private class FakeRepo : UserRepository {
    override fun findByGithubId(githubId: Long): User? = null
    override fun <S : User> save(entity: S): S = entity
    override fun <S : User> saveAll(entities: Iterable<S>): Iterable<S> = entities
    override fun findById(id: UUID): java.util.Optional<User> = java.util.Optional.empty()
    override fun existsById(id: UUID): Boolean = false
    override fun findAll(): Iterable<User> = emptyList()
    override fun findAllById(ids: Iterable<UUID>): Iterable<User> = emptyList()
    override fun count(): Long = 0
    override fun deleteById(id: UUID) {}
    override fun delete(entity: User) {}
    override fun deleteAllById(ids: Iterable<UUID>) {}
    override fun deleteAll(entities: Iterable<User>) {}
    override fun deleteAll() {}
}
