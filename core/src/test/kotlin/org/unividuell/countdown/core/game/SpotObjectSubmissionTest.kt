package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.spotobject.CountryLookup
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * What a Weltanschauung submission leaves in `game.round_plays.guess` — the column every other
 * player of the round gets to read.
 *
 * Driven through [PlayService] rather than through the game type alone: the guarantee is only real
 * if the framework writes what the game hands back, and that seam is what this file pins.
 * [CountryLookup] is mocked so nothing here reaches Google.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class SpotObjectSubmissionTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {

    @MockkBean lateinit var countries: CountryLookup

    /** A community whose countdown starts in 2099, with a Weltanschauung round announced now. */
    private fun aSpotObjectRound(name: String): Pair<Community, UUID> {
        val ownerId = requireNotNull(
            users.save(User(githubId = System.nanoTime(), githubLogin = "owner")).id,
        )
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        // Announced directly, bypassing selection: this file is about one game's submission shape.
        store.announce(
            edition = edition, roundNumber = currentRoundNumberOf(community), gameType = "spot-object",
            params = mapper.readTree("""{"term":"Rosa Gartenzwerg","timed":false}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
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

    /**
     * The whole point of taking a panorama id instead of a coordinate: none ever reaches storage.
     * Our own client sends four fields — this is about the one that does not.
     */
    @Test
    fun `a coordinate smuggled next to the tip does not reach the database`() {
        every { countries.countryOf(any()) } returns "ES"
        val (community, owner) = aSpotObjectRound("Smuggled Coordinate")
        val roundNumber = currentRoundNumberOf(community)
        play.reveal(slug = community.slug, userId = owner, isSuperAdmin = false)

        play.guess(
            slug = community.slug, userId = owner, isSuperAdmin = false, roundNumber = roundNumber,
            guess = mapper.readTree(
                """{"panoId":"abc","heading":12,"pitch":0,"zoom":1,"lat":41.38505,"lng":2.1734}""",
            ),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundGameId = requireNotNull(store.find(edition = edition, roundNumber = roundNumber)?.id)
        val stored = requireNotNull(
            plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = owner)?.guess,
        )

        // A set, not a list: JSONB does not keep the order the game wrote the object in.
        stored.propertyNames().toSet() shouldBe setOf("panoId", "heading", "pitch", "zoom")
        stored.get("panoId").stringValue() shouldBe "abc"
    }
}
