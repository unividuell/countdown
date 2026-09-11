package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.util.UUID

@Service
class ImagePoolService(
    private val images: ImageRepository,
    private val limits: ImagePoolProperties,
    private val transactions: TransactionTemplate,
) {
    /**
     * Inspecting and rescaling the file happens BEFORE the transaction opens. Both are CPU-bound
     * and slow, and a transaction here means one of Hikari's ten connections plus the pool's
     * advisory lock: held across the decode, ten concurrent uploads would starve the whole
     * application of connections, and two uploads into one community would queue behind each
     * other's rescaling. The price is a thumbnail computed for a file the quota then refuses.
     *
     * `TransactionTemplate` rather than a second @Transactional method: called from inside this
     * class, that one would go around the proxy and run with no transaction at all -- the advisory
     * lock would be released the moment it was taken, the quota would stop being safe, and every
     * test here would stay green.
     */
    fun upload(pool: PoolContext, uploaderId: UUID, bytes: ByteArray): ImageSummary {
        if (bytes.size > limits.maxBytes) throw ImageTooLargeException(limits.maxBytes)

        val mediaType = when (val detected = ImageIntake.detect(bytes)) {
            is DetectedFormat.Supported -> detected.mediaType
            DetectedFormat.Heic -> throw HeicNotSupportedException()
            DetectedFormat.Unknown -> throw UnsupportedFormatException()
        }

        val dimensions = runCatching { ImageIntake.probe(bytes = bytes, mediaType = mediaType) }
            .getOrElse { throw BrokenImageException() }
        if (dimensions.pixels > limits.maxPixels) throw TooManyPixelsException(limits.maxPixels)

        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes)
        val thumb = runCatching {
            ImageIntake.thumbnail(bytes = bytes, mediaType = mediaType, maxEdge = limits.thumbEdge)
        }.getOrElse { throw BrokenImageException() }

        // Database only from here on: the lock, the two reads it guards, and the insert.
        return transactions.execute {
            images.lockPool(lockKey(pool.communityId))
            val limit = limitOf(pool)
            if (images.countInPool(pool.communityId) >= limit) throw PoolFullException(limit)
            if (images.existsInPool(communityId = pool.communityId, sha256 = sha256)) throw DuplicateImageException()

            val saved = images.save(
                Image(
                    communityId = pool.communityId,
                    uploadedBy = uploaderId,
                    mediaType = mediaType,
                    width = dimensions.width,
                    height = dimensions.height,
                    byteSize = bytes.size,
                    sha256 = sha256,
                    bytes = bytes,
                    thumbBytes = thumb,
                ),
            )
            images.findSummary(saved.id!!) ?: throw ImageNotFoundException()
        }!!
    }

    fun list(pool: PoolContext, viewerId: UUID): List<ImageSummary> = when {
        pool.communityId == null -> images.listGlobal()
        pool.viewerIsAdmin -> images.listForCommunity(pool.communityId)
        else -> images.listForUploader(communityId = pool.communityId, uploadedBy = viewerId)
    }

    fun count(pool: PoolContext): Long = images.countInPool(pool.communityId)

    fun limitOf(pool: PoolContext): Int =
        if (pool.communityId == null) limits.globalLimit else limits.perCommunityLimit

    fun original(pool: PoolContext, id: UUID, viewerId: UUID): ImageBytes {
        visible(pool = pool, id = id, viewerId = viewerId)
        return images.findOriginal(id) ?: throw ImageNotFoundException()
    }

    fun thumb(pool: PoolContext, id: UUID, viewerId: UUID): ByteArray {
        visible(pool = pool, id = id, viewerId = viewerId)
        return images.findThumb(id) ?: throw ImageNotFoundException()
    }

    @Transactional
    fun delete(pool: PoolContext, id: UUID, viewerId: UUID) {
        visible(pool = pool, id = id, viewerId = viewerId)
        images.deleteImage(id)
    }

    /**
     * Wrong pool, someone else's upload, or gone -- all one answer. A member who guesses an id
     * must not be able to tell "not yours" from "does not exist".
     */
    private fun visible(pool: PoolContext, id: UUID, viewerId: UUID): ImageSummary {
        val summary = images.findSummary(id) ?: throw ImageNotFoundException()
        if (summary.communityId != pool.communityId) throw ImageNotFoundException()
        if (!pool.viewerIsAdmin && summary.uploadedBy != viewerId) throw ImageNotFoundException()
        return summary
    }

    /**
     * String.hashCode is specified, so the key is stable across JVMs and restarts -- unlike a
     * value derived from the UUID's bits, it also gives the global pool (no id) a key of its own.
     */
    private fun lockKey(communityId: UUID?): Long =
        (communityId?.toString() ?: "imagepool:global").hashCode().toLong()
}
