package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File

class FitGoldenVectorTest {

    data class Case(val fit: Fit, val guess: List<Int>, val template: List<Int>)
    data class Vectors(val version: Int, val rule: String, val cases: List<Case>)

    /** Relative to the module directory, Maven's working directory — the file Vitest reads too. */
    private val vectors = jacksonObjectMapper().readValue(File("../shared/copy-blocks/fit.json"), Vectors::class.java)

    private fun cell(xyz: List<Int>) = Cell(x = xyz[0], y = xyz[1], z = xyz[2])

    @Test
    fun `a guess cell lands on the template where the shared vectors say`() {
        vectors.cases.forEach { case -> case.fit.toTemplate(cell(case.guess)) shouldBe cell(case.template) }
    }

    @Test
    fun `and the inverse brings it back`() {
        vectors.cases.forEach { case -> case.fit.toGuess(cell(case.template)) shouldBe cell(case.guess) }
    }

    @Test
    fun `the identity moves nothing`() {
        Fit.IDENTITY.toTemplate(Cell(x = 4, y = -1, z = 9)) shouldBe Cell(x = 4, y = -1, z = 9)
    }
}
