package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
import org.unividuell.countdown.core.game.sealed
import java.security.SecureRandom
import java.time.Clock

/**
 * Announces a round: picks its game, draws its params, persists the row and stores the assets the
 * game produces, stage assets sealed. Two callers, one draw — [MaterialisationSchedule] a day
 * ahead, [AnnouncementService] for a round the schedule missed — so the frozen round does not
 * depend on which of them wrote it.
 */
@Component
class RoundMaterialiser(
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val selection: GameSelection,
    private val assets: RoundAssetStore,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** The hidden seed is drawn, never derived: `(edition, round)` would be guessable. */
    private val secureRandom = SecureRandom()

    /**
     * Announce [roundNumber] of [edition] — or, on a lost race, return the winner's row. `null` when
     * no game type is available.
     *
     * Rolls back on checked exceptions too: the MP3 decoder throws them, and a row committed without
     * its assets is a round nobody can play that the fallback, finding the row, never retries.
     */
    @Transactional(rollbackFor = [Exception::class])
    fun materialise(edition: CommunityEdition, roundNumber: Int): RoundGame? {
        val history = store.history(edition = edition, roundNumber = roundNumber)
        val random = GameRandom.independent(secureRandom)
        val context = RoundContext(
            communityId = edition.communityId,
            roundNumber = roundNumber,
            phase = Phase.of(edition = edition, roundNumber = roundNumber),
        )
        val typeId = selection.pick(
            candidates = catalog.availableIds(context),
            history = history,
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            random = random.presentation,
        ) ?: run {
            // Unreachable today, but not because Spring would refuse to inject an empty
            // List<GameType<*>> — it does that happily. It is unreachable because GuessHueGameType
            // is an unconditional bean, so the catalogue this branch guards against never empties.
            logger.warn { "no game type available for round $roundNumber of edition ${edition.id}" }
            return null
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val announced = store.announce(
            edition = edition,
            roundNumber = roundNumber,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = context.copy(
                    previousParams = store.previousParams(edition = edition, gameType = typeId),
                ),
            ),
            award = awardFor(roundNumber = roundNumber, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
        // On a lost announce race, `announced` is the WINNER's row, possibly of a different type
        // than `typeId` drew — so the assets must come from the type the persisted row actually
        // carries, not from this caller's `handle`. Both first callers reach this line, and keys are
        // random: `exists` spares the second one the work, `storeAll` keeps the first writer's rows.
        val materialisedHandle = requireNotNull(catalog.handle(announced.gameType)) {
            "announced round carries unknown type '${announced.gameType}'"
        }
        val roundGameId = requireNotNull(announced.id)
        if (!assets.exists(roundGameId)) {
            assets.storeAll(
                roundGameId = roundGameId,
                assets = materialisedHandle.produceAssets(announced.params).map { it.sealed() },
            )
        }
        return announced
    }
}
