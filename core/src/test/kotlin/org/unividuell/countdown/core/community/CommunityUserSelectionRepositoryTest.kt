package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityUserSelectionRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityUserSelectionRepositoryTest(
    @Autowired val selection: CommunityUserSelectionRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {
    @Test
    fun `upsert sets then overwrites the selected community`() {
        val uid = users.save(User(githubId = 3L, githubLogin = "u3")).id!!
        val c1id = communities.save(Community(name = "One", slug = "one", createdBy = uid)).id!!
        val c2id = communities.save(Community(name = "Two", slug = "two", createdBy = uid)).id!!

        selection.upsert(uid, c1id)
        selection.findCommunityId(uid) shouldBe c1id
        selection.upsert(uid, c2id)
        selection.findCommunityId(uid) shouldBe c2id
    }
}
