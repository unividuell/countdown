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
}
