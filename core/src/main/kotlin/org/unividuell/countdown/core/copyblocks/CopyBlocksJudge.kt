package org.unividuell.countdown.core.copyblocks

/**
 * All three lists are in template coordinates: [missing] carries the template's type, [extra] and
 * [wrongType] the guess's. [missing] follows the template's order, the others the guess's.
 */
data class Verdict(
    val correct: Boolean,
    val fit: Fit,
    val missing: List<Block>,
    val extra: List<Block>,
    val wrongType: List<Block>,
)

/**
 * A hit is equal up to a shift and quarter turns about the vertical. Tipped over or mirrored is no
 * special case, only wrong.
 */
object CopyBlocksJudge {

    fun judge(template: List<Block>, guess: List<Block>): Verdict {
        val best = bestFit(template = template, guess = guess)
        val fit = best.fit

        val templateByCell = template.associateBy { it.cell() }
        val hit = mutableSetOf<Cell>()
        val extra = mutableListOf<Block>()
        val wrongType = mutableListOf<Block>()

        guess.forEach { g ->
            val cell = fit.toTemplate(g.cell())
            val expected = templateByCell[cell]
            val placed = Block(x = cell.x, y = cell.y, z = cell.z, type = g.type)

            if (expected != null) hit += cell

            when {
                expected == null -> extra += placed
                expected.type != g.type -> wrongType += placed
            }
        }

        return Verdict(
            correct = guess.size == template.size && best.types == template.size,
            fit = fit,
            missing = template.filterNot { it.cell() in hit },
            extra = extra,
            wrongType = wrongType,
        )
    }

    /** A fit with the guess blocks it lands on a template block, and those among them of the same type. */
    private class Candidate(val fit: Fit, val positions: Int, val types: Int)

    /**
     * Every guess/template pair votes, per turn, for the one shift that lands the first on the second.
     * Cells are unique on both sides, so a shift's votes are exactly the guess blocks it lands on a
     * template block: 200 against 58 blocks cost 46 400 votes, not a scan per candidate shift.
     *
     * Most positions win, then most types, then fewer turns, then the smallest dx, dy, dz. Without a
     * single vote (an empty guess) the identity stays.
     */
    private fun bestFit(template: List<Block>, guess: List<Block>): Candidate {
        val candidates = (0..3).flatMap { turns ->
            // the fit's own turning, so the convention lives in Fit only
            val turn = Fit(turns = turns, dx = 0, dy = 0, dz = 0)
            val positions = mutableMapOf<Cell, Int>()
            val types = mutableMapOf<Cell, Int>()

            guess.forEach { g ->
                val turned = turn.toTemplate(g.cell())

                template.forEach { t ->
                    val shift = Cell(x = t.x - turned.x, y = t.y - turned.y, z = t.z - turned.z)

                    positions.merge(shift, 1, Int::plus)
                    if (t.type == g.type) types.merge(shift, 1, Int::plus)
                }
            }

            positions.map { (shift, count) ->
                Candidate(
                    fit = Fit(turns = turns, dx = shift.x, dy = shift.y, dz = shift.z),
                    positions = count,
                    types = types[shift] ?: 0,
                )
            }
        }

        return candidates.minWithOrNull(
            compareByDescending<Candidate> { it.positions }
                .thenByDescending { it.types }
                .thenBy { it.fit.turns }
                .thenBy { it.fit.dx }
                .thenBy { it.fit.dy }
                .thenBy { it.fit.dz },
        ) ?: Candidate(fit = Fit.IDENTITY, positions = 0, types = 0)
    }
}
