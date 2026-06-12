package org.unividuell.countdown.core.iam.internal

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service

/**
 * Fetches the GitHub profile via the default service, upserts our user, and
 * returns a principal carrying our UUID + authorities.
 */
@Service
class GitHubOAuth2UserService(
    private val provisioning: UserProvisioningService,
    private val delegate: OAuth2UserService<OAuth2UserRequest, OAuth2User> = DefaultOAuth2UserService(),
) : OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val githubUser = delegate.loadUser(userRequest)
            ?: error("Delegate OAuth2UserService returned null for userRequest")
        val attributes = githubUser.attributes
        val user = provisioning.provision(
            githubId = (attributes["id"] as Number).toLong(),
            login = attributes["login"] as String,
            name = attributes["name"] as String?,
            email = attributes["email"] as String?,
        )
        return CountdownOAuth2User(user, attributes)
    }
}
