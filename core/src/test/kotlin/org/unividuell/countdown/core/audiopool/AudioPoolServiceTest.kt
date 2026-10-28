package org.unividuell.countdown.core.audiopool

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionTemplate
import org.unividuell.countdown.core.RecordingTransactionManager
import org.unividuell.countdown.core.audiopool.internal.AUDIO_LOCK_CLASS
import org.unividuell.countdown.core.audiopool.internal.AudioClip
import org.unividuell.countdown.core.audiopool.internal.AudioClipNotFoundException
import org.unividuell.countdown.core.audiopool.internal.AudioClipRepository
import org.unividuell.countdown.core.audiopool.internal.AudioClipSummary
import org.unividuell.countdown.core.audiopool.internal.AudioPoolContext
import org.unividuell.countdown.core.audiopool.internal.AudioPoolFullException
import org.unividuell.countdown.core.audiopool.internal.AudioPoolProperties
import org.unividuell.countdown.core.audiopool.internal.AudioPoolService
import org.unividuell.countdown.core.audiopool.internal.AudioTooLargeException
import org.unividuell.countdown.core.audiopool.internal.BrokenAudioException
import org.unividuell.countdown.core.audiopool.internal.DuplicateAudioException
import org.unividuell.countdown.core.audiopool.internal.UnsupportedAudioFormatException
import org.unividuell.countdown.core.audiopool.internal.cleanFileName
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem

class AudioPoolServiceTest {

    private val clips: AudioClipRepository = mockk(relaxed = true)
    private val limits = AudioPoolProperties(perCommunityLimit = 2, globalLimit = 1, maxBytes = 5 * 1024 * 1024)
    private val transactionManager = RecordingTransactionManager()
    private val service = serviceWith(limits)

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val uploader = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")
    private val pool = AudioPoolContext(communityId = communityId, viewerIsAdmin = false)
    private val globalPool = AudioPoolContext(communityId = null, viewerIsAdmin = true)
    private val summaryId = UUID.fromString("018f0000-0000-7000-8000-0000000000d1")
    private val saved = slot<AudioClip>()

    private fun serviceWith(limits: AudioPoolProperties) = AudioPoolService(
        clips = clips,
        limits = limits,
        transactions = TransactionTemplate(transactionManager),
    )

    /** Silence, written by the JDK's own WAV writer -- the same family of header the browser sends. */
    private fun wav(frames: Int = 480, channels: Int = 1, rate: Float = 48_000f): ByteArray {
        val format = AudioFormat(rate, 16, channels, true, false)
        val out = ByteArrayOutputStream()
        AudioInputStream(ByteArrayInputStream(ByteArray(frames * format.frameSize)), format, frames.toLong()).use {
            AudioSystem.write(it, AudioFileFormat.Type.WAVE, out)
        }
        return out.toByteArray()
    }

    /** save() must hand back a row WITH an id -- the service reads saved.id!! straight after. */
    private fun stubStorage() {
        every { clips.save(capture(saved)) } answers {
            val incoming = firstArg<AudioClip>()
            AudioClip(
                id = UUID.randomUUID(),
                communityId = incoming.communityId,
                uploadedBy = incoming.uploadedBy,
                fileName = incoming.fileName,
                channels = incoming.channels,
                sampleRate = incoming.sampleRate,
                frames = incoming.frames,
                byteSize = incoming.byteSize,
                sha256 = incoming.sha256,
                bytes = incoming.bytes,
            )
        }
        every { clips.findSummary(any()) } returns summary()
    }

    @Test
    fun `stores the WAV untouched with its header facts`() {
        stubStorage()
        val bytes = wav(frames = 441, channels = 2, rate = 44_100f)

        val stored = service.upload(pool = pool, uploaderId = uploader, fileName = "spruch.wav", bytes = bytes)

        with(saved.captured) {
            this.bytes shouldBe bytes
            channels shouldBe 2
            sampleRate shouldBe 44_100
            frames shouldBe 441
            byteSize shouldBe bytes.size
            sha256.size shouldBe 32
            sha256 shouldBe MessageDigest.getInstance("SHA-256").digest(bytes)
            fileName shouldBe "spruch.wav"
            communityId shouldBe pool.communityId
            uploadedBy shouldBe uploader
        }
        stored shouldBe summary()
        transactionManager.events shouldContainExactly listOf("begin", "commit")
    }

    @Test
    fun `stores the cleaned file name`() {
        stubStorage()

        service.upload(pool = pool, uploaderId = uploader, fileName = "C:\\fakepath\\spruch.wav", bytes = wav())

        saved.captured.fileName shouldBe "spruch.wav"
    }

    @Test
    fun `refuses a non-WAV before anything else`() {
        val mp3 = "ID3".toByteArray() + ByteArray(64)

        shouldThrow<UnsupportedAudioFormatException> {
            service.upload(pool = pool, uploaderId = uploader, fileName = "a.mp3", bytes = mp3)
        }

        verify(exactly = 0) { clips.lockPool(classId = any(), key = any()) }
        transactionManager.events.shouldBeEmpty()
    }

    /**
     * The same oversized file, twice: once readable, once with garbage behind the magic bytes. If
     * the header were read first, the second would be BROKEN_AUDIO -- the size must answer first.
     */
    @Test
    fun `refuses an oversized file before reading its header`() {
        val small = serviceWith(limits.copy(maxBytes = 100))
        val readable = wav()
        val garbage = "RIFF".toByteArray() + ByteArray(4) + "WAVE".toByteArray() + ByteArray(200)

        shouldThrow<AudioTooLargeException> {
            small.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = readable)
        }
        shouldThrow<AudioTooLargeException> {
            small.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = garbage)
        }
        transactionManager.events.shouldBeEmpty()
    }

    @Test
    fun `a file exactly at the size limit is accepted, one byte over is not`() {
        stubStorage()
        val bytes = wav()

        shouldThrow<AudioTooLargeException> {
            serviceWith(limits.copy(maxBytes = bytes.size - 1))
                .upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = bytes)
        }
        serviceWith(limits.copy(maxBytes = bytes.size))
            .upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = bytes)
    }

    @Test
    fun `a broken header is BROKEN_AUDIO`() {
        shouldThrow<BrokenAudioException> {
            service.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = wav().copyOf(20))
        }

        verify(exactly = 0) { clips.lockPool(classId = any(), key = any()) }
        transactionManager.events.shouldBeEmpty()
    }

    @Test
    fun `refuses a duplicate`() {
        every { clips.existsInPool(communityId = communityId, sha256 = any()) } returns true

        shouldThrow<DuplicateAudioException> {
            service.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = wav())
        }
        // The refusal happens inside the guarded region, so it must undo it rather than commit.
        transactionManager.events shouldContainExactly listOf("begin", "rollback")
    }

    @Test
    fun `refuses when the pool is full`() {
        every { clips.countInPool(communityId) } returns 2

        shouldThrow<AudioPoolFullException> {
            service.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = wav())
        }.message shouldContain "at most 2"
        transactionManager.events shouldContainExactly listOf("begin", "rollback")
    }

    /** A full pool must not hide that the file is already in it: the spec orders the duplicate first. */
    @Test
    fun `a full pool answers DUPLICATE for a file it already holds`() {
        every { clips.countInPool(communityId) } returns 2
        every { clips.existsInPool(communityId = communityId, sha256 = any()) } returns true

        shouldThrow<DuplicateAudioException> {
            service.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = wav())
        }
    }

    @Test
    fun `the global limit applies to the global pool`() {
        every { clips.countInPool(null) } returns 1

        shouldThrow<AudioPoolFullException> {
            service.upload(pool = globalPool, uploaderId = uploader, fileName = "a.wav", bytes = wav())
        }.message shouldContain "at most 1"
    }

    @Test
    fun `takes the audio lock inside the transaction`() {
        stubStorage()
        var lockedInside: Boolean? = null
        every {
            clips.lockPool(classId = AUDIO_LOCK_CLASS, key = communityId.toString().hashCode())
        } answers {
            lockedInside = transactionManager.active
            1L
        }

        service.upload(pool = pool, uploaderId = uploader, fileName = "a.wav", bytes = wav())

        verify { clips.lockPool(classId = AUDIO_LOCK_CLASS, key = communityId.toString().hashCode()) }
        lockedInside shouldBe true
    }

    @Test
    fun `the global pool has a lock key of its own`() {
        stubStorage()

        service.upload(pool = globalPool, uploaderId = uploader, fileName = "a.wav", bytes = wav())

        verify { clips.lockPool(classId = AUDIO_LOCK_CLASS, key = "audiopool:global".hashCode()) }
    }

    @Test
    fun `an admin sees the whole pool, a member only their own`() {
        service.list(pool = pool.copy(viewerIsAdmin = true), viewerId = uploader)
        verify { clips.listForCommunity(communityId) }

        service.list(pool = pool, viewerId = uploader)
        verify { clips.listForUploader(communityId = communityId, uploadedBy = uploader) }

        service.list(pool = globalPool, viewerId = uploader)
        verify { clips.listGlobal() }
    }

    @Test
    fun `a member cannot read or delete someone else's clip, nor one from another pool`() {
        val id = UUID.randomUUID()

        every { clips.findSummary(any()) } returns summary(uploadedBy = UUID.randomUUID())
        shouldThrow<AudioClipNotFoundException> { service.wav(pool = pool, id = id, viewerId = uploader) }
        shouldThrow<AudioClipNotFoundException> { service.delete(pool = pool, id = id, viewerId = uploader) }

        // even an admin of this pool sees nothing of another pool's clip
        every { clips.findSummary(any()) } returns summary(communityId = UUID.randomUUID())
        val admin = pool.copy(viewerIsAdmin = true)
        shouldThrow<AudioClipNotFoundException> { service.wav(pool = admin, id = id, viewerId = uploader) }
        shouldThrow<AudioClipNotFoundException> { service.delete(pool = admin, id = id, viewerId = uploader) }

        every { clips.findSummary(any()) } returns null
        shouldThrow<AudioClipNotFoundException> { service.wav(pool = pool, id = id, viewerId = uploader) }

        verify(exactly = 0) { clips.deleteClip(any()) }
    }

    @Test
    fun `a member reads and deletes their own clip, an admin any clip of the pool`() {
        val id = UUID.randomUUID()
        val bytes = wav()
        every { clips.findWav(id) } returns bytes

        every { clips.findSummary(id) } returns summary(uploadedBy = uploader)
        service.wav(pool = pool, id = id, viewerId = uploader) shouldBe bytes
        service.delete(pool = pool, id = id, viewerId = uploader)

        every { clips.findSummary(id) } returns summary(uploadedBy = UUID.randomUUID())
        service.wav(pool = pool.copy(viewerIsAdmin = true), id = id, viewerId = uploader) shouldBe bytes
        service.delete(pool = pool.copy(viewerIsAdmin = true), id = id, viewerId = uploader)

        verify(exactly = 2) { clips.deleteClip(id) }
    }

    @Test
    fun `reports the limit of the addressed pool and the size limit`() {
        service.limitOf(pool) shouldBe 2
        service.limitOf(globalPool) shouldBe 1
        service.maxBytes() shouldBe 5 * 1024 * 1024
    }

    @Test
    fun `cleans the file name`() {
        cleanFileName("C:\\fakepath\\spruch.wav") shouldBe "spruch.wav"
        cleanFileName("a/b/c.wav") shouldBe "c.wav"
        cleanFileName("x".repeat(300)) shouldBe "x".repeat(200)
        cleanFileName("  ") shouldBe "audio.wav"
        cleanFileName(null) shouldBe "audio.wav"
    }

    private fun summary(
        communityId: UUID? = this.communityId,
        uploadedBy: UUID = uploader,
    ) = AudioClipSummary(
        id = summaryId,
        communityId = communityId,
        uploadedBy = uploadedBy,
        fileName = "spruch.wav",
        channels = 1,
        sampleRate = 48_000,
        frames = 480,
        byteSize = 44,
        createdAt = Instant.parse("2026-09-01T00:00:00Z"),
    )
}
