package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Three hooks [AnnouncementService.materialise] must fire — the draw, [GameType.materialised] and
 * [GameType.releaseStageAssets] for the rounds that are no longer playable — and one, the archival
 * [GameType.releaseAssets], deliberately must not. Exercised through a fake [GameType] that records
 * every call it receives: [RecordingGame].
 *
 * The catalogue here carries three games — `guess-hue` and `song-snippet` (both unconditional beans)
 * and `recording-fake` (this file's `@Import`) — so [org.unividuell.countdown.core.game.internal.GameSelection]
 * may draw any one of them for a freshly materialised round; see [PlayServiceStrictRevealTest] for why
 * that risk is not shared with the default context. Test (a) below therefore does not fight the
 * selection: it asserts conditionally on whichever type actually won. Test (b) needs no such guard
 * either, because the stage release runs across the whole catalogue regardless of which type wins. Test (c) plants two earlier rounds
 * of different types directly via [RoundGameStore.announce] and asserts, again conditionally on the
 * winner, that only the same-type params reached the draw. [SongSnippetTestCatalogConfiguration] keeps
 * a `song-snippet` win from reaching the network or an empty pool.
 */
@Import(
    TestcontainersConfiguration::class,
    AnnouncementMaterialisedHookTest.RecordingGame::class,
    SongSnippetTestCatalogConfiguration::class,
)
@SpringBootTest
@Transactional
class AnnouncementMaterialisedHookTest(
    @Autowired val announcements: AnnouncementService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val recorder: RecordingGame.Recorder,
) {
    @TestConfiguration
    class RecordingGame {
        class Recorder {
            val materialisedFor = CopyOnWriteArrayList<UUID>()
            val releasedRounds = CopyOnWriteArrayList<UUID>()
            val stagesReleasedRounds = CopyOnWriteArrayList<UUID>()
            val previousParamsSeen = CopyOnWriteArrayList<List<JsonNode>>()
        }

        @Bean fun recorder() = Recorder()

        @Bean
        fun recordingGame(recorder: Recorder): GameType<RecParams> = object : GameType<RecParams> {
            override val id = "recording-fake"
            override val displayName = "Aufzeichnend"
            override val paramsType = RecParams::class.java
            override fun draw(random: GameRandom, context: RoundContext): RecParams {
                recorder.previousParamsSeen.add(context.previousParams)
                return RecParams(n = context.roundNumber)
            }
            override fun present(params: RecParams) = RecPayload(n = params.n)
            override fun judge(params: RecParams, guess: JsonNode) =
                Judgement(qualifies = true, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: RecParams) = false
            override fun materialised(params: RecParams, roundGameId: UUID) {
                recorder.materialisedFor.add(roundGameId)
            }
            override fun releaseAssets(roundGameIds: List<UUID>) {
                recorder.releasedRounds.addAll(roundGameIds)
            }
            override fun releaseStageAssets(roundGameIds: List<UUID>) {
                recorder.stagesReleasedRounds.addAll(roundGameIds)
            }
        }

        data class RecParams(val n: Int)
        data class RecPayload(val n: Int) : GamePayload
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun aCommunity(name: String): Pair<Community, UUID> {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community to ownerId
    }

    private fun currentRoundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    private fun anAward() = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)

    @Test
    fun `materialising a round calls the winning type's materialised hook with the round id`() {
        val (community, viewer) = aCommunity("Materialised Hook")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val stored = requireNotNull(store.find(edition = edition, roundNumber = roundNumber))
        if (stored.gameType == "recording-fake") {
            recorder.materialisedFor shouldContain requireNotNull(stored.id)
        }
    }

    @Test
    fun `materialising a round releases every earlier round's stage assets, and only those`() {
        val (community, viewer) = aCommunity("Cleanup Round")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        val earlier = store.announce(
            edition = edition, roundNumber = roundNumber + 1, gameType = "guess-hue",
            params = mapper.readTree("""{"n":1}"""), award = anAward(), announcedAt = clock.instant(),
        )

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        // Only the running round is playable, so nobody needs an earlier round's stage ladder again
        // — and that ladder is the expensive part. `recording-fake` sees the call whichever type won
        // the current round, because the release runs across the whole catalogue.
        recorder.stagesReleasedRounds shouldContain requireNotNull(earlier.id)
        // The archival hook stays untouched: what the history still plays is not this call's business,
        // and releasing everything belongs to archiving the run.
        recorder.releasedRounds.shouldBeEmpty()
    }

    @Test
    fun `previousParams carries only earlier rounds of the same game type`() {
        val (community, viewer) = aCommunity("Previous Params Round")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        val sameType = store.announce(
            edition = edition, roundNumber = roundNumber + 1, gameType = "recording-fake",
            params = mapper.valueToTree(RecordingGame.RecParams(n = 999)),
            award = anAward(), announcedAt = clock.instant(),
        )
        store.announce(
            edition = edition, roundNumber = roundNumber + 2, gameType = "guess-hue",
            params = mapper.readTree("""{"n":2}"""), award = anAward(), announcedAt = clock.instant(),
        )

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        val stored = requireNotNull(store.find(edition = edition, roundNumber = roundNumber))
        if (stored.gameType == "recording-fake") {
            val seen = recorder.previousParamsSeen.last()
            seen shouldHaveSize 1
            seen shouldContain sameType.params
        }
    }
}
