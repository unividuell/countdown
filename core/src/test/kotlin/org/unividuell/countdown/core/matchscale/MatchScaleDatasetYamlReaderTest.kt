package org.unividuell.countdown.core.matchscale

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetException
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetYamlReader

class MatchScaleDatasetYamlReaderTest {

    private fun read(yaml: String) =
        MatchScaleDatasetYamlReader.read(yaml.trimIndent().byteInputStream(), origin = "test.yaml")

    private fun file(
        category: String = "example",
        displayName: String = "Beispielkategorie",
        entries: String = entry(),
        categoryAttribution: String? = null,
    ) = buildString {
        appendLine("category: $category")
        appendLine("displayName: \"$displayName\"")
        if (categoryAttribution != null) appendLine("attribution: \"$categoryAttribution\"")
        appendLine("entries:")
        append(entries)
    }

    private fun entry(
        name: String = "Beispielform Alpha",
        path: String = "M0 0 l1000 0 l0 500 z",
        width: String = "1000",
        height: String = "500",
        metresPerUnit: String = "2.5",
        attribution: String? = null,
        measure: String? = null,
    ) = buildString {
        appendLine("  - name: \"$name\"")
        appendLine("    path: \"$path\"")
        appendLine("    width: $width")
        appendLine("    height: $height")
        appendLine("    metresPerUnit: $metresPerUnit")
        if (attribution != null) appendLine("    attribution: \"$attribution\"")
        if (measure != null) appendLine("    measure: $measure")
    }

    private fun rejects(yaml: String, vararg fragments: String) {
        val thrown = shouldThrow<MatchScaleDatasetException> { read(yaml) }
        thrown.message!! shouldContain "test.yaml"
        fragments.forEach { thrown.message!! shouldContain it }
    }

    @Test
    fun `reads a category with its entries`() {
        val category = read(
            file(
                categoryAttribution = "Quelle K",
                entries = entry(name = "Beispielform Alpha", attribution = "Quelle E") +
                    entry(name = "Beispielform Beta", width = "800", height = "1000", metresPerUnit = "4") +
                    entry(name = "Beispielform Gamma"),
            ),
        )

        category.key shouldBe "example"
        category.displayName shouldBe "Beispielkategorie"
        category.entries.map { it.name } shouldBe listOf("Beispielform Alpha", "Beispielform Beta", "Beispielform Gamma")

        val alpha = category.entries[0]
        alpha.path shouldBe "M0 0 l1000 0 l0 500 z"
        alpha.width shouldBe 1000.0
        alpha.height shouldBe 500.0
        alpha.metresPerUnit shouldBe 2.5
        alpha.attribution shouldBe "Quelle E"

        category.entries[1].attribution shouldBe "Quelle K"
        category.entries[1].height shouldBe 1000.0
    }

    @Test
    fun `attribution is null when neither entry nor category has one`() {
        read(file()).entries.single().attribution shouldBe null
    }

    @Test
    fun `reads an entry's measure`() {
        val measure = read(
            file(entries = entry(measure = "{ axis: height, metres: 2.5, source: \"https://example.org/q\" }")),
        ).entries.single().measure

        measure shouldBe MatchScaleMeasure(axis = MatchScaleAxis.HEIGHT, metres = 2.5, source = "https://example.org/q")
    }

    @Test
    fun `reads a measure's span`() {
        val measure = read(
            file(entries = entry(measure = "{ axis: length, metres: 2.5, source: q, span: [120, 870.5] }")),
        ).entries.single().measure

        measure?.span shouldBe MatchScaleSpan(from = 120.0, to = 870.5)
    }

    @Test
    fun `span is null when the measure has none`() {
        read(file(entries = entry(measure = "{ axis: length, metres: 2.5, source: q }")))
            .entries.single().measure?.span shouldBe null
    }

    @Test
    fun `rejects a malformed span`() {
        listOf(
            "[870, 120]",
            "[500, 500]",
            "[-1, 500]",
            "[0, 1000.5]",
            "[0, .nan]",
            "[0]",
            "[0, 500, 900]",
            "[a, b]",
            "500",
        ).forEach { span ->
            rejects(
                file(entries = entry(measure = "{ axis: length, metres: 2.5, source: q, span: $span }")),
                "Beispielform Alpha",
                "span",
            )
        }
    }

    @Test
    fun `measure is null when the entry has none`() {
        read(file()).entries.single().measure shouldBe null
    }

    @Test
    fun `rejects an incomplete or malformed measure`() {
        listOf(
            "{ axis: width, metres: 2.5, source: q }" to "axis",
            "{ metres: 2.5, source: q }" to "axis",
            "{ axis: length, metres: 0, source: q }" to "metres",
            "{ axis: length, metres: .nan, source: q }" to "metres",
            "{ axis: length, source: q }" to "metres",
            "{ axis: length, metres: 2.5, source: \" \" }" to "source",
            "{ axis: length, metres: 2.5 }" to "source",
            "2.5" to "measure",
        ).forEach { (measure, field) ->
            rejects(file(entries = entry(measure = measure)), "Beispielform Alpha", field)
        }
    }

    @Test
    fun `rejects a key outside the allowed alphabet`() {
        rejects(file(category = "Bad_Key"), "Bad_Key")
    }

    @Test
    fun `rejects an empty display name`() {
        rejects(file(displayName = " "), "displayName")
    }

    @Test
    fun `rejects a category without entries`() {
        rejects("category: example\ndisplayName: X\nentries: []\n", "entries")
    }

    @Test
    fun `rejects an empty path`() {
        rejects(file(entries = entry(path = " ")), "Beispielform Alpha", "path")
    }

    @Test
    fun `rejects a non-positive, NaN or missing measure`() {
        listOf("width", "height", "metresPerUnit").forEach { field ->
            listOf("0", "-1", ".nan").forEach { bad ->
                val entries = entry(
                    width = if (field == "width") bad else "1000",
                    height = if (field == "height") bad else "500",
                    metresPerUnit = if (field == "metresPerUnit") bad else "2.5",
                )
                rejects(file(entries = entries), "Beispielform Alpha", field)
            }

            val missing = entry().lines().filterNot { it.trim().startsWith("$field:") }.joinToString("\n")
            rejects(file(entries = missing), "Beispielform Alpha", field)
        }
    }

    @Test
    fun `rejects a longest side other than 1000`() {
        rejects(file(entries = entry(width = "900", height = "500")), "Beispielform Alpha", "1000")
    }

    @Test
    fun `rejects a duplicate name within the category`() {
        rejects(file(entries = entry() + entry()), "Beispielform Alpha", "duplicate")
    }
}
