package org.unividuell.countdown.core.imagepool.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

private const val SUMMARY_COLUMNS =
    "id, community_id, uploaded_by, media_type, width, height, byte_size, created_at"

interface ImageRepository : CrudRepository<Image, UUID> {

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE community_id = :communityId ORDER BY id DESC")
    fun listForCommunity(communityId: UUID): List<ImageSummary>

    @Query(
        """
        SELECT $SUMMARY_COLUMNS FROM imagepool.images
        WHERE community_id = :communityId AND uploaded_by = :uploadedBy
        ORDER BY id DESC
        """,
    )
    fun listForUploader(communityId: UUID, uploadedBy: UUID): List<ImageSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE community_id IS NULL ORDER BY id DESC")
    fun listGlobal(): List<ImageSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE id = :id")
    fun findSummary(id: UUID): ImageSummary?

    @Query("SELECT media_type, bytes FROM imagepool.images WHERE id = :id")
    fun findOriginal(id: UUID): ImageBytes?

    @Query("SELECT thumb_bytes FROM imagepool.images WHERE id = :id")
    fun findThumbBytes(id: UUID): ThumbBytes?

    /** See [ThumbBytes]: a plain `@Query` returning `ByteArray` directly does not work. */
    fun findThumb(id: UUID): ByteArray? = findThumbBytes(id)?.thumbBytes

    /** IS NOT DISTINCT FROM so a null [communityId] addresses the global pool instead of matching nothing. */
    @Query("SELECT count(*) FROM imagepool.images WHERE community_id IS NOT DISTINCT FROM :communityId")
    fun countInPool(communityId: UUID?): Long

    @Query(
        """
        SELECT count(*) > 0 FROM imagepool.images
        WHERE community_id IS NOT DISTINCT FROM :communityId AND sha256 = :sha256
        """,
    )
    fun existsInPool(communityId: UUID?, sha256: ByteArray): Boolean

    /**
     * Serialises the quota check against concurrent uploads into the same pool; released when the
     * transaction ends, so the caller must be @Transactional. The lock function returns void, which
     * neither Spring Data JDBC nor JDBC's executeUpdate can map -- wrapping it in a count() gives it
     * a shape (always 1) without changing what it does.
     */
    @Query("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(:key)) AS locked")
    fun lockPool(key: Long): Long

    @Modifying
    @Query("DELETE FROM imagepool.images WHERE id = :id")
    fun deleteImage(id: UUID): Int
}
