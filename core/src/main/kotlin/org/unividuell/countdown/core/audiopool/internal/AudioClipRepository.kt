package org.unividuell.countdown.core.audiopool.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

private const val SUMMARY_COLUMNS =
    "id, community_id, uploaded_by, file_name, channels, sample_rate, frames, byte_size, created_at"

/**
 * First argument of the two-int advisory lock: "AUDI". `pg_advisory_xact_lock(int, int)` has a key
 * space of its own, apart from the single-bigint form the image pool locks with, so the two pools
 * neither wait on each other nor collide on the global pool's constant.
 */
const val AUDIO_LOCK_CLASS: Int = 0x41554449

interface AudioClipRepository : CrudRepository<AudioClip, UUID> {

    @Query("SELECT $SUMMARY_COLUMNS FROM audiopool.clips WHERE community_id = :communityId ORDER BY id DESC")
    fun listForCommunity(communityId: UUID): List<AudioClipSummary>

    @Query(
        """
        SELECT $SUMMARY_COLUMNS FROM audiopool.clips
        WHERE community_id = :communityId AND uploaded_by = :uploadedBy
        ORDER BY id DESC
        """,
    )
    fun listForUploader(communityId: UUID, uploadedBy: UUID): List<AudioClipSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM audiopool.clips WHERE community_id IS NULL ORDER BY id DESC")
    fun listGlobal(): List<AudioClipSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM audiopool.clips WHERE id = :id")
    fun findSummary(id: UUID): AudioClipSummary?

    @Query("SELECT bytes FROM audiopool.clips WHERE id = :id")
    fun findWavBytes(id: UUID): WavBytes?

    /** See [WavBytes]: a plain `@Query` returning `ByteArray` directly does not work. */
    fun findWav(id: UUID): ByteArray? = findWavBytes(id)?.bytes

    /** IS NOT DISTINCT FROM so a null [communityId] addresses the global pool instead of matching nothing. */
    @Query("SELECT count(*) FROM audiopool.clips WHERE community_id IS NOT DISTINCT FROM :communityId")
    fun countInPool(communityId: UUID?): Long

    @Query(
        """
        SELECT count(*) > 0 FROM audiopool.clips
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
    @Query("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(:classId, :key)) AS locked")
    fun lockPool(classId: Int, key: Int): Long

    @Modifying
    @Query("DELETE FROM audiopool.clips WHERE id = :id")
    fun deleteClip(id: UUID): Int
}
