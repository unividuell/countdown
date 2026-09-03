package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.MemberIdentityResolver
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import java.util.UUID

class MemberIdentityResolverTest {
    private val id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")

    private fun user(displayName: String? = null, bgColorHex: String? = null) = User(
        id = id, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        displayName = displayName, bgColorHex = bgColorHex,
    )

    @Test
    fun `the membership's name wins`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = "Zwerg",
            bgColorHex = null,
        )
        identity.username shouldBe "Zwerg"
        identity.avatar.shortName shouldBe "ZWRG"
    }

    @Test
    fun `without a membership name the global one applies`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = null,
            bgColorHex = null,
        )
        identity.username shouldBe "Turanga Leela"
    }

    @Test
    fun `without any chosen name the github name applies`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(), displayName = null, bgColorHex = null,
        )
        identity.username shouldBe "The Octocat"
    }

    @Test
    fun `the fields fall back independently — an overridden name keeps the global colour`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(bgColorHex = "#111111"),
            displayName = "Zwerg",
            bgColorHex = null,
        )
        identity.username shouldBe "Zwerg"
        identity.avatar.bgColorHex shouldBe "#111111"
    }

    @Test
    fun `an overridden colour keeps the global name`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = null,
            bgColorHex = "#8e44ad",
        )
        identity.username shouldBe "Turanga Leela"
        identity.avatar.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `with nothing set anywhere the identity is the plain global one`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(), displayName = null, bgColorHex = null,
        )
        identity.avatar shouldBe Avatar.of(user())
    }

    @Test
    fun `blank membership values count as unset`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela", bgColorHex = "#111111"),
            displayName = "   ",
            bgColorHex = "",
        )
        identity.username shouldBe "Turanga Leela"
        identity.avatar.bgColorHex shouldBe "#111111"
    }
}
