package org.unividuell.countdown.core.gamelab.internal

import tools.jackson.databind.JsonNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.gamelab.LabGame
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/**
 * The lab's only orchestration: resolve the community the same way every other module does, look
 * up the game, delegate to the store, and assemble the response.
 *
 * Community context comes from the `community` module's PUBLIC api (`CommunityQuery` +
 * `MembershipQuery`), never from `community.internal` — `CountdownService` is the precedent.
 */
@Service
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val users: UserQuery,
    private val store: LabRoundStore,
    games: List<LabGame>,
) {
    private val byId: Map<String, LabGame> = games.associateBy { it.id }

    init {
        require(byId.size == games.size) {
            "duplicate lab game id among ${games.map { it.id }}"
        }
    }

    fun open(slug: String, gameId: String, seed: Int, userId: UUID, isSuperAdmin: Boolean): LabRoundResponse {
        val (communityId, game) = resolve(slug, gameId, userId, isSuperAdmin)
        return respond(game, seed, userId, store.open(communityId, gameId, seed))
    }

    fun guess(
        slug: String,
        gameId: String,
        seed: Int,
        userId: UUID,
        isSuperAdmin: Boolean,
        guess: JsonNode,
    ): LabRoundResponse {
        val (communityId, game) = resolve(slug, gameId, userId, isSuperAdmin)
        // score() first: an invalid guess must not consume the player's single attempt.
        val outcome = game.score(seed, guess)
        return when (val result = store.record(communityId, gameId, seed, userId, guess, outcome)) {
            is RecordResult.Recorded -> respond(game, seed, userId, result.snapshot)
            RecordResult.AlreadyGuessed -> throw AlreadyGuessedException()
        }
    }

    fun resetRound(slug: String, gameId: String, seed: Int, userId: UUID, isSuperAdmin: Boolean): LabRoundResponse {
        val (communityId, game) = resolve(slug, gameId, userId, isSuperAdmin)
        return respond(game, seed, userId, store.resetRound(communityId, gameId, seed))
    }

    fun forgetMine(slug: String, gameId: String, seed: Int, userId: UUID, isSuperAdmin: Boolean): LabRoundResponse {
        val (communityId, game) = resolve(slug, gameId, userId, isSuperAdmin)
        return respond(game, seed, userId, store.forget(communityId, gameId, seed, userId))
    }

    private fun resolve(slug: String, gameId: String, userId: UUID, isSuperAdmin: Boolean): Pair<UUID, LabGame> {
        val community = communities.findBySlug(slug) ?: throw LabAccessDeniedException()
        val id = requireNotNull(community.id) { "a persisted community always has an id" }
        if (!isSuperAdmin && !memberships.isActiveMember(id, userId)) throw LabAccessDeniedException()
        val game = byId[gameId] ?: throw UnknownLabGameException("no lab game '$gameId'")
        return id to game
    }

    private fun respond(
        game: LabGame,
        seed: Int,
        me: UUID,
        snapshot: LabRoundSnapshot,
    ): LabRoundResponse {
        val byUser = users.findAllById(snapshot.entries.map { it.userId }).associateBy { it.id }
        val dtos = snapshot.entries.mapNotNull { entry ->
            // A tester whose user row vanished mid-session drops out of the list rather than
            // taking the whole page down with them.
            val user = byUser[entry.userId] ?: return@mapNotNull null
            LabEntryDto(
                userId = entry.userId,
                username = user.username,
                avatar = Avatar.of(user),
                guess = entry.guess,
                outcome = entry.outcome,
                at = entry.at,
            )
        }
        return LabRoundResponse(
            seed = snapshot.seed,
            game = game.id,
            displayName = game.displayName,
            payload = game.reveal(seed),
            me = dtos.firstOrNull { it.userId == me },
            others = dtos.filter { it.userId != me },
            tookOverRound = snapshot.tookOverRound,
        )
    }
}
