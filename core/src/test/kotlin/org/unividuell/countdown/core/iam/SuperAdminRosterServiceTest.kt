package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.SuperAdminRosterService
import org.unividuell.countdown.core.iam.internal.UserRepository

/**
 * Integration test on purpose: the roster runs hand-written SQL (`lower(github_login) IN (…)`)
 * and binds the real allowlist property — neither is exercised by a mock.
 * `test-auth.enabled=false` keeps the seeded Futurama users out of this context.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(
    properties = ["app.super-admin-github-logins=bossuser,ghost,notyetflagged", "app.test-auth.enabled=false"],
)
class SuperAdminRosterServiceTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `matches an allowlist entry to a differently-cased github login exactly once`() {
        users.save(User(githubId = 501L, githubLogin = "BossUser", displayName = "Boss", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin.lowercase() == "bossuser" }

        rows shouldHaveSize 1
        rows[0].flagged shouldBe true
        rows[0].allowlisted shouldBe true
        rows[0].username shouldBe "Boss"
    }

    @Test
    fun `an allowlisted user stored with mixed-case login resolves to their real row instead of a phantom`() {
        // Unlike the differently-cased case above, this user is NOT flagged, so findSuperAdmins()
        // can't find them either — the only path to their real row is the lowercased SQL lookup.
        users.save(User(githubId = 504L, githubLogin = "NotYetFlagged"))

        val row = service.roster().single { it.githubLogin.lowercase() == "notyetflagged" }

        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldNotBeNull()
    }

    @Test
    fun `orders rows by lowercased github login`() {
        users.save(User(githubId = 505L, githubLogin = "Zulu", isSuperAdmin = true))
        users.save(User(githubId = 506L, githubLogin = "alpha", isSuperAdmin = true))

        val ownLogins = setOf("zulu", "alpha", "bossuser", "ghost", "notyetflagged")
        val logins = service.roster().map { it.githubLogin }.filter { it.lowercase() in ownLogins }

        logins shouldBe listOf("alpha", "bossuser", "ghost", "notyetflagged", "Zulu")
    }

    @Test
    fun `an allowlist entry without a user row awaits its first login`() {
        val row = service.roster().single { it.githubLogin == "ghost" }

        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldBeNull()
        row.createdAt.shouldBeNull()
        row.username.shouldBeNull()
    }

    @Test
    fun `a flagged user missing from the allowlist is reported as stale`() {
        users.save(User(githubId = 502L, githubLogin = "removed", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "removed" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}

/** Separate context: the empty default must not produce `IN ()`. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["app.super-admin-github-logins=", "app.test-auth.enabled=false"])
class SuperAdminRosterEmptyAllowlistTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `an empty allowlist returns only flagged users`() {
        users.save(User(githubId = 503L, githubLogin = "onlyflagged", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "onlyflagged" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}
