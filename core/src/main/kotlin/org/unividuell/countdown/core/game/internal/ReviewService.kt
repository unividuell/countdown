package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.Vote
import java.time.Clock
import java.util.UUID

/**
 * Peer review: confirming, flagging, and the game master's override.
 *
 * Every write here takes the **round's row lock**, the same one a guess takes: it ends in
 * `RoundScoring.reevaluate`, which reads every play of the round and writes every one back. Two
 * votes landing together without the lock would each compute from the same stale picture, and one
 * update would be lost in exactly the moment the points move.
 */
@Service
class ReviewService(
    private val announcements: AnnouncementService,
    private val history: HistoryService,
    private val store: RoundGameStore,
    private val plays: RoundPlayRepository,
    private val votes: RoundPlayVoteRepository,
    private val scoring: RoundScoring,
    private val responses: RoundResponses,
    private val memberships: MembershipQuery,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    @Transactional
    fun vote(
        slug: String,
        voterId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        targetUserId: UUID,
        value: Vote?,
    ): RoundResponse {
        // [isSuperAdmin] is accepted for the same reason `PlayService`'s writes accept it and pass
        // `false`: the signature stays the shape every round action has, and the decision not to
        // use it stays visible at the call site. The read bypass exists so an admin may *look*
        // without joining; this is a write into other people's scoring.
        val open = openForReview(slug = slug, userId = voterId, roundNumber = roundNumber)
        if (targetUserId == voterId) throw ReviewNotAllowedException("you cannot vote on your own tip")

        val round = store.lock(open.roundGame)
        val roundGameId = requireNotNull(round.id)
        // Whoever did not play the round does not judge it. Not implied by the framework: for the
        // running round one only sees others' tips after guessing, but the history opens
        // everything to everyone once the round is closed.
        val voterPlay = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = voterId)
        if (voterPlay?.guessedAt == null) throw ReviewNotAllowedException("you have not played this round")

        val target = plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = targetUserId)
            ?.takeIf { it.guessedAt != null }
            ?: throw ReviewNotAllowedException("there is no tip to vote on")
        val targetPlayId = requireNotNull(target.id)

        if (value == null) {
            votes.withdrawVote(roundPlayId = targetPlayId, voterUserId = voterId)
        } else {
            votes.castVote(
                roundPlayId = targetPlayId,
                voterUserId = voterId,
                value = value,
                createdAt = clock.instant(),
            )
        }

        val written = scoring.reevaluate(round)
        logger.debug { "round ${round.roundNumber}: vote by $voterId on $targetUserId rewrote $written rows" }
        return responses.of(current = open.copy(roundGame = round), viewerId = voterId)
    }

    /** Moderation during the game is explicitly allowed — what is not is recurring admin *prep*. */
    @Transactional
    fun override(
        slug: String,
        adminId: UUID,
        isSuperAdmin: Boolean,
        roundNumber: Int,
        targetUserId: UUID,
        value: Boolean?,
    ): RoundResponse {
        val open = openForReview(slug = slug, userId = adminId, roundNumber = roundNumber)
        if (!memberships.isAdmin(communityId = open.communityId, userId = adminId)) {
            throw ReviewNotAllowedException("only this community's admin may override a tip")
        }

        val round = store.lock(open.roundGame)
        val target = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(round.id), userId = targetUserId,
        )?.takeIf { it.guessedAt != null }
            ?: throw ReviewNotAllowedException("there is no tip to override")

        plays.updateAdminOverride(id = requireNotNull(target.id), adminOverride = value)
        scoring.reevaluate(round)
        logger.info { "round ${round.roundNumber}: $adminId set the override on $targetUserId to $value" }
        return responses.of(current = open.copy(roundGame = round), viewerId = adminId)
    }

    /**
     * The round this vote is for, if it is still open to one.
     *
     * The window is „the running round or the one immediately before it“, and it needs no clock:
     * `previousRoundNumber` is the pointer `ResolvedRound` already carries. Without a window,
     * a tip submitted just before the round turned would be practically unassailable; with a
     * wider one the table would still wobble weeks later.
     */
    private fun openForReview(slug: String, userId: UUID, roundNumber: Int): ResolvedRound.Announced {
        val current = announcements.resolve(slug = slug, userId = userId, isSuperAdmin = false)
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        val resolved = when (roundNumber) {
            currentNumber -> current
            current.previousRoundNumber -> history.resolve(current = current, roundNumber = roundNumber)
            else -> throw RoundNotFoundException()
        }
        val announced = when (resolved) {
            is ResolvedRound.NoGame -> throw NoGameToPlayException(resolved.reason)
            is ResolvedRound.Announced -> resolved
        }
        if (!announced.handle.allowsPeerReview(announced.roundGame.params)) throw ReviewNotOpenException()
        return announced
    }
}
