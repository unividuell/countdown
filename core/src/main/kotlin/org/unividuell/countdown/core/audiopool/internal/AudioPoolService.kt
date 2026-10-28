package org.unividuell.countdown.core.audiopool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.util.UUID

private const val MAX_FILE_NAME_LENGTH = 200
private const val DEFAULT_FILE_NAME = "audio.wav"

/**
 * A client may send a whole path ("C:\fakepath\spruch.wav", "a/b/c.wav"); only the name is kept,
 * at most 200 characters, and "audio.wav" when nothing is left.
 */
fun cleanFileName(raw: String?): String =
    raw.orEmpty()
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .trim()
        .take(MAX_FILE_NAME_LENGTH)
        .ifEmpty { DEFAULT_FILE_NAME }

@Service
class AudioPoolService(
    private val clips: AudioClipRepository,
    private val limits: AudioPoolProperties,
    private val transactions: TransactionTemplate,
) {
    /**
     * Magic bytes, size, header and hash all run BEFORE the transaction opens, cheapest first. A
     * transaction here means one of Hikari's ten connections plus the pool's advisory lock; held
     * across hashing up to 5 MB, ten concurrent uploads would starve the application of
     * connections. The price is a hash computed for a file the quota then refuses.
     *
     * `TransactionTemplate` rather than a second @Transactional method: called from inside this
     * class, that one would go around the proxy and run with no transaction at all -- the advisory
     * lock would be released the moment it was taken, the quota would stop being safe, and every
     * test here would stay green.
     */
    fun upload(pool: AudioPoolContext, uploaderId: UUID, fileName: String?, bytes: ByteArray): AudioClipSummary {
        if (!WavIntake.isWav(bytes)) throw UnsupportedAudioFormatException()
        if (bytes.size > limits.maxBytes) throw AudioTooLargeException(limits.maxBytes)

        val format = WavIntake.inspect(bytes)
        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes)

        // Database only from here on: the lock, the two reads it guards, and the insert.
        return transactions.execute {
            clips.lockPool(classId = AUDIO_LOCK_CLASS, key = lockKey(pool.communityId))
            val limit = limitOf(pool)
            // Duplicate first: a full pool must not hide that the file is already in it.
            if (clips.existsInPool(communityId = pool.communityId, sha256 = sha256)) throw DuplicateAudioException()
            if (clips.countInPool(pool.communityId) >= limit) throw AudioPoolFullException(limit)

            val saved = clips.save(
                AudioClip(
                    communityId = pool.communityId,
                    uploadedBy = uploaderId,
                    fileName = cleanFileName(fileName),
                    channels = format.channels,
                    sampleRate = format.sampleRate,
                    frames = format.frames,
                    byteSize = bytes.size,
                    sha256 = sha256,
                    bytes = bytes,
                ),
            )
            clips.findSummary(saved.id!!) ?: throw AudioClipNotFoundException()
        }
    }

    fun list(pool: AudioPoolContext, viewerId: UUID): List<AudioClipSummary> = when {
        pool.communityId == null -> clips.listGlobal()
        pool.viewerIsAdmin -> clips.listForCommunity(pool.communityId)
        else -> clips.listForUploader(communityId = pool.communityId, uploadedBy = viewerId)
    }

    fun count(pool: AudioPoolContext): Long = clips.countInPool(pool.communityId)

    fun limitOf(pool: AudioPoolContext): Int =
        if (pool.communityId == null) limits.globalLimit else limits.perCommunityLimit

    fun maxBytes(): Int = limits.maxBytes

    fun wav(pool: AudioPoolContext, id: UUID, viewerId: UUID): ByteArray {
        visible(pool = pool, id = id, viewerId = viewerId)
        return clips.findWav(id) ?: throw AudioClipNotFoundException()
    }

    @Transactional
    fun delete(pool: AudioPoolContext, id: UUID, viewerId: UUID) {
        visible(pool = pool, id = id, viewerId = viewerId)
        clips.deleteClip(id)
    }

    /**
     * Wrong pool, someone else's upload, or gone -- all one answer. A member who guesses an id
     * must not be able to tell "not yours" from "does not exist".
     */
    private fun visible(pool: AudioPoolContext, id: UUID, viewerId: UUID): AudioClipSummary {
        val summary = clips.findSummary(id) ?: throw AudioClipNotFoundException()
        if (summary.communityId != pool.communityId) throw AudioClipNotFoundException()
        if (!pool.viewerIsAdmin && summary.uploadedBy != viewerId) throw AudioClipNotFoundException()
        return summary
    }

    /**
     * String.hashCode is specified, so the key is stable across JVMs and restarts -- unlike a
     * value derived from the UUID's bits, it also gives the global pool (no id) a key of its own.
     * Paired with [AUDIO_LOCK_CLASS], it never meets the image pool's locks.
     */
    private fun lockKey(communityId: UUID?): Int =
        (communityId?.toString() ?: "audiopool:global").hashCode()
}
