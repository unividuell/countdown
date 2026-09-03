package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.Award
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * The table, expressed in the terms the rest of the module thinks in: a run and a round number.
 *
 * It exists as its own unit so [AnnouncementService] never handles an edition id, and so the
 * "insert then read back" pair stays in one place rather than being repeated by every caller.
 */
@Component
class RoundGameStore(private val rounds: RoundGameRepository) {

    @Transactional(readOnly = true)
    fun find(edition: CommunityEdition, roundNumber: Int): RoundGame? =
        rounds.findByEditionIdAndRoundNumber(
            editionId = requireNotNull(edition.id),
            roundNumber = roundNumber,
        )

    /** The rounds of [edition] earlier in time than [roundNumber], most recently played first. */
    @Transactional(readOnly = true)
    fun history(edition: CommunityEdition, roundNumber: Int): List<PastRound> =
        rounds.historyOf(editionId = requireNotNull(edition.id), after = roundNumber)

    /**
     * The next older announced round of [edition], or `null` when [roundNumber] is the oldest one
     * the run has. `Int.MAX_VALUE` stands in for an unbounded window, which is what a `null`
     * `gamesFromRound` means.
     */
    @Transactional(readOnly = true)
    fun previousRound(edition: CommunityEdition, roundNumber: Int): Int? =
        rounds.previousRoundNumber(
            editionId = requireNotNull(edition.id),
            after = roundNumber,
            notOlderThan = edition.gamesFromRound ?: Int.MAX_VALUE,
            notNewerThan = edition.gamesUntilRound,
        )

    /**
     * The round, locked until the transaction ends. Taken by the guess flow after it judges — a
     * judge call may do network I/O, and holding the lock across that would serialise the whole
     * round on one stalled service — so the re-evaluation that follows is what it protects: it
     * sees a picture nobody else can move under it.
     */
    @Transactional
    fun lock(roundGame: RoundGame): RoundGame {
        val id = requireNotNull(roundGame.id)
        return requireNotNull(rounds.findByIdForUpdate(id)) { "round $id vanished while locking it" }
    }

    /** Every round id of [edition] except [roundNumber] — the rounds that stopped being playable. */
    @Transactional(readOnly = true)
    fun roundIdsExcept(edition: CommunityEdition, roundNumber: Int): List<UUID> =
        rounds.idsOfOtherRounds(editionId = requireNotNull(edition.id), roundNumber = roundNumber)

    /**
     * Announce [roundNumber] — or, if somebody else got there first, return their announcement.
     * Either way the returned row is what every later reader will see.
     */
    @Transactional
    fun announce(
        edition: CommunityEdition,
        roundNumber: Int,
        gameType: String,
        params: JsonNode,
        award: Award,
        announcedAt: Instant,
    ): RoundGame {
        val editionId = requireNotNull(edition.id)
        rounds.insertIfAbsent(
            editionId = editionId,
            roundNumber = roundNumber,
            gameType = gameType,
            params = params,
            awardRule = award.rule.name,
            awardPoints = award.points,
            announcedAt = announcedAt,
        )
        return requireNotNull(
            rounds.findByEditionIdAndRoundNumber(editionId = editionId, roundNumber = roundNumber),
        ) { "round $roundNumber of edition $editionId vanished right after it was announced" }
    }

    /** The frozen params of this edition's earlier rounds of [gameType] — what a draw may avoid. */
    @Transactional(readOnly = true)
    fun previousParams(edition: CommunityEdition, gameType: String): List<JsonNode> =
        rounds.findByEditionIdAndGameType(
            editionId = requireNotNull(edition.id),
            gameType = gameType,
        ).map { it.params }
}
