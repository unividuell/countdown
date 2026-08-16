package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
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
    private val users: UserQuery,
) {

    fun of(current: CurrentRound, viewerId: UUID): RoundResponse = when (current) {
        is CurrentRound.NoGame -> RoundResponse(
            round = current.round?.toDto(),
            game = null,
            noGameReason = current.reason,
        )

        is CurrentRound.Announced -> announced(current = current, viewerId = viewerId)
    }

    private fun announced(current: CurrentRound.Announced, viewerId: UUID): RoundResponse {
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
        val byUser = users.findAllById((visible + listOfNotNull(mine)).map { it.userId })
            .associateBy { it.id }

        return RoundResponse(
            round = current.round.toDto(),
            game = GameDto(
                id = current.handle.id,
                displayName = current.handle.displayName,
                requiresReveal = current.handle.requiresReveal(current.roundGame.params),
            ),
            noGameReason = null,
            payload = mine?.let { current.handle.present(current.roundGame.params) },
            solution = if (hasGuessed) current.handle.solution(current.roundGame.params) else null,
            me = mine?.let { mineDtoOf(play = it, user = byUser[it.userId]) },
            // Sorted by when they guessed — the order the round actually happened in, and stable
            // where two stamps collide. A row whose user row vanished drops out rather than taking
            // the page down.
            others = visible
                .sortedWith(compareBy({ it.guessedAt }, { it.userId }))
                .mapNotNull { otherDtoOf(play = it, user = byUser[it.userId]) },
            awardRule = current.roundGame.awardRule,
            awardPoints = current.roundGame.awardPoints,
        )
    }

    private fun mineDtoOf(play: RoundPlay, user: User?): MyPlayDto? = user?.let {
        MyPlayDto(
            userId = play.userId,
            username = it.username,
            avatar = Avatar.of(it),
            revealedAt = play.revealedAt,
            guessedAt = play.guessedAt,
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }

    private fun otherDtoOf(play: RoundPlay, user: User?): OtherPlayDto? = user?.let {
        OtherPlayDto(
            userId = play.userId,
            username = it.username,
            avatar = Avatar.of(it),
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }
}
