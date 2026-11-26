package org.unividuell.countdown.core.stackfloor

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File

/**
 * Pins [Tower] to the committed vectors. `tower.spec.ts` asserts the browser mirror against the
 * same file.
 *
 * Regenerate after an intentional change of the tower arithmetic:
 * `./mvnw test -Dtest=TowerGoldenVectorTest -Dstackfloor.vectors.write=true`
 */
class TowerGoldenVectorTest {

    data class GeometryJson(
        val fieldWidth: Int,
        val startWidth: Int,
        val speedNum: Int,
        val speedDen: Int,
        val accelPercent: Int,
        val perfectTolerance: Int,
        val maxFloors: Int,
    )
    private data class PlaceInput(val below: Bar, val x: Int, val width: Int, val tolerance: Int = 0)
    data class PositionCase(val floor: Int, val width: Int, val ms: Int, val x: Int)
    data class PlaceCase(val below: List<Int>, val x: Int, val width: Int, val tolerance: Int, val bar: List<Int>?)
    data class TowerCase(val maxFloors: Int, val clicks: List<Int>, val height: Int, val missed: Boolean, val bars: List<List<Int>>)
    data class Vectors(
        val version: Int,
        val geometry: GeometryJson,
        val positions: List<PositionCase>,
        val places: List<PlaceCase>,
        val towers: List<TowerCase>,
    )

    private val g = TowerGeometry(
        fieldWidth = 1000, startWidth = 660, speedNum = 1, speedDen = 2, accelPercent = 3, perfectTolerance = 3,
        maxFloors = 999,
    )

    private fun pair(bar: Bar) = listOf(bar.left, bar.width)

    private fun tower(geometry: TowerGeometry, clicks: List<Int>): TowerCase {
        val result = Tower.build(geometry = geometry, clicks = clicks)

        return TowerCase(
            maxFloors = geometry.maxFloors,
            clicks = clicks,
            height = result.height,
            missed = result.missed,
            bars = result.bars.map { pair(it) },
        )
    }

    private fun build(): Vectors {
        val below = Bar(left = 170, width = 660)
        val placeInputs = listOf(
            PlaceInput(below = below, x = 0, width = 660), // overhang left
            PlaceInput(below = below, x = 340, width = 660), // overhang right
            PlaceInput(below = below, x = 170, width = 660), // congruent
            PlaceInput(below = below, x = 400, width = 200), // inside
            PlaceInput(below = below, x = 830, width = 100), // touches the right edge
            PlaceInput(below = below, x = 70, width = 100), // touches the left edge
            PlaceInput(below = below, x = 0, width = 50), // far left
            PlaceInput(below = below, x = 900, width = 100), // far right
            PlaceInput(below = below, x = 173, width = 660, tolerance = 3), // snaps from the right
            PlaceInput(below = below, x = 167, width = 660, tolerance = 3), // snaps from the left
            PlaceInput(below = below, x = 174, width = 660, tolerance = 3), // one past: cut
        )
        val rng = SeededRandom.fromSeed(7)
        val random = List(20) { rng.nextIntBetween(min = 0, maxInclusive = 2000) }

        return Vectors(
            version = 3,
            geometry = GeometryJson(
                fieldWidth = g.fieldWidth, startWidth = g.startWidth, speedNum = g.speedNum,
                speedDen = g.speedDen, accelPercent = g.accelPercent, perfectTolerance = g.perfectTolerance,
                maxFloors = g.maxFloors,
            ),
            positions = listOf(0, 1, 7, 40).flatMap { floor ->
                listOf(660, 1, 999).flatMap { width ->
                    listOf(0, 1, 679, 680, 681, 1361, 3_600_000).map { ms ->
                        PositionCase(floor = floor, width = width, ms = ms, x = Tower.position(geometry = g, floor = floor, width = width, ms = ms))
                    }
                }
            },
            places = placeInputs.map { (b, x, width, tolerance) ->
                PlaceCase(
                    below = pair(b), x = x, width = width, tolerance = tolerance,
                    bar = Tower.place(below = b, x = x, width = width, tolerance = tolerance)?.let { pair(it) },
                )
            },
            towers = listOf(
                tower(geometry = g, clicks = listOf(0, 0, 0)),
                tower(geometry = g, clicks = random),
                tower(geometry = g.copy(maxFloors = 5), clicks = List(7) { 340 }), // dead centre every time
            ),
        )
    }

    @Test
    fun `tower matches the shared vectors`() {
        val generated = build()

        if (System.getProperty("stackfloor.vectors.write") == "true") {
            FILE.parentFile.mkdirs()
            FILE.writeText(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated) + "\n")
        }

        FILE.exists() shouldBe true
        mapper.readValue(FILE, Vectors::class.java) shouldBe generated
    }

    private companion object {
        /** Resolved relative to the module directory, which is Maven's and Vitest's working directory. */
        val FILE = File("../shared/stack-floor/tower.json")
        val mapper = jacksonObjectMapper()
    }
}
