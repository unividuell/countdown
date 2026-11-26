package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.game.internal.GameWeightStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class GameWeightStoreTest(
    @Autowired val store: GameWeightStore,
    @Autowired val catalog: GameCatalog,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
    @Autowired val jdbc: JdbcClient,
) {
    private fun aCommunity(): UUID {
        val creator = requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = "admin")).id)
        val slug = "w${System.nanoTime()}"
        return requireNotNull(communities.save(Community(name = slug, slug = slug, createdBy = creator)).id)
    }

    private val a get() = catalog.ids()[0]
    private val b get() = catalog.ids()[1]
    private val c get() = catalog.ids()[2]

    @Test
    fun `a community without rows has no weights`() {
        store.weightsOf(aCommunity()) shouldBe emptyMap()
    }

    @Test
    fun `replace stores only non-normal weights`() {
        val community = aCommunity()

        store.replace(communityId = community, weights = mapOf(a to GameWeight.OFTEN, b to GameWeight.NORMAL, c to GameWeight.OFF))

        store.weightsOf(community) shouldBe mapOf(a to GameWeight.OFTEN, c to GameWeight.OFF)
    }

    @Test
    fun `replace drops what is no longer set`() {
        val community = aCommunity()
        store.replace(communityId = community, weights = mapOf(a to GameWeight.OFTEN, b to GameWeight.RARE))

        store.replace(communityId = community, weights = mapOf(b to GameWeight.RARE))

        store.weightsOf(community) shouldBe mapOf(b to GameWeight.RARE)
    }

    @Test
    fun `weights of games this build does not have are ignored`() {
        val community = aCommunity()
        jdbc.sql("INSERT INTO game.community_game_weights (community_id, game_type, weight) VALUES (:c, 'gone', 'OFTEN')")
            .param("c", community)
            .update()

        store.weightsOf(community) shouldBe emptyMap()
    }

    @Test
    fun `communities do not see each other's weights`() {
        val one = aCommunity()
        val other = aCommunity()

        store.replace(communityId = one, weights = mapOf(a to GameWeight.OFF))

        store.weightsOf(other) shouldBe emptyMap()
    }
}
