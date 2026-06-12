package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
        assertEquals(saved.id, query.findById(saved.id!!)?.id)
        assertNull(query.findById(UUID.randomUUID()))
    }
}
