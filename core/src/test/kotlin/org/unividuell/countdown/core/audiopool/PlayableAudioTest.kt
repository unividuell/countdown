package org.unividuell.countdown.core.audiopool

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import java.util.UUID

class PlayableAudioTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val own = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val global = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val pool = mockk<AudioPoolQuery>()

    @Test
    fun `a community with clips never plays the global ones`() {
        every { pool.candidateIds(community) } returns listOf(own)
        every { pool.candidateIds(null) } returns listOf(global)

        pool.playableIds(community) shouldContainExactly listOf(own)
    }

    @Test
    fun `a community without clips plays the global ones`() {
        every { pool.candidateIds(community) } returns emptyList()
        every { pool.candidateIds(null) } returns listOf(global)

        pool.playableIds(community) shouldContainExactly listOf(global)
    }

    @Test
    fun `no clips anywhere is no clips`() {
        every { pool.candidateIds(any()) } returns emptyList()

        pool.playableIds(community).shouldBeEmpty()
    }
}
