package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.User
import java.io.Serializable

/** Session principal carrying our domain user. Serializable for Spring Session JDBC. */
class CountdownOAuth2User(
    val user: User,
    private val attributes: Map<String, Any>,
) : OAuth2User, Serializable {

    override fun getName(): String = user.id.toString()

    override fun getAttributes(): Map<String, Any> = attributes

    override fun getAuthorities(): Collection<GrantedAuthority> = buildList {
        add(SimpleGrantedAuthority("ROLE_USER"))
        if (user.isSuperAdmin) add(SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))
    }

    companion object {
        private const val serialVersionUID: Long = 1L
    }
}
