package org.unividuell.countdown.core.game

import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * One game, with its generic parameter captured, so the rest of the module can hold
 * `GameTypeHandle<*>` and still call through without a cast.
 *
 * This is the only place the `P` of a [GameType] and the `String` in the `params` column meet. It is
 * a class rather than a few helper functions precisely so that meeting has exactly one location — no
 * `UNCHECKED_CAST` anywhere else, because there is no cast at all: `P` is bound at construction.
 */
class GameTypeHandle<P : Any>(
    private val type: GameType<P>,
    private val mapper: ObjectMapper,
) {
    val id: String get() = type.id
    val displayName: String get() = type.displayName

    /** Draw a round and turn it into the tree the `params` column stores. */
    fun draw(random: GameRandom, context: RoundContext): JsonNode =
        mapper.valueToTree(type.draw(random = random, context = context))

    /** What the player sees, from a stored `params` blob. */
    fun present(params: JsonNode): GamePayload = type.present(paramsOf(params))

    /** The game's verdict on a guess. Throws on an invalid guess; nothing is written before this. */
    fun judge(params: JsonNode, guess: JsonNode): Judgement =
        type.judge(params = paramsOf(params), guess = guess)

    /** What may be shown after the viewer's own guess, or `null` for a game that reveals nothing. */
    fun solution(params: JsonNode): GameSolution? = type.solution(paramsOf(params))

    /** Whether this round needs a deliberate reveal, from a stored `params` blob. */
    fun requiresReveal(params: JsonNode): Boolean = type.requiresReveal(paramsOf(params))

    /** How many stages a round of this game has, from a stored `params` blob. */
    fun stages(params: JsonNode): Int = type.stages(paramsOf(params))

    /** Compute (expensively) the round's assets — the lab's path; the real round goes through [materialised]. */
    fun produceAssets(params: JsonNode): Map<Int, RoundAsset> = type.produceAssets(paramsOf(params))

    /** Produce and persist the round's assets — the game owns its storage. Idempotent. */
    fun materialised(params: JsonNode, roundGameId: UUID) =
        type.materialised(params = paramsOf(params), roundGameId = roundGameId)

    /** One stored asset. The caller gates; this only fetches. */
    fun asset(params: JsonNode, roundGameId: UUID, key: Int): RoundAsset? =
        type.asset(params = paramsOf(params), roundGameId = roundGameId, key = key)

    /** Forwarded verbatim — no params involved. */
    fun releaseAssets(roundGameIds: List<UUID>) = type.releaseAssets(roundGameIds)

    /** The one place the `params` column and this game's `P` meet. */
    private fun paramsOf(params: JsonNode): P = mapper.treeToValue(params, type.paramsType)
}

/**
 * Every game the framework can announce. Bean presence *is* the release: `guesshue` fails the boot
 * under `production`/`staging` when its dataset is missing anyway (see game-content.md), so a game
 * that cannot run does not reach this list.
 */
@Component
class GameCatalog(games: List<GameType<*>>, mapper: ObjectMapper) {

    private val handles: Map<String, GameTypeHandle<*>> =
        games.associate { it.id to handleFor(type = it, mapper = mapper) }

    init {
        require(handles.size == games.size) {
            "duplicate game type id among ${games.map { it.id }}"
        }
    }

    /**
     * Sorted, and that is load-bearing rather than tidiness: the selection draws from this list, so
     * bean order — which Spring does not promise — must not decide which game a round gets.
     */
    fun ids(): List<String> = handles.keys.sorted()

    fun handle(id: String): GameTypeHandle<*>? = handles[id]

    private companion object {
        /** Captures `P` at construction; without this indirection the map would need a cast. */
        private fun <P : Any> handleFor(type: GameType<P>, mapper: ObjectMapper) =
            GameTypeHandle(type = type, mapper = mapper)
    }
}
