package org.unividuell.countdown.core.audiopool

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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.audiopool.internal.AUDIO_LOCK_CLASS
import org.unividuell.countdown.core.audiopool.internal.AudioClip
import org.unividuell.countdown.core.audiopool.internal.AudioClipRepository
import org.unividuell.countdown.core.audiopool.internal.AudioPoolContext
import org.unividuell.countdown.core.audiopool.internal.AudioPoolService
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import javax.sql.DataSource
import kotlin.test.assertFailsWith

/**
 * Deliberately NOT @Transactional, for the reason given in ImageRepositoryTest: a unique
 * violation would abort a shared transaction. Isolation comes from per-test names instead, and
 * every community and global-pool row created here is deleted again afterwards.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class AudioClipRepositoryTest(
    @Autowired val clips: AudioClipRepository,
    @Autowired val communityRepo: CommunityRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
    @Autowired val jdbc: JdbcTemplate,
    @Autowired val dataSource: DataSource,
    @Autowired val transactions: TransactionTemplate,
    @Autowired val service: AudioPoolService,
) {
    private val createdCommunities = mutableListOf<UUID>()

    @AfterEach
    fun cleanUpCommunities() {
        createdCommunities.forEach { communityRepo.deleteById(it) }
        createdCommunities.clear()
    }

    @AfterEach
    fun cleanUpGlobalPool() {
        jdbc.update("DELETE FROM audiopool.clips WHERE community_id IS NULL")
    }

    private fun user(login: String): UUID =
        users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id!!

    private fun community(name: String, owner: UUID): UUID =
        communities.create(creatorUserId = owner, rawName = name).id!!.also { createdCommunities.add(it) }

    private fun clip(communityId: UUID?, uploader: UUID, seed: Byte) = AudioClip(
        communityId = communityId,
        uploadedBy = uploader,
        fileName = "clip-$seed.wav",
        channels = 2,
        sampleRate = 48_000,
        frames = 10,
        byteSize = 3,
        sha256 = ByteArray(32) { seed },
        bytes = byteArrayOf(seed, seed, seed),
    )

    @Test
    fun `lists a community's clips newest first, and never another pool's`() {
        val alice = user("alice")
        val alpha = community(name = "Alpha", owner = alice)
        val beta = community(name = "Beta", owner = alice)

        val first = clips.save(clip(communityId = alpha, uploader = alice, seed = 1)).id!!
        val second = clips.save(clip(communityId = alpha, uploader = alice, seed = 2)).id!!
        clips.save(clip(communityId = beta, uploader = alice, seed = 3))
        val global = clips.save(clip(communityId = null, uploader = alice, seed = 4)).id!!

        // uuidv7 is time-ordered, so "newest first" and "highest id first" agree.
        clips.listForCommunity(alpha).map { it.id } shouldContainExactly listOf(second, first)
        // The global pool is shared across tests, so this asks whether the row is there --
        // not whether it is alone.
        clips.listGlobal().map { it.id } shouldContain global
        clips.listGlobal().map { it.communityId }.toSet() shouldBe setOf(null)
    }

    @Test
    fun `a member sees only their own uploads`() {
        val alice = user("alice2")
        val bob = user("bob2")
        val alpha = community(name = "Gamma", owner = alice)
        val mine = clips.save(clip(communityId = alpha, uploader = alice, seed = 5)).id!!
        clips.save(clip(communityId = alpha, uploader = bob, seed = 6))

        clips.listForUploader(communityId = alpha, uploadedBy = alice).map { it.id } shouldContainExactly listOf(mine)
    }

    @Test
    fun `the same file twice is refused within a pool, but allowed across pools`() {
        val alice = user("alice3")
        val alpha = community(name = "Delta", owner = alice)
        val beta = community(name = "Epsilon", owner = alice)

        clips.save(clip(communityId = alpha, uploader = alice, seed = 7))
        // same bytes, different pool: allowed
        clips.save(clip(communityId = beta, uploader = alice, seed = 7))

        assertFailsWith<DuplicateKeyException> {
            clips.save(clip(communityId = alpha, uploader = alice, seed = 7))
        }
    }

    @Test
    fun `NULLS NOT DISTINCT -- the rule bites in the global pool too`() {
        val alice = user("alice6")
        clips.save(clip(communityId = null, uploader = alice, seed = 8))

        assertFailsWith<DuplicateKeyException> {
            clips.save(clip(communityId = null, uploader = alice, seed = 8))
        }
    }

    /**
     * The summary queries are a projection on purpose: `bytes` averages hundreds of KB a row, and
     * every other assertion in this file -- ids, order, counts, deletion -- stays green if one of
     * them degrades to `SELECT *`, so the guarantee is asserted on the SQL.
     */
    @Test
    fun `no summary query reads the bytes column`() {
        val projections = setOf("listForCommunity", "listForUploader", "listGlobal", "findSummary")
        val queried = AudioClipRepository::class.java.declaredMethods
            .filter { it.name in projections }
            .map { it.name to it.getAnnotation(Query::class.java).shouldNotBeNull().value }

        // Without this, a renamed method would drop out of the filter and take its guarantee along.
        queried.map { it.first }.toSet() shouldBe projections

        queried.forEach { (name, sql) ->
            val selected = sql.substringAfter("SELECT").substringBefore("FROM")
            withClue("$name selects$selected") {
                // `byte_size` is a small int and welcome.
                selected shouldNotContain "bytes"
                selected shouldNotContain "*"
            }
        }
    }

    /** The one query no other test reaches: a typo would surface on the first production upload. */
    @Test
    fun `the pool lock is SQL Postgres accepts`() {
        clips.lockPool(classId = AUDIO_LOCK_CLASS, key = 7) shouldBe 1L
    }

    /**
     * Held in the image pool's key space, a pool's lock would make image and audio uploads of one
     * community wait on each other. The image pool locks with a single bigint; the audio pool's
     * two-int form is a separate key space, so a bigint with the same low bits stays free.
     */
    @Test
    fun `the audio lock leaves the image pool's key space free`() {
        val key = 12345

        transactions.executeWithoutResult {
            clips.lockPool(classId = AUDIO_LOCK_CLASS, key = key)

            dataSource.connection.use { other ->
                other.prepareStatement("SELECT pg_try_advisory_xact_lock(?::bigint)").use {
                    it.setLong(1, key.toLong())
                    it.executeQuery().use { rs -> rs.next(); rs.getBoolean(1) } shouldBe true
                }
                other.prepareStatement("SELECT pg_try_advisory_xact_lock(?, ?)").use {
                    it.setInt(1, AUDIO_LOCK_CLASS)
                    it.setInt(2, key)
                    it.executeQuery().use { rs -> rs.next(); rs.getBoolean(1) } shouldBe false
                }
            }
        }
    }

    /**
     * The only place the upload path itself meets a database: AudioPoolServiceTest mocks the
     * repository, so nothing else ever runs the real service's lock, quota read and insert inside
     * its TransactionTemplate.
     */
    @Test
    fun `the real upload path takes the lock and commits the row`() {
        val alice = user("alice7")
        val theta = community(name = "Theta", owner = alice)
        val bytes = wav()

        val stored = service.upload(
            pool = AudioPoolContext(communityId = theta, viewerIsAdmin = false),
            uploaderId = alice,
            fileName = "spruch.wav",
            bytes = bytes,
        )

        clips.countInPool(theta) shouldBe 1L
        clips.findSummary(stored.id).shouldNotBeNull().uploadedBy shouldBe alice
        clips.findWav(stored.id) shouldBe bytes
    }

    private fun wav(): ByteArray {
        val format = AudioFormat(48_000f, 16, 1, true, false)
        val out = ByteArrayOutputStream()
        AudioInputStream(ByteArrayInputStream(ByteArray(480 * format.frameSize)), format, 480L).use {
            AudioSystem.write(it, AudioFileFormat.Type.WAVE, out)
        }
        return out.toByteArray()
    }

    @Test
    fun `counts, wav reads and deletion`() {
        val alice = user("alice4")
        val alpha = community(name = "Zeta", owner = alice)
        val id = clips.save(clip(communityId = alpha, uploader = alice, seed = 9)).id!!

        clips.countInPool(alpha) shouldBe 1L
        clips.existsInPool(communityId = alpha, sha256 = ByteArray(32) { 9 }) shouldBe true
        clips.existsInPool(communityId = alpha, sha256 = ByteArray(32) { 99 }) shouldBe false

        clips.findSummary(id).shouldNotBeNull().channels shouldBe 2
        clips.findWav(id).shouldNotBeNull().size shouldBe 3

        clips.deleteClip(id) shouldBe 1
        clips.findSummary(id) shouldBe null
    }

    @Test
    fun `deleting the community takes its clips with it`() {
        val alice = user("alice5")
        val alpha = community(name = "Eta", owner = alice)
        clips.save(clip(communityId = alpha, uploader = alice, seed = 10))

        communityRepo.deleteById(alpha)

        clips.listForCommunity(alpha) shouldContainExactly emptyList()
    }
}
