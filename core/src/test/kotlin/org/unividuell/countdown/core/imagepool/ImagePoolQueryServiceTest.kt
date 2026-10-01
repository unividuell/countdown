package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.internal.Image
import org.unividuell.countdown.core.imagepool.internal.ImageRepository
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.UUID
import javax.imageio.ImageIO

/** Rolled back after each test: nothing here may outlive it in the shared global pool. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class ImagePoolQueryServiceTest(
    @Autowired val query: ImagePoolQuery,
    @Autowired val images: ImageRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun user(): UUID = users.save(User(githubId = System.nanoTime(), githubLogin = "pool-query")).id!!

    private fun png(width: Int, height: Int): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, width, height); dispose() }
        return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
    }

    private fun stored(communityId: UUID?, uploader: UUID, bytes: ByteArray): UUID = images.save(
        Image(
            communityId = communityId, uploadedBy = uploader, mediaType = "image/png",
            width = 1, height = 1, byteSize = bytes.size,
            sha256 = MessageDigest.getInstance("SHA-256").digest(bytes),
            bytes = bytes, thumbBytes = byteArrayOf(0),
        ),
    ).id!!

    @Test
    fun `candidates are one pool's ids in a stable order`() {
        val owner = user()
        val community = communities.create(creatorUserId = owner, rawName = "Pool Query").id!!
        val first = stored(communityId = community, uploader = owner, bytes = png(width = 10, height = 5))
        val second = stored(communityId = community, uploader = owner, bytes = png(width = 11, height = 5))
        stored(communityId = null, uploader = owner, bytes = png(width = 12, height = 5))

        query.candidateIds(community) shouldContainExactly listOf(first, second)
    }

    @Test
    fun `the display size comes from the image, not from the stored columns`() {
        val owner = user()
        val id = stored(communityId = null, uploader = owner, bytes = png(width = 30, height = 10))

        query.displaySize(id) shouldBe ImageSize(width = 30, height = 10)
    }

    @Test
    fun `a missing image has neither size nor pixels`() {
        query.displaySize(UUID.randomUUID()).shouldBeNull()
        query.displayed(id = UUID.randomUUID(), minShortEdge = 10).shouldBeNull()
    }

    @Test
    fun `the displayed image is decoded`() {
        val owner = user()
        val id = stored(communityId = null, uploader = owner, bytes = png(width = 30, height = 10))

        query.displayed(id = id, minShortEdge = 10).shouldNotBeNull().width shouldBe 30
    }
}
