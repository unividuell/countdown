package org.unividuell.countdown.core.echolocate

import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlin.random.Random

/** 16-bit PCM WAV from interleaved samples, the way the pool stores one. */
internal fun pcmWav(interleaved: ShortArray, channels: Int, sampleRate: Int): ByteArray {
    val bytes = ByteBuffer.allocate(interleaved.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    interleaved.forEach { bytes.putShort(it) }

    val format = AudioFormat(sampleRate.toFloat(), 16, channels, true, false)
    val out = ByteArrayOutputStream()
    AudioInputStream(ByteArrayInputStream(bytes.array()), format, (interleaved.size / channels).toLong()).use {
        AudioSystem.write(it, AudioFileFormat.Type.WAVE, out)
    }

    return out.toByteArray()
}

class ClipPrepTest {

    private val rate = 48_000
    private val window = 240 // 5 ms at 48 kHz
    private val preRoll = 720 // 15 ms at 48 kHz

    private fun frames(seconds: Double, rate: Int = this.rate) = (seconds * rate).roundToInt()

    private fun silence(seconds: Double) = FloatArray(frames(seconds = seconds))

    /** A cosine whose period fits whole into every 5 ms window, so every window is equally loud. */
    private fun tone(seconds: Double, dbfs: Double = -10.0, rate: Int = this.rate): FloatArray {
        val amplitude = 10.0.pow(dbfs / 20) * sqrt(2.0) // rms = amplitude / sqrt(2)

        return FloatArray(frames(seconds = seconds, rate = rate)) { i ->
            (amplitude * cos(2 * PI * 1000.0 * i / rate)).toFloat()
        }
    }

    private fun noise(seconds: Double, dbfs: Double): FloatArray {
        val random = Random(seed = 1)
        val peak = 10.0.pow(dbfs / 20) * sqrt(3.0) // uniform noise: rms = peak / sqrt(3)

        return FloatArray(frames(seconds = seconds)) { ((random.nextDouble() * 2 - 1) * peak).toFloat() }
    }

    private fun shorts(samples: FloatArray) =
        ShortArray(samples.size) { (samples[it] * 32768f).roundToInt().toShort() }

    private fun monoWav(samples: FloatArray) =
        pcmWav(interleaved = shorts(samples), channels = 1, sampleRate = rate)

    private fun stereoWav(left: FloatArray, right: FloatArray, rate: Int = this.rate): ByteArray {
        val l = shorts(left)
        val r = shorts(right)

        return pcmWav(
            interleaved = ShortArray(l.size * 2) { if (it % 2 == 0) l[it / 2] else r[it / 2] },
            channels = 2,
            sampleRate = rate,
        )
    }

    private class Decoded(val samples: ShortArray, val format: AudioFormat)

    private fun decode(wav: ByteArray): Decoded {
        val stream = AudioSystem.getAudioInputStream(ByteArrayInputStream(wav))
        val bytes = ByteBuffer.wrap(stream.readAllBytes()).order(ByteOrder.LITTLE_ENDIAN)

        return Decoded(samples = ShortArray(bytes.capacity() / 2) { bytes.getShort(it * 2) }, format = stream.format)
    }

    @Test
    fun `silence then a tone cuts 15 ms before the tone`() {
        val clip = silence(seconds = 0.3) + tone(seconds = 0.3)

        // 300 ms = window 60, minus 15 ms of pre-roll
        ClipPrep.cutFrame(mono = clip, sampleRate = rate) shouldBe 60 * window - preRoll
    }

    @Test
    fun `the prepared clip starts with the pre-roll, then the tone`() {
        val clip = silence(seconds = 0.3) + tone(seconds = 0.3)

        val out = decode(ClipPrep.prepare(monoWav(clip))).samples

        out.size shouldBe frames(seconds = 0.3) + preRoll
        out.take(preRoll).all { it.toInt() == 0 } shouldBe true
        out.drop(preRoll + 1_000).take(window).maxOf { abs(it.toInt()) } shouldBeGreaterThan 1_000
    }

    @Test
    fun `noise then a louder tone finds the tone, not the noise`() {
        val clip = noise(seconds = 0.3, dbfs = -40.0) + tone(seconds = 0.3, dbfs = -10.0)

        val expected = 60 * window - preRoll
        ClipPrep.cutFrame(mono = clip, sampleRate = rate) shouldBeInRange (expected - window)..(expected + window)
    }

    @Test
    fun `a stereo clip is mixed to mono before it is measured`() {
        val voice = silence(seconds = 0.3) + tone(seconds = 0.3)
        val quiet = FloatArray(voice.size)

        // The tone sits on one channel only; whichever it is, the onset is found and the result is mono.
        listOf(stereoWav(left = voice, right = quiet), stereoWav(left = quiet, right = voice)).forEach { wav ->
            val out = decode(ClipPrep.prepare(wav))

            out.format.channels shouldBe 1
            out.samples.size shouldBe frames(seconds = 0.3) + preRoll
        }
    }

    @Test
    fun `a click shorter than the hold is not an onset`() {
        val click = tone(seconds = 0.005, dbfs = -6.0)
        val clip = silence(seconds = 0.05) + click + silence(seconds = 0.245) + tone(seconds = 0.3)

        ClipPrep.cutFrame(mono = clip, sampleRate = rate) shouldBe 60 * window - preRoll
    }

    @Test
    fun `without an onset nothing is cut`() {
        val clip = silence(seconds = 1.0)

        ClipPrep.cutFrame(mono = clip, sampleRate = rate) shouldBe 0
        decode(ClipPrep.prepare(monoWav(clip))).samples.size shouldBe clip.size
    }

    @Test
    fun `a clip shorter than three windows passes unharmed`() {
        val clip = tone(seconds = 0.008)

        ClipPrep.cutFrame(mono = clip, sampleRate = rate) shouldBe 0
        decode(ClipPrep.prepare(monoWav(clip))).samples.size shouldBe clip.size
    }

    @Test
    fun `the output is capped at 3 s, mono, 16 bit, at the pool's rate`() {
        val tone = tone(seconds = 5.0, rate = 44_100)

        val out = decode(ClipPrep.prepare(stereoWav(left = tone, right = tone, rate = 44_100)))

        out.format.channels shouldBe 1
        out.format.sampleSizeInBits shouldBe 16
        out.format.sampleRate shouldBe 44_100f
        out.samples.size shouldBe 3 * 44_100
    }

    @Test
    fun `the cap counts from the cut, not from the start`() {
        val clip = silence(seconds = 0.3) + tone(seconds = 5.0)

        decode(ClipPrep.prepare(monoWav(clip))).samples.size shouldBe 3 * rate
    }

    @Test
    fun `it fades in and out over 20 ms`() {
        val clip = tone(seconds = 1.0, dbfs = -6.0)
        val src = shorts(clip)

        val out = decode(ClipPrep.prepare(monoWav(clip))).samples

        out.size shouldBe src.size
        out.first().toInt() shouldBe 0
        out.last().toInt() shouldBe 0

        // linear: halfway through the 960-frame fade, half the level (frame 480 is a cosine peak)
        abs(out[480] - src[480] / 2) shouldBeInRange 0..1

        // 25 ms is past both fades: untouched
        val past = frames(seconds = 0.025)
        out[past] shouldBe src[past]
        out[out.size - 1 - past] shouldBe src[src.size - 1 - past]
    }

    @Test
    fun `a clip shorter than both fades is faded without overrun`() {
        val clip = tone(seconds = 0.03, dbfs = -6.0)
        val src = shorts(clip)

        val out = decode(ClipPrep.prepare(monoWav(clip))).samples

        out.size shouldBe src.size
        out.first().toInt() shouldBe 0
        out.last().toInt() shouldBe 0

        // each fade is half the clip (720 frames) and they never overlap: frame 720 is a cosine peak
        // and is faded once, by the out-fade's 719/720
        abs(src[720].toInt()) shouldBeGreaterThan 1_000
        abs(out[720] - src[720] * 719 / 720) shouldBeInRange 0..1
    }
}
