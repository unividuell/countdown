package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.unividuell.countdown.core.community.internal.MemberPointsConfiguration
import org.unividuell.countdown.core.community.internal.StubMemberPoints
import org.unividuell.countdown.core.community.internal.ZeroMemberPoints
import java.util.UUID

class MemberPointsTest {
    private val communityId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000aa")
    private val viewer = UUID.fromString("0190f1b2-0000-7000-8000-0000000000bb")
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")

    @Test
    fun `zero points has an entry per member and never exposes live points`() {
        val result = ZeroMemberPoints().standings(communityId, viewer, listOf(alice, bob))
        result.keys shouldBe setOf(alice, bob)
        result.values.forEach {
            it.stable shouldBe 0
            it.live shouldBe null
        }
    }

    @Test
    fun `stub points are deterministic per community and member`() {
        val stub = StubMemberPoints()
        val first = stub.standings(communityId, viewer, listOf(alice, bob))
        val second = stub.standings(communityId, viewer, listOf(alice, bob))
        first shouldBe second
    }

    @Test
    fun `stub points differ between communities for the same member`() {
        val other = UUID.fromString("0190f1b2-0000-7000-8000-0000000000cc")
        val stub = StubMemberPoints()
        val here = stub.standings(communityId, viewer, listOf(alice))[alice]
        val there = stub.standings(other, viewer, listOf(alice))[alice]
        (here == there) shouldBe false
    }

    @Test
    fun `stub points give some but not all members live points`() {
        val many = (1..40).map { UUID.fromString("0190f1b2-0000-7000-8000-%012d".format(it)) }
        val result = StubMemberPoints().standings(communityId, viewer, many)
        val withLive = result.values.count { it.live != null }
        (withLive in 1 until many.size) shouldBe true
    }

    private val factory = MemberPointsConfiguration()

    @Test
    fun `factory returns ZeroMemberPoints when property is absent and no production profile`() {
        val env = MockEnvironment()
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "ZeroMemberPoints"
    }

    @Test
    fun `factory returns StubMemberPoints when property is true and no production profile (localhost)`() {
        val env = MockEnvironment()
        env.setProperty("app.stub-points.enabled", "true")
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "StubMemberPoints"
    }

    @Test
    fun `factory returns StubMemberPoints when property is true and staging profile active`() {
        val env = MockEnvironment()
        env.setProperty("app.stub-points.enabled", "true")
        env.setActiveProfiles("staging")
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "StubMemberPoints"
    }

    @Test
    fun `factory returns ZeroMemberPoints when property is false and staging profile active`() {
        val env = MockEnvironment()
        env.setProperty("app.stub-points.enabled", "false")
        env.setActiveProfiles("staging")
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "ZeroMemberPoints"
    }

    @Test
    fun `factory returns ZeroMemberPoints when property is true but production profile active (safety belt)`() {
        val env = MockEnvironment()
        env.setProperty("app.stub-points.enabled", "true")
        env.setActiveProfiles("production")
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "ZeroMemberPoints"
    }

    @Test
    fun `factory returns ZeroMemberPoints when property is absent and production profile active`() {
        val env = MockEnvironment()
        env.setActiveProfiles("production")
        val bean = factory.memberPointsQuery(env)
        bean::class.simpleName shouldBe "ZeroMemberPoints"
    }
}
