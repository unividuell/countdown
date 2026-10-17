package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class CopyBlocksJudgeTest {

    /** Asymmetric, every block another type: exactly one fit can be exact. */
    private val template = listOf(
        Block(x = 0, y = 0, z = 0, type = BlockType.DIRT),
        Block(x = 1, y = 0, z = 0, type = BlockType.BRICKS),
        Block(x = 2, y = 0, z = 0, type = BlockType.LEAVES),
        Block(x = 0, y = 1, z = 0, type = BlockType.STONE),
        Block(x = 0, y = 0, z = 1, type = BlockType.LAPIS),
    )

    /** What a player builds who turned and shifted the template by [fit]. */
    private fun built(fit: Fit, blocks: List<Block> = template) =
        blocks.map { b -> fit.toGuess(b.cell()).let { Block(x = it.x, y = it.y, z = it.z, type = b.type) } }

    @Test
    fun `each of the four turns about the vertical, shifted anywhere, is exact`() {
        (0..3).forEach { turns ->
            val fit = Fit(turns = turns, dx = 3, dy = -2, dz = 7)
            CopyBlocksJudge.judge(template = template, guess = built(fit)).let {
                it.correct shouldBe true
                it.fit shouldBe fit
                it.missing.shouldBeEmpty()
                it.extra.shouldBeEmpty()
                it.wrongType.shouldBeEmpty()
            }
        }
    }

    @Test
    fun `tipped over or mirrored is simply wrong`() {
        val tipped = template.map { it.copy(x = -it.y, y = it.x) }
        val mirrored = template.map { it.copy(x = -it.x) }

        CopyBlocksJudge.judge(template = template, guess = tipped).correct shouldBe false
        CopyBlocksJudge.judge(template = template, guess = mirrored).correct shouldBe false
    }

    @Test
    fun `a missing, an extra and a wrong block each land in their list, in template coordinates`() {
        val fit = Fit(turns = 1, dx = 10, dy = 0, dz = -4)
        val guess = built(fit = fit, blocks = template.filterNot { it.type == BlockType.LAPIS })
            .map { if (it.type == BlockType.LEAVES) it.copy(type = BlockType.STONE) else it } +
            built(fit = fit, blocks = listOf(Block(x = 3, y = 0, z = 0, type = BlockType.DIRT)))

        CopyBlocksJudge.judge(template = template, guess = guess).let {
            it.correct shouldBe false
            it.fit shouldBe fit
            it.missing shouldBe listOf(Block(x = 0, y = 0, z = 1, type = BlockType.LAPIS))
            it.wrongType shouldBe listOf(Block(x = 2, y = 0, z = 0, type = BlockType.STONE))
            it.extra shouldBe listOf(Block(x = 3, y = 0, z = 0, type = BlockType.DIRT))
        }
    }

    @Test
    fun `the right shape in the wrong types is no hit`() {
        val guess = template.map { it.copy(type = BlockType.DIRT) }

        CopyBlocksJudge.judge(template = template, guess = guess).let {
            it.correct shouldBe false
            it.wrongType.size shouldBe 4
        }
    }

    @Test
    fun `equal fits pick the fewest turns`() {
        val one = listOf(Block(x = 5, y = 0, z = 0, type = BlockType.DIRT))
        val origin = listOf(Block(x = 0, y = 0, z = 0, type = BlockType.DIRT))

        CopyBlocksJudge.judge(template = one, guess = origin).fit shouldBe Fit(turns = 0, dx = 5, dy = 0, dz = 0)
    }

    @Test
    fun `equal fits pick the smallest dx, then dy, then dz`() {
        val line = listOf(
            Block(x = 3, y = 0, z = 0, type = BlockType.DIRT),
            Block(x = 1, y = 9, z = 9, type = BlockType.DIRT),
            Block(x = 1, y = 5, z = 9, type = BlockType.DIRT),
            Block(x = 1, y = 5, z = 2, type = BlockType.DIRT),
        )
        val origin = listOf(Block(x = 0, y = 0, z = 0, type = BlockType.DIRT))

        CopyBlocksJudge.judge(template = line, guess = origin).fit shouldBe Fit(turns = 0, dx = 1, dy = 5, dz = 2)
    }

    @Test
    fun `a lone block of a type the template never uses lands on a template block as the wrong type`() {
        // The leftmost block sits one up: the template in my coordinates reaches below my floor.
        val steps = listOf(
            Block(x = 0, y = 1, z = 0, type = BlockType.DIRT),
            Block(x = 1, y = 1, z = 0, type = BlockType.STONE),
            Block(x = 1, y = 0, z = 0, type = BlockType.BRICKS),
        )

        CopyBlocksJudge.judge(
            template = steps,
            guess = listOf(Block(x = 3, y = 0, z = 3, type = BlockType.LEAVES)),
        ).let {
            it.correct shouldBe false
            it.fit shouldBe Fit(turns = 0, dx = -3, dy = 1, dz = -3)
            it.wrongType shouldBe listOf(Block(x = 0, y = 1, z = 0, type = BlockType.LEAVES))
            it.missing shouldBe steps.drop(1)
            it.extra.shouldBeEmpty()
        }
    }

    @Test
    fun `an empty guess keeps the identity and misses everything`() {
        CopyBlocksJudge.judge(template = template, guess = emptyList()).let {
            it.correct shouldBe false
            it.fit shouldBe Fit.IDENTITY
            it.missing shouldBe template
        }
    }
}
