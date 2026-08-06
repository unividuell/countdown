package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.AvatarColor
import java.util.UUID

class AvatarColorTest {
    private val hex = Regex("^#[0-9a-f]{6}$")

    @Test
    fun `prefers the colour the user chose`() {
        AvatarColor.resolve("#8e44ad", UUID.randomUUID()) shouldBe "#8e44ad"
    }

    @Test
    fun `treats a blank profile colour as unset`() {
        val id = UUID.randomUUID()
        AvatarColor.resolve("   ", id) shouldBe AvatarColor.resolve(null, id)
    }

    @Test
    fun `derives the same colour for the same user every time`() {
        val id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
        val first = AvatarColor.resolve(null, id)
        first shouldMatch hex
        first shouldBe AvatarColor.resolve(null, id)
    }

    @Test
    fun `derives different colours for different users`() {
        val a = AvatarColor.resolve(null, UUID.fromString("0190f1b2-0000-7000-8000-000000000001"))
        val b = AvatarColor.resolve(null, UUID.fromString("0190f1b2-0000-7000-8000-000000000002"))
        (a == b) shouldBe false
    }

    @Test
    fun `keeps every channel in the mid range, so text of either colour can be legible`() {
        repeat(50) {
            val c = AvatarColor.resolve(null, UUID.randomUUID())
            listOf(1..2, 3..4, 5..6).forEach { range ->
                val channel = c.substring(range.first, range.last + 1).toInt(16)
                (channel in 60..195) shouldBe true
            }
        }
    }
}
