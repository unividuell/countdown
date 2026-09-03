package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.VoteTally
import org.unividuell.countdown.core.game.struckByReview
import java.util.UUID

/**
 * Turns a resolved round into the answer one viewer may see.
 *
 * One place for all three endpoints, because the visibility gates are the part that must not drift:
 * the payload after the reveal, the solution and the others' guesses after the viewer's own guess.
 */
@Component
class RoundResponses(
    private val plays: RoundPlayRepository,
    private val identities: MemberIdentityQuery,
    private val votes: RoundPlayVoteRepository,
    private val memberships: MembershipQuery,
) {

    fun of(current: ResolvedRound, viewerId: UUID): RoundResponse = when (current) {
        is ResolvedRound.NoGame -> RoundResponse(
            round = current.round?.toDto(),
            game = null,
            noGameReason = current.reason,
            previousRoundNumber = current.previousRoundNumber,
        )

        is ResolvedRound.Announced -> announced(current = current, viewerId = viewerId)
    }

    private fun announced(current: ResolvedRound.Announced, viewerId: UUID): RoundResponse {
        val rows = plays.findByRoundGameId(requireNotNull(current.roundGame.id))
        val mine = rows.firstOrNull { it.userId == viewerId }
        val hasGuessed = mine?.guessedAt != null
        // A closed round holds nothing back: nobody can play it any more, so the gate that protects
        // the answer has nothing left to protect. What stays withheld either way is a
        // revealed-but-unguessed row — that says who looked, which is about people, not the round.
        val open = hasGuessed || current.closed
        // Asked once per response, not per row: it is the round's game that decides, not the player.
        val timed = current.handle.requiresReveal(current.roundGame.params)
        val visible = if (open) {
            rows.filter { it.userId != viewerId && it.guessedAt != null }
        } else {
            emptyList()
        }
        // One read for the whole round. Grouped by play id, and only for the rows this viewer may
        // see anyway — a tip that is withheld carries no votes either.
        val tallies = votes.votesOfRound(requireNotNull(current.roundGame.id)).groupBy { it.roundPlayId }

        // Voters get names too — they are community members, but not necessarily among the
        // players of this round.
        val voterIds = tallies.values.flatten().map { it.voterUserId }
        val byId = identities.of(
            communityId = current.communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId } + voterIds,
        )

        return RoundResponse(
            round = current.round.toDto(),
            game = GameDto(
                id = current.handle.id,
                displayName = current.handle.displayName,
                requiresReveal = timed,
            ),
            noGameReason = null,
            previousRoundNumber = current.previousRoundNumber,
            payload = if (open || mine != null) current.handle.present(current.roundGame.params) else null,
            solution = if (open) current.handle.solution(current.roundGame.params) else null,
            me = mine?.let {
                mineDtoOf(
                    play = it, identity = byId[it.userId], timed = timed,
                    cast = tallies[it.id].orEmpty(), byId = byId,
                )
            },
            // Sorted by when they guessed — the order the round actually happened in, and stable
            // where two stamps collide. A row whose user row vanished drops out rather than taking
            // the page down.
            others = visible
                .sortedWith(compareBy({ it.guessedAt }, { it.userId }))
                .mapNotNull {
                    otherDtoOf(
                        play = it, identity = byId[it.userId], timed = timed,
                        cast = tallies[it.id].orEmpty(), byId = byId,
                    )
                },
            awardRule = current.roundGame.awardRule,
            awardPoints = current.roundGame.awardPoints,
            canOverride = memberships.isAdmin(communityId = current.communityId, userId = viewerId),
        )
    }

    private fun mineDtoOf(
        play: RoundPlay,
        identity: MemberIdentity?,
        timed: Boolean,
        cast: List<PlayVote>,
        byId: Map<UUID, MemberIdentity>,
    ): MyPlayDto? =
        identity?.let {
            val (views, struck, override) = reviewOf(play = play, cast = cast, byId = byId)
            MyPlayDto(
                userId = play.userId,
                username = it.username,
                avatar = it.avatar,
                stage = play.stage,
                revealedAt = play.revealedAt,
                guessedAt = play.guessedAt,
                guess = play.guess,
                outcome = play.outcome,
                points = play.points,
                durationMs = durationMsOf(play = play, timed = timed),
                votes = views,
                struck = struck,
                adminOverride = override,
            )
        }

    private fun otherDtoOf(
        play: RoundPlay,
        identity: MemberIdentity?,
        timed: Boolean,
        cast: List<PlayVote>,
        byId: Map<UUID, MemberIdentity>,
    ): OtherPlayDto? =
        identity?.let {
            val (views, struck, override) = reviewOf(play = play, cast = cast, byId = byId)
            OtherPlayDto(
                userId = play.userId,
                username = it.username,
                avatar = it.avatar,
                stage = play.stage,
                guess = play.guess,
                outcome = play.outcome,
                points = play.points,
                durationMs = durationMsOf(play = play, timed = timed),
                votes = views,
                struck = struck,
                adminOverride = override,
            )
        }

    /**
     * The review side of one play: who voted what, and whether the review took the tip's points.
     * `struckByReview(...)` rather than `!effectiveQualifies(...)`: the latter is also true for a
     * give-up and for any game that never opens a review, and this field claims the review did it.
     */
    private fun reviewOf(
        play: RoundPlay,
        cast: List<PlayVote>,
        byId: Map<UUID, MemberIdentity>,
    ): Triple<List<VoteView>, Boolean, Boolean?> {
        val tally = VoteTally.of(cast.map { it.value })
        val views = cast.mapNotNull { vote ->
            byId[vote.voterUserId]?.let {
                VoteView(userId = vote.voterUserId, username = it.username, value = vote.value)
            }
        }.sortedBy { it.username }
        val struck = struckByReview(
            adminOverride = play.adminOverride,
            qualifies = play.qualifies == true,
            tally = tally,
        )
        return Triple(views, struck, play.adminOverride)
    }

    /**
     * Only for a game that asked for the reveal, only once the play is finished, and never for a
     * give-up: `guess` stays NULL there (see [RoundPlayRepository.giveUp]), so this is not a time to
     * be beaten — publishing it would leak how long an abandoning player sat on the round.
     */
    private fun durationMsOf(play: RoundPlay, timed: Boolean): Long? =
        if (!timed || play.guess == null) null
        else play.guessedAt?.let { durationMsBetween(revealedAt = play.revealedAt, guessedAt = it) }
}
