package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.CountdownOAuth2User
import java.util.UUID

class CountdownOAuth2UserTest {

    private fun user(isSuperAdmin: Boolean) = User(
        id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
        githubId = 1L, githubLogin = "octocat", isSuperAdmin = isSuperAdmin,
    )

    @Test
    fun `name is our uuid`() {
        val principal = CountdownOAuth2User(user(false), mapOf("login" to "octocat"))
        principal.name shouldBe "018f0000-0000-7000-8000-000000000000"
    }

    @Test
    fun `non-super-admin has only ROLE_USER`() {
        val authorities = CountdownOAuth2User(user(false), emptyMap()).authorities.map { it.authority }
        authorities shouldContain "ROLE_USER"
        authorities shouldNotContain "ROLE_SUPER_ADMIN"
    }

    @Test
    fun `super-admin has ROLE_SUPER_ADMIN`() {
        val authorities = CountdownOAuth2User(user(true), emptyMap()).authorities.map { it.authority }
        authorities shouldContain "ROLE_USER"
        authorities shouldContain "ROLE_SUPER_ADMIN"
    }
}
