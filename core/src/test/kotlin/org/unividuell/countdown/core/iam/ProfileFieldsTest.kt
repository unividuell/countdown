package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class ProfileFieldsTest {

    @Test
    fun `trims the name`() {
        ProfileFields.normalizeName("  Turanga Leela  ") shouldBe "Turanga Leela"
    }

    @Test
    fun `blank and null are both no name`() {
        ProfileFields.normalizeName(null).shouldBeNull()
        ProfileFields.normalizeName("").shouldBeNull()
        ProfileFields.normalizeName("   ").shouldBeNull()
    }

    @Test
    fun `a name at the limit is kept, one beyond it is refused`() {
        val limit = "x".repeat(ProfileFields.MAX_NAME_LENGTH)
        ProfileFields.normalizeName(limit) shouldBe limit
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeName("x".repeat(33)) }
    }

    @Test
    fun `the limit applies after trimming`() {
        val padded = "  " + "x".repeat(ProfileFields.MAX_NAME_LENGTH) + "  "
        ProfileFields.normalizeName(padded) shouldBe "x".repeat(ProfileFields.MAX_NAME_LENGTH)
    }

    @Test
    fun `stores the colour lowercased`() {
        ProfileFields.normalizeColor("#8E44AD") shouldBe "#8e44ad"
    }

    @Test
    fun `blank and null are both no colour`() {
        ProfileFields.normalizeColor(null).shouldBeNull()
        ProfileFields.normalizeColor("  ").shouldBeNull()
    }

    @Test
    fun `refuses anything that is not a six digit hex colour`() {
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("8e44ad") }
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("#8e44a") }
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("rebeccapurple") }
    }
}
