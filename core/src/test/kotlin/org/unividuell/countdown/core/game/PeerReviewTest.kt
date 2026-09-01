package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

/**
 * The rule both worlds call. A table rather than prose: every pair below was argued about once,
 * and the table is where that argument stays settled.
 */
class PeerReviewTest {

    private fun tally(confirms: Int, flags: Int) = VoteTally(confirms = confirms, flags = flags)

    @Test
    fun `two flags strike a tip unless as many confirm it`() {
        struckOut(tally(confirms = 0, flags = 0)) shouldBe false
        struckOut(tally(confirms = 0, flags = 1)) shouldBe false
        struckOut(tally(confirms = 0, flags = 2)) shouldBe true
        struckOut(tally(confirms = 1, flags = 2)) shouldBe true
        struckOut(tally(confirms = 2, flags = 2)) shouldBe false
        struckOut(tally(confirms = 2, flags = 3)) shouldBe true
        struckOut(tally(confirms = 5, flags = 0)) shouldBe false
    }

    @Test
    fun `a tally counts each value separately`() {
        VoteTally.of(listOf(Vote.FLAG, Vote.CONFIRM, Vote.FLAG)) shouldBe tally(confirms = 1, flags = 2)
        VoteTally.of(emptyList()) shouldBe VoteTally.NONE
    }

    @Test
    fun `a struck tip loses its qualification, and gets it back when the vote turns`() {
        val struck = tally(confirms = 0, flags = 2)
        effectiveQualifies(adminOverride = null, qualifies = true, tally = struck) shouldBe false
        effectiveQualifies(adminOverride = null, qualifies = true, tally = tally(confirms = 2, flags = 2)) shouldBe true
    }

    @Test
    fun `voting cannot lift a tip the game itself rejected`() {
        effectiveQualifies(adminOverride = null, qualifies = false, tally = tally(confirms = 9, flags = 0)) shouldBe false
    }

    @Test
    fun `a tip nobody voted on is not struck, however it scored`() {
        // The two rows the framework produces without any review at all: a give-up (`qualifies`
        // NULL, read as false) and a wrong guess in a game that has no peer review.
        struckByReview(adminOverride = null, qualifies = false, tally = VoteTally.NONE) shouldBe false
        struckByReview(adminOverride = null, qualifies = false, tally = tally(confirms = 0, flags = 5)) shouldBe false
    }

    @Test
    fun `struck means the review turned it, or the game master did`() {
        struckByReview(adminOverride = null, qualifies = true, tally = tally(confirms = 0, flags = 2)) shouldBe true
        struckByReview(adminOverride = null, qualifies = true, tally = tally(confirms = 2, flags = 2)) shouldBe false
        struckByReview(adminOverride = false, qualifies = true, tally = VoteTally.NONE) shouldBe true
        // The game master may strike a tip the game never qualified — that is still the review.
        struckByReview(adminOverride = false, qualifies = false, tally = VoteTally.NONE) shouldBe true
        struckByReview(adminOverride = true, qualifies = true, tally = tally(confirms = 0, flags = 5)) shouldBe false
    }

    @Test
    fun `the admin override wins in both directions`() {
        effectiveQualifies(adminOverride = true, qualifies = true, tally = tally(confirms = 0, flags = 5)) shouldBe true
        effectiveQualifies(adminOverride = true, qualifies = false, tally = VoteTally.NONE) shouldBe true
        effectiveQualifies(adminOverride = false, qualifies = true, tally = tally(confirms = 9, flags = 0)) shouldBe false
    }
}
