package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class UserTest {

    private fun user(superAdmin: Boolean = false, allowed: Boolean = false) = User(
        githubId = 1L, githubLogin = "octocat",
        isSuperAdmin = superAdmin, communityCreationAllowed = allowed,
    )

    @Test
    fun `may create communities when the clearance is stored`() {
        user(allowed = true).mayCreateCommunities shouldBe true
    }

    @Test
    fun `may create communities as a super-admin without a stored clearance`() {
        user(superAdmin = true).mayCreateCommunities shouldBe true
    }

    @Test
    fun `may not create communities without either`() {
        user().mayCreateCommunities shouldBe false
    }
}
