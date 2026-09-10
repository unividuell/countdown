package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkObject
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.imagepool.internal.*
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.test.assertFailsWith

class ImagePoolServiceTest {

    private val images: ImageRepository = mockk(relaxed = true)
    private val limits = ImagePoolProperties(
        perCommunityLimit = 2, globalLimit = 1,
        // Long, not Int -- Kotlin does not widen a literal for you.
        maxBytes = 15 * 1024 * 1024, maxPixels = 40_000_000L, thumbEdge = 400,
    )
    private val transactionManager = RecordingTransactionManager()
    private val service = ImagePoolService(
        images = images,
        limits = limits,
        transactions = TransactionTemplate(transactionManager),
    )

    @AfterEach
    fun unmockIntake() = unmockkObject(ImageIntake)

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val uploader = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")
    private val pool = PoolContext(communityId = communityId, viewerIsAdmin = false)

    private fun jpeg(width: Int = 64, height: Int = 32): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, width, height); dispose() }
        val out = ByteArrayOutputStream()
        ImageIO.write(img, "jpeg", out)
        return out.toByteArray()
    }

    @Test
    fun `stores the original untouched and a thumbnail beside it`() {
        every { images.countInPool(communityId) } returns 0
        every { images.existsInPool(communityId = communityId, sha256 = any()) } returns false
        val bytes = jpeg()
        // save() must hand back a row WITH an id -- the service reads saved.id!! straight after.
        every { images.save(any<Image>()) } answers {
            val incoming = firstArg<Image>()
            incoming.bytes.contentEquals(bytes) shouldBe true
            Image(
                id = UUID.randomUUID(),
                communityId = incoming.communityId,
                uploadedBy = incoming.uploadedBy,
                mediaType = incoming.mediaType,
                width = incoming.width,
                height = incoming.height,
                byteSize = incoming.byteSize,
                sha256 = incoming.sha256,
                bytes = incoming.bytes,
                thumbBytes = incoming.thumbBytes,
            )
        }
        every { images.findSummary(any()) } returns summary()

        service.upload(pool = pool, uploaderId = uploader, bytes = bytes)

        verify { images.lockPool(any()) }
        verify {
            images.save(match<Image> { it.mediaType == "image/jpeg" && it.width == 64 && it.thumbBytes.isNotEmpty() })
        }
    }

    /**
     * The guarantee that protects the connection pool: the decode is the slow part of an upload,
     * and a transaction here means one of Hikari's ten connections plus the community's advisory
     * lock. Nothing else in this file would notice the whole method going back under one
     * transaction, so this asks where each step ran.
     */
    @Test
    fun `the decode runs outside the transaction, the lock and the insert inside`() {
        every { images.countInPool(communityId) } returns 0
        every { images.existsInPool(communityId = communityId, sha256 = any()) } returns false
        every { images.findSummary(any()) } returns summary()
        val inTransaction = mutableMapOf<String, Boolean>()
        every { images.lockPool(any()) } answers { inTransaction["lock"] = transactionManager.active; 1L }
        every { images.save(any<Image>()) } answers {
            inTransaction["save"] = transactionManager.active
            Image(
                id = UUID.randomUUID(), communityId = communityId, uploadedBy = uploader,
                mediaType = "image/jpeg", width = 64, height = 32, byteSize = 3,
                sha256 = ByteArray(32), bytes = ByteArray(3), thumbBytes = byteArrayOf(1),
            )
        }
        mockkObject(ImageIntake)
        every { ImageIntake.thumbnail(bytes = any(), mediaType = any(), maxEdge = any()) } answers {
            inTransaction["decode"] = transactionManager.active
            byteArrayOf(1)
        }

        service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())

        inTransaction shouldBe mapOf("decode" to false, "lock" to true, "save" to true)
        transactionManager.events shouldContainExactly listOf("begin", "commit")
    }

    @Test
    fun `refuses a full pool`() {
        every { images.countInPool(communityId) } returns 2
        assertFailsWith<PoolFullException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())
        }
        // The refusal happens inside the guarded region, so it must undo it rather than commit.
        transactionManager.events shouldContainExactly listOf("begin", "rollback")
    }

    @Test
    fun `refuses the same file twice in one pool`() {
        every { images.countInPool(communityId) } returns 0
        every { images.existsInPool(communityId = communityId, sha256 = any()) } returns true
        assertFailsWith<DuplicateImageException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())
        }
    }

    @Test
    fun `names HEIC rather than calling it unknown`() {
        every { images.countInPool(communityId) } returns 0
        val heic = ByteArray(4) + "ftypheic".toByteArray() + ByteArray(8)
        assertFailsWith<HeicNotSupportedException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = heic)
        }
    }

    @Test
    fun `refuses a file that is not an image, and one that is too large`() {
        every { images.countInPool(communityId) } returns 0
        assertFailsWith<UnsupportedFormatException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = "nope".toByteArray())
        }
        assertFailsWith<ImageTooLargeException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = ByteArray(limits.maxBytes + 1))
        }
    }

    /**
     * A JPEG's magic bytes with nothing decodable behind them. This is the only place BROKEN_IMAGE
     * is reachable: detect() is happy, and the decoder is the one that refuses.
     */
    @Test
    fun `a file that only looks like an image is named broken, not unknown`() {
        every { images.countInPool(communityId) } returns 0
        val truncated = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()) + ByteArray(64)

        assertFailsWith<BrokenImageException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = truncated)
        }
    }

    @Test
    fun `an admin sees the whole pool, a member only their own`() {
        service.list(pool = pool.copy(viewerIsAdmin = true), viewerId = uploader)
        verify { images.listForCommunity(communityId) }

        service.list(pool = pool, viewerId = uploader)
        verify { images.listForUploader(communityId = communityId, uploadedBy = uploader) }
    }

    @Test
    fun `deleting someone else's image is a 404, not a 403`() {
        every { images.findSummary(any()) } returns summary(uploadedBy = UUID.randomUUID())
        assertFailsWith<ImageNotFoundException> {
            service.delete(pool = pool, id = UUID.randomUUID(), viewerId = uploader)
        }
    }

    @Test
    fun `an image from another pool is invisible even with the right id`() {
        every { images.findSummary(any()) } returns summary(communityId = UUID.randomUUID())
        assertFailsWith<ImageNotFoundException> {
            service.original(pool = pool.copy(viewerIsAdmin = true), id = UUID.randomUUID(), viewerId = uploader)
        }
    }

    private fun summary(
        communityId: UUID? = this.communityId,
        uploadedBy: UUID = uploader,
    ) = ImageSummary(
        id = UUID.randomUUID(), communityId = communityId, uploadedBy = uploadedBy,
        mediaType = "image/jpeg", width = 64, height = 32, byteSize = 10,
        createdAt = Instant.parse("2026-09-01T00:00:00Z"),
    )
}

/**
 * A real [TransactionTemplate] over a manager that does nothing but say when it is inside a
 * transaction. The service's own path stays unstubbed -- what is faked is the database, not the
 * boundary being tested.
 */
private class RecordingTransactionManager : PlatformTransactionManager {
    val events = mutableListOf<String>()
    var active = false
        private set

    override fun getTransaction(definition: TransactionDefinition?): TransactionStatus {
        events += "begin"
        active = true
        return SimpleTransactionStatus()
    }

    override fun commit(status: TransactionStatus) {
        events += "commit"
        active = false
    }

    override fun rollback(status: TransactionStatus) {
        events += "rollback"
        active = false
    }
}
