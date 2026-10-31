package org.unividuell.countdown.core.game

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import tools.jackson.databind.JsonNode
import java.util.concurrent.atomic.AtomicInteger

/**
 * A game that counts its `judge` calls — for proving a request never reached it. Every guess
 * qualifies; no reveal, one stage. Shared by the real round's and the lab's tests, so both prove the
 * same thing against the same game.
 */
class CountingGame : GameType<CountingGame.Params> {
    data class Params(val answer: String)
    data class Payload(val hint: String) : GamePayload

    val judged = AtomicInteger()

    override val id = "counting-fake"
    override val displayName = "Zählwerk"
    override val paramsType = Params::class.java
    override fun draw(random: GameRandom, context: RoundContext) = Params(answer = "42")
    override fun present(params: Params) = Payload(hint = "any")
    override fun requiresReveal(params: Params) = false
    override fun scoresOnDuration(params: Params) = false

    override fun judge(params: Params, guess: JsonNode): Judgement {
        judged.incrementAndGet()
        return Judgement(qualifies = true, deviation = 0.0, outcome = null)
    }

    @TestConfiguration
    class Configuration {
        @Bean
        fun countingGame() = CountingGame()
    }
}
