package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityQueryService
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.community.internal.SlugUnavailableException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.time.Instant

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class CommunityServiceTest(
    @Autowired val service: CommunityService,
    @Autowired val query: CommunityQueryService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val users: UserRepository,
) {
    private fun aUser() = users.save(User(githubId = System.nanoTime(), githubLogin = "creator"))

    @Test
    fun `create derives slug and makes the creator an active admin`() {
        val creatorId = aUser().id!!
        val c = service.create(creatorUserId = creatorId, rawName = "Hütte Hütte")
        c.slug shouldBe "huette-huette"
        val m = members.findByCommunityIdAndUserId(communityId = c.id!!, userId = creatorId)!!
        m.status shouldBe MemberStatus.ACTIVE
        m.isAdmin shouldBe true
    }

    @Test
    fun `create rejects a name shorter than 3 chars`() {
        shouldThrow<IllegalArgumentException> { service.create(creatorUserId = aUser().id!!, rawName = "ab") }
    }

    @Test
    fun `create rejects a duplicate slug`() {
        val uid = aUser().id!!
        service.create(creatorUserId = uid, rawName = "Team A")
        shouldThrow<SlugUnavailableException> { service.create(creatorUserId = uid, rawName = "team a") }
    }

    @Test
    fun `create accepts a name whose slug used to be reserved`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Super Admin")
        c.slug shouldBe "super-admin"
    }

    @Test
    fun `create makes the first active edition labelled with the community name`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Hütte 2026")

        val edition = query.activeEditionOf(requireNotNull(c.id)).shouldNotBeNull()
        edition.label shouldBe "Hütte 2026"
        edition.startsAtTimezone shouldBe CommunityEdition.DEFAULT_TIMEZONE
        edition.startsAt.shouldBeNull()
    }

    @Test
    fun `update writes the schedule to the active edition and the name to the community`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Zone Team")

        val (community, edition) = service.update(
            c, name = "Zone Team Renamed", label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "America/New_York",
            phaseTwoStartRound = 20, gamesFromRound = 24, gamesUntilRound = null,
        )

        community.name shouldBe "Zone Team Renamed"
        community.slug shouldBe "zone-team"           // the slug is immutable
        edition.startsAtTimezone shouldBe "America/New_York"
        edition.phaseTwoStartRound shouldBe 20
        edition.gamesFromRound shouldBe 24
        edition.gamesUntilRound shouldBe 0
        query.activeEditionOf(requireNotNull(c.id))!!.startsAtTimezone shouldBe "America/New_York"
    }

    @Test
    fun `update rejects an invalid timezone`() {
        val c = service.create(creatorUserId = aUser().id!!, rawName = "Bad Zone")

        shouldThrow<IllegalArgumentException> {
            service.update(
                c, name = null, label = null, startsAt = null, startsAtTimezone = "Mars/Olympus",
                phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
            )
        }
    }
}
