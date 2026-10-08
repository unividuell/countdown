package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.InviteCodes
import java.security.SecureRandom

class InviteCodesTest {

    private val alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    @Test
    fun `generates six characters out of the Crockford alphabet`() {
        val random = SecureRandom()
        repeat(500) {
            val code = InviteCodes.generate(random)
            code.length shouldBe InviteCodes.LENGTH
            code.all { it in alphabet } shouldBe true
        }
    }

    @Test
    fun `normalize upper-cases and repairs the confusable letters`() {
        InviteCodes.normalize("a7k2mp") shouldBe "A7K2MP"
        InviteCodes.normalize("iLo123") shouldBe "110123"
    }

    @Test
    fun `normalize leaves an already normal code alone`() {
        InviteCodes.normalize("A7K2MP") shouldBe "A7K2MP"
    }
}
