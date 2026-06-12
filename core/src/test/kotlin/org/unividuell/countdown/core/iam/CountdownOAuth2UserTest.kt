package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CountdownOAuth2UserTest {

    private fun user(isSuperAdmin: Boolean) = User(
        id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
        githubId = 1L, githubLogin = "octocat", isSuperAdmin = isSuperAdmin,
    )

    @Test
    fun `name is our uuid`() {
        val principal = CountdownOAuth2User(user(false), mapOf("login" to "octocat"))
        assertEquals("018f0000-0000-7000-8000-000000000000", principal.name)
    }

    @Test
    fun `non-super-admin has only ROLE_USER`() {
        val authorities = CountdownOAuth2User(user(false), emptyMap()).authorities.map { it.authority }
        assertTrue("ROLE_USER" in authorities)
        assertFalse("ROLE_SUPER_ADMIN" in authorities)
    }

    @Test
    fun `super-admin has ROLE_SUPER_ADMIN`() {
        val authorities = CountdownOAuth2User(user(true), emptyMap()).authorities.map { it.authority }
        assertTrue("ROLE_USER" in authorities)
        assertTrue("ROLE_SUPER_ADMIN" in authorities)
    }
}
