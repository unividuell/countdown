package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
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
        // Withheld, not filtered in the client. Revealed-but-unguessed rows stay out entirely: they
        // say who is looking, which is nobody's business. A participation count would be a `COUNT`,
        // not a filtered list of guesses.
        val visible = if (hasGuessed) {
            rows.filter { it.userId != viewerId && it.guessedAt != null }
        } else {
            emptyList()
        }
        val byId = identities.of(
            communityId = current.communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId },
        )

        return RoundResponse(
            round = current.round.toDto(),
            game = GameDto(
                id = current.handle.id,
                displayName = current.handle.displayName,
                requiresReveal = current.handle.requiresReveal(current.roundGame.params),
            ),
            noGameReason = null,
            previousRoundNumber = current.previousRoundNumber,
            payload = mine?.let { current.handle.present(current.roundGame.params) },
            solution = if (hasGuessed) current.handle.solution(current.roundGame.params) else null,
            me = mine?.let { mineDtoOf(play = it, identity = byId[it.userId]) },
            // Sorted by when they guessed — the order the round actually happened in, and stable
            // where two stamps collide. A row whose user row vanished drops out rather than taking
            // the page down.
            others = visible
                .sortedWith(compareBy({ it.guessedAt }, { it.userId }))
                .mapNotNull { otherDtoOf(play = it, identity = byId[it.userId]) },
            awardRule = current.roundGame.awardRule,
            awardPoints = current.roundGame.awardPoints,
        )
    }

    private fun mineDtoOf(play: RoundPlay, identity: MemberIdentity?): MyPlayDto? = identity?.let {
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
        )
    }

    private fun otherDtoOf(play: RoundPlay, identity: MemberIdentity?): OtherPlayDto? = identity?.let {
        OtherPlayDto(
            userId = play.userId,
            username = it.username,
            avatar = it.avatar,
            stage = play.stage,
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }
}
