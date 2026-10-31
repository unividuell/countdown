package org.unividuell.countdown.core.paintratio

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

class PaintStrokeTest {

    @Test
    fun `a stroke of one point is a dot of half the brush`() {
        PaintStroke(brush = 0, color = "#000000", points = listOf(50, 50)).marks(brushes = listOf(6, 12)) shouldBe
            listOf(Capsule(ax = 50, ay = 50, bx = 50, by = 50, radius = 3))
    }

    @Test
    fun `consecutive points become capsules`() {
        val stroke = PaintStroke(brush = 1, color = "#000000", points = listOf(0, 0, 10, 0, 10, 10))

        stroke.marks(brushes = listOf(6, 12)) shouldBe
            listOf(
                Capsule(ax = 0, ay = 0, bx = 10, by = 0, radius = 6),
                Capsule(ax = 10, ay = 0, bx = 10, by = 10, radius = 6),
            )
    }

    @Test
    fun `the colour becomes opaque argb`() {
        PaintStroke(brush = 0, color = "#3049e8", points = listOf(0, 0)).argb() shouldBe 0xFF3049E8.toInt()
    }

    @Test
    fun `it serialises as brush, color and points only`() {
        val stroke = PaintStroke(brush = 1, color = "#3049e8", points = listOf(1, 2, 3, 4))

        val json = JsonMapper.builder().build().valueToTree<JsonNode>(stroke)

        json.propertyNames().toSet() shouldBe setOf("brush", "color", "points")
    }
}
