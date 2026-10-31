package org.unividuell.countdown.core.echolocate

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * A pool clip as a ping plays it: the voice starts with the first sample, so every ring the player
 * marks is timed from the voice, not from the silence in front of it. Pure JVM, no Spring.
 *
 * The onset rule is the spike's (`d41a6488`): the first 5 ms window 6 dB above the clip's noise
 * floor (its quietest tenth) that stays there for 15 ms. A share of the peak would not do: a noisy
 * recording's hiss already crosses it (130 ms of hiss stayed in front of one voice).
 *
 * Levelling (RMS) is not done here; the browser scales every part to one loudness.
 */
object ClipPrep {

    const val WINDOW_MS = 5
    const val FLOOR_SHARE = 0.1
    const val ONSET_DB = 6.0
    const val HOLD_WINDOWS = 3
    const val PRE_ROLL_MS = 15
    const val MAX_SECONDS = 3.0
    const val FADE_MS = 20

    /** Added to a window's power so silence has a level (-180 dB) instead of minus infinity. */
    private const val POWER_EPSILON = 1e-18

    /** The floor of a clip too short to have a window. */
    private const val NO_FLOOR_DB = -120.0

    private const val FULL_SCALE = 32768f

    private class Mono(val samples: FloatArray, val sampleRate: Int)

    /**
     * The frame to cut at: [PRE_ROLL_MS] before the onset, so the voice's attack survives; never
     * below 0, and 0 when there is no onset.
     */
    fun cutFrame(mono: FloatArray, sampleRate: Int): Int {
        val window = frames(ms = WINDOW_MS, sampleRate = sampleRate).coerceAtLeast(1)
        val levels = DoubleArray(mono.size / window) { levelDb(mono = mono, from = it * window, length = window) }

        val floor = levels.sorted().getOrElse((levels.size * FLOOR_SHARE).toInt()) { NO_FLOOR_DB }

        fun loud(i: Int) = i in levels.indices && levels[i] > floor + ONSET_DB

        val onset = levels.indices.firstOrNull { first -> (0 until HOLD_WINDOWS).all { loud(first + it) } }
            ?: return 0

        return max(a = 0, b = onset * window - frames(ms = PRE_ROLL_MS, sampleRate = sampleRate))
    }

    /** Cut at the first sound, capped at [MAX_SECONDS], faded at both ends; 16-bit mono WAV at the pool's rate. */
    fun prepare(wav: ByteArray): ByteArray {
        val clip = decode(wav)

        val from = cutFrame(mono = clip.samples, sampleRate = clip.sampleRate)
        val to = min(a = clip.samples.size, b = from + (MAX_SECONDS * clip.sampleRate).roundToInt())

        val cut = clip.samples.copyOfRange(fromIndex = from, toIndex = to)
        fade(samples = cut, sampleRate = clip.sampleRate)

        return wav(samples = cut, sampleRate = clip.sampleRate)
    }

    private fun frames(ms: Int, sampleRate: Int): Int = (ms / 1000.0 * sampleRate).roundToInt()

    /** Mean power of one window in dB (full scale = 0 dB for a square wave). */
    private fun levelDb(mono: FloatArray, from: Int, length: Int): Double {
        var sum = 0.0
        for (i in from until from + length) sum += mono[i].toDouble() * mono[i]

        return 10 * log10(sum / length + POWER_EPSILON)
    }

    /** The pool only holds 16-bit PCM WAV (see `WavIntake`); channels are averaged. */
    private fun decode(wav: ByteArray): Mono =
        AudioSystem.getAudioInputStream(ByteArrayInputStream(wav)).use { stream ->
            val format = stream.format
            require(
                format.encoding == AudioFormat.Encoding.PCM_SIGNED &&
                    format.sampleSizeInBits == 16 &&
                    !format.isBigEndian,
            ) { "not 16-bit little-endian PCM: $format" }

            val bytes = ByteBuffer.wrap(stream.readAllBytes()).order(ByteOrder.LITTLE_ENDIAN)
            val channels = format.channels

            val samples = FloatArray(bytes.capacity() / format.frameSize) { frame ->
                var sum = 0f
                for (channel in 0 until channels) sum += bytes.getShort((frame * channels + channel) * 2) / FULL_SCALE

                sum / channels
            }

            Mono(samples = samples, sampleRate = format.sampleRate.toInt())
        }

    /**
     * Linear in and out, so the cut neither clicks nor ends abruptly. A clip shorter than two fades
     * fades over half its length each, so the fades never overlap.
     */
    private fun fade(samples: FloatArray, sampleRate: Int) {
        val length = min(a = frames(ms = FADE_MS, sampleRate = sampleRate), b = samples.size / 2)

        for (i in 0 until length) {
            val gain = i.toFloat() / length
            samples[i] *= gain
            samples[samples.lastIndex - i] *= gain
        }
    }

    private fun wav(samples: FloatArray, sampleRate: Int): ByteArray {
        val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (sample in samples) {
            val pcm = (sample * FULL_SCALE).roundToInt().coerceIn(minimumValue = -32768, maximumValue = 32767)
            bytes.putShort(pcm.toShort())
        }

        val format = AudioFormat(sampleRate.toFloat(), 16, 1, true, false)
        val out = ByteArrayOutputStream()
        AudioInputStream(ByteArrayInputStream(bytes.array()), format, samples.size.toLong()).use { stream ->
            AudioSystem.write(stream, AudioFileFormat.Type.WAVE, out)
        }

        return out.toByteArray()
    }
}
