package org.unividuell.countdown.core.songsnippet

import javazoom.jl.decoder.Bitstream
import javazoom.jl.decoder.Decoder
import javazoom.jl.decoder.SampleBuffer
import org.springframework.stereotype.Component
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem

/**
 * MP3 -> PCM -> sample-exact prefix cuts -> WAV, pure JVM. The cuts all start at the same offset
 * (the fade skip), so every stage is a prefix of the next — more of the same, never a new spot.
 */
@Component
class SnippetCutter {

    private class Pcm(val samples: ShortArray, val channels: Int, val sampleRate: Int)

    fun ladder(mp3: ByteArray): Map<Int, AudioClip> {
        val pcm = decode(mp3)
        val skipFrames = (SongSnippetStages.FADE_SKIP_SECONDS * pcm.sampleRate).toInt()
        val totalFrames = pcm.samples.size / pcm.channels
        val stages = SongSnippetStages.DURATIONS_SECONDS.mapIndexed { stage, seconds ->
            val wantedFrames = (seconds * pcm.sampleRate).toInt()
            val from = minOf(a = skipFrames, b = totalFrames)
            val to = minOf(a = from + wantedFrames, b = totalFrames)
            stage to AudioClip(mediaType = "audio/wav", bytes = wav(pcm = pcm, fromFrame = from, toFrame = to))
        }
        return (stages + (SongSnippetStages.SOLUTION_KEY to AudioClip(mediaType = "audio/mpeg", bytes = mp3)))
            .toMap()
    }

    private fun decode(mp3: ByteArray): Pcm {
        val bitstream = Bitstream(ByteArrayInputStream(mp3))
        val decoder = Decoder()
        val chunks = ArrayList<ShortArray>()
        var channels = 0
        var sampleRate = 0
        try {
            while (true) {
                val header = bitstream.readFrame() ?: break
                val frame = decoder.decodeFrame(header, bitstream) as SampleBuffer
                if (channels == 0) {
                    channels = frame.channelCount
                    sampleRate = frame.sampleFrequency
                }
                chunks.add(frame.buffer.copyOf(frame.bufferLength))
                bitstream.closeFrame()
            }
        } finally {
            bitstream.close()
        }
        require(channels > 0) { "not a decodable mp3" }
        val total = chunks.sumOf { it.size }
        val samples = ShortArray(total)
        var offset = 0
        for (chunk in chunks) {
            chunk.copyInto(destination = samples, destinationOffset = offset)
            offset += chunk.size
        }
        return Pcm(samples = samples, channels = channels, sampleRate = sampleRate)
    }

    private fun wav(pcm: Pcm, fromFrame: Int, toFrame: Int): ByteArray {
        val frameCount = (toFrame - fromFrame).coerceAtLeast(0)
        val bytes = ByteArray(frameCount * pcm.channels * 2)
        var i = 0
        for (frame in fromFrame until toFrame) {
            for (channel in 0 until pcm.channels) {
                val sample = pcm.samples[frame * pcm.channels + channel].toInt()
                bytes[i++] = (sample and 0xff).toByte()
                bytes[i++] = ((sample shr 8) and 0xff).toByte()
            }
        }
        val format = AudioFormat(pcm.sampleRate.toFloat(), 16, pcm.channels, true, false)
        val out = ByteArrayOutputStream()
        AudioInputStream(ByteArrayInputStream(bytes), format, frameCount.toLong()).use { stream ->
            AudioSystem.write(stream, javax.sound.sampled.AudioFileFormat.Type.WAVE, out)
        }
        return out.toByteArray()
    }
}
