package org.unividuell.countdown.core.game

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import tools.jackson.databind.JsonNode

/**
 * A game that shows what its contexts carry: a step answers with the number of earlier inputs, and
 * `judge` deviates by the number of stored steps. Four stages that do not score; every guess qualifies.
 * Shared by the real round's and the lab's tests.
 */
class EarlierStepsGame : GameType<EarlierStepsGame.Params> {
    data class Params(val answer: String)
    data class Payload(val stages: Int) : GamePayload
    data class EarlierAnswer(val earlier: Int) : GameStepAnswer

    override val id = "earlier-steps-fake"
    override val displayName = "Rückblick"
    override val paramsType = Params::class.java
    override fun draw(random: GameRandom, context: RoundContext) = Params(answer = "42")
    override fun present(params: Params) = Payload(stages = 4)
    override fun requiresReveal(params: Params) = false
    override fun scoresOnDuration(params: Params) = false
    override fun stages(params: Params) = 4
    override fun stagesScore(params: Params) = false

    override fun judge(params: Params, guess: JsonNode): Judgement =
        Judgement(qualifies = true, deviation = -1.0, outcome = null)

    override fun judge(params: Params, guess: JsonNode, context: GuessContext): Judgement =
        Judgement(qualifies = true, deviation = context.steps.size.toDouble(), outcome = null)

    override fun step(params: Params, stage: Int, input: JsonNode?, context: StepContext): GameStepAnswer =
        EarlierAnswer(earlier = context.earlier.size)

    @TestConfiguration
    class Configuration {
        @Bean
        fun earlierStepsGame() = EarlierStepsGame()
    }
}
