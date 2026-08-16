# Guess Hue — Datenset-Überarbeitung: Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Eintrag trägt wieder seine eigene Farbe (Hue + Sättigung + Helligkeit), die Zweitakt-Regel samt Validator und `difficulty` verschwindet, und das Datenset besteht aus 76 übernommenen und 60 neu geschriebenen Einträgen.

**Architecture:** Fünf Code-Tasks, die die Form ändern, dann zwei Content-Tasks, die sie füllen. Der Wire-Vertrag zum Frontend bleibt unverändert — `GuessHuePayload` trug Sättigung und Helligkeit schon immer, sie kommen jetzt nur aus einer anderen Quelle. Kein Frontend-Code, keine Migration, keine API-Änderung.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · SnakeYAML (über den Boot-Starter) · JUnit 5 + kotest-Matcher · sops/age fürs Datenset · Python 3 für die zwei Wegwerf-Werkzeuge (Import, Vorschau).

**Spec:** [`docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`](../specs/2026-08-07-guess-hue-dataset-design.md) — Fassung vom 2026-08-16. Der Plan argumentiert aus dem Spec; lies beide.

## Global Constraints

- **Kein Spielinhalt im Klartext im Repository.** Nicht in diesem Plan, nicht in einer Commit-Message, nicht in einer PR-Beschreibung, nicht in einer Test-Fixture. Alle Beispieltexte in diesem Plan sind erfundene Platzhalter und dürfen **nicht** als Einträge verwendet werden. Siehe [`.claude/guidelines/game-content.md`](../../../.claude/guidelines/game-content.md).
- **Der Klartext lebt in `.local/guess-hue-dataset.yaml` im Haupt-Checkout** (`/opt/unividuell/projects/countdown.unividuell.org/.local/`), nie in einem Worktree. Den Pfad liefert `./scripts/guess-hue-dataset.sh dev-path`.
- **`GuessHueDataset.JITTER_DEGREES = 5.0` muss strikt unter `GuessHueTolerance.DEGREES = 10.0` bleiben.** `GuessHueDrawTest` pinnt die Ungleichung.
- **`generatedAt` verlässt das Backend nie.** Der Feldmengen-Test in `GuessHueGameTypeTest` (`the payload carries exactly what the player needs and nothing else`) ist die Zusicherung; er darf **nicht** um ein Feld erweitert werden.
- **Kotlin-Aufrufstellen:** benannte Argumente ab zwei Argumenten ([kotlin.md](../../../.claude/guidelines/kotlin.md)). Alle `GuessHueEntry(...)`-Konstruktoraufrufe in Tests bekommen sie.
- **Logging:** `private val logger = KotlinLogging.logger {}` innerhalb der Klasse, Lambda-Messages ([logging.md](../../../.claude/guidelines/logging.md)).
- **Sprache:** Quelltext, Kommentare und Commit-Messages Englisch; Beschreibungen im Datenset Deutsch; deutscher Fließtext mit `„…“`, nie mit `"`.
- **Tests:** JUnit 5 + kotest-Matcher, wie in den bestehenden Guess-Hue-Tests ([testing.md](../../../.claude/guidelines/testing.md)).

## Dateiübersicht

| Datei | Was passiert |
| --- | --- |
| `core/src/main/kotlin/.../guesshue/GuessHueEntry.kt` | `difficulty` raus, `saturation`/`lightness`/`generatedAt` rein; `GuessHueDifficulty` gelöscht |
| `core/src/main/kotlin/.../guesshue/GuessHueDataset.kt` | Draw zieht S/L nicht mehr; Korridor-Konstanten gelöscht |
| `core/src/main/kotlin/.../guesshue/internal/GuessHueDatasetYamlReader.kt` | liest die neuen Felder, prüft Wertebereiche, normalisiert das Datum |
| `core/src/main/kotlin/.../guesshue/internal/GuessHueDatasetValidator.kt` | **gelöscht** |
| `core/src/main/kotlin/.../guesshue/internal/GuessHueCohorts.kt` | **neu** — `generatedAt`s einziger Leser |
| `core/src/main/kotlin/.../guesshue/internal/GuessHueDatasetLoader.kt` | Validator-Aufrufe raus |
| `core/src/main/kotlin/.../guesshue/internal/GuessHueDatasetConfiguration.kt` | Startmeldung nennt die Kohorten |
| `core/src/main/resources/guess-hue-dataset.sample.yaml` | neue Form, beide Register, ein extremer Wert |
| `core/src/test/resources/guess-hue-dataset.test.yaml` | von 60 auf 4 Einträge, neue Form |
| `core/src/test/kotlin/.../guesshue/GuessHueDatasetValidatorTest.kt` | **gelöscht** |
| `core/src/test/kotlin/.../guesshue/GuessHueSampleDatasetTest.kt` | **gelöscht** |
| `core/src/test/kotlin/.../guesshue/GuessHueProductionDatasetTest.kt` | **gelöscht** |
| `core/src/test/kotlin/.../guesshue/GuessHueDatasetYamlReaderTest.kt` | auf die neuen Felder umgeschrieben |
| `core/src/test/kotlin/.../guesshue/GuessHueDatasetLoaderTest.kt` | Completeness-Test raus, Fixture geschrumpft |
| `core/src/test/kotlin/.../guesshue/GuessHueCohortsTest.kt` | **neu** |
| `core/src/test/kotlin/.../guesshue/GuessHueDrawTest.kt` | Korridor-Erwartungen → Eintragswerte |
| `core/src/test/kotlin/.../guesshue/GuessHueTestDatasetConfiguration.kt` | nur KDoc |
| `core/README.md` | Abschnitt zum Opt-in-Produktionstest raus, Zahlen korrigiert |
| `.claude/guidelines/game-content.md` | Validator-Regeln raus, die tatsächliche Lehre rein |
| `.local/guess-hue-dataset.yaml` | **komplett neu**, außerhalb des Repos |
| `deploy/guess-hue-dataset.sops.yaml` | neu verschlüsselt |

Unverändert und **absichtlich nicht angefasst:** `GuessHueTarget.kt`, `GuessHueTolerance.kt`, `game/internal/GuessHueGameType.kt`, `GuessHueDatasetFailFastTest.kt`, das gesamte `webapp-vue/src/games/guesshue/`.

---

### Task 1: Der Eintrag ist ein Farbwert, und der Validator ist Geschichte

Ein Task, obwohl er viel anfasst: `GuessHueDifficulty` zu entfernen bricht Reader, Validator, Loader und drei Testklassen gleichzeitig. Der Kotlin-Compiler lässt dazwischen keinen grünen Stand zu, also gibt es auch keinen sinnvollen Zwischen-Commit.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueEntry.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetYamlReader.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetLoader.kt:25-45`
- Delete: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetValidator.kt`
- Modify: `core/src/main/resources/guess-hue-dataset.sample.yaml`
- Modify: `core/src/test/resources/guess-hue-dataset.test.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetYamlReaderTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetLoaderTest.kt`
- Delete: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetValidatorTest.kt`
- Delete: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueSampleDatasetTest.kt`
- Delete: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueProductionDatasetTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt:16-25,100-102` (nur die Konstruktoraufrufe, damit es kompiliert — die Erwartungen sind Task 2)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueTestDatasetConfiguration.kt` (nur KDoc)

**Interfaces:**
- Produces: `GuessHueEntry(hue: Int, saturation: Double, lightness: Double, generatedAt: LocalDate, description: String)` — Task 2, 3 und 4 bauen darauf.
- Produces: `GuessHueDatasetYamlReader.read(source: InputStream, origin: String): List<GuessHueEntry>` — Signatur unverändert.
- Consumes: nichts.

- [ ] **Step 1: Write the failing reader tests**

Ersetze den kompletten Inhalt von `GuessHueDatasetYamlReaderTest.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader
import java.time.LocalDate

class GuessHueDatasetYamlReaderTest {

    private fun read(yaml: String) =
        GuessHueDatasetYamlReader.read(yaml.byteInputStream(), origin = "test.yaml")

    @Test
    fun `reads hue, saturation, lightness, generatedAt and description`() {
        val entries = read(
            """
            entries:
              - hue: 0
                saturation: 0.72
                lightness: 0.45
                generatedAt: 2026-08-16
                description: >-
                  Beispieleintrag Alpha, kein Spielinhalt. Er sagt über Farben
                  nichts aus.
              - hue: 359
                saturation: 0.1
                lightness: 0.9
                generatedAt: 2024-03-03
                description: Beispieleintrag Gamma, kein Spielinhalt.
            """.trimIndent(),
        )

        entries.size shouldBe 2
        entries[0].hue shouldBe 0
        entries[0].saturation shouldBe 0.72
        entries[0].lightness shouldBe 0.45
        entries[0].generatedAt shouldBe LocalDate.of(2026, 8, 16)
        // The folded block scalar `>-` turns the line breaks into spaces.
        entries[0].description shouldContain "kein Spielinhalt. Er sagt über Farben nichts aus."
        entries[1].hue shouldBe 359
        entries[1].generatedAt shouldBe LocalDate.of(2024, 3, 3)
    }

    @Test
    fun `reads a quoted date just as well as an unquoted one`() {
        // SnakeYAML resolves an unquoted 2024-03-03 to a java.util.Date (YAML 1.1 timestamps) and a
        // quoted one to a String. Both spellings mean the same thing to whoever edits the file by
        // hand, so both have to arrive as the same LocalDate.
        val entries = read(
            """
            entries:
              - hue: 10
                saturation: 0.5
                lightness: 0.5
                generatedAt: "2024-03-03"
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        entries[0].generatedAt shouldBe LocalDate.of(2024, 3, 3)
    }

    @Test
    fun `accepts the integer spellings of the fraction bounds`() {
        // YAML reads 0 and 1 as Int, 0.0 and 1.0 as Double. A hand-written file will contain both.
        val entries = read(
            """
            entries:
              - hue: 10
                saturation: 0
                lightness: 1
                description: Beispieleintrag, kein Spielinhalt.
                generatedAt: 2026-08-16
            """.trimIndent(),
        )

        entries[0].saturation shouldBe 0.0
        entries[0].lightness shouldBe 1.0
    }

    @Test
    fun `rejects a hue outside the wheel and names the entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 360
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "entry #0"
        thrown.message!! shouldContain "0..359"
    }

    @Test
    fun `rejects a saturation outside zero to one`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 1.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "saturation"
        thrown.message!! shouldContain "0.0..1.0"
    }

    @Test
    fun `rejects a missing lightness`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    generatedAt: 2026-08-16
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "lightness"
    }

    @Test
    fun `rejects a generatedAt that is not a date`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: "irgendwann"
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "generatedAt"
        thrown.message!! shouldContain "irgendwann"
    }

    @Test
    fun `rejects a blank description and points at the offending entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    saturation: 0.5
                    lightness: 0.5
                    generatedAt: 2026-08-16
                    description: "   "
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "entry #0"
        thrown.message!! shouldContain "description"
    }

    @Test
    fun `rejects a file without a top-level entries list`() {
        val thrown = shouldThrow<GuessHueDatasetException> { read("something: else") }

        thrown.message!! shouldContain "entries"
        thrown.message!! shouldContain "test.yaml"
    }
}
```

- [ ] **Step 2: Run the reader tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=GuessHueDatasetYamlReaderTest
```

Erwartet: Kompilierfehler — `GuessHueEntry` hat weder `saturation` noch `generatedAt`.

- [ ] **Step 3: Rewrite the entry model**

Kompletter Inhalt von `GuessHueEntry.kt` (das `GuessHueDifficulty`-Enum verschwindet ersatzlos):

```kotlin
package org.unividuell.countdown.core.guesshue

import java.time.LocalDate

/**
 * One curated colour, complete. [hue] is the **nominal** angle the round jitters around;
 * [saturation] and [lightness] are the entry's own and reach the round untouched.
 *
 * They belong to the entry rather than to the draw because the description talks about them: "a
 * dark emerald" is only true if the wheel shows one, and an object has a characteristic saturation
 * and lightness, not just a hue. Drawing them per round — which this dataset did until 2026-08-16 —
 * had the wheel contradict the text and cost the descriptions half their vocabulary.
 *
 * [generatedAt] is author statistics: which cohort an entry belongs to. It never leaves the server,
 * which the payload field-set test in `GuessHueGameTypeTest` is what enforces. Its only reader is
 * `GuessHueCohorts`, in the startup log.
 *
 * See `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`.
 */
data class GuessHueEntry(
    val hue: Int,
    val saturation: Double,
    val lightness: Double,
    val generatedAt: LocalDate,
    val description: String,
)
```

- [ ] **Step 4: Rewrite the YAML reader**

Kompletter Inhalt von `internal/GuessHueDatasetYamlReader.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Date

/**
 * SnakeYAML rather than Jackson: `org.yaml:snakeyaml` is already on the compile classpath via the
 * Spring Boot starter (Boot uses it to parse `application.yaml`), so a `jackson-dataformat-yaml`
 * would be a whole new dependency for five fields.
 *
 * This is the dataset's only checking left. It parses and it bounds values; it does not judge
 * prose. The validator that used to do the latter was deleted on 2026-08-16 — see the spec's
 * "Validierung" chapter for why.
 *
 * Every message names [origin] and the position, because whoever is debugging this typically isn't
 * looking at the file that failed — it sits decrypted on a server, not open on their machine.
 */
object GuessHueDatasetYamlReader {

    fun read(source: InputStream, origin: String): List<GuessHueEntry> {
        val root = Yaml().load<Any?>(source)
        val entries = (root as? Map<*, *>)?.get("entries")
            ?: throw GuessHueDatasetException("$origin: expected a top-level 'entries' list")
        if (entries !is List<*>) {
            throw GuessHueDatasetException("$origin: 'entries' must be a list, was ${entries::class.simpleName}")
        }
        if (entries.isEmpty()) throw GuessHueDatasetException("$origin: 'entries' is empty")
        return entries.mapIndexed { index, raw -> entry(raw, origin, index) }
    }

    private fun entry(raw: Any?, origin: String, index: Int): GuessHueEntry {
        val where = "$origin entry #$index"
        val map = raw as? Map<*, *>
            ?: throw GuessHueDatasetException(
                "$where: expected a mapping with hue, saturation, lightness, generatedAt and description",
            )

        val hue = map["hue"] as? Int
            ?: throw GuessHueDatasetException("$where: 'hue' is missing or not an integer")
        if (hue !in 0..359) {
            throw GuessHueDatasetException("$where: 'hue' must lie in 0..359, was $hue")
        }

        val description = (map["description"] as? String)?.trim()
        if (description.isNullOrEmpty()) {
            throw GuessHueDatasetException("$where: 'description' is missing or blank")
        }

        return GuessHueEntry(
            hue = hue,
            saturation = fraction(raw = map["saturation"], where = where, field = "saturation"),
            lightness = fraction(raw = map["lightness"], where = where, field = "lightness"),
            generatedAt = generatedAt(raw = map["generatedAt"], where = where),
            description = description,
        )
    }

    /** Read as a [Number], not as a Double: YAML resolves `0.5` to a Double but `0` and `1` to an
     *  Int, and both spellings turn up in a hand-written file. */
    private fun fraction(raw: Any?, where: String, field: String): Double {
        val value = (raw as? Number)?.toDouble()
            ?: throw GuessHueDatasetException("$where: '$field' is missing or not a number")
        if (value < 0.0 || value > 1.0) {
            throw GuessHueDatasetException("$where: '$field' must lie in 0.0..1.0, was $value")
        }
        return value
    }

    /**
     * SnakeYAML resolves an unquoted `2024-03-03` to a [Date] (YAML 1.1 timestamps) and a quoted one
     * to a String. Both spellings mean the same date to whoever edits the file by hand, so both are
     * accepted here — making the quoting a rule instead would be a rule nobody remembers, enforced
     * by an error message that reads like a type mismatch.
     */
    private fun generatedAt(raw: Any?, where: String): LocalDate = when (raw) {
        is Date -> raw.toInstant().atZone(ZoneOffset.UTC).toLocalDate()
        is String -> runCatching { LocalDate.parse(raw.trim()) }.getOrElse {
            throw GuessHueDatasetException("$where: 'generatedAt' is not a YYYY-MM-DD date, was '$raw'")
        }
        null -> throw GuessHueDatasetException("$where: 'generatedAt' is missing")
        else -> throw GuessHueDatasetException(
            "$where: 'generatedAt' is not a date, was ${raw::class.simpleName}",
        )
    }
}
```

- [ ] **Step 5: Delete the validator and the three tests that served it**

```bash
git rm core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetValidator.kt \
       core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetValidatorTest.kt \
       core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueSampleDatasetTest.kt \
       core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueProductionDatasetTest.kt
```

- [ ] **Step 6: Drop the validator calls from the loader**

In `internal/GuessHueDatasetLoader.kt` werden die drei Validator-Zeilen und der Kommentar entfernt. `fromFile` und `sample` sehen danach so aus:

```kotlin
    private fun fromFile(path: String): LoadedGuessHueDataset {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            throw GuessHueDatasetException(
                "app.guess-hue.dataset-path points at '$path', which is not a readable file",
            )
        }
        val entries = file.inputStream().use { GuessHueDatasetYamlReader.read(it, path) }
        return LoadedGuessHueDataset(entries, origin = path, isSample = false)
    }

    private fun sample(): LoadedGuessHueDataset {
        val stream = javaClass.getResourceAsStream(SAMPLE_RESOURCE)
            ?: throw GuessHueDatasetException("the bundled $SAMPLE_RESOURCE is missing from the classpath")
        val entries = stream.use { GuessHueDatasetYamlReader.read(it, SAMPLE_RESOURCE) }
        return LoadedGuessHueDataset(entries, origin = SAMPLE_RESOURCE, isSample = true)
    }
```

Der Klassen-KDoc bekommt einen Satz mehr:

```kotlin
/**
 * Reads either the mounted file or the sample from the classpath. Nothing here knows about SOPS:
 * the deployment decrypts, the application just reads plain YAML from a path. That keeps key
 * management entirely outside the application code, and CI never needs a key.
 *
 * Nothing here validates either, since 2026-08-16: what can be checked mechanically is checked
 * while parsing, and what cannot — whether the texts are any good — is looked at, not asserted.
 */
```

- [ ] **Step 7: Rewrite the sample dataset**

Kompletter Inhalt von `core/src/main/resources/guess-hue-dataset.sample.yaml`:

```yaml
# Not game content. This set exists so tests and a local start work without the encrypted
# production dataset. The app refuses to boot with it under production or staging — see
# GuessHueDatasetConfiguration.
#
# Six entries covering both registers and both cohorts, plus one deliberately washed-out colour:
# there is no saturation/lightness corridor any more, and the sample should exercise that.
entries:
  - hue: 0
    saturation: 0.72
    lightness: 0.45
    generatedAt: 2026-08-16
    description: Beispieleintrag Alpha, kein Spielinhalt.
  - hue: 60
    saturation: 0.55
    lightness: 0.60
    generatedAt: 2026-08-16
    description: Beispieleintrag Beta, kein Spielinhalt.
  - hue: 120
    saturation: 0.30
    lightness: 0.38
    generatedAt: 2024-03-03
    description: >-
      Beispieleintrag Gamma, kein Spielinhalt. Er steht stellvertretend für das
      längere historische Register und sagt über Farben nichts aus.
  - hue: 180
    saturation: 0.90
    lightness: 0.72
    generatedAt: 2024-03-03
    description: >-
      Beispieleintrag Delta, kein Spielinhalt. Auch er steht stellvertretend für
      das historische Register und sagt über Farben nichts aus.
  - hue: 240
    saturation: 0.12
    lightness: 0.30
    generatedAt: 2026-08-16
    description: Beispieleintrag Epsilon, kein Spielinhalt.
  - hue: 300
    saturation: 0.66
    lightness: 0.50
    generatedAt: 2026-08-16
    description: Beispieleintrag Zeta, kein Spielinhalt.
```

- [ ] **Step 8: Shrink the test fixture dataset**

Die 60 Einträge in `core/src/test/resources/guess-hue-dataset.test.yaml` existierten nur, um die gelöschte Completeness-Regel zu erfüllen. Kompletter neuer Inhalt:

```yaml
# Not game content. Stands in for a mounted production dataset in tests that activate a deployed
# profile, so that GuessHueDatasetConfiguration's fail-fast is satisfied the way a real deployment
# would satisfy it — see GuessHueTestDatasetConfiguration.
entries:
  - hue: 15
    saturation: 0.70
    lightness: 0.45
    generatedAt: 2026-08-16
    description: "Beispieleintrag, kein Spielinhalt."
  - hue: 105
    saturation: 0.40
    lightness: 0.55
    generatedAt: 2026-08-16
    description: "Beispieleintrag, kein Spielinhalt."
  - hue: 195
    saturation: 0.60
    lightness: 0.35
    generatedAt: 2024-03-03
    description: "Beispieleintrag, kein Spielinhalt."
  - hue: 285
    saturation: 0.50
    lightness: 0.65
    generatedAt: 2024-03-03
    description: "Beispieleintrag, kein Spielinhalt."
```

In `GuessHueTestDatasetConfiguration.kt` wird im KDoc der eine Satz angepasst — `60-entry fixture` → `four-entry fixture`:

```kotlin
 * Deliberately its own `@TestConfiguration`, imported only by the test(s) that actually activate a
 * deployed profile — **not** folded into the shared `TestcontainersConfiguration` that all
 * `@SpringBootTest` classes import. Wiring it in globally would silently switch every context test
 * from the bundled six-entry sample to this four-entry fixture, including tests that mean to
 * exercise the sample itself. A future deployment-profile test that forgets to import this
```

- [ ] **Step 9: Fix the loader test**

In `GuessHueDatasetLoaderTest.kt`: den Test `applies the completeness rule to a configured file` und die Hilfsmethode `sixtyBalancedEntriesAsYaml()` löschen. Der Test `reads the configured file and reports it as not the sample` bekommt eine kleine Fixture und einen neuen Nachbarn:

```kotlin
    @Test
    fun `reads the configured file and reports it as not the sample`(@TempDir dir: Path) {
        val file = dir.resolve("dataset.yaml").toFile()
        file.writeText(
            """
            entries:
              - hue: 10
                saturation: 0.6
                lightness: 0.4
                generatedAt: 2026-08-16
                description: Beispieleintrag, kein Spielinhalt.
              - hue: 200
                saturation: 0.3
                lightness: 0.7
                generatedAt: 2024-03-03
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()

        loaded.isSample shouldBe false
        loaded.entries.size shouldBe 2
        loaded.origin shouldBe file.absolutePath
    }

    @Test
    fun `a configured file with a broken entry fails with the file's own path`(@TempDir dir: Path) {
        // The loader has no rules of its own any more, but the reader's do have to surface through
        // it naming the mounted file — that path is all the operator gets on a server.
        val file = dir.resolve("broken.yaml").toFile()
        file.writeText(
            """
            entries:
              - hue: 400
                saturation: 0.6
                lightness: 0.4
                generatedAt: 2026-08-16
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
        }

        thrown.message!! shouldContain file.absolutePath
        thrown.message!! shouldContain "0..359"
    }
```

Der Test `falls back to the bundled sample when no path is configured` bleibt unverändert — das Sample hat weiterhin sechs Einträge.

- [ ] **Step 10: Make GuessHueDrawTest compile again**

Nur die Konstruktoraufrufe, nicht die Erwartungen — die sind Task 2. Das Fixture oben in der Klasse:

```kotlin
    private val dataset = GuessHueDataset(
        (0 until 12).flatMap { sector ->
            val base = sector * 30
            listOf(
                GuessHueEntry(
                    hue = base + 2,
                    saturation = 0.70,
                    lightness = 0.45,
                    generatedAt = LocalDate.of(2026, 8, 16),
                    description = "Beispieleintrag, kein Spielinhalt.",
                ),
                GuessHueEntry(
                    hue = base + 14,
                    saturation = 0.35,
                    lightness = 0.62,
                    generatedAt = LocalDate.of(2026, 8, 16),
                    description = "Beispieleintrag, kein Spielinhalt.",
                ),
                GuessHueEntry(
                    hue = base + 26,
                    saturation = 0.88,
                    lightness = 0.28,
                    generatedAt = LocalDate.of(2024, 3, 3),
                    description = "Beispieleintrag, kein Spielinhalt.",
                ),
            )
        },
    )
```

Die drei Sättigungs-/Helligkeitswerte sind bewusst verschieden — Task 2 braucht sie, um „S und L stammen aus dem Eintrag" von „S und L sind konstant" zu unterscheiden. Und in `wraps the jitter across zero degrees`:

```kotlin
        val nearZero = GuessHueDataset(
            listOf(
                GuessHueEntry(
                    hue = 2,
                    saturation = 0.5,
                    lightness = 0.5,
                    generatedAt = LocalDate.of(2026, 8, 16),
                    description = "Beispieleintrag, kein Spielinhalt.",
                ),
            ),
        )
```

`import java.time.LocalDate` ergänzen.

- [ ] **Step 11: Run the full backend suite**

```bash
cd core && ./mvnw test
```

Erwartet: grün. `GuessHueDrawTest` prüft in diesem Stand noch den alten Korridor und muss trotzdem bestehen — der Draw ist unverändert.

- [ ] **Step 12: Commit**

```bash
git add -A core .claude
git commit -m "$(cat <<'EOF'
refactor(guess-hue): an entry carries its own colour, and the validator goes

hue, saturation, lightness, generatedAt, description — difficulty and
GuessHueDifficulty are gone with the two-beat rule they graded. The validator
went with them: sentence counts and a measure-word list could never tell a good
text from a bad one, and what they actually enforced was the formula the
revision removes. What is left is parsing — field types, hue in 0..359,
fractions in 0.0..1.0, a date, a non-blank description — and it lives in the
reader.

generatedAt takes both YAML spellings: unquoted, SnakeYAML resolves it to a
java.util.Date via the YAML 1.1 timestamp tag, quoted it stays a String. Making
the quoting a rule would be a rule nobody remembers.

The draw still uses its corridor; that is the next commit.
EOF
)"
```

---

### Task 2: Sättigung und Helligkeit kommen aus dem Eintrag

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt`

**Interfaces:**
- Consumes: `GuessHueEntry.saturation`, `GuessHueEntry.lightness` (Task 1).
- Produces: `GuessHueDataset.JITTER_DEGREES` bleibt die einzige Konstante im Companion; `SATURATION_MIN/MAX` und `LIGHTNESS_MIN/MAX` gibt es nicht mehr.

- [ ] **Step 1: Write the failing tests**

Drei Tests in `GuessHueDrawTest.kt` ändern sich, einer kommt dazu. Ersetze `draws entry, jitter, saturation, lightness and init hue in exactly that order`:

```kotlin
    @Test
    fun `draws the entry and the init hue in exactly that order, and nothing else`() {
        // The order is a contract per stream: reordering either changes every round already played.
        // So this checks against hand-replayed streams instead of magic numbers — presentation for
        // the entry and the init angle, solution for the jitter alone. Saturation and lightness are
        // no longer drawn at all, which is what the replay below proves: the init angle uses the
        // presentation stream's *second* draw, not its fourth.
        val solutionRef = SeededRandom.fromSeed("community-42/round-7")
        val presentationRef = SeededRandom.fromSeed("community-42/round-7/p")
        val expectedEntry = presentationRef.pick(dataset.entries)
        val initDraw = presentationRef.nextDouble()
        val jitterDraw = solutionRef.nextDouble()

        val target = dataset.draw(
            solution = SeededRandom.fromSeed("community-42/round-7"),
            presentation = SeededRandom.fromSeed("community-42/round-7/p"),
        )

        target.entry shouldBe expectedEntry
        target.hue shouldBe (expectedEntry.hue + jitterDraw * (2 * 5.0) - 5.0)
            .let { ((it % 360.0) + 360.0) % 360.0 }
        target.initHue shouldBe initDraw * 360.0
        target.saturation shouldBe expectedEntry.saturation
        target.lightness shouldBe expectedEntry.lightness
    }
```

Neu daneben:

```kotlin
    @Test
    fun `saturation and lightness are the entry's own, across the whole dataset`() {
        // Not a restatement of the test above: that one replays a single round. This one rules out
        // a draw that happens to agree with one entry — the fixture's three entries carry three
        // different pairs, so a constant or a corridor would fail here.
        val drawn = (0 until 2_000).map { drawWith(it) }

        drawn.forEach { target ->
            target.saturation shouldBe target.entry.saturation
            target.lightness shouldBe target.entry.lightness
        }
        drawn.map { it.saturation }.distinct().size shouldBeGreaterThan 1
    }
```

Aus `keeps the jitter inside the tolerance and the colour inside the corridor` werden die vier Korridor-Zeilen entfernt, und der Test heißt danach:

```kotlin
    @Test
    fun `keeps the jitter inside the tolerance and every angle on the wheel`() {
        // The jitter must stay below the plus-or-minus 10 degree tolerance, otherwise a player who
        // reads the description perfectly could still be marked wrong through no fault of their own.
        (0 until 2_000).forEach { seed ->
            val target = drawWith(seed)

            distanceOnCircle(target.hue, target.entry.hue.toDouble()) shouldBeLessThanOrEqualTo 5.0
            target.hue shouldBeGreaterThanOrEqualTo 0.0
            target.hue shouldBeLessThan 360.0
            target.initHue shouldBeGreaterThanOrEqualTo 0.0
            target.initHue shouldBeLessThan 360.0
        }
    }
```

`the presentation values come from the presentation stream and the hue does not` bleibt inhaltlich, bekommt aber einen Kommentarzusatz:

```kotlin
    @Test
    fun `the presentation values come from the presentation stream and the hue does not`() {
        // The split is by publication: everything the player is shown is drawn from one stream, the
        // jitter that hides the answer from the other. Holding one stream fixed while varying the
        // other is what proves the split — no rounding, no heuristics. Saturation and lightness ride
        // along with the entry now rather than being drawn, which makes the claim stronger, not
        // weaker: a value that is never drawn cannot leak a stream.
        val varyingSolution = (1..20).map { seed ->
            dataset.draw(solution = SeededRandom.fromSeed(seed), presentation = SeededRandom.fromSeed(4711))
        }

        varyingSolution.map { Triple(it.entry, it.saturation, it.lightness) }.distinct() shouldHaveSize 1
        varyingSolution.map { it.initHue }.distinct() shouldHaveSize 1
        varyingSolution.map { it.hue }.distinct().size shouldBeGreaterThan 1
    }
```

Die nicht mehr benutzten Imports `shouldBeGreaterThanOrEqualTo`/`shouldBeLessThan` bleiben (die Winkelprüfungen brauchen sie weiter); prüfe nach dem Umbau mit ktlint, ob einer übrig ist.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd core && ./mvnw test -Dtest=GuessHueDrawTest
```

Erwartet: `draws the entry and the init hue in exactly that order, and nothing else` schlägt fehl — `target.initHue` steht auf dem vierten Zug des Presentation-Streams, erwartet wird der zweite.

- [ ] **Step 3: Rewrite the draw**

In `GuessHueDataset.kt` — Methode und Companion:

```kotlin
    /**
     * **The draw order is a contract, per stream.** [presentation] draws the entry and then the
     * start angle; [solution] draws the jitter. Reorder either and every round derived from the
     * same pair of seeds changes.
     *
     * Saturation and lightness are **not drawn** — they belong to the entry, so that the
     * description may talk about them (see [GuessHueEntry]). That also shortens this contract: two
     * fewer draws from the presentation stream than before 2026-08-16.
     *
     * Two streams, split by **publication** rather than by importance: everything the player is
     * shown comes from [presentation], and [solution] produces the round's only secret — the jitter.
     * One stream would not do, and not because a published value might equal the answer:
     * `SeededRandom.nextDouble` publishes 53 bits of two consecutive words and the generator's
     * transition is a bijection, so a few published doubles pin the state and let it be stepped
     * **backwards** to whatever the same stream drew for the solution. The entry belongs on the
     * published side for exactly that reason — its description is what the player reads.
     *
     * What remains after the split is not a generator problem: whoever knows the curated dataset can
     * read the nominal hue off the description. That is what game-content.md protects, not this.
     */
    fun draw(solution: SeededRandom, presentation: SeededRandom): GuessHueTarget {
        val entry = presentation.pick(entries)
        val initHue = presentation.nextDouble() * 360.0
        val jittered = entry.hue + solution.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES

        return GuessHueTarget(
            entry = entry,
            hue = wrap360(jittered),
            saturation = entry.saturation,
            lightness = entry.lightness,
            initHue = initHue,
        )
    }

    private fun wrap360(degrees: Double) = ((degrees % 360.0) + 360.0) % 360.0

    companion object {
        /**
         * Must stay below the ±10° scoring tolerance. The jitter is what makes a lookup table
         * built from observed rounds unreliable; if it exceeded the tolerance, a player who read
         * the description perfectly could still be marked wrong through no fault of their own.
         */
        const val JITTER_DEGREES = 5.0
    }
```

Der Klassen-KDoc bleibt, wie er ist.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd core && ./mvnw test -Dtest='GuessHueDrawTest,GuessHueGameTypeTest'
```

Erwartet: grün. `GuessHueGameTypeTest` ist der Beleg, dass der Wire-Vertrag steht — der Feldmengen-Test muss unverändert bestehen.

- [ ] **Step 5: Commit**

```bash
git add core
git commit -m "$(cat <<'EOF'
feat(guess-hue): the round shows the entry's own saturation and lightness

The corridor S 50-78% / L 38-52% is gone, and with it two draws from the
presentation stream. It was never a taste judgement — outside it a hue is hard
to read on the wheel — but it was the cause of the monotony: every round came
out of the same narrow band, so every rainbow looked alike, and a description
could not name a brightness it had no say over.

The stream split gets shorter, not weaker: a value that is never drawn cannot
leak a stream. The new draw-order test proves it by replaying the presentation
stream by hand — the init angle now sits on its second draw, not its fourth.
EOF
)"
```

---

### Task 3: `generatedAt` bekommt seinen einzigen Leser

Ohne diesen Task ist `generatedAt` ein Kommentar mit Extraschritten — genau das Argument, an dem `difficulty` gestorben ist.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueCohorts.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetConfiguration.kt:36-40`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueCohortsTest.kt`

**Interfaces:**
- Consumes: `GuessHueEntry.generatedAt` (Task 1).
- Produces: `GuessHueCohorts.summarise(entries: List<GuessHueEntry>): String`.

- [ ] **Step 1: Write the failing test**

Kompletter Inhalt von `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueCohortsTest.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueCohorts
import java.time.LocalDate

class GuessHueCohortsTest {

    private fun entry(generatedAt: LocalDate) = GuessHueEntry(
        hue = 0,
        saturation = 0.5,
        lightness = 0.5,
        generatedAt = generatedAt,
        description = "Beispieleintrag, kein Spielinhalt.",
    )

    @Test
    fun `counts the entries per cohort, oldest first`() {
        val entries = listOf(
            entry(LocalDate.of(2026, 8, 16)),
            entry(LocalDate.of(2024, 3, 3)),
            entry(LocalDate.of(2026, 8, 16)),
            entry(LocalDate.of(2024, 3, 3)),
            entry(LocalDate.of(2024, 3, 3)),
        )

        // Chronological, not insertion order: the line is read to see how the set grew.
        GuessHueCohorts.summarise(entries) shouldBe "3 from 2024-03-03, 2 from 2026-08-16"
    }

    @Test
    fun `says so plainly when every entry comes from one day`() {
        GuessHueCohorts.summarise(listOf(entry(LocalDate.of(2024, 3, 3)))) shouldBe "1 from 2024-03-03"
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd core && ./mvnw test -Dtest=GuessHueCohortsTest
```

Erwartet: Kompilierfehler — `GuessHueCohorts` gibt es nicht.

- [ ] **Step 3: Write the implementation**

Kompletter Inhalt von `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueCohorts.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry

/**
 * `GuessHueEntry.generatedAt`'s only reader, and the reason the field is in the schema rather than
 * in a YAML comment: the startup line reports how the set is composed, so a dataset that lost half
 * of itself in a bad merge says so out loud instead of quietly playing on.
 *
 * Its own object rather than a private helper in `GuessHueDatasetConfiguration` so the format is
 * testable without asserting on a log appender.
 */
object GuessHueCohorts {

    /** Oldest cohort first — the line is read to see how the set grew over time. */
    fun summarise(entries: List<GuessHueEntry>): String = entries
        .groupingBy { it.generatedAt }
        .eachCount()
        .toSortedMap()
        .entries
        .joinToString { (date, count) -> "$count from $date" }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd core && ./mvnw test -Dtest=GuessHueCohortsTest
```

Erwartet: PASS.

- [ ] **Step 5: Put the summary into the startup line**

In `internal/GuessHueDatasetConfiguration.kt`, der `else`-Zweig der Logmeldung:

```kotlin
        if (loaded.isSample) {
            logger.warn { "Guess Hue is running on the bundled sample dataset (${loaded.origin}) — local development only" }
        } else {
            logger.info {
                "Guess Hue loaded ${loaded.entries.size} entries from ${loaded.origin} — " +
                    GuessHueCohorts.summarise(loaded.entries)
            }
        }
```

- [ ] **Step 6: Run the full backend suite**

```bash
cd core && ./mvnw test
```

Erwartet: grün.

- [ ] **Step 7: Commit**

```bash
git add core
git commit -m "$(cat <<'EOF'
feat(guess-hue): the startup line reports the dataset's cohorts

generatedAt would otherwise repeat difficulty's mistake: a field nobody reads
drifts from the truth unnoticed and gets deleted two revisions later. One
reader is enough to keep it honest, and this one earns its keep — a dataset
that lost half of itself in a bad merge now says so at boot instead of quietly
playing on with what is left.

Its own object rather than a private helper, so the format can be asserted
without a log appender.
EOF
)"
```

---

### Task 4: Die 76 Einträge aus `huettehuette` übernehmen

Ab hier verlässt der Plan das Repository. Alles, was entsteht, liegt im Scratchpad oder in `.local/` — **nichts davon wird committet.**

Im Folgenden ist `$SCRATCH` das Scratchpad-Verzeichnis der ausführenden Session — setze es als erstes auf deins. In der Session, in der dieser Plan entstand, war das `/private/tmp/claude-501/-opt-unividuell-projects-countdown-unividuell-org--claude-worktrees-dazzling-bardeen-d62b01/6bfd064d-5c0f-4f06-9f43-69a2b02e7831/scratchpad`. Nur nicht `/tmp` und niemals ein Pfad innerhalb des Repos.

**Files:**
- Create (Scratchpad, nicht committen): `$SCRATCH/import-original.py`
- Create (Scratchpad, nicht committen): `$SCRATCH/preview.py`
- Modify (außerhalb des Repos): `/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml`

**Interfaces:**
- Consumes: das YAML-Schema aus Task 1.
- Produces: eine Pufferdatei mit 76 Einträgen, alle `generatedAt: 2024-03-03`.

- [ ] **Step 1: Put the old buffer file aside instead of overwriting it**

Die alte Pufferdatei enthält die 60 verworfenen Einträge. Sie wird nicht gebraucht, aber auch nicht weggeworfen, solange nichts freigegeben ist:

```bash
mv /opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml \
   /opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.superseded.yaml
```

`.local/` ist vollständig gitignored, die abgelegte Datei also ebenfalls. Prüfen:

```bash
cd /opt/unividuell/projects/countdown.unividuell.org && git check-ignore -v .local/guess-hue-dataset.superseded.yaml
```

Erwartet: eine Zeile, die die greifende `.gitignore`-Regel nennt. Kommt **nichts**, brich ab und kläre die Ignore-Regel, bevor du weitermachst.

- [ ] **Step 2: Write the import script**

`$SCRATCH/import-original.py`:

```python
"""One-off: convert huettehuette's colors.json into the new Guess Hue YAML shape.

Throwaway. Lives in the scratchpad because its OUTPUT is game content; the script itself
holds none. Run it once, check the result, forget it.
"""
import colorsys
import datetime
import json

import yaml

SOURCE = "/opt/unividuell/projects/huettehuette.unividuell.org/pages/admin/01-guess-color/colors.json"
TARGET = "/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml"
COHORT = datetime.date(2024, 3, 3)

# Two of the original's 78 entries share their text with another entry at a colour more than 40
# degrees away. The same text with two answers is a trap, not a puzzle, so one of each pair goes.
# Identified by hex rather than by hue: rounding must not decide which one is dropped.
DROP = {"#668d60", "#6f2c68"}


def to_hsl(hex_value):
    raw = hex_value.lstrip("#")
    r, g, b = (int(raw[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return round(h * 360) % 360, round(s, 3), round(l, 3)


def main():
    source = json.load(open(SOURCE, encoding="utf-8"))
    entries = []
    for item in source:
        if item["hex"].lower() in DROP:
            continue
        hue, saturation, lightness = to_hsl(item["hex"])
        entries.append({
            "hue": hue,
            "saturation": saturation,
            "lightness": lightness,
            "generatedAt": COHORT,
            "description": " ".join(item["description"].split()),
        })

    entries.sort(key=lambda e: e["hue"])
    with open(TARGET, "w", encoding="utf-8") as out:
        out.write("# Guess Hue — Produktions-Datenset (KLARTEXT, nie committen)\n")
        out.write("# Regeln + Prozess: docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md\n")
        yaml.safe_dump(
            {"entries": entries},
            out,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
            width=100,
        )

    print(f"{len(entries)} entries written to {TARGET}")
    print(f"dropped {len(source) - len(entries)} of {len(source)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the import and check the count**

```bash
python3 "$SCRATCH/import-original.py"
```

Erwartet: `76 entries written to …` und `dropped 2 of 78`. Steht dort etwas anderes, brich ab — dann haben die beiden Hex-Werte in `DROP` das Original nicht getroffen.

- [ ] **Step 4: Let the backend read it**

Den Dev-Server über die Preview-Werkzeuge starten, **nicht** über Bash: `preview_start` mit `{name: "backend"}`. Die `backend`-Konfiguration in `.claude/launch.json` zeigt `GUESS_HUE_DATASET_PATH` bereits über `./scripts/guess-hue-dataset.sh dev-path` auf genau diese Pufferdatei — es ist also nichts zu exportieren. Läuft der Server aus einem früheren Task noch, genügt ein Neustart (`preview_stop`, dann `preview_start`), weil das Datenset beim Boot geladen wird.

Dann `preview_logs` mit `{serverId, search: "Guess Hue"}`. Erwartet, genau eine Zeile:

```
Guess Hue loaded 76 entries from /opt/.../.local/guess-hue-dataset.yaml — 76 from 2024-03-03
```

Das ist der eigentliche Test dieses Tasks: Reader, Wertebereiche und Datumsnormalisierung an echten Daten. Bricht der Start ab, nennt die Meldung Eintragsnummer und Feld — dort korrigieren, nicht den Reader aufweichen.

- [ ] **Step 5: Write the preview tool**

`$SCRATCH/preview.py` — die Wegwerf-Vorschau aus Schritt 2 des Spec-Kapitels *Der Weg eines Eintrags*:

```python
"""Render the buffer dataset as a standalone HTML page for review.

Throwaway, and deliberately outside the repository: its output IS the game content.
"""
import html
import sys

import yaml

SOURCE = "/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml"
TARGET = sys.argv[1] if len(sys.argv) > 1 else "/tmp/guess-hue-preview.html"

entries = sorted(yaml.safe_load(open(SOURCE, encoding="utf-8"))["entries"], key=lambda e: e["hue"])

gaps = [
    (entries[i + 1]["hue"] - entries[i]["hue"], entries[i]["hue"], entries[i + 1]["hue"])
    for i in range(len(entries) - 1)
]
wrap = 360 - entries[-1]["hue"] + entries[0]["hue"]
gaps.append((wrap, entries[-1]["hue"], entries[0]["hue"]))
gaps.sort(reverse=True)

rows = []
for e in entries:
    css = f"hsl({e['hue']} {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%)"
    ring = (
        f"conic-gradient(hsl(0 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(60 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(120 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(180 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(240 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(300 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%),"
        f"hsl(360 {e['saturation'] * 100:.1f}% {e['lightness'] * 100:.1f}%))"
    )
    rows.append(f"""
    <tr>
      <td><div class="swatch" style="background:{css}"></div></td>
      <td><div class="ring" style="background:{ring}"></div></td>
      <td class="meta">h {e['hue']}<br>s {e['saturation']:.2f}<br>l {e['lightness']:.2f}<br>
          <span class="cohort">{e['generatedAt']}</span></td>
      <td class="text">{html.escape(e['description'])}</td>
    </tr>""")

gap_list = "".join(f"<li>{g}° zwischen {a}° und {b}°</li>" for g, a, b in gaps[:5])

open(TARGET, "w", encoding="utf-8").write(f"""<!doctype html>
<meta charset="utf-8"><title>Guess Hue — Vorschau</title>
<style>
  body {{ font: 15px/1.5 system-ui, sans-serif; margin: 2rem; background: #16181c; color: #e7e9ee; }}
  table {{ border-collapse: collapse; width: 100%; max-width: 70rem; }}
  td {{ border-top: 1px solid #2c3038; padding: .6rem .8rem; vertical-align: top; }}
  .swatch {{ width: 76px; height: 76px; border-radius: 8px; }}
  .ring {{ width: 76px; height: 76px; border-radius: 50%;
           mask: radial-gradient(closest-side, transparent 58%, #000 59%);
           -webkit-mask: radial-gradient(closest-side, transparent 58%, #000 59%); }}
  .meta {{ font-variant-numeric: tabular-nums; color: #9aa3b2; white-space: nowrap; font-size: 13px; }}
  .cohort {{ color: #6d7688; }}
  .text {{ max-width: 46rem; }}
  h1 {{ font-size: 1.2rem; }} h2 {{ font-size: 1rem; color: #9aa3b2; margin-top: 2rem; }}
  ul {{ color: #9aa3b2; }}
</style>
<h1>{len(entries)} Einträge</h1>
<h2>Größte Lücken auf dem Kreis</h2>
<ul>{gap_list}</ul>
<table>{"".join(rows)}</table>
""")
print(f"{len(entries)} entries -> {TARGET}")
```

Der zweite Kreis in jeder Zeile ist das Rad, wie der Spieler es sieht — in der Sättigung und Helligkeit des Eintrags. Genau dort wird sichtbar, wenn ein Eintrag das Rad grau macht.

- [ ] **Step 6: Generate the preview and hand it over**

```bash
python3 "$SCRATCH/preview.py" "$SCRATCH/guess-hue-preview.html"
```

Dann die Datei mit `SendUserFile` (`display: "render"`) an den Nutzer schicken, mit dem Hinweis, dass die 76 übernommenen Einträge unverändert sind und die Lückenliste zeigt, wo Task 5 ansetzen muss.

- [ ] **Step 7: No commit**

Dieser Task committet **nichts**. `git status` muss sauber sein:

```bash
git status --porcelain
```

Erwartet: leere Ausgabe. Steht dort etwas, ist Klartext im Repo gelandet — entfernen, bevor es weitergeht.

---

### Task 5: 60 neue Einträge schreiben

Der lange Task. Kein TDD — die Prüfung ist der Blick auf die Vorschau, nicht ein Assert. Vier Runden zu je fünfzehn Einträgen, jede mit einer Vorschau und einer Freigabe.

**Files:**
- Modify (außerhalb des Repos): `/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml`

**Interfaces:**
- Consumes: die Pufferdatei mit 76 Einträgen (Task 4).
- Produces: dieselbe Datei mit 136 Einträgen.

**Die Schreibregel** steht im Spec, Kapitel *Die Schreibregel*. Zusammengefasst, weil sie hier gebraucht wird:

- Ein Anker, ein bis zwei Sätze. Ein Gegenstand, eine Szene, eine kleine Erzählung.
- Der Farbname darf beiläufig fallen — als Apposition im selben Satz, **nie** als eigener Kalibriersatz.
- Verboten: Richtungsangaben („auf der orangen Seite von"), Schlussformeln mit Maß („einen Fingerbreit Richtung Gelb"), Gradzahlen, Ziffern.
- Erlaubt und erwünscht: „dunkel", „blass", „kräftig", „stumpf" — sie stimmen jetzt.
- **Anker und Farbwert müssen zusammenpassen.** Der Gegenstand bestimmt `saturation` und `lightness` mit, nicht nur `hue`. Ein Moos ist stumpf und dunkel, eine Warnweste grell und mittelhell.
- Grob ein Drittel nennt gar keinen Farbnamen.
- Deutscher Text, `„…“` statt `"`.

**Kalibrierung der Zahlen:** `saturation` und `lightness` frei in `[0,1]`. Als Orientierung — Neon und Signalfarben `s 0.85–1.0`, Lack und Kunststoff `s 0.55–0.85`, Naturtöne und Textil `s 0.25–0.55`, Staub, Stein und Verwittertes `s 0.08–0.25`. `lightness` folgt dem Licht in der Szene: Mittagssonne `0.6–0.8`, Innenraum `0.35–0.55`, Dämmerung und Tiefe `0.15–0.3`.

- [ ] **Step 1: Read the coverage list**

```bash
python3 "$SCRATCH/preview.py" "$SCRATCH/guess-hue-preview.html"
```

Die Lückenliste oben auf der Seite nennt die fünf größten Abstände. Die Abdeckungsregel des Specs: **kein Loch größer als etwa 15°**. Notiere, welche Bereiche unterversorgt sind — dort liegen die ersten neuen Einträge.

- [ ] **Step 2: Write the first fifteen**

An `.local/guess-hue-dataset.yaml` anhängen, im selben Schema, mit `generatedAt: 2026-08-16`. Form eines Eintrags — **erfundenes Beispiel, nicht übernehmen**:

```yaml
  - hue: 190
    saturation: 0.45
    lightness: 0.35
    generatedAt: 2026-08-16
    description: >-
      Der Lack eines Werkstattschranks, den seit den Achtzigern niemand mehr
      abgewischt hat — ein dunkles Petrol, das sich für nichts mehr interessiert.
```

Fünfzehn Stück, verteilt auf die größten Lücken aus Step 1. Beim Schreiben mitzählen, wie viele ohne Farbnamen auskommen — Ziel über alle 60 ist etwa ein Drittel.

- [ ] **Step 3: Check that the backend still reads the file**

`preview_stop` und `preview_start` mit `{name: "backend"}` — das Datenset wird beim Boot gelesen, ein laufender Server sieht die neuen Einträge nicht. Danach `preview_logs` mit `{search: "Guess Hue"}`.

Erwartet: `Guess Hue loaded 91 entries … — 76 from 2024-03-03, 15 from 2026-08-16`.

- [ ] **Step 4: Preview and hand over for culling**

```bash
python3 "$SCRATCH/preview.py" "$SCRATCH/guess-hue-preview.html"
```

Per `SendUserFile` schicken. Frage konkret: welche Einträge fliegen raus, und stimmt bei den bleibenden das Verhältnis von Text zu Farbe. Aussortierte ersetzen, nicht einfach streichen — die fünfzehn sollen fünfzehn bleiben.

- [ ] **Step 5: Repeat steps 2 to 4 three more times**

Runde 2, 3 und 4 zu je fünfzehn Einträgen, bis 60 stehen. Nach jeder Runde die Lückenliste neu lesen: die Abdeckung verschiebt sich mit jedem Eintrag. Nach der letzten Runde muss die Startmeldung lauten:

```
Guess Hue loaded 136 entries … — 76 from 2024-03-03, 60 from 2026-08-16
```

- [ ] **Step 6: Play a round in the game lab**

`preview_start` mit `{name: "backend"}` und `{name: "frontend"}`, dann im Frontend-Tab zu `/c/<slug>/lab/guess-hue` navigieren (der Lab ist lokal eingeschaltet, `app.game-lab.enabled` in `core/src/main/resources/application.yaml`). Mindestens drei Runden mit verschiedenen Seeds durchspielen, darunter bewusst eine mit einem stumpfen Eintrag. Worauf zu achten ist:

- Der Ring trägt noch genug Farbe, um darauf zu zielen — oder er tut es nicht, und der Eintrag muss kräftiger werden.
- Text und Rad widersprechen sich nicht.
- Die Reveal-Ansicht bleibt lesbar, auch bei sehr hellen und sehr dunklen Einträgen.

Screenshot der Runden an den Nutzer.

- [ ] **Step 7: No commit**

Wieder: `git status --porcelain` muss leer sein.

---

### Task 6: Verschlüsseln, Dokumentation nachziehen, abschließen

**Files:**
- Modify: `deploy/guess-hue-dataset.sops.yaml`
- Modify: `core/README.md:62-90`
- Modify: `.claude/guidelines/game-content.md:28-40`

**Interfaces:**
- Consumes: die fertige Pufferdatei (Task 5).

- [ ] **Step 1: Encrypt the buffer file**

```bash
./scripts/guess-hue-dataset.sh encrypt
```

Erwartet: `Encrypted to: …/deploy/guess-hue-dataset.sops.yaml`.

- [ ] **Step 2: Prove the ciphertext holds the new dataset and no plaintext**

```bash
sops -d --config .sops.yaml deploy/guess-hue-dataset.sops.yaml | grep -c "generatedAt"
```

Erwartet: `136` — jeder Eintrag hat genau ein `generatedAt`.

```bash
grep "description:" deploy/guess-hue-dataset.sops.yaml | grep -cv "ENC\["
```

Erwartet: `0`. SOPS lässt die Schlüsselnamen im Klartext und verschlüsselt nur die Werte; jede `description:`-Zeile im Chiffrat muss also ein `ENC[...]` tragen. Zählt das Kommando etwas anderes als null, steht dort ein deutscher Satz im Klartext — **nicht committen**, Ursache klären.

- [ ] **Step 3: Update `core/README.md`**

Der Abschnitt „Guess Hue: checking the dataset" beschreibt einen Test, den es nicht mehr gibt. Ersetze ihn samt Codeblock durch (der Vierfach-Zaun hier ist nur die Klammer um den Markdown-Block — in die README kommt der Inhalt zwischen den Zäunen, mit seinem ```bash-Block):

````markdown
## Guess Hue: checking the dataset

The production dataset doesn't live in the repo (see
[game-content.md](../.claude/guidelines/game-content.md)). There is no test that grades it:
what can be checked mechanically — field types, `hue` in `0..359`, saturation and lightness
in `0.0..1.0`, a `YYYY-MM-DD` date, a non-blank description — the app checks while parsing,
and it does that on every start. Whether the texts are any good is looked at, not asserted.

So the check is: point the app at the buffer file and read its startup line.

```bash
./scripts/guess-hue-dataset.sh decrypt   # prints "Decrypted to: <path>"
cd core && GUESS_HUE_DATASET_PATH=<path from the script output> ./mvnw spring-boot:run
```

It either names the dataset and its cohorts —
`Guess Hue loaded 136 entries from … — 76 from 2024-03-03, 60 from 2026-08-16` — or it refuses
to start and names the entry and the field that is wrong. Locally, without a mounted dataset,
the app runs on `guess-hue-dataset.sample.yaml`; under `production` and `staging` it refuses to
start instead.
````

Im folgenden Abschnitt „Using the real dataset locally" den ersten Satz korrigieren — `the real, 60-entry dataset` stimmt nicht mehr:

```markdown
The six-entry sample is enough to start `guess-hue`, but not to judge the game. Anyone
working on it can load the real dataset locally before ever deploying:
```

- [ ] **Step 4: Feed the lesson back into the guidelines**

In `.claude/guidelines/game-content.md` beschreiben die letzten drei Aufzählungspunkte einen Apparat, den es nicht mehr gibt. Ersetze sie — von `- **Keep the validation rules in one implementation…` bis einschließlich `…indistinguishable from a passing run.` — durch:

```markdown
- **A checker can only check what is mechanically wrong.** Field types, ranges, a parseable
  date, a non-blank string: those belong in the loader and run on every start. Sentence counts,
  word lists, quotas per category do not — Guess Hue had all three, and what they actually
  enforced was a formula. Whoever writes the content writes to the checker, so a rule about
  taste becomes a template, and the template is what made the set unplayable.
- **Review curated content by looking at it.** A throwaway page that puts each entry next to
  the thing the player will actually see, generated outside the repository because its output
  is the content itself. That page is the review step; there is no green test that replaces it.
- **The presentation must not contradict the text.** If a description names a property —
  dark, pale, muted — that property has to come from the entry, not be re-rolled per round.
  Guess Hue drew saturation and lightness randomly for one revision, and every entry whose
  text mentioned brightness was regularly refuted by its own screen.
```

Und der Schlusssatz der Datei, der auf „die Validierungsregeln" zeigt:

```markdown
Concrete shape, and what is checked versus what is looked at:
[the Guess Hue dataset spec](../../docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md).
```

- [ ] **Step 5: Run everything**

```bash
cd core && ./mvnw test
```

```bash
cd webapp-vue && pnpm test && pnpm lint && pnpm exec vue-tsc -b
```

Das Frontend ist nicht angefasst worden; der Lauf belegt genau das. Erwartet: beides grün.

- [ ] **Step 6: Commit**

```bash
git add deploy/guess-hue-dataset.sops.yaml core/README.md .claude/guidelines/game-content.md
git commit -m "$(cat <<'EOF'
feat(guess-hue): re-encrypt the dataset, and record what the validator taught

136 entries: 76 carried over from huettehuette, 60 newly written. The README's
check is now the startup line rather than an opt-in test — the app validates
what is mechanically checkable on every boot, and the rest is looked at.

game-content.md keeps the lesson instead of the apparatus. A checker that
grades prose does not raise the quality of the prose; it standardises it, and
whoever writes the content writes to the checker. The other half of the lesson
is that presentation must not contradict text: a description may only name a
property the entry actually owns.
EOF
)"
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin claude/guess-hue-dataset-revision-d6b97f
```

```bash
gh pr create --base develop --title "Guess Hue: das Datenset überarbeiten" --body "$(cat <<'EOF'
## Was

Ein Eintrag trägt wieder seine eigene Farbe. Die Zweitakt-Regel, `difficulty`
und der Validator sind weg; das Datenset besteht aus 76 aus `huettehuette`
übernommenen und 60 neu geschriebenen Einträgen.

## Warum

Der kalibrierende zweite Satz war das Einzige, was ein Spieler gelesen hat —
der Anker, der den Charme trug, war Dekoration vor einer Gradangabe in Worten.
Die Ursache lag tiefer: Sättigung und Helligkeit wurden pro Runde aus einem
engen Korridor gezogen, statt zum Eintrag zu gehören. Damit konnte kein Text
mehr „dunkel" sagen, und jedes Bild wurde regelmäßig vom eigenen Rad
widerlegt. Die Zweitakt-Regel war die Kompensation, der Korridor die Ursache;
beides fällt.

## Kein Wire-Vertrag berührt

`GuessHuePayload` trug Sättigung und Helligkeit schon immer — sie kommen jetzt
nur aus einer anderen Quelle. Kein Frontend-Code, keine Migration.

Spec: `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`
Plan: `docs/superpowers/plans/2026-08-16-guess-hue-dataset-revision.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Clean up the scratchpad artefacts**

Die Vorschau-HTML und die Pufferdatei-Kopien enthalten Spielinhalt. Der Scratchpad liegt außerhalb des Repos, ist aber kein Tresor:

```bash
rm -f "$SCRATCH/guess-hue-preview.html"
```

Die abgelegte alte Pufferdatei (`.local/guess-hue-dataset.superseded.yaml`) bleibt liegen, bis der Nutzer sie freigibt — sie ist die einzige Kopie der verworfenen 60 Einträge.

---

## Reihenfolge und Abhängigkeiten

Task 1 → 2 → 3 sind Code und müssen in dieser Reihenfolge laufen (Task 2 braucht das Modell aus Task 1, Task 3 das Feld). Task 4 braucht Task 1 (das YAML-Schema) und Task 3 (die Startmeldung, an der man den Import abliest). Task 5 braucht Task 4. Task 6 braucht Task 5.

Task 4 und 5 committen bewusst nichts. Wer sie ausführt, muss nach jedem Schritt `git status --porcelain` leer sehen.
