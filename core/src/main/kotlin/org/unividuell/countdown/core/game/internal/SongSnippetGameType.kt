package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.songsnippet.PreviewSource
import org.unividuell.countdown.core.songsnippet.SnippetCutter
import org.unividuell.countdown.core.songsnippet.SongCatalog
import org.unividuell.countdown.core.songsnippet.SongSnippetAudioStore
import org.unividuell.countdown.core.songsnippet.SongSnippetStages
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.Locale
import java.util.UUID

/** The frozen round. Artist and title double as the answer; the track id is its permanent handle. */
data class SongSnippetParams(
    val trackId: Long,
    val artist: String,
    val title: String,
    val coverUrl: String?,
    val link: String,
)

/** All the player needs before guessing: how long each stage is. Zero track information. */
data class SongSnippetPayload(val stageDurationsSeconds: List<Double>) : GamePayload

/** What the player is told about their guess — the stage advance itself rides on the response. */
data class SongSnippetOutcome(val correct: Boolean) : GameOutcome

data class SongSnippetSolution(
    val artist: String,
    val title: String,
    val coverUrl: String?,
    val link: String,
) : GameSolution

/** The wire shape of a guess, bound leniently — judge() decides what is enough. */
private data class SongSnippetGuess(
    val trackId: Long? = null,
    val artist: String? = null,
    val title: String? = null,
)

/**
 * Song Snippet as an announceable game. The adapter lives here and `songsnippet` knows nothing
 * about it — the same reasoning as GuessHueGameType, and this round of contract changes is
 * exactly the case that reasoning exists for.
 */
@Component
class SongSnippetGameType(
    private val catalog: SongCatalog,
    private val previews: PreviewSource,
    private val cutter: SnippetCutter,
    private val audio: SongSnippetAudioStore,
    private val mapper: ObjectMapper,
) : GameType<SongSnippetParams> {

    override val id = "song-snippet"
    override val displayName = "Anspielung"
    override val paramsType = SongSnippetParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): SongSnippetParams {
        val pool = catalog.poolTracks()
        require(pool.isNotEmpty()) { "song-snippet pool is empty - check app.song-snippet.playlist-ids" }
        val used = context.previousParams.mapNotNull { it.get("trackId")?.asLong() }.toSet()
        val fresh = pool.filterNot { it.trackId in used }
        // An exhausted pool allows repeats rather than failing the round.
        val track = random.solution.pick(fresh.ifEmpty { pool })
        return SongSnippetParams(
            trackId = track.trackId,
            artist = track.artist,
            title = track.title,
            coverUrl = track.coverUrl,
            link = track.link,
        )
    }

    override fun present(params: SongSnippetParams) =
        SongSnippetPayload(stageDurationsSeconds = SongSnippetStages.DURATIONS_SECONDS)

    override fun requiresReveal(params: SongSnippetParams) = false

    override fun stages(params: SongSnippetParams) = SongSnippetStages.DURATIONS_SECONDS.size

    override fun judge(params: SongSnippetParams, guess: JsonNode): Judgement {
        val g = try {
            mapper.treeToValue(guess, SongSnippetGuess::class.java)
        } catch (e: Exception) {
            throw InvalidGuessException("guess must carry trackId or artist+title")
        }
        val hasPair = g.artist != null && g.title != null
        if (g.trackId == null && !hasPair) {
            throw InvalidGuessException("guess must carry trackId or artist+title")
        }
        val correct = (g.trackId != null && g.trackId == params.trackId) ||
            (hasPair &&
                normalized(g.artist) == normalized(params.artist) &&
                normalized(g.title) == normalized(params.title))
        return Judgement(
            qualifies = correct,
            // The distance of a staged game is the stage — framework state, overridden there.
            deviation = 0.0,
            outcome = SongSnippetOutcome(correct = correct),
        )
    }

    override fun solution(params: SongSnippetParams) = SongSnippetSolution(
        artist = params.artist,
        title = params.title,
        coverUrl = params.coverUrl,
        link = params.link,
    )

    override fun produceAssets(params: SongSnippetParams): Map<Int, RoundAsset> {
        val resolved = checkNotNull(catalog.track(params.trackId)) {
            "track ${params.trackId} no longer resolvable for audio"
        }
        val mp3 = previews.download(resolved.previewUrl)
        return cutter.ladder(mp3).mapValues { (_, clip) ->
            RoundAsset(mediaType = clip.mediaType, bytes = clip.bytes)
        }
    }

    override fun materialised(params: SongSnippetParams, roundGameId: UUID) {
        for ((key, asset) in produceAssets(params)) {
            audio.store(roundGameId = roundGameId, key = key, mediaType = asset.mediaType, bytes = asset.bytes)
        }
    }

    override fun asset(params: SongSnippetParams, roundGameId: UUID, key: Int): RoundAsset? =
        audio.find(roundGameId = roundGameId, key = key)
            ?.let { RoundAsset(mediaType = it.mediaType, bytes = it.bytes) }

    override fun releaseAssets(roundGameIds: List<UUID>) {
        audio.release(roundGameIds)
    }
}

/** Lowercase, trimmed, whitespace collapsed — title_short is already version-free. */
private fun normalized(value: String?): String? =
    value?.lowercase(Locale.ROOT)?.trim()?.replace(regex = Regex("\\s+"), replacement = " ")
