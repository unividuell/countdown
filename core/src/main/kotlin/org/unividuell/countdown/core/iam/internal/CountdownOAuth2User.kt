package org.unividuell.countdown.core.iam.internal

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.user.OAuth2User
import org.unividuell.countdown.core.iam.User
import java.io.Serializable

/**
 * Session principal carrying our domain [User]. Serializable for Spring Session JDBC.
 *
 * The [attributes] are the raw GitHub claims; they are assumed to contain only
 * JDK-Serializable values (String/Number/Boolean/List/Map from JSON), which holds
 * for the `read:user` scope. This matters because the principal is JDK-serialized
 * into the HTTP session.
 */
class CountdownOAuth2User(
    val user: User,
    private val attributes: Map<String, Any>,
) : OAuth2User, Serializable {

    override fun getName(): String = requireNotNull(user.id) {
        "CountdownOAuth2User constructed with an unsaved User (id is null)"
    }.toString()

    override fun getAttributes(): Map<String, Any> = attributes

    private val grantedAuthorities: Collection<GrantedAuthority> = buildList {
        add(SimpleGrantedAuthority("ROLE_USER"))
        if (user.isSuperAdmin) add(SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))
    }

    override fun getAuthorities(): Collection<GrantedAuthority> = grantedAuthorities

    companion object {
        private const val serialVersionUID: Long = 1L
    }
}
