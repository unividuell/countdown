package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The lifecycle of a community's runs. A run is never deleted, only archived, and a community has
 * exactly one active run at a time — the partial unique index is the enforcement, this service is
 * the well-lit path to it.
 */
@Service
open class EditionService(
    private val editions: CommunityEditionRepository,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    open fun active(communityId: UUID): CommunityEdition? = editions.findActiveByCommunityId(communityId)

    /**
     * Every community has an active edition: `CommunityService.create` makes one and the V3
     * migration backfilled the rest. A miss is a broken invariant, not a user error — hence 500.
     */
    @Transactional(readOnly = true)
    open fun requireActive(communityId: UUID): CommunityEdition =
        active(communityId) ?: throw IllegalStateException("community $communityId has no active edition")

    /** [inheritFrom] carries the setup forward when a follow-up run starts; only the date resets. */
    @Transactional
    open fun create(communityId: UUID, rawLabel: String, inheritFrom: CommunityEdition? = null): CommunityEdition {
        val fresh = CommunityEdition(communityId = communityId, label = rawLabel.trim())
        val edition = inheritFrom?.let {
            fresh.copy(
                startsAtTimezone = it.startsAtTimezone,
                phaseTwoStartRound = it.phaseTwoStartRound,
                gamesFromRound = it.gamesFromRound,
                gamesUntilRound = it.gamesUntilRound,
            )
        } ?: fresh
        validate(edition)
        return saveOrConflict(communityId = communityId, edition = edition)
    }

    /**
     * Archive the current run and open the next one. Two concurrent calls both archive and both
     * insert; the partial index rejects the loser, which surfaces as a 409 rather than a second
     * active run.
     */
    @Transactional
    open fun startNew(communityId: UUID, rawLabel: String): CommunityEdition {
        val current = active(communityId)
        if (current != null) editions.save(current.copy(archivedAt = clock.instant()))
        return create(communityId = communityId, rawLabel = rawLabel, inheritFrom = current)
    }

    /** "null = keep" throughout, matching `CommunityService.update`; clearing a value is out of scope. */
    @Transactional
    open fun update(
        edition: CommunityEdition,
        label: String?,
        startsAt: Instant?,
        startsAtTimezone: String?,
        phaseTwoStartRound: Int?,
        gamesFromRound: Int?,
        gamesUntilRound: Int?,
    ): CommunityEdition {
        val next = edition.copy(
            label = label?.trim() ?: edition.label,
            startsAt = startsAt ?: edition.startsAt,
            startsAtTimezone = startsAtTimezone ?: edition.startsAtTimezone,
            phaseTwoStartRound = phaseTwoStartRound ?: edition.phaseTwoStartRound,
            gamesFromRound = gamesFromRound ?: edition.gamesFromRound,
            gamesUntilRound = gamesUntilRound ?: edition.gamesUntilRound,
        )
        validate(next)
        return saveOrConflict(communityId = edition.communityId, edition = next)
    }

    /**
     * Both [create] and [update] can lose the race against the partial unique index — [update]
     * whenever it writes back a read that has since been archived by a concurrent [startNew] —
     * and both need the same 409 rather than a raw 500.
     */
    private fun saveOrConflict(communityId: UUID, edition: CommunityEdition): CommunityEdition = try {
        editions.save(edition)
    } catch (e: DuplicateKeyException) {
        throw EditionConflictException(message = "community $communityId already has an active edition", cause = e)
    }

    /** Validating the finished aggregate, not the arguments — one place covers create and update. */
    private fun validate(edition: CommunityEdition) {
        require(edition.label.length in 3..50) { "label must be 3..50 chars" }
        edition.phaseTwoStartRound?.let { require(it > 0) { "phaseTwoStartRound must be > 0" } }
        // IANA region IDs only (by design): DST-correct round math needs region zones, not offsets.
        require(AVAILABLE_ZONE_IDS.contains(edition.startsAtTimezone)) {
            "invalid timezone: ${edition.startsAtTimezone}"
        }
        // A larger round number is earlier in time, so the first round must not be below the last.
        edition.gamesFromRound?.let {
            require(it >= edition.gamesUntilRound) {
                "gamesFromRound ($it) must not be below gamesUntilRound (${edition.gamesUntilRound})"
            }
        }
    }

    private companion object {
        // Fetched once: the JVM's IANA zone set does not change at runtime, and this set has ~600
        // entries — no reason to rebuild it on every validate() call.
        val AVAILABLE_ZONE_IDS: Set<String> = ZoneId.getAvailableZoneIds()
    }
}
