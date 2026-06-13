package org.unividuell.countdown.core.community

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityRepositoryTest(
    @Autowired val repository: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = 1L, githubLogin = "octocat"))

    @Test
    fun `saves a community with a uuid v7 id and finds it by slug`() {
        val creator = aUser()
        val saved = repository.save(Community(name = "Hütte Hütte", slug = "huette-huette", createdBy = creator.id!!))

        saved.id.shouldNotBeNull()
        saved.id!!.version() shouldBe 7
        saved.createdAt.shouldNotBeNull()
        repository.findBySlug("huette-huette").shouldNotBeNull()
        repository.findBySlug("does-not-exist").shouldBeNull()
    }
}
