package org.unividuell.countdown.core.audiopool.internal

import java.io.ByteArrayInputStream
import java.io.IOException
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioSystem
import javax.sound.sampled.UnsupportedAudioFileException

data class WavFormat(val channels: Int, val sampleRate: Int, val frames: Int)

/**
 * The only file the pool takes: the 16-bit PCM WAV the browser built from whatever the phone
 * recorded. No Spring, no database -- and no decoding: the header is read, the samples never are.
 */
object WavIntake {

    private val channelRange = 1..2
    private val sampleRateRange = 8_000..96_000

    /** The client's Content-Type is a claim; these bytes are evidence: "RIFF", four length bytes, "WAVE". */
    fun isWav(bytes: ByteArray): Boolean =
        at(bytes = bytes, offset = 0, expected = "RIFF") && at(bytes = bytes, offset = 8, expected = "WAVE")

    /**
     * Throws [BrokenAudioException] for a header the JDK cannot read or one that promises no frames,
     * [UnsupportedAudioFormatException] for a readable one outside what the browser is told to send.
     */
    fun inspect(bytes: ByteArray): WavFormat {
        val format = try {
            AudioSystem.getAudioFileFormat(ByteArrayInputStream(bytes))
        } catch (_: UnsupportedAudioFileException) {
            throw BrokenAudioException()
        } catch (_: IOException) {
            // the in-memory stream itself failing; a malformed or cut header is the case above
            throw BrokenAudioException()
        }

        if (!isAccepted(format.format)) throw UnsupportedAudioFormatException()
        // frameLength is -1 when the header does not say
        if (format.frameLength <= 0) throw BrokenAudioException()

        return WavFormat(
            channels = format.format.channels,
            sampleRate = format.format.sampleRate.toInt(),
            frames = format.frameLength,
        )
    }

    private fun isAccepted(format: AudioFormat): Boolean =
        format.encoding == AudioFormat.Encoding.PCM_SIGNED &&
            format.sampleSizeInBits == 16 &&
            !format.isBigEndian &&
            format.channels in channelRange &&
            format.sampleRate.toInt() in sampleRateRange

    private fun at(bytes: ByteArray, offset: Int, expected: String): Boolean =
        bytes.size >= offset + expected.length &&
            String(bytes = bytes, offset = offset, length = expected.length, charset = Charsets.US_ASCII) == expected
}
