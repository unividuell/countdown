package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactlyInAnyOrder
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
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
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AnnouncementService
import org.unividuell.countdown.core.game.internal.RoundAssetStore
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
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
import java.util.concurrent.atomic.AtomicInteger

/**
 * What a materialisation does besides the row: the draw sees the right history, and the assets of
 * the persisted type are produced once and stored, stage assets sealed. Exercised through a fake
 * [GameType] that records its calls: [RecordingGame].
 *
 * The selection may draw any available game for a fresh round, so the asset cases plant the row
 * first: [RoundMaterialiser.materialise] then loses the announce race and stores the assets of the
 * type the row carries — the same line a fresh round goes through. [SongSnippetTestCatalogConfiguration]
 * keeps a `song-snippet` draw off the network and off an empty pool.
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
    @Autowired val materialiser: RoundMaterialiser,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val assets: RoundAssetStore,
    @Autowired val catalog: GameCatalog,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val recorder: RecordingGame.Recorder,
) {
    @TestConfiguration
    class RecordingGame {
        class Recorder {
            val produced = AtomicInteger()
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
            override fun scoresOnDuration(params: RecParams) = false
            override fun produceAssets(params: RecParams): List<RoundAsset> {
                recorder.produced.incrementAndGet()
                return listOf(
                    RoundAsset(name = "scene", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", bytes = byteArrayOf(1)),
                    RoundAsset(name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav", bytes = byteArrayOf(2)),
                )
            }
        }

        data class RecParams(val n: Int)
        data class RecPayload(val n: Int) : GamePayload
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

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

    private fun editionOf(community: Community): CommunityEdition =
        requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))

    private fun aRecordingRound(edition: CommunityEdition, roundNumber: Int): RoundGame = store.announce(
        edition = edition, roundNumber = roundNumber, gameType = "recording-fake",
        params = mapper.valueToTree(RecordingGame.RecParams(n = roundNumber)),
        award = anAward(), announcedAt = clock.instant(),
    )

    private fun keyOf(roundGameId: UUID, name: String): ByteArray? =
        assets.headers(roundGameId).single { it.name == name }.key

    @Test
    fun `materialising a round stores its produced assets, stage assets sealed`() {
        val (community, _) = aCommunity("Materialised Assets")
        val edition = editionOf(community)
        val roundNumber = currentRoundNumberOf(community)
        val round = aRecordingRound(edition = edition, roundNumber = roundNumber)

        materialiser.materialise(edition = edition, roundNumber = roundNumber)

        val id = requireNotNull(round.id)
        assets.headers(id).map { it.name } shouldContainExactlyInAnyOrder listOf("scene", "clip-0")
        keyOf(roundGameId = id, name = "clip-0").shouldNotBeNull()
        keyOf(roundGameId = id, name = "scene").shouldBeNull()
    }

    @Test
    fun `a second materialise keeps the first keys`() {
        val (community, _) = aCommunity("Materialised Twice")
        val edition = editionOf(community)
        val roundNumber = currentRoundNumberOf(community)
        val id = requireNotNull(aRecordingRound(edition = edition, roundNumber = roundNumber).id)
        materialiser.materialise(edition = edition, roundNumber = roundNumber)
        val first = keyOf(roundGameId = id, name = "clip-0")
        val produced = recorder.produced.get()

        materialiser.materialise(edition = edition, roundNumber = roundNumber)

        keyOf(roundGameId = id, name = "clip-0") shouldBe first
        recorder.produced.get() shouldBe produced
    }

    @Test
    fun `a game without assets stores nothing`() {
        val (community, _) = aCommunity("Materialised Without Assets")
        val edition = editionOf(community)
        val roundNumber = currentRoundNumberOf(community)
        val guessHue = requireNotNull(catalog.handle("guess-hue"))
        val round = store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "guess-hue",
            params = guessHue.draw(
                random = GameRandom.fromSeed(1),
                context = RoundContext(communityId = requireNotNull(community.id), roundNumber = roundNumber, phase = Phase.ONE),
            ),
            award = anAward(), announcedAt = clock.instant(),
        )

        materialiser.materialise(edition = edition, roundNumber = roundNumber)

        assets.exists(requireNotNull(round.id)) shouldBe false
    }

    @Test
    fun `the fallback leaves a round announced ahead alone`() {
        val (community, viewer) = aCommunity("Ahead Round")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        // A larger round number is earlier: `roundNumber - 1` is tomorrow's round, not yet playable.
        val ahead = aRecordingRound(edition = edition, roundNumber = roundNumber - 1)

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        store.find(edition = edition, roundNumber = roundNumber - 1) shouldBe ahead
        assets.exists(requireNotNull(ahead.id)) shouldBe false
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
