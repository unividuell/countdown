package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
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
    private val service = ImagePoolService(images = images, limits = limits)

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

    @Test
    fun `refuses a full pool`() {
        every { images.countInPool(communityId) } returns 2
        assertFailsWith<PoolFullException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())
        }
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
