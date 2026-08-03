package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.MemberShortName

class MemberShortNameTest {
    @Test
    fun `keeps a short name verbatim, punctuation included`() {
        MemberShortName.of(":-|") shouldBe ":-|"
        MemberShortName.of("Fry") shouldBe "FRY"
        MemberShortName.of("anna") shouldBe "ANNA"
    }

    @Test
    fun `drops vowels only once the name is too long`() {
        MemberShortName.of("Bender") shouldBe "BNDR"
        MemberShortName.of("hubert") shouldBe "HBRT"
    }

    @Test
    fun `collapses repeats and truncates the longest names`() {
        MemberShortName.of("Turanga Leela") shouldBe "TRNG"
        MemberShortName.of("Prof Farnsworth") shouldBe "PRFR"
    }

    @Test
    fun `falls back when nothing printable survives`() {
        MemberShortName.of("aeiou") shouldBe ":/"
        MemberShortName.of("") shouldBe ":/"
    }
}
