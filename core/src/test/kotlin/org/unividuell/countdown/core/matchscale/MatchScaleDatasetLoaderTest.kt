package org.unividuell.countdown.core.matchscale

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContainExactlyInAnyOrder
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetException
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetLoader
import org.unividuell.countdown.core.matchscale.internal.MatchScaleDatasetProperties
import java.io.File

class MatchScaleDatasetLoaderTest {

    @TempDir
    lateinit var dir: File

    private fun loader(path: String = dir.path) = MatchScaleDatasetLoader(MatchScaleDatasetProperties(datasetDir = path))

    private fun category(key: String, vararg metresPerUnit: Double) = buildString {
        appendLine("category: $key")
        appendLine("displayName: Kategorie $key")
        appendLine("entries:")
        metresPerUnit.forEachIndexed { index, value ->
            appendLine("  - name: Form $index")
            appendLine("    path: M0 0 l1000 0 l0 500 z")
            appendLine("    width: 1000")
            appendLine("    height: 500")
            appendLine("    metresPerUnit: $value")
        }
    }

    private fun write(name: String, content: String) = File(dir, name).writeText(content)

    @Test
    fun `an empty directory setting loads the bundled sample`() {
        val loaded = loader(path = " ").load()

        loaded.isSample shouldBe true
        loaded.categories.map { it.key } shouldContainExactlyInAnyOrder listOf("shapes", "blocks")
    }

    @Test
    fun `loads every yaml file of the directory and ignores other files`() {
        write("a.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("b.yaml", category("beta", 1.0, 3.0, 4.0))
        write("notes.txt", "not a category")

        val loaded = loader().load()

        loaded.isSample shouldBe false
        loaded.origin shouldBe dir.path
        loaded.categories.map { it.key } shouldContainExactlyInAnyOrder listOf("alpha", "beta")
    }

    @Test
    fun `rejects a category key used by two files`() {
        write("a.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("b.yaml", category("alpha", 1.0, 3.0, 4.0))

        shouldThrow<MatchScaleDatasetException> { loader().load() }.message!! shouldContain "alpha"
    }

    @Test
    fun `rejects a path that is not a readable directory`() {
        val missing = File(dir, "missing").path

        shouldThrow<MatchScaleDatasetException> { loader(path = missing).load() }.message!! shouldContain missing
    }

    @Test
    fun `leaves out a category with fewer than two pairs within the factor`() {
        write("a.yaml", category("alpha", 1.0, 2.0))
        write("b.yaml", category("beta", 1.0, 11.0))
        write("c.yaml", category("gamma", 5.0))
        write("d.yaml", category("delta", 1.0, 10.0, 100.0))

        val loaded = loader().load()

        // alpha: one pair, beta: none, gamma: none, delta: (1,10) and (10,100) — two
        loaded.categories.map { it.key } shouldContainExactlyInAnyOrder listOf("delta")
    }

    @Test
    fun `keeps a category with exactly two fair pairs`() {
        write("a.yaml", category("alpha", 1.0, 2.0, 3.0))

        loader().load().categories.map { it.key } shouldBe listOf("alpha")
    }

    @Test
    fun `fails when no category is left`() {
        write("a.yaml", category("alpha", 1.0, 2.0))

        shouldThrow<MatchScaleDatasetException> { loader().load() }
    }

    @Test
    fun `categories txt switches categories on, comments and blank lines are skipped`() {
        write("alpha.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("beta.yaml", category("beta", 1.0, 3.0, 4.0))
        write("gamma.yaml", category("gamma", 1.0, 3.0, 4.0))
        write("categories.txt", "# header\n\n  alpha  \n# beta\ngamma")

        loader().load().categories.map { it.key } shouldContainExactlyInAnyOrder listOf("alpha", "gamma")
    }

    @Test
    fun `a category file that is not listed is ignored`() {
        write("alpha.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("beta.yaml", category("beta", 1.0, 3.0, 4.0))
        write("categories.txt", "alpha")

        loader().load().categories.map { it.key } shouldBe listOf("alpha")
    }

    @Test
    fun `a listed key without a file fails the start`() {
        write("alpha.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("categories.txt", "alpha\nbeta")

        shouldThrow<MatchScaleDatasetException> { loader().load() }.message!! shouldContain "beta"
    }

    @Test
    fun `an invalid key in the list fails the start`() {
        write("alpha.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("categories.txt", "alpha\nBad_Key")

        shouldThrow<MatchScaleDatasetException> { loader().load() }.message!! shouldContain "Bad_Key"
    }

    @Test
    fun `a list with nothing switched on loads no category`() {
        write("alpha.yaml", category("alpha", 1.0, 2.0, 3.0))
        write("categories.txt", "# alpha\n")

        loader().load().categories shouldBe emptyList()
    }
}
