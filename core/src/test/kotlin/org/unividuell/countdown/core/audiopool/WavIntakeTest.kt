package org.unividuell.countdown.core.audiopool

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.audiopool.internal.BrokenAudioException
import org.unividuell.countdown.core.audiopool.internal.UnsupportedAudioFormatException
import org.unividuell.countdown.core.audiopool.internal.WavFormat
import org.unividuell.countdown.core.audiopool.internal.WavIntake
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem

class WavIntakeTest {

    /** Silence in [format], written by the JDK's own WAV writer -- the same family of header the browser sends. */
    private fun wav(format: AudioFormat, frames: Int): ByteArray {
        val out = ByteArrayOutputStream()
        val pcm = ByteArray(frames * format.frameSize)
        AudioInputStream(ByteArrayInputStream(pcm), format, frames.toLong()).use {
            AudioSystem.write(it, AudioFileFormat.Type.WAVE, out)
        }
        return out.toByteArray()
    }

    private fun wav(channels: Int = 1, rate: Float = 48000f, frames: Int = 480, bits: Int = 16): ByteArray =
        wav(format = AudioFormat(rate, bits, channels, true, false), frames = frames)

    @Test
    fun `recognises RIFF WAVE by its magic bytes`() {
        WavIntake.isWav(wav()) shouldBe true
        // a RIFF container, but an AVI
        WavIntake.isWav("RIFF\u0000\u0000\u0000\u0000AVI ".toByteArray(Charsets.US_ASCII)) shouldBe false
        WavIntake.isWav(ByteArray(4)) shouldBe false
    }

    @Test
    fun `accepts 16-bit mono and stereo`() {
        WavIntake.inspect(wav(channels = 1, rate = 48000f, frames = 480)) shouldBe
            WavFormat(channels = 1, sampleRate = 48000, frames = 480)
        WavIntake.inspect(wav(channels = 2, rate = 44100f, frames = 441)) shouldBe
            WavFormat(channels = 2, sampleRate = 44100, frames = 441)
    }

    @Test
    fun `refuses 8-bit, 24-bit, float and three channels as unsupported`() {
        val float = AudioFormat(AudioFormat.Encoding.PCM_FLOAT, 48000f, 32, 1, 4, 48000f, false)

        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(bits = 8)) }
        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(bits = 24)) }
        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(format = float, frames = 480)) }
        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(channels = 3)) }
    }

    @Test
    fun `refuses big-endian PCM`() {
        // AIFF stores 16-bit samples big-endian; WAV never does
        val out = ByteArrayOutputStream()
        val format = AudioFormat(48000f, 16, 1, true, false)
        AudioInputStream(ByteArrayInputStream(ByteArray(960)), format, 480).use {
            AudioSystem.write(it, AudioFileFormat.Type.AIFF, out)
        }

        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(out.toByteArray()) }
    }

    @Test
    fun `refuses sample rates outside 8 to 96 kHz`() {
        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(rate = 4000f)) }
        shouldThrow<UnsupportedAudioFormatException> { WavIntake.inspect(wav(rate = 192000f)) }
    }

    @Test
    fun `a header without frames is broken`() {
        shouldThrow<BrokenAudioException> { WavIntake.inspect(wav(frames = 0)) }
    }

    @Test
    fun `a truncated header is broken`() {
        val truncated = wav().copyOf(20)

        // the magic bytes survive the cut, the header does not
        WavIntake.isWav(truncated) shouldBe true
        shouldThrow<BrokenAudioException> { WavIntake.inspect(truncated) }
    }
}
