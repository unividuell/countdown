package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.GameCatalog
import java.time.ZoneId
import java.util.UUID

/**
 * Rounds that are over.
 *
 * Only the running round is playable, so a closed round has nothing left to protect — see the
 * visibility table in `docs/superpowers/specs/2026-08-23-round-history-design.md`. The one line
 * that must never move is the strictly-older refusal below: without it this is a second way to the
 * running round's solution, past `present()`/`solution()` and their field-set tests.
 */
@Service
class HistoryService(
    private val announcements: AnnouncementService,
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val responses: RoundResponses,
    private val engine: CountdownEngine,
) {

    /**
     * Not `readOnly`: [AnnouncementService.resolve] materialises the running round for its first
     * caller of the day, and that caller may well be this one.
     */
    @Transactional
    fun pastRound(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse =
        responses.of(
            current = resolve(
                current = announcements.resolve(
                    slug = slug, userId = userId, isSuperAdmin = isSuperAdmin,
                ),
                roundNumber = roundNumber,
            ),
            viewerId = userId,
        )

    /**
     * [roundNumber] against an already-resolved running round. The parameter rather than a second
     * `resolve()` call, so the asset path does not resolve the same round twice.
     */
    fun resolve(current: ResolvedRound, roundNumber: Int): ResolvedRound {
        val edition = current.edition ?: throw RoundNotFoundException()
        val startsAt = edition.startsAt ?: throw RoundNotFoundException()
        val currentNumber = current.round?.number ?: throw RoundNotFoundException()
        // A larger number is earlier: only strictly older rounds are history. This is the line that
        // keeps the running round's solution out of here.
        if (roundNumber <= currentNumber) throw RoundNotFoundException()
        if (windowReasonOf(edition = edition, roundNumber = roundNumber) != null) {
            throw RoundNotFoundException()
        }
        val roundGame = store.find(edition = edition, roundNumber = roundNumber)
            ?: throw RoundNotFoundException()
        val round = engine.intervalOf(
            number = roundNumber,
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        )
        val previous = store.previousRound(edition = edition, roundNumber = roundNumber)
        // A type this build has no game for is a gap the history shows rather than hides, and the
        // chain walks past it.
        val handle = catalog.handle(roundGame.gameType) ?: return ResolvedRound.NoGame(
            communityId = current.communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            reason = NoGameReason.NO_GAME_TYPE,
        )
        return ResolvedRound.Announced(
            communityId = current.communityId,
            edition = edition,
            round = round,
            previousRoundNumber = previous,
            roundGame = roundGame,
            handle = handle,
            closed = true,
        )
    }
}
