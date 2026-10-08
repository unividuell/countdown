package org.unividuell.countdown.core.iam

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.collections.shouldNotContain
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
 * Integration test on purpose: the roster runs hand-written SQL (`lower(github_login) IN (…)`, per
 * provider) and reads the real allowlist bean — neither is exercised by a mock. The list is spaced
 * like a hand-edited "a, b" value on purpose: `ghost` and `notyetflagged` must resolve without a
 * phantom " ghost" row.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(
    properties = [
        "unividuell.auth.roles.super-admin=github:bossuser, github:ghost, github:notyetflagged, github:prof, test:prof",
    ],
)
class SuperAdminRosterServiceTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `matches an allowlist entry to a differently-cased github login exactly once`() {
        users.save(User(subject = "501", githubLogin = "BossUser", displayName = "Boss", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin.lowercase() == "bossuser" }

        rows shouldHaveSize 1
        rows[0].provider shouldBe "github"
        rows[0].flagged shouldBe true
        rows[0].allowlisted shouldBe true
        rows[0].username shouldBe "Boss"
    }

    @Test
    fun `an allowlisted user stored with mixed-case login resolves to their real row instead of a phantom`() {
        // Unlike the differently-cased case above, this user is NOT flagged, so findSuperAdmins()
        // can't find them either — the only path to their real row is the lowercased SQL lookup.
        users.save(User(subject = "504", githubLogin = "NotYetFlagged"))

        val row = service.roster().single { it.githubLogin.lowercase() == "notyetflagged" }

        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldNotBeNull()
    }

    @Test
    fun `orders rows by lowercased github login`() {
        users.save(User(subject = "505", githubLogin = "Zulu", isSuperAdmin = true))
        users.save(User(subject = "506", githubLogin = "alpha", isSuperAdmin = true))

        val ownLogins = setOf("zulu", "alpha", "bossuser", "ghost", "notyetflagged")
        val logins = service.roster().map { it.githubLogin }.filter { it.lowercase() in ownLogins }

        logins shouldBe listOf("alpha", "bossuser", "ghost", "notyetflagged", "Zulu")
    }

    @Test
    fun `an allowlist entry without a user row awaits its first login`() {
        val row = service.roster().single { it.githubLogin == "ghost" }

        row.provider shouldBe "github"
        row.flagged shouldBe false
        row.allowlisted shouldBe true
        row.userId.shouldBeNull()
        row.createdAt.shouldBeNull()
        row.username.shouldBeNull()
    }

    @Test
    fun `whitespace left by a comma-separated allowlist value produces no phantom row`() {
        val logins = service.roster().map { it.githubLogin }

        logins shouldContain "ghost"
        logins shouldNotContain " ghost"
    }

    @Test
    fun `a flagged user missing from the allowlist is reported as stale`() {
        users.save(User(subject = "502", githubLogin = "removed", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "removed" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }

    @Test
    fun `the same login at two providers is two rows`() {
        users.save(User(provider = "test", subject = "prof", githubLogin = "prof", isSuperAdmin = true))

        val rows = service.roster().filter { it.githubLogin == "prof" }

        rows.map { it.provider } shouldBe listOf("github", "test")
        rows.single { it.provider == "test" }.let {
            it.flagged shouldBe true
            it.allowlisted shouldBe true
            it.userId.shouldNotBeNull()
        }
        rows.single { it.provider == "github" }.let {
            it.flagged shouldBe false
            it.allowlisted shouldBe true
            it.userId.shouldBeNull()
        }
    }

    @Test
    fun `a login listed for one provider does not cover the same login at another`() {
        users.save(User(provider = "test", subject = "bossuser", githubLogin = "bossuser", isSuperAdmin = true))

        val row = service.roster().single { it.provider == "test" && it.githubLogin == "bossuser" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}

/** Separate context: the empty default must not produce `IN ()`. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
@TestPropertySource(properties = ["unividuell.auth.roles.super-admin="])
class SuperAdminRosterEmptyAllowlistTest(
    @Autowired val service: SuperAdminRosterService,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `an empty allowlist returns only flagged users`() {
        users.save(User(subject = "503", githubLogin = "onlyflagged", isSuperAdmin = true))

        val row = service.roster().single { it.githubLogin == "onlyflagged" }

        row.flagged shouldBe true
        row.allowlisted shouldBe false
    }
}
