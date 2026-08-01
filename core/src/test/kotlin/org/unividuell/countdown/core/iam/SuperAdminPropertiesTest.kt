package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties

class SuperAdminPropertiesTest {

    @Test
    fun `matches a login despite whitespace left by a comma-separated value`() {
        val properties = SuperAdminProperties(listOf("alice", " bob"))

        properties.isSuperAdmin("bob") shouldBe true
    }

    @Test
    fun `normalized view trims entries and drops blanks`() {
        val properties = SuperAdminProperties(listOf("alice", " bob", "", "   "))

        properties.normalizedSuperAdminGithubLogins shouldBe listOf("alice", "bob")
    }
}
