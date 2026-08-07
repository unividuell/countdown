package org.unividuell.countdown.core.iam

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class UserQueryServiceTest(
    @Autowired val query: UserQuery,
    @Autowired val repository: UserRepository,
) {

    @Test
    fun `finds user by id and returns null for unknown`() {
        val saved = repository.save(User(githubId = 202L, githubLogin = "octocat"))
        query.findById(saved.id!!)?.id shouldBe saved.id
        query.findById(UUID.randomUUID()).shouldBeNull()
    }

    @Test
    fun `answers the effective community-creation permission and defaults to false`() {
        val plain = repository.save(User(githubId = 301L, githubLogin = "plain"))
        val cleared = repository.save(
            User(githubId = 302L, githubLogin = "cleared", communityCreationAllowed = true)
        )
        val boss = repository.save(User(githubId = 303L, githubLogin = "boss", isSuperAdmin = true))

        query.mayCreateCommunities(plain.id!!) shouldBe false
        query.mayCreateCommunities(cleared.id!!) shouldBe true
        query.mayCreateCommunities(boss.id!!) shouldBe true
        query.mayCreateCommunities(UUID.randomUUID()) shouldBe false
    }
}
