package org.unividuell.countdown.core.iam.internal

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service

/**
 * Fetches the GitHub profile via the default service, upserts our user, and
 * returns a principal carrying our UUID + authorities.
 */
@Service
class GitHubOAuth2UserService(
    private val provisioning: UserProvisioningService,
    private val delegate: OAuth2UserService<OAuth2UserRequest, OAuth2User>,
) : OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    // Spring uses this constructor (the primary one exists for tests). Passing a fresh
    // DefaultOAuth2UserService() directly avoids Spring injecting this very bean back into
    // itself via the OAuth2UserService<OAuth2UserRequest, OAuth2User> interface type (self-injection).
    @Autowired
    constructor(provisioning: UserProvisioningService) : this(provisioning, DefaultOAuth2UserService())

    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val githubUser = delegate.loadUser(userRequest)
            ?: throw invalidClaims("GitHub user-info endpoint returned no user")
        val attributes = githubUser.attributes
        val githubId = (attributes["id"] as? Number)?.toLong()
            ?: throw invalidClaims("missing or non-numeric 'id' in GitHub attributes")
        val login = attributes["login"] as? String
            ?: throw invalidClaims("missing or non-string 'login' in GitHub attributes")
        val user = provisioning.provision(
            githubId = githubId,
            login = login,
            name = attributes["name"] as? String,
            email = attributes["email"] as? String,
        )
        return CountdownOAuth2User(user, attributes)
    }

    private fun invalidClaims(message: String) =
        OAuth2AuthenticationException(OAuth2Error("invalid_github_claims", message, null), message)
}
