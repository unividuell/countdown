package org.unividuell.countdown.core.deduster

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import java.util.UUID

class DedusterPoolTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val own = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val global = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val query = mockk<ImagePoolQuery>()
    private val pool = DedusterPool(query)

    @Test
    fun `the community's own images come first, exclusively`() {
        every { query.candidateIds(community) } returns listOf(own)
        every { query.candidateIds(null) } returns listOf(global)

        pool.candidates(community) shouldContainExactly listOf(own)
    }

    @Test
    fun `the global pool is only the fallback`() {
        every { query.candidateIds(community) } returns emptyList()
        every { query.candidateIds(null) } returns listOf(global)

        pool.candidates(community) shouldContainExactly listOf(global)
    }

    @Test
    fun `the grid follows the shown size`() {
        every { query.displaySize(own) } returns ImageSize(width = 3000, height = 4000)
        every { query.displaySize(global) } returns null

        pool.gridOf(own) shouldBe DedusterGrid.PORTRAIT
        pool.gridOf(global).shouldBeNull()
    }
}
