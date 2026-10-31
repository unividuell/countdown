package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AlreadyGuessedException
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * A spent guess costs the server nothing: `judge` can be the most expensive call in a round, and a
 * player who already guessed must not be able to make it run again just to collect the 409.
 */
@Import(TestcontainersConfiguration::class, CountingGame.Configuration::class)
@SpringBootTest
@Transactional
class PlayServiceSpentGuessTest(
    @Autowired val play: PlayService,
    @Autowired val game: CountingGame,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {

    @Test
    fun `a second guess is refused without judging it`() {
        val ownerId = requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id)
        val community = communities.create(creatorUserId = ownerId, rawName = "Spent Guess")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        store.announce(
            edition = edition, roundNumber = roundNumber,
            gameType = "counting-fake", params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        play.reveal(slug = community.slug, userId = ownerId, isSuperAdmin = false, roundNumber = roundNumber)
        play.guess(
            slug = community.slug, userId = ownerId, isSuperAdmin = false,
            roundNumber = roundNumber, guess = mapper.readTree("""{"answer":"42"}"""),
        )
        val judged = game.judged.get()

        shouldThrow<AlreadyGuessedException> {
            play.guess(
                slug = community.slug, userId = ownerId, isSuperAdmin = false,
                roundNumber = roundNumber, guess = mapper.readTree("""{"answer":"42"}"""),
            )
        }

        game.judged.get() shouldBe judged
    }
}
