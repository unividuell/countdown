package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import org.junit.jupiter.api.Test
import java.util.UUID

class AvatarTest {
    private val hex = Regex("^#[0-9a-f]{6}$")

    private fun user(
        displayName: String? = null,
        bgColorHex: String? = null,
        id: UUID = UUID.fromString("0190f1b2-0000-7000-8000-000000000001"),
    ) = User(
        id = id, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        displayName = displayName, bgColorHex = bgColorHex,
    )

    @Test
    fun `labels the avatar with the shortened display name`() {
        Avatar.of(user(displayName = "Turanga Leela")).shortName shouldBe "TRNG"
    }

    @Test
    fun `takes the colour the user chose`() {
        Avatar.of(user(bgColorHex = "#8e44ad")).bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `falls back to a colour derived from the user id`() {
        val avatar = Avatar.of(user(bgColorHex = null))
        avatar.bgColorHex shouldMatch hex
        avatar.bgColorHex shouldBe Avatar.of(user(bgColorHex = null)).bgColorHex
    }

    @Test
    fun `gives two users different derived colours`() {
        val a = Avatar.of(user(id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")))
        val b = Avatar.of(user(id = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")))
        (a.bgColorHex == b.bgColorHex) shouldBe false
    }
}
