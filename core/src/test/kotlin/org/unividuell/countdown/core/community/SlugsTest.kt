package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.Slugs

class SlugsTest {
    @Test
    fun `derives url-safe slug with german transliteration`() {
        Slugs.slugify("Hütte Hütte") shouldBe "huette-huette"
        Slugs.slugify("Café Crème") shouldBe "cafe-creme"
        Slugs.slugify("Süßes & Saures!") shouldBe "suesses-saures"
        Slugs.slugify("  multiple   spaces  ") shouldBe "multiple-spaces"
        Slugs.slugify("Team---A") shouldBe "team-a"
    }
}
