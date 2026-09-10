package org.unividuell.countdown.core.imagepool

import io.kotest.assertions.withClue
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.jdbc.repository.query.Query
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.internal.Image
import org.unividuell.countdown.core.imagepool.internal.ImageRepository
import java.util.UUID
import kotlin.test.assertFailsWith

/**
 * Deliberately NOT @Transactional, unlike most repository tests here: one case provokes a unique
 * violation, and inside a shared transaction Postgres would abort it and fail every later
 * statement with "current transaction is aborted". Isolation comes from per-test names instead.
 *
 * That also means every community created here is committed for good, and CommunityService.create
 * gives each one an active edition -- left behind, it pollutes an unfiltered query in another
 * test (CommunityEditionRepositoryTest.findAllActive counts every active edition in the database).
 * [cleanUpCommunities] deletes what this test created; the cascade takes its edition and
 * membership row along.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class ImageRepositoryTest(
    @Autowired val images: ImageRepository,
    @Autowired val communityRepo: CommunityRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private val createdCommunities = mutableListOf<UUID>()

    @AfterEach
    fun cleanUpCommunities() {
        createdCommunities.forEach { communityRepo.deleteById(it) }
        createdCommunities.clear()
    }

    private fun user(login: String): UUID =
        users.save(User(githubId = System.nanoTime(), githubLogin = login)).id!!

    /** create() derives the slug and fills createdBy -- the constructor demands both. */
    private fun community(name: String, owner: UUID): UUID =
        communities.create(creatorUserId = owner, rawName = name).id!!.also { createdCommunities.add(it) }

    private fun image(communityId: UUID?, uploader: UUID, seed: Byte) = Image(
        communityId = communityId,
        uploadedBy = uploader,
        mediaType = "image/jpeg",
        width = 400, height = 300, byteSize = 3,
        sha256 = ByteArray(32) { seed },
        bytes = byteArrayOf(seed, seed, seed),
        thumbBytes = byteArrayOf(seed),
    )

    @Test
    fun `lists a community's images newest first, and never another pool's`() {
        val alice = user("alice")
        val alpha = community(name = "Alpha", owner = alice)
        val beta = community(name = "Beta", owner = alice)

        val first = images.save(image(communityId = alpha, uploader = alice, seed = 1)).id!!
        val second = images.save(image(communityId = alpha, uploader = alice, seed = 2)).id!!
        images.save(image(communityId = beta, uploader = alice, seed = 3))
        val global = images.save(image(communityId = null, uploader = alice, seed = 4)).id!!

        // uuidv7 is time-ordered, so "newest first" and "highest id first" agree.
        images.listForCommunity(alpha).map { it.id } shouldContainExactly listOf(second, first)
        // The global pool is shared across tests, so this asks whether the row is there --
        // not whether it is alone.
        images.listGlobal().map { it.id } shouldContain global
        images.listGlobal().map { it.communityId }.toSet() shouldBe setOf(null)
    }

    @Test
    fun `a member sees only their own uploads`() {
        val alice = user("alice2")
        val bob = user("bob2")
        val alpha = community(name = "Gamma", owner = alice)
        val mine = images.save(image(communityId = alpha, uploader = alice, seed = 5)).id!!
        images.save(image(communityId = alpha, uploader = bob, seed = 6))

        images.listForUploader(communityId = alpha, uploadedBy = alice).map { it.id } shouldContainExactly listOf(mine)
    }

    @Test
    fun `the same file twice is refused within a pool, but allowed across pools`() {
        val alice = user("alice3")
        val alpha = community(name = "Delta", owner = alice)
        val beta = community(name = "Epsilon", owner = alice)

        images.save(image(communityId = alpha, uploader = alice, seed = 7))
        // same bytes, different pool: allowed
        images.save(image(communityId = beta, uploader = alice, seed = 7))

        assertFailsWith<DuplicateKeyException> {
            images.save(image(communityId = alpha, uploader = alice, seed = 7))
        }
    }

    @Test
    fun `NULLS NOT DISTINCT -- the rule bites in the global pool too`() {
        val alice = user("alice6")
        images.save(image(communityId = null, uploader = alice, seed = 8))

        assertFailsWith<DuplicateKeyException> {
            images.save(image(communityId = null, uploader = alice, seed = 8))
        }
    }

    /**
     * The summary queries are a projection on purpose: `bytes` averages several MB a row, so a
     * `SELECT *` over a full 150-image pool is ~750 MB against a 1.4 GB heap, on a container that
     * runs -XX:+ExitOnOutOfMemoryError. Every other assertion in this file -- ids, order, counts,
     * deletion -- stays green through exactly that change, so the guarantee is asserted on the SQL.
     */
    @Test
    fun `no summary query reads the byte columns`() {
        val projections = setOf("listForCommunity", "listForUploader", "listGlobal", "findSummary")
        val queried = ImageRepository::class.java.declaredMethods
            .filter { it.name in projections }
            .map { it.name to it.getAnnotation(Query::class.java).shouldNotBeNull().value }

        // Without this, a renamed method would drop out of the filter and take its guarantee along.
        queried.map { it.first }.toSet() shouldBe projections

        queried.forEach { (name, sql) ->
            val selected = sql.substringAfter("SELECT").substringBefore("FROM")
            withClue("$name selects$selected") {
                // Catches both `bytes` and `thumb_bytes`; `byte_size` is a small int and welcome.
                selected shouldNotContain "bytes"
                selected shouldNotContain "*"
            }
        }
    }

    /** The one query no other test reaches: a typo would surface on the first production upload. */
    @Test
    fun `the pool lock is SQL Postgres accepts`() {
        images.lockPool(System.nanoTime()) shouldBe 1L
    }

    @Test
    fun `counts, byte reads and deletion`() {
        val alice = user("alice4")
        val alpha = community(name = "Zeta", owner = alice)
        val id = images.save(image(communityId = alpha, uploader = alice, seed = 9)).id!!

        images.countInPool(alpha) shouldBe 1L
        images.existsInPool(communityId = alpha, sha256 = ByteArray(32) { 9 }) shouldBe true
        images.existsInPool(communityId = alpha, sha256 = ByteArray(32) { 99 }) shouldBe false

        val original = images.findOriginal(id).shouldNotBeNull()
        original.mediaType shouldBe "image/jpeg"
        original.bytes.size shouldBe 3
        images.findThumb(id).shouldNotBeNull().size shouldBe 1

        images.deleteImage(id) shouldBe 1
        images.findSummary(id) shouldBe null
    }

    @Test
    fun `deleting the community takes its images with it`() {
        val alice = user("alice5")
        val alpha = community(name = "Eta", owner = alice)
        images.save(image(communityId = alpha, uploader = alice, seed = 10))

        communityRepo.deleteById(alpha)

        images.listForCommunity(alpha) shouldContainExactly emptyList()
    }
}
