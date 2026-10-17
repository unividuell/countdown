package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.game.internal.RoundAssetStore
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.UUID

/** The `game.round_assets` table through [RoundAssetStore]: what goes in comes out, the first writer stays. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class RoundAssetStoreTest(
    @Autowired val store: RoundAssetStore,
    @Autowired val rounds: RoundGameStore,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val clock: Clock,
    @Autowired val jdbc: JdbcTemplate,
) {
    private val scene = StoredAsset(
        header = AssetHeader(
            name = "scene", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", key = null,
        ),
        bytes = byteArrayOf(10, 11),
    )

    private val clip0 = StoredAsset(
        header = AssetHeader(
            name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav",
            key = ByteArray(32) { 1 },
        ),
        bytes = byteArrayOf(20, 21, 22),
    )

    private val clip0WithOtherKey = StoredAsset(
        header = AssetHeader(
            name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav",
            key = ByteArray(32) { 2 },
        ),
        bytes = byteArrayOf(30, 31),
    )

    private val clip3 = StoredAsset(
        header = AssetHeader(
            name = "clip-3", visibility = AssetVisibility.FromStage(3), mediaType = "audio/wav",
            key = ByteArray(32) { 3 },
        ),
        bytes = byteArrayOf(40),
    )

    private val solution = StoredAsset(
        header = AssetHeader(
            name = "solution", visibility = AssetVisibility.AfterGuess, mediaType = "audio/mpeg", key = null,
        ),
        bytes = byteArrayOf(50),
    )

    /** A real `round_games` row: the table's foreign key admits nothing else. */
    private fun aRound(): UUID {
        val ownerId = requireNotNull(
            users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id,
        )
        val community = communities.create(creatorUserId = ownerId, rawName = "Round Asset Store")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))

        val round = rounds.announce(
            edition = edition, roundNumber = 1, gameType = "asset-store-fake",
            params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        return requireNotNull(round.id)
    }

    @Test
    fun `stores every asset and reads each back by name`() {
        val id = aRound()

        store.storeAll(roundGameId = id, assets = listOf(scene, clip0))

        store.find(roundGameId = id, name = "clip-0")!!.bytes shouldBe clip0.bytes
        store.find(roundGameId = id, name = "clip-0")!!.header.key shouldBe clip0.header.key
        store.find(roundGameId = id, name = "scene")!!.header.visibility shouldBe AssetVisibility.Scene
    }

    @Test
    fun `a second storeAll keeps the first writer's key and bytes`() {
        val id = aRound()

        store.storeAll(roundGameId = id, assets = listOf(clip0))
        store.storeAll(roundGameId = id, assets = listOf(clip0WithOtherKey))

        val kept = store.find(roundGameId = id, name = "clip-0")!!
        kept.header.key shouldBe clip0.header.key
        kept.bytes shouldBe clip0.bytes
    }

    @Test
    fun `a second storeAll still adds the names the first one lacked`() {
        val id = aRound()

        store.storeAll(roundGameId = id, assets = listOf(clip0))
        store.storeAll(roundGameId = id, assets = listOf(clip0WithOtherKey, scene))

        store.find(roundGameId = id, name = "scene")!!.bytes shouldBe scene.bytes
    }

    @Test
    fun `headers carry name, visibility, stage, media type and key`() {
        val id = aRound()

        store.storeAll(roundGameId = id, assets = listOf(scene, clip0))

        store.headers(id).associate { it.name to (it.visibility to it.mediaType) } shouldBe mapOf(
            "scene" to (AssetVisibility.Scene to "image/jpeg"),
            "clip-0" to (AssetVisibility.FromStage(0) to "audio/wav"),
        )
        store.headers(id).single { it.name == "clip-0" }.key shouldBe clip0.header.key
    }

    @Test
    fun `every visibility, a stage above zero included, survives the round trip`() {
        val id = aRound()

        store.storeAll(roundGameId = id, assets = listOf(scene, clip3, solution))

        store.headers(id).associate { it.name to it.visibility } shouldBe mapOf(
            "scene" to AssetVisibility.Scene,
            "clip-3" to AssetVisibility.FromStage(3),
            "solution" to AssetVisibility.AfterGuess,
        )
        store.find(roundGameId = id, name = "clip-3")!!.header.visibility shouldBe AssetVisibility.FromStage(3)
        store.find(roundGameId = id, name = "solution")!!.header.key.shouldBeNull()
    }

    @Test
    fun `an unknown name or round is null and exists is false`() {
        val id = aRound()

        store.exists(id) shouldBe false
        store.find(roundGameId = id, name = "nope").shouldBeNull()

        store.storeAll(roundGameId = id, assets = listOf(scene))

        store.exists(id) shouldBe true
    }

    @Test
    fun `the table refuses a stage row without a key`() {
        val id = aRound()

        shouldThrow<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO game.round_assets (round_game_id, name, visibility, stage, media_type, bytes) VALUES (?, 'x', 'STAGE', 0, 'a/b', '\\x00')",
                id,
            )
        }
    }

    @Test
    fun `the table refuses a scene row with a key`() {
        val id = aRound()

        shouldThrow<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO game.round_assets (round_game_id, name, visibility, media_type, encryption_key, bytes) VALUES (?, 'x', 'SCENE', 'a/b', '\\x01', '\\x00')",
                id,
            )
        }
    }

    @Test
    fun `the table refuses a scene row with a stage`() {
        val id = aRound()

        shouldThrow<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO game.round_assets (round_game_id, name, visibility, stage, media_type, bytes) VALUES (?, 'x', 'SCENE', 0, 'a/b', '\\x00')",
                id,
            )
        }
    }

    @Test
    fun `the table refuses a negative stage`() {
        val id = aRound()

        shouldThrow<DataIntegrityViolationException> {
            jdbc.update(
                "INSERT INTO game.round_assets (round_game_id, name, visibility, stage, media_type, encryption_key, bytes) VALUES (?, 'x', 'STAGE', -1, 'a/b', '\\x01', '\\x00')",
                id,
            )
        }
    }
}
