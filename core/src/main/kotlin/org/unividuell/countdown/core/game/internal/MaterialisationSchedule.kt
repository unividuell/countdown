package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * Announces every active run's rounds a day ahead, so no player's request draws a round's seed and a
 * day nobody opens still gets its round.
 *
 * A round boundary is the time of day of `startsAt` in the run's own zone — a different hour per
 * community — so one daily run cannot meet them; it can only prepare the next round, which always
 * starts within the next 24 hours. The running round is taken along in case yesterday's run missed it.
 *
 *   03:00 ─┬─ for each active edition
 *          ├─ round n   (running)  missing? → materialise
 *          ├─ round n−1 (next)     missing? → materialise
 *          └─ release stages of rounds older than n
 *
 * A round that has a row is left alone, whoever wrote it. [AnnouncementService] stays the fallback
 * for a round this run missed.
 */
@Component
class MaterialisationSchedule(
    private val communities: CommunityQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val materialiser: RoundMaterialiser,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** Berlin like the default run, so a Berlin run's DST shift moves this run with it. */
    @Scheduled(cron = "\${countdown.game.materialisation-cron}", zone = CommunityEdition.DEFAULT_TIMEZONE)
    fun run() {
        val now = clock.instant()
        val editions = communities.activeEditions()
        // One edition's failure — a lost connection, a zone the JDK no longer knows — skips only that one.
        val materialised = editions.sumOf { edition ->
            try {
                prepare(edition = edition, now = now)
            } catch (e: Exception) {
                logger.warn(e) { "edition ${edition.id} not prepared" }
                0
            }
        }
        logger.info { "$materialised rounds materialised across ${editions.size} editions" }
    }

    /**
     * The running and the next round of [edition], each in its own transaction: a failed download for
     * tomorrow must not cost today's round. Returns how many rounds this call announced.
     */
    fun prepare(edition: CommunityEdition, now: Instant): Int {
        val startsAt = edition.startsAt ?: return 0
        val current = engine.roundAt(
            now = now,
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number

        // A larger round number is earlier: the next round is `current - 1`.
        var materialised = 0
        for (roundNumber in listOf(current, current - 1)) {
            if (windowReasonOf(edition = edition, roundNumber = roundNumber) != null) continue
            if (store.find(edition = edition, roundNumber = roundNumber) != null) continue
            try {
                if (materialiser.materialise(edition = edition, roundNumber = roundNumber) != null) materialised++
            } catch (e: Exception) {
                logger.warn(e) { "round $roundNumber of edition ${edition.id} not materialised" }
            }
        }

        try {
            materialiser.releaseStagesOlderThan(edition = edition, roundNumber = current)
        } catch (e: Exception) {
            logger.warn(e) { "stage assets of edition ${edition.id} older than round $current not released" }
        }
        return materialised
    }
}
