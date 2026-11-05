package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** What an admin submits for a run: everything but what the system owns (`gamesUntilRound`, archiving). */
data class EditionDraft(
    val label: String?,
    val startsAt: Instant,
    val startsAtTimezone: String,
    val phaseTwoStartRound: Int?,
    val gamesFromRound: Int,
)

/**
 * The lifecycle of a community's run. A run is never deleted, only archived, and a community has
 * at most one active run at a time — the partial unique index is the enforcement, this service is
 * the well-lit path to it.
 */
@Service
open class EditionService(
    private val editions: CommunityEditionRepository,
    private val clock: Clock,
) {
    @Transactional(readOnly = true)
    open fun active(communityId: UUID): CommunityEdition? = editions.findActiveByCommunityId(communityId)

    /** Opens the community's first run — or the next one, once the previous was archived. */
    @Transactional
    open fun create(communityId: UUID, draft: EditionDraft): CommunityEdition {
        if (active(communityId) != null) {
            throw EditionConflictException("community $communityId already has an active edition")
        }
        val edition = CommunityEdition(
            communityId = communityId,
            label = draft.label.toLabel(),
            startsAt = draft.startsAt,
            startsAtTimezone = draft.startsAtTimezone,
            phaseTwoStartRound = draft.phaseTwoStartRound,
            gamesFromRound = draft.gamesFromRound,
        )
        validate(edition)
        requireGridStillOpen(edition)
        return saveOrConflict(communityId = communityId, edition = edition)
    }

    /**
     * Overwrites every admin-editable field of the active run; `gamesUntilRound` stays. A frozen run
     * keeps its grid: start and zone are fixed, and the first game round may move, but never so the run thaws.
     */
    @Transactional
    open fun replace(communityId: UUID, draft: EditionDraft): CommunityEdition {
        val current = active(communityId) ?: throw EditionNotFoundException()
        val next = current.copy(
            label = draft.label.toLabel(),
            startsAt = draft.startsAt,
            startsAtTimezone = draft.startsAtTimezone,
            phaseTwoStartRound = draft.phaseTwoStartRound,
            gamesFromRound = draft.gamesFromRound,
        )
        validate(next)

        if (isFrozen(current)) {
            if (next.startsAt != current.startsAt || next.startsAtTimezone != current.startsAtTimezone) {
                throw EditionFrozenException("the run's grid is fixed since ${frozenSince(current)}")
            }
            if (!isFrozen(next)) {
                throw EditionFrozenException("a frozen run must not be thawed")
            }
        } else {
            requireGridStillOpen(next)
        }
        return saveOrConflict(communityId = communityId, edition = next)
    }

    /**
     * Whether this run's grid is fixed — the day before its first game round has begun, so the
     * schedule may have announced that round and moving the grid would hand out a round number twice.
     */
    open fun isFrozen(edition: CommunityEdition): Boolean = !clock.instant().isBefore(frozenSince(edition))

    /** A new run must not start out frozen: its first announced round would already be out. */
    private fun requireGridStillOpen(edition: CommunityEdition) {
        require(!isFrozen(edition)) {
            "the run would be fixed since ${frozenSince(edition)}, which has already begun"
        }
    }

    /** Blank counts as "no label"; a stored empty string would render as an empty heading. */
    private fun String?.toLabel(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

    /** Both [create] and [replace] can lose the race against the partial unique index; both need a 409, not a 500. */
    private fun saveOrConflict(communityId: UUID, edition: CommunityEdition): CommunityEdition = try {
        editions.save(edition)
    } catch (e: DuplicateKeyException) {
        throw EditionConflictException(message = "community $communityId already has an active edition", cause = e)
    }

    /** Validating the finished aggregate, not the arguments — one place covers create and replace. */
    private fun validate(edition: CommunityEdition) {
        edition.label?.let { require(it.length in 3..50) { "label must be 3..50 chars" } }
        edition.phaseTwoStartRound?.let { require(it < 0) { "phaseTwoStartRound must be < 0" } }
        // IANA region IDs only (by design): DST-correct round math needs region zones, not offsets.
        require(AVAILABLE_ZONE_IDS.contains(edition.startsAtTimezone)) {
            "invalid timezone: ${edition.startsAtTimezone}"
        }
        // A smaller round number is earlier in time, so the first round must not be above the last.
        require(edition.gamesFromRound <= edition.gamesUntilRound) {
            "gamesFromRound (${edition.gamesFromRound}) must not be above gamesUntilRound (${edition.gamesUntilRound})"
        }
        // A run longer than a century of daily rounds is not a real run; the bound also keeps
        // `frozenSince`'s grid math (and its parity with `CountdownEngine.intervalOf`) from ever
        // seeing a round number close enough to Int.MIN_VALUE to overflow.
        require(edition.gamesFromRound >= -MAX_GAMES_FROM_ROUND) {
            "gamesFromRound (${edition.gamesFromRound}) must not be below -$MAX_GAMES_FROM_ROUND"
        }
    }

    private companion object {
        // Fetched once: the JVM's IANA zone set does not change at runtime, and this set has ~600
        // entries — no reason to rebuild it on every validate() call.
        val AVAILABLE_ZONE_IDS: Set<String> = ZoneId.getAvailableZoneIds()

        // A hundred years of daily rounds.
        const val MAX_GAMES_FROM_ROUND = 36500
    }
}
