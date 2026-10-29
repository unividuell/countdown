package org.unividuell.countdown.core.audiopool

import io.kotest.matchers.collections.shouldBeSorted
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.audiopool.internal.AudioClip
import org.unividuell.countdown.core.audiopool.internal.AudioClipRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.UUID

/** Rolled back after each test: nothing here may outlive it in the shared global pool. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class AudioPoolQueryServiceTest(
    @Autowired val query: AudioPoolQuery,
    @Autowired val clips: AudioClipRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun user(): UUID = users.save(User(subject = System.nanoTime().toString(), githubLogin = "pool-query")).id!!

    private fun stored(communityId: UUID?, uploader: UUID, seed: Byte): UUID = clips.save(
        AudioClip(
            communityId = communityId,
            uploadedBy = uploader,
            fileName = "clip-$seed.wav",
            channels = 1,
            sampleRate = 48_000,
            frames = 10,
            byteSize = 3,
            sha256 = ByteArray(32) { seed },
            bytes = byteArrayOf(seed, seed, seed),
        ),
    ).id!!

    @Test
    fun `candidate ids are the pool's own, ascending, the global pool under null`() {
        val owner = user()
        val community = communities.create(creatorUserId = owner, rawName = "Audio Query").id!!
        val first = stored(communityId = community, uploader = owner, seed = 1)
        val second = stored(communityId = community, uploader = owner, seed = 2)
        val global = stored(communityId = null, uploader = owner, seed = 3)

        query.candidateIds(community) shouldContainExactly listOf(first, second)

        // The global pool is shared across tests: ask for the row, not for the pool alone.
        query.candidateIds(null) shouldContain global
        query.candidateIds(null).shouldBeSorted()
        query.candidateIds(null) shouldNotContain first
    }

    @Test
    fun `wav returns the stored bytes, null for a deleted clip`() {
        val owner = user()
        val id = stored(communityId = null, uploader = owner, seed = 4)

        query.wav(id) shouldBe byteArrayOf(4, 4, 4)

        clips.deleteClip(id)

        query.wav(id).shouldBeNull()
    }
}
