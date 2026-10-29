package org.unividuell.countdown.core.echolocate

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.audiopool.AudioPoolQuery
import java.util.UUID

class EchoLocateClipsTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val own = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val global = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val pool = mockk<AudioPoolQuery>()
    private val clips = EchoLocateClips(pool = pool)

    @Test
    fun `a deleted clip prepares to null`() {
        every { pool.wav(own) } returns null

        clips.prepared(own) shouldBe null
    }

    @Test
    fun `a stored clip is prepared by ClipPrep`() {
        // constant level: the fades alter it, so the output differs from the input
        val wav = pcmWav(interleaved = ShortArray(4_800) { 8_000 }, channels = 1, sampleRate = 48_000)
        every { pool.wav(own) } returns wav

        clips.prepared(own) shouldBe ClipPrep.prepare(wav)
        clips.prepared(own) shouldNotBe wav
    }

    @Test
    fun `playable reads the pool's playable ids`() {
        every { pool.candidateIds(community) } returns emptyList()
        every { pool.candidateIds(null) } returns listOf(global)

        clips.playable(community) shouldContainExactly listOf(global)

        every { pool.candidateIds(community) } returns listOf(own)

        clips.playable(community) shouldContainExactly listOf(own)
    }
}
