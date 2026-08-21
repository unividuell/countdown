package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import javax.sound.sampled.AudioSystem

class SnippetCutterTest {

    private val mp3: ByteArray =
        requireNotNull(javaClass.getResource("/songsnippet/fixture-tone.mp3")).readBytes()

    private val ladder = SnippetCutter().ladder(mp3)

    private fun pcmOf(key: Int): Pair<ByteArray, javax.sound.sampled.AudioFormat> {
        val stream = AudioSystem.getAudioInputStream(ByteArrayInputStream(ladder.getValue(key).bytes))
        return stream.readAllBytes() to stream.format
    }

    @Test
    fun `the ladder carries the five stages plus the solution key`() {
        ladder.keys.sorted() shouldContainExactly listOf(0, 1, 2, 3, 4, SongSnippetStages.SOLUTION_KEY)
    }

    @Test
    fun `every stage is sample-exact, stereo, 44_1 kHz`() {
        val expectedFrames = listOf(4410L, 22050L, 88200L, 352800L, 661500L)
        SongSnippetStages.DURATIONS_SECONDS.indices.forEach { stage ->
            val (pcm, format) = pcmOf(stage)
            format.channels shouldBe 2
            format.sampleRate shouldBe 44100.0f
            format.sampleSizeInBits shouldBe 16
            (pcm.size / format.frameSize).toLong() shouldBe expectedFrames[stage]
        }
    }

    @Test
    fun `each stage is a prefix of the next - more of the same, never a different spot`() {
        (0..3).forEach { stage ->
            val (shorter, _) = pcmOf(stage)
            val (longer, _) = pcmOf(stage + 1)
            longer.copyOfRange(0, shorter.size) shouldBe shorter
        }
    }

    @Test
    fun `the solution key passes the original mp3 through untouched`() {
        val solution = ladder.getValue(SongSnippetStages.SOLUTION_KEY)
        solution.mediaType shouldBe "audio/mpeg"
        solution.bytes shouldBe mp3
    }

    @Test
    fun `stage wavs declare their media type`() {
        (0..4).forEach { stage -> ladder.getValue(stage).mediaType shouldBe "audio/wav" }
    }
}
