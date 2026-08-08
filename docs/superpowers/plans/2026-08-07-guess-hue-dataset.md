# Guess Hue Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues `guesshue`-Modulith-Modul lädt das kuratierte Farbdatenset aus einer zur Laufzeit gemounteten YAML-Datei, validiert es gegen die Schreibregeln des Specs und leitet daraus deterministisch die Zielfarbe einer Runde ab.

**Architecture:** Das Modul hält keine Tabelle und keine Migration — wie `rng` ist es reine Logik plus eine Ressource. Der Loader liest YAML mit SnakeYAML (schon im Classpath) von einem konfigurierten Pfad und fällt auf ein mitgeliefertes Beispiel-Datenset im Classpath zurück; unter `production`/`staging` ist dieser Rückfall ein Startabbruch. Die Rundenziehung ist eine reine Funktion über `SeededRandom` — sie bekommt den Seed später vom Spielrahmen, der einen eigenen Spec hat und in diesem Plan **nicht** vorkommt.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Modulith 2.1 · SnakeYAML 2.6 (transitiv, keine neue Dependency) · JUnit 5 + kotest-assertions · SOPS + age (nur Deployment)

## Global Constraints

- **Der Klartext des Datensets erscheint nirgends im Repository** — nicht in Code, Test, Fixture, Commit-Message oder Plan. Siehe [`.claude/guidelines/game-content.md`](../../../.claude/guidelines/game-content.md). Alle Beispiele in Tests und Doku stammen aus dem Beispiel-Datenset.
- **Toleranz ±10°, Jitter ±5°.** Der Jitter muss kleiner bleiben als die Toleranz; das ist die Begründung für den Wert, nicht ein frei wählbarer Parameter.
- **S/L-Korridor `0.50–0.78` / `0.38–0.52`.** Werte außerhalb machen den Farbton auf dem Rad ununterscheidbar.
- **Ziehungsreihenfolge ist Vertrag:** `pick(entries)` → Jitter → Sättigung → Helligkeit → Startwinkel. Eine Umstellung ändert jede bereits gespielte Runde.
- **`SeededRandom` wird nicht erweitert.** Alle Ziehungen kommen aus der vorhandenen API (`pick`, `nextDouble()`); jede neue Methode dort erzwingt neue Golden Vectors.
- **Logger im Klassenrumpf**, `private val logger = KotlinLogging.logger {}`, Nachrichten immer als Lambda ([logging.md](../../../.claude/guidelines/logging.md)).
- **Branch:** Arbeit läuft auf `claude/guess-color-game-dev-83461a`, PR gegen `develop`.
- Alle Maven-Kommandos laufen aus `core/`.

## Referenz

Spec: [2026-08-07-guess-hue-dataset-design.md](../specs/2026-08-07-guess-hue-dataset-design.md). Die fünf Validierungsregeln und die Rundenableitung stehen dort; dieser Plan setzt sie um.

## File Structure

**Neu — Produktivcode** (`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/`):

| Datei | Verantwortung |
| --- | --- |
| `GuessHueEntry.kt` | Der Datensatz: `GuessHueDifficulty`-Enum + `GuessHueEntry`. Öffentliche API des Moduls. |
| `GuessHueTarget.kt` | Das Ergebnis einer Ziehung — Eintrag, Zielwinkel, S, L, Startwinkel. |
| `GuessHueDataset.kt` | Die geladene Liste plus `draw(SeededRandom)`. Der Bean, den der Spielrahmen später konsumiert. |
| `internal/GuessHueDatasetException.kt` | Eine Ausnahme für alle Lade- und Regelverstöße. |
| `internal/GuessHueDatasetYamlReader.kt` | YAML → `List<GuessHueEntry>`, mit Fehlermeldungen, die die Zeile benennen. |
| `internal/GuessHueDatasetValidator.kt` | Die fünf Regeln als Code. Getrennt nach `validateStructure` (jede Liste) und `validateCompleteness` (nur Produktion). |
| `internal/GuessHueDatasetProperties.kt` | `app.guess-hue.dataset-path`. |
| `internal/GuessHueDatasetLoader.kt` | Pfad oder Classpath-Beispiel, lesen + validieren. |
| `internal/GuessHueDatasetConfiguration.kt` | Bean-Verdrahtung und der Fail-Fast. |

**Neu — Ressourcen und Deployment:**

| Datei | Verantwortung |
| --- | --- |
| `core/src/main/resources/guess-hue-dataset.sample.yaml` | Sechs unechte Einträge. Classpath-Fallback und Testfixture. |
| `deploy/guess-hue-dataset.sops.yaml` | Die echten 60, verschlüsselt. **Nicht** im Classpath. |
| `.sops.yaml` | Empfängerliste (age-Public-Keys). |

**Geändert:**

| Datei | Änderung |
| --- | --- |
| `core/src/main/resources/application.yaml` | `app.guess-hue.dataset-path` aus `GUESS_HUE_DATASET_PATH`. |
| `deploy/compose.yaml` | Volume-Mount + Env für den `core`-Service. |
| `deploy/update.sh` | Verschlüsseltes Datenset holen und entschlüsseln. |
| `deploy/README.md` | age-Key und `sops` als Server-Voraussetzung. |
| `deploy/.env.prod.example`, `.env.staging.example` | Pfadvariablen. |
| `.claude/guidelines/game-content.md` | Abschlussaufgabe: was sich beim Bauen als übertragbar erwiesen hat. |

**Tests** (`core/src/test/kotlin/org/unividuell/countdown/core/guesshue/`): `GuessHueDatasetYamlReaderTest`, `GuessHueDatasetValidatorTest`, `GuessHueSampleDatasetTest`, `GuessHueDatasetLoaderTest`, `GuessHueDatasetFailFastTest`, `GuessHueDrawTest`, `GuessHueProductionDatasetTest`.

---

### Task 1: Datensatz und YAML-Leser

Der Einstieg: ein Typ und ein Parser, der schlechte Eingaben mit einer Meldung ablehnt, die sagt, welcher Eintrag schuld ist.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueEntry.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetException.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetYamlReader.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetYamlReaderTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `enum class GuessHueDifficulty { EASY, MEDIUM, HARD }`
  - `data class GuessHueEntry(val hue: Int, val difficulty: GuessHueDifficulty, val description: String)`
  - `class GuessHueDatasetException(message: String) : IllegalStateException(message)`
  - `object GuessHueDatasetYamlReader { fun read(source: InputStream, origin: String): List<GuessHueEntry> }`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader

class GuessHueDatasetYamlReaderTest {

    private fun read(yaml: String) =
        GuessHueDatasetYamlReader.read(yaml.byteInputStream(), origin = "test.yaml")

    @Test
    fun `reads hue, difficulty and description`() {
        val entries = read(
            """
            entries:
              - hue: 0
                difficulty: easy
                description: >-
                  Beispieleintrag Alpha, kein Spielinhalt. Er steht praktisch auf dem
                  reinen Rot, keinen Fingerbreit daneben.
              - hue: 120
                difficulty: hard
                description: Beispieleintrag Gamma, kein Spielinhalt.
            """.trimIndent(),
        )

        entries.size shouldBe 2
        entries[0].hue shouldBe 0
        entries[0].difficulty shouldBe GuessHueDifficulty.EASY
        // Der Faltblock `>-` macht aus den Zeilenumbrüchen Leerzeichen.
        entries[0].description shouldContain "reinen Rot, keinen Fingerbreit daneben."
        entries[1].difficulty shouldBe GuessHueDifficulty.HARD
    }

    @Test
    fun `rejects an unknown difficulty and names the allowed values`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    difficulty: tricky
                    description: Beispieleintrag, kein Spielinhalt.
                """.trimIndent(),
            )
        }

        thrown.message!! shouldContain "tricky"
        thrown.message!! shouldContain "easy"
    }

    @Test
    fun `rejects a blank description and points at the offending entry`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            read(
                """
                entries:
                  - hue: 10
                    difficulty: hard
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

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetYamlReaderTest`
Expected: FAIL — Kompilierfehler, `GuessHueDifficulty`/`GuessHueDatasetYamlReader` existieren nicht.

- [ ] **Step 3: Write the entry type**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueEntry.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

/**
 * Autoren-Metadatum, kein Laufzeitschalter. Zur Spielzeit liest niemand dieses Feld — die Stufen
 * fallen allein aus der Datenlage, weil der Seed gleichverteilt über alle Einträge zieht. Es
 * existiert, damit die Zweitakt-Regel des Specs prüfbar ist statt Geschmackssache.
 */
enum class GuessHueDifficulty { EASY, MEDIUM, HARD }

/**
 * Ein Eintrag ist eine Farb*familie*, kein Farbwert: [hue] ist der **nominale** Winkel, um den die
 * Runde jittert, und Sättigung wie Helligkeit gehören gar nicht dazu — sie entstehen pro Runde.
 *
 * Siehe `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`.
 */
data class GuessHueEntry(
    val hue: Int,
    val difficulty: GuessHueDifficulty,
    val description: String,
)
```

- [ ] **Step 4: Write the exception**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetException.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

/**
 * Jeder Lade- und Regelverstoß. Bewusst eine einzige Ausnahme: sie fliegt ausschließlich beim
 * Anwendungsstart, und dort ist die Meldung das Produkt — nicht der Typ, auf den jemand fängt.
 */
class GuessHueDatasetException(message: String) : IllegalStateException(message)
```

- [ ] **Step 5: Write the YAML reader**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetYamlReader.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry
import org.yaml.snakeyaml.Yaml
import java.io.InputStream

/**
 * SnakeYAML statt Jackson: `org.yaml:snakeyaml` liegt über den Spring-Boot-Starter ohnehin im
 * Compile-Classpath (Boot parst `application.yaml` damit), ein `jackson-dataformat-yaml` wäre eine
 * neue Dependency für drei Felder.
 *
 * Jede Meldung nennt [origin] und die Position, weil der Leser im Regelfall gegen eine Datei läuft,
 * die der Fehlersuchende nicht offen hat — sie liegt entschlüsselt auf einem Server.
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
            ?: throw GuessHueDatasetException("$where: expected a mapping with hue, difficulty and description")

        val hue = map["hue"] as? Int
            ?: throw GuessHueDatasetException("$where: 'hue' is missing or not an integer")

        val rawDifficulty = map["difficulty"] as? String
            ?: throw GuessHueDatasetException("$where: 'difficulty' is missing or not a string")
        val difficulty = GuessHueDifficulty.entries.firstOrNull { it.name.equals(rawDifficulty, ignoreCase = true) }
            ?: throw GuessHueDatasetException(
                "$where: unknown difficulty '$rawDifficulty', expected one of " +
                    GuessHueDifficulty.entries.joinToString { it.name.lowercase() },
            )

        val description = (map["description"] as? String)?.trim()
        if (description.isNullOrEmpty()) {
            throw GuessHueDatasetException("$where: 'description' is missing or blank")
        }

        return GuessHueEntry(hue = hue, difficulty = difficulty, description = description)
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetYamlReaderTest`
Expected: PASS, 4 Tests.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/guesshue core/src/test/kotlin/org/unividuell/countdown/core/guesshue
git commit -m "feat(guesshue): read the dataset from YAML

Neues Modulith-Modul, vorerst nur Datensatz und Parser. SnakeYAML statt
Jackson, weil es ueber den Boot-Starter ohnehin im Classpath liegt.

Jede Fehlermeldung nennt Datei und Eintragsnummer: die Datei liegt im
Regelfall entschluesselt auf einem Server und nicht dem offen, der den
Startabbruch liest."
```

---

### Task 2: Die fünf Regeln als Code

Der Spec behauptet, die Zweitakt-Regel sei mechanisch prüfbar. Hier wird sie es. Getrennt in zwei Aufrufe, weil Regel 1 nur für das Produktionsdatenset gilt — das Beispiel hat sechs Einträge und könnte sie nie erfüllen.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetValidator.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetValidatorTest.kt`

**Interfaces:**
- Consumes: `GuessHueEntry`, `GuessHueDifficulty`, `GuessHueDatasetException` aus Task 1.
- Produces:
  - `object GuessHueDatasetValidator`
  - `fun validateStructure(entries: List<GuessHueEntry>, origin: String)` — Regeln 2–5
  - `fun validateCompleteness(entries: List<GuessHueEntry>, origin: String)` — Regel 1
  - `const val EXPECTED_SIZE = 60`, `EXPECTED_PER_DIFFICULTY = 20`, `EXPECTED_PER_SECTOR = 5`, `SECTOR_WIDTH_DEGREES = 30`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetValidator

class GuessHueDatasetValidatorTest {

    private fun easy(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt. Er steht praktisch auf dem reinen Rot, keinen Fingerbreit daneben.") =
        GuessHueEntry(hue, GuessHueDifficulty.EASY, description)

    private fun medium(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt. Er liegt auf der gruenen Seite von reinem Gelb, nicht auf der orangen.") =
        GuessHueEntry(hue, GuessHueDifficulty.MEDIUM, description)

    private fun hard(hue: Int, description: String = "Beispieleintrag, kein Spielinhalt.") =
        GuessHueEntry(hue, GuessHueDifficulty.HARD, description)

    private fun structure(vararg entries: GuessHueEntry) =
        GuessHueDatasetValidator.validateStructure(entries.toList(), "test.yaml")

    @Test
    fun `accepts a well-formed set`() {
        shouldNotThrowAny { structure(easy(0), medium(60), hard(120)) }
    }

    @Test
    fun `rejects a duplicate hue`() {
        val thrown = shouldThrow<GuessHueDatasetException> { structure(easy(0), hard(0)) }
        thrown.message!! shouldContain "hue 0"
    }

    @Test
    fun `rejects a hue outside the circle`() {
        val thrown = shouldThrow<GuessHueDatasetException> { structure(hard(360)) }
        thrown.message!! shouldContain "0..359"
    }

    @Test
    fun `rejects a hard entry with two sentences`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(hard(10, "Beispieleintrag, kein Spielinhalt. Und noch ein Takt."))
        }
        thrown.message!! shouldContain "exactly one sentence"
    }

    @Test
    fun `rejects a medium entry with only one sentence`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(medium(10, "Beispieleintrag, kein Spielinhalt."))
        }
        thrown.message!! shouldContain "at least two sentences"
    }

    @Test
    fun `rejects an easy entry without a measure word`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(easy(10, "Beispieleintrag, kein Spielinhalt. Er liegt neben dem reinen Rot, nicht daneben."))
        }
        thrown.message!! shouldContain "measure word"
    }

    @Test
    fun `rejects a digit in the description`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            structure(hard(10, "Beispieleintrag mit 30 Grad, kein Spielinhalt."))
        }
        thrown.message!! shouldContain "digit"
    }

    @Test
    fun `completeness rejects a set that is not sixty entries`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetValidator.validateCompleteness(listOf(easy(0)), "test.yaml")
        }
        thrown.message!! shouldContain "60"
    }

    @Test
    fun `completeness accepts a balanced set of sixty`() {
        // Fuenf pro 30-Grad-Sektor, 20 pro Stufe. Die Verteilung je Sektor ist bewusst UNGLEICH —
        // eine gleiche waere gar nicht moeglich (5 ist nicht durch 3 teilbar) und traefe auch die
        // Sache nicht: namenlose Zonen koennen nie easy tragen. Drei Muster rotieren ueber die
        // zwoelf Sektoren, vier Sektoren je Muster, und ergeben genau 20/20/20.
        val entries = (0 until 12).flatMap { sector ->
            val base = sector * 30
            val difficulties = when (sector % 3) {
                0 -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD)
                1 -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD, GuessHueDifficulty.HARD)
                else -> listOf(GuessHueDifficulty.EASY, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.MEDIUM, GuessHueDifficulty.HARD, GuessHueDifficulty.HARD)
            }
            difficulties.mapIndexed { index, difficulty ->
                val hue = base + 2 + index * 6
                when (difficulty) {
                    GuessHueDifficulty.EASY -> easy(hue)
                    GuessHueDifficulty.MEDIUM -> medium(hue)
                    GuessHueDifficulty.HARD -> hard(hue)
                }
            }
        }
        shouldNotThrowAny { GuessHueDatasetValidator.validateCompleteness(entries, "test.yaml") }
        shouldNotThrowAny { GuessHueDatasetValidator.validateStructure(entries, "test.yaml") }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetValidatorTest`
Expected: FAIL — `GuessHueDatasetValidator` existiert nicht.

- [ ] **Step 3: Write the validator**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetValidator.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueDifficulty
import org.unividuell.countdown.core.guesshue.GuessHueEntry

/**
 * Die Schreibregeln des Specs als Code. Sie können einen schlechten Text nicht erkennen — sie
 * fangen den häufigsten Fehler: einen als `easy` markierten Eintrag, dem der kalibrierende zweite
 * Takt fehlt.
 *
 * Alle Verstöße einer Liste werden gesammelt und gemeinsam gemeldet. Ein Validator, der beim ersten
 * Fund abbricht, zwingt den Autor durch so viele Durchläufe, wie er Fehler gemacht hat.
 */
object GuessHueDatasetValidator {

    const val EXPECTED_SIZE = 60
    const val EXPECTED_PER_DIFFICULTY = 20
    const val EXPECTED_PER_SECTOR = 5
    const val SECTOR_WIDTH_DEGREES = 30

    /** Schließt das Fenster einer `easy`-Beschreibung. Ohne eines davon ist sie nicht leicht. */
    private val MEASURE_WORDS = listOf(
        "Hauch", "Fingerbreit", "Handbreit", "Drittel", "Hälfte",
        "Schritt", "kaum", "knapp", "praktisch", "dicht",
    )

    /** Satzende = Zeichen plus Leerraum oder Textende, damit der Schlusspunkt mitzählt. */
    private val SENTENCE_END = Regex("[.!?](?=\\s|\\z)")
    private val DIGIT = Regex("\\d")

    /** Regeln 2–5. Gilt für jede geladene Liste, auch das Beispiel-Datenset. */
    fun validateStructure(entries: List<GuessHueEntry>, origin: String) {
        val problems = mutableListOf<String>()

        entries.groupBy { it.hue }
            .filterValues { it.size > 1 }
            .keys.sorted()
            .forEach { problems += "hue $it appears more than once" }

        entries.forEach { entry ->
            val where = "hue ${entry.hue}"
            val difficulty = entry.difficulty.name.lowercase()

            if (entry.hue !in 0..359) {
                problems += "$where: hue must be within 0..359"
            }

            val sentences = SENTENCE_END.findAll(entry.description).count()
            if (entry.difficulty == GuessHueDifficulty.HARD) {
                if (sentences != 1) {
                    problems += "$where: hard needs exactly one sentence, found $sentences"
                }
            } else if (sentences < 2) {
                problems += "$where: $difficulty needs at least two sentences, found $sentences"
            }

            if (entry.difficulty == GuessHueDifficulty.EASY &&
                MEASURE_WORDS.none { it in entry.description }
            ) {
                problems += "$where: easy needs a measure word, one of ${MEASURE_WORDS.joinToString()}"
            }

            if (DIGIT.containsMatchIn(entry.description)) {
                problems += "$where: the description must not contain a digit — it paints, it does not compute"
            }
        }

        report(problems, origin)
    }

    /** Regel 1. Nur für das Produktionsdatenset — das Beispiel hat bewusst zu wenige Einträge. */
    fun validateCompleteness(entries: List<GuessHueEntry>, origin: String) {
        val problems = mutableListOf<String>()

        if (entries.size != EXPECTED_SIZE) {
            problems += "expected $EXPECTED_SIZE entries, found ${entries.size}"
        }

        GuessHueDifficulty.entries.forEach { difficulty ->
            val found = entries.count { it.difficulty == difficulty }
            if (found != EXPECTED_PER_DIFFICULTY) {
                problems += "expected $EXPECTED_PER_DIFFICULTY ${difficulty.name.lowercase()} entries, found $found"
            }
        }

        (0 until 360 / SECTOR_WIDTH_DEGREES).forEach { sector ->
            val found = entries.count { it.hue / SECTOR_WIDTH_DEGREES == sector }
            if (found != EXPECTED_PER_SECTOR) {
                val from = sector * SECTOR_WIDTH_DEGREES
                problems += "sector $from..${from + SECTOR_WIDTH_DEGREES - 1} holds $found entries, expected $EXPECTED_PER_SECTOR"
            }
        }

        report(problems, origin)
    }

    private fun report(problems: List<String>, origin: String) {
        if (problems.isNotEmpty()) {
            throw GuessHueDatasetException(
                "$origin violates the dataset rules:\n" + problems.joinToString("\n") { "  - $it" },
            )
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetValidatorTest`
Expected: PASS, 9 Tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetValidator.kt core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetValidatorTest.kt
git commit -m "feat(guesshue): enforce the dataset writing rules in code

Die Zweitakt-Regel des Specs ist damit keine Absichtserklaerung mehr. Sie
faengt keinen schlechten Text, aber den haeufigsten Fehler: ein als easy
markierter Eintrag ohne den kalibrierenden Schlusstakt.

Getrennt nach Struktur und Vollstaendigkeit, weil das Beispiel-Datenset
sechs Eintraege hat und die 60er-Regel nie erfuellen koennte.

Alle Verstoesse werden gesammelt statt beim ersten Fund abgebrochen -- sonst
kostet ein Datenset mit fuenf Fehlern fuenf Durchlaeufe."
```

---

### Task 3: Beispiel-Datenset und Loader

Der Loader entscheidet zwischen gemountetem Pfad und Classpath-Beispiel. Das Beispiel entsteht hier mit, weil es Testfixture *und* Fallback ist — es getrennt zu committen würde einen Test hinterlassen, der auf eine fehlende Datei zeigt.

**Files:**
- Create: `core/src/main/resources/guess-hue-dataset.sample.yaml`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetProperties.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetLoader.kt`
- Modify: `core/src/main/resources/application.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueSampleDatasetTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetLoaderTest.kt`

**Interfaces:**
- Consumes: `GuessHueDatasetYamlReader`, `GuessHueDatasetValidator`, `GuessHueDatasetException`.
- Produces:
  - `class GuessHueDatasetProperties(val datasetPath: String = "")` mit `@ConfigurationProperties(prefix = "app.guess-hue")`
  - `data class LoadedGuessHueDataset(val entries: List<GuessHueEntry>, val origin: String, val isSample: Boolean)`
  - `class GuessHueDatasetLoader(properties)` mit `fun load(): LoadedGuessHueDataset`
  - `GuessHueDatasetLoader.SAMPLE_RESOURCE = "/guess-hue-dataset.sample.yaml"`

- [ ] **Step 1: Write the sample dataset**

`core/src/main/resources/guess-hue-dataset.sample.yaml`:

```yaml
# Kein Spielinhalt. Dieses Set existiert, damit Tests und ein lokaler Start ohne das
# verschluesselte Produktionsdatenset laufen. Die Anwendung bricht ab, wenn sie es unter
# production oder staging laedt — siehe GuessHueDatasetConfiguration.
entries:
  - hue: 0
    difficulty: easy
    description: >-
      Beispieleintrag Alpha, kein Spielinhalt. Er steht praktisch auf dem
      reinen Rot, keinen Fingerbreit daneben.
  - hue: 60
    difficulty: medium
    description: >-
      Beispieleintrag Beta, kein Spielinhalt. Er liegt auf der grünen Seite von
      reinem Gelb, nicht auf der orangen.
  - hue: 120
    difficulty: hard
    description: Beispieleintrag Gamma, kein Spielinhalt.
  - hue: 180
    difficulty: easy
    description: >-
      Beispieleintrag Delta, kein Spielinhalt. Er sitzt so dicht am reinen
      Türkis, dass daneben nichts mehr passt.
  - hue: 240
    difficulty: medium
    description: >-
      Beispieleintrag Epsilon, kein Spielinhalt. Er liegt auf der violetten
      Seite von reinem Blau, nicht auf der türkisen.
  - hue: 300
    difficulty: hard
    description: Beispieleintrag Zeta, kein Spielinhalt.
```

- [ ] **Step 2: Write the failing tests**

`core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueSampleDatasetTest.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetValidator
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetYamlReader

/**
 * Das mitgelieferte Beispiel muss dieselben Regeln erfüllen wie das echte Datenset — sonst
 * beweisen die Tests, die darauf laufen, nichts über den Ernstfall.
 */
class GuessHueSampleDatasetTest {

    private val entries = GuessHueDatasetLoader::class.java
        .getResourceAsStream(GuessHueDatasetLoader.SAMPLE_RESOURCE)!!
        .use { GuessHueDatasetYamlReader.read(it, GuessHueDatasetLoader.SAMPLE_RESOURCE) }

    @Test
    fun `the bundled sample obeys the structural rules`() {
        shouldNotThrowAny {
            GuessHueDatasetValidator.validateStructure(entries, GuessHueDatasetLoader.SAMPLE_RESOURCE)
        }
    }

    @Test
    fun `the bundled sample is recognisably not game content`() {
        entries.size shouldBe 6
        entries.all { "Beispieleintrag" in it.description } shouldBe true
    }
}
```

`core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetLoaderTest.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties
import java.nio.file.Path

class GuessHueDatasetLoaderTest {

    @Test
    fun `falls back to the bundled sample when no path is configured`() {
        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = "")).load()

        loaded.isSample shouldBe true
        loaded.entries.size shouldBe 6
        loaded.origin shouldBe GuessHueDatasetLoader.SAMPLE_RESOURCE
    }

    @Test
    fun `reads the configured file and reports it as not the sample`(@TempDir dir: Path) {
        val file = dir.resolve("dataset.yaml").toFile()
        file.writeText(sixtyBalancedEntriesAsYaml())

        val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()

        loaded.isSample shouldBe false
        loaded.entries.size shouldBe 60
        loaded.origin shouldBe file.absolutePath
    }

    @Test
    fun `fails when the configured path is not a readable file`(@TempDir dir: Path) {
        val missing = dir.resolve("absent.yaml").toAbsolutePath().toString()

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = missing)).load()
        }

        thrown.message!! shouldContain missing
        thrown.message!! shouldContain "app.guess-hue.dataset-path"
    }

    @Test
    fun `applies the completeness rule to a configured file`(@TempDir dir: Path) {
        val file = dir.resolve("short.yaml").toFile()
        file.writeText(
            """
            entries:
              - hue: 0
                difficulty: hard
                description: Beispieleintrag, kein Spielinhalt.
            """.trimIndent(),
        )

        val thrown = shouldThrow<GuessHueDatasetException> {
            GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
        }

        thrown.message!! shouldContain "expected 60 entries"
    }

    /**
     * Fünf pro Sektor, 20 pro Stufe — erfundene Texte, die die Regeln erfüllen. Die Verteilung je
     * Sektor ist ungleich, weil fünf nicht durch drei teilbar ist: drei Muster rotieren über die
     * zwölf Sektoren, vier Sektoren je Muster, und ergeben genau 20/20/20.
     */
    private fun sixtyBalancedEntriesAsYaml(): String = buildString {
        appendLine("entries:")
        (0 until 12).forEach { sector ->
            val base = sector * 30
            val difficulties = when (sector % 3) {
                0 -> listOf("easy", "easy", "medium", "medium", "hard")
                1 -> listOf("easy", "easy", "medium", "hard", "hard")
                else -> listOf("easy", "medium", "medium", "hard", "hard")
            }
            difficulties.forEachIndexed { index, difficulty ->
                val description = when (difficulty) {
                    "easy" -> "Beispieleintrag, kein Spielinhalt. Er steht praktisch daneben, keinen Fingerbreit weiter."
                    "medium" -> "Beispieleintrag, kein Spielinhalt. Er liegt auf der einen Seite, nicht auf der anderen."
                    else -> "Beispieleintrag, kein Spielinhalt."
                }
                appendLine("  - hue: ${base + 2 + index * 6}")
                appendLine("    difficulty: $difficulty")
                appendLine("    description: \"$description\"")
            }
        }
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest='GuessHueSampleDatasetTest+GuessHueDatasetLoaderTest'`
Expected: FAIL — `GuessHueDatasetLoader` und `GuessHueDatasetProperties` existieren nicht.

- [ ] **Step 4: Write the properties**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetProperties.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "app.guess-hue")
open class GuessHueDatasetProperties(
    /**
     * Absoluter Pfad auf das **entschlüsselte** Produktionsdatenset, das das Deployment in den
     * Container mountet. Leer bedeutet: Beispiel aus dem Classpath — im Betrieb ein Startabbruch,
     * siehe `GuessHueDatasetConfiguration`.
     */
    val datasetPath: String = "",
)
```

- [ ] **Step 5: Write the loader**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetLoader.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import org.unividuell.countdown.core.guesshue.GuessHueEntry
import java.io.File

/** Was geladen wurde, und woher — [isSample] entscheidet über den Fail-Fast im Betrieb. */
data class LoadedGuessHueDataset(
    val entries: List<GuessHueEntry>,
    val origin: String,
    val isSample: Boolean,
)

/**
 * Liest entweder die gemountete Datei oder das Beispiel aus dem Classpath. Nichts hier weiß von
 * SOPS: das Deployment entschlüsselt, die Anwendung liest schlichtes YAML von einem Pfad. Damit
 * bleibt Schlüsselverwaltung vollständig außerhalb des Anwendungscodes und die CI braucht nie
 * einen Schlüssel.
 */
class GuessHueDatasetLoader(private val properties: GuessHueDatasetProperties) {

    fun load(): LoadedGuessHueDataset {
        val path = properties.datasetPath.trim()
        return if (path.isEmpty()) sample() else fromFile(path)
    }

    private fun fromFile(path: String): LoadedGuessHueDataset {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            throw GuessHueDatasetException(
                "app.guess-hue.dataset-path points at '$path', which is not a readable file",
            )
        }
        val entries = file.inputStream().use { GuessHueDatasetYamlReader.read(it, path) }
        GuessHueDatasetValidator.validateStructure(entries, path)
        GuessHueDatasetValidator.validateCompleteness(entries, path)
        return LoadedGuessHueDataset(entries, origin = path, isSample = false)
    }

    private fun sample(): LoadedGuessHueDataset {
        val stream = javaClass.getResourceAsStream(SAMPLE_RESOURCE)
            ?: throw GuessHueDatasetException("the bundled $SAMPLE_RESOURCE is missing from the classpath")
        val entries = stream.use { GuessHueDatasetYamlReader.read(it, SAMPLE_RESOURCE) }
        // Bewusst ohne validateCompleteness: das Beispiel hat sechs Einträge und soll sie haben.
        GuessHueDatasetValidator.validateStructure(entries, SAMPLE_RESOURCE)
        return LoadedGuessHueDataset(entries, origin = SAMPLE_RESOURCE, isSample = true)
    }

    companion object {
        const val SAMPLE_RESOURCE = "/guess-hue-dataset.sample.yaml"
    }
}
```

- [ ] **Step 6: Wire the property into application.yaml**

In `core/src/main/resources/application.yaml`, direkt unter `app:` und vor `test-auth:` einfügen:

```yaml
  guess-hue:
    # Leer heisst: das Beispiel-Datenset aus dem Classpath. Lokal richtig, im Betrieb ein
    # Startabbruch -- production und staging setzen GUESS_HUE_DATASET_PATH auf die Datei,
    # die update.sh mit sops entschluesselt und compose in den Container mountet.
    dataset-path: ${GUESS_HUE_DATASET_PATH:}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd core && ./mvnw test -Dtest='GuessHueSampleDatasetTest+GuessHueDatasetLoaderTest'`
Expected: PASS, 6 Tests.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/resources/guess-hue-dataset.sample.yaml core/src/main/resources/application.yaml core/src/main/kotlin/org/unividuell/countdown/core/guesshue core/src/test/kotlin/org/unividuell/countdown/core/guesshue
git commit -m "feat(guesshue): load the dataset from a mounted path or the bundled sample

Die Anwendung liest schlichtes YAML von einem Pfad und weiss nichts von SOPS.
Damit bleibt Schluesselverwaltung im Deployment, und die CI braucht nie einen
Schluessel -- die Tests laufen gegen das Beispiel.

Das Beispiel erfuellt dieselben Struktur-Regeln wie das echte Datenset, sonst
bewiesen die Tests darauf nichts ueber den Ernstfall. Die 60er-Regel gilt
bewusst nur fuer die gemountete Datei."
```

---

### Task 4: Der Fail-Fast

Ein versehentlich ausgeliefertes Beispiel ist schlimmer als ein nicht startender Container: das Spiel wäre still kaputt.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetConfiguration.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDatasetFailFastTest.kt`

**Interfaces:**
- Consumes: `GuessHueDatasetLoader`, `LoadedGuessHueDataset`, `GuessHueDatasetProperties`.
- Produces:
  - `class GuessHueDataset(val entries: List<GuessHueEntry>)` — der Bean (`draw` kommt in Task 5 dazu)
  - `class GuessHueDatasetConfiguration` mit `fun guessHueDataset(loader, environment): GuessHueDataset`
  - `GuessHueDatasetConfiguration.DEPLOYED_PROFILES = setOf("production", "staging")`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetConfiguration
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetException
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties

class GuessHueDatasetFailFastTest {

    private val configuration = GuessHueDatasetConfiguration()
    private val samplingLoader = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = ""))

    private fun environment(vararg profiles: String) =
        MockEnvironment().apply { setActiveProfiles(*profiles) }

    @Test
    fun `refuses to start on the sample under production`() {
        val thrown = shouldThrow<GuessHueDatasetException> {
            configuration.guessHueDataset(samplingLoader, environment("production"))
        }

        thrown.message!! shouldContain "production"
        thrown.message!! shouldContain "GUESS_HUE_DATASET_PATH"
    }

    @Test
    fun `refuses to start on the sample under staging`() {
        shouldThrow<GuessHueDatasetException> {
            configuration.guessHueDataset(samplingLoader, environment("staging"))
        }
    }

    @Test
    fun `allows the sample when no deployed profile is active`() {
        shouldNotThrowAny {
            val dataset = configuration.guessHueDataset(samplingLoader, environment())
            dataset.entries.size shouldBe 6
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetFailFastTest`
Expected: FAIL — `GuessHueDataset` und `GuessHueDatasetConfiguration` existieren nicht.

- [ ] **Step 3: Write the dataset bean**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

/**
 * Die geladene, geprüfte Liste. Die öffentliche Fläche des Moduls: der spätere Spielrahmen
 * bekommt diesen Bean und zieht daraus die Runde.
 *
 * Unveränderlich und ohne Zustand — der Zufall lebt im übergebenen `SeededRandom`, nie hier.
 */
class GuessHueDataset(val entries: List<GuessHueEntry>)
```

- [ ] **Step 4: Write the configuration**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/internal/GuessHueDatasetConfiguration.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.unividuell.countdown.core.guesshue.GuessHueDataset

@Configuration
@EnableConfigurationProperties(GuessHueDatasetProperties::class)
class GuessHueDatasetConfiguration {

    private val logger = KotlinLogging.logger {}

    @Bean
    fun guessHueDatasetLoader(properties: GuessHueDatasetProperties) = GuessHueDatasetLoader(properties)

    /**
     * Lädt beim Start, nicht beim ersten Spielzug: ein Datensatzfehler soll das Deployment stoppen,
     * nicht eine Runde, die schon läuft.
     */
    @Bean
    fun guessHueDataset(loader: GuessHueDatasetLoader, environment: Environment): GuessHueDataset {
        val loaded = loader.load()
        val deployedProfiles = environment.activeProfiles.filter { it in DEPLOYED_PROFILES }

        if (loaded.isSample && deployedProfiles.isNotEmpty()) {
            throw GuessHueDatasetException(
                "the bundled sample dataset was loaded under profile(s) ${deployedProfiles.joinToString()} — " +
                    "set GUESS_HUE_DATASET_PATH to the decrypted production dataset. Refusing to start: " +
                    "a game running on placeholder content looks healthy and is not.",
            )
        }

        if (loaded.isSample) {
            logger.warn { "Guess Hue is running on the bundled sample dataset (${loaded.origin}) — local development only" }
        } else {
            logger.info { "Guess Hue loaded ${loaded.entries.size} entries from ${loaded.origin}" }
        }

        return GuessHueDataset(loaded.entries)
    }

    companion object {
        /** Die Profile, unter denen echte Spieler mitspielen. Alles andere ist lokale Entwicklung. */
        val DEPLOYED_PROFILES = setOf("production", "staging")
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=GuessHueDatasetFailFastTest`
Expected: PASS, 3 Tests.

- [ ] **Step 6: Verify the Modulith boundaries still hold**

Run: `cd core && ./mvnw test -Dtest=ModularityTests`
Expected: PASS. Sollte es fehlschlagen, verletzt `guesshue` eine Modulgrenze — dann gehört der beanstandete Typ nach `guesshue/` statt `guesshue/internal/` oder umgekehrt. `guesshue` darf auf nichts anderes zugreifen.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/guesshue core/src/test/kotlin/org/unividuell/countdown/core/guesshue
git commit -m "feat(guesshue): refuse to start on the sample dataset in production

Ein versehentlich ausgeliefertes Beispiel ist schlimmer als ein nicht
startender Container: das Spiel waere still kaputt und niemandem fiele es auf,
weil ein Container laeuft und Runden ausliefert.

Geladen wird beim Start, nicht beim ersten Spielzug -- ein Datensatzfehler soll
das Deployment stoppen und nicht eine Runde, die schon laeuft."
```

---

### Task 5: Die Rundenziehung

Die reine Funktion, die aus einem Seed die Zielfarbe macht. Der Spielrahmen liefert später den Seed; hier steht nur, was mit ihm geschieht.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueTarget.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDrawTest.kt`

**Interfaces:**
- Consumes: `GuessHueDataset`, `GuessHueEntry`, `org.unividuell.countdown.core.rng.SeededRandom`.
- Produces:
  - `data class GuessHueTarget(val entry: GuessHueEntry, val hue: Double, val saturation: Double, val lightness: Double, val initHue: Double)`
  - `fun GuessHueDataset.draw(random: SeededRandom): GuessHueTarget`
  - Konstanten auf `GuessHueDataset.Companion`: `JITTER_DEGREES = 5.0`, `SATURATION_MIN = 0.50`, `SATURATION_MAX = 0.78`, `LIGHTNESS_MIN = 0.38`, `LIGHTNESS_MAX = 0.52`

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.matchers.comparables.shouldBeGreaterThanOrEqualTo
import io.kotest.matchers.comparables.shouldBeLessThan
import io.kotest.matchers.comparables.shouldBeLessThanOrEqualTo
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.abs
import kotlin.math.min

class GuessHueDrawTest {

    private val dataset = GuessHueDataset(
        (0 until 12).flatMap { sector ->
            val base = sector * 30
            listOf(
                GuessHueEntry(base + 2, GuessHueDifficulty.EASY, "Beispieleintrag, kein Spielinhalt. Praktisch daneben, keinen Fingerbreit weiter."),
                GuessHueEntry(base + 14, GuessHueDifficulty.MEDIUM, "Beispieleintrag, kein Spielinhalt. Auf der einen Seite, nicht auf der anderen."),
                GuessHueEntry(base + 26, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt."),
            )
        },
    )

    private fun distanceOnCircle(a: Double, b: Double): Double {
        val raw = abs(a - b)
        return min(raw, 360.0 - raw)
    }

    @Test
    fun `draws entry, jitter, saturation, lightness and init hue in exactly that order`() {
        // Die Reihenfolge ist Vertrag: eine Umstellung aendert jede bereits gespielte Runde.
        // Deshalb gegen einen von Hand nachgezogenen Stream pruefen statt gegen Magic Numbers.
        val reference = SeededRandom.fromSeed("community-42/round-7")
        val expectedEntry = reference.pick(dataset.entries)
        val jitterDraw = reference.nextDouble()
        val saturationDraw = reference.nextDouble()
        val lightnessDraw = reference.nextDouble()
        val initDraw = reference.nextDouble()

        val target = dataset.draw(SeededRandom.fromSeed("community-42/round-7"))

        target.entry shouldBe expectedEntry
        // Die Klammerung muss die der Implementierung SPIEGELN, nicht nur denselben Wert meinen:
        // (0.78 - 0.50) ist in IEEE754 nicht dasselbe wie das Literal 0.28, und `shouldBe` auf
        // Double vergleicht exakt. Genau das soll es auch — der Test pinnt die Arithmetik.
        target.hue shouldBe (expectedEntry.hue + jitterDraw * (2 * 5.0) - 5.0)
            .let { ((it % 360.0) + 360.0) % 360.0 }
        target.saturation shouldBe 0.50 + saturationDraw * (0.78 - 0.50)
        target.lightness shouldBe 0.38 + lightnessDraw * (0.52 - 0.38)
        target.initHue shouldBe initDraw * 360.0
    }

    @Test
    fun `is reproducible for the same seed`() {
        val first = dataset.draw(SeededRandom.fromSeed(4711))
        val second = dataset.draw(SeededRandom.fromSeed(4711))

        second shouldBe first
    }

    @Test
    fun `keeps the jitter inside the tolerance and the colour inside the corridor`() {
        // Der Jitter muss kleiner bleiben als die Toleranz von plus/minus 10 Grad, sonst kann ein
        // perfekter Leser unverschuldet danebenliegen.
        (0 until 2_000).forEach { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))

            distanceOnCircle(target.hue, target.entry.hue.toDouble()) shouldBeLessThanOrEqualTo 5.0
            target.saturation shouldBeGreaterThanOrEqualTo 0.50
            target.saturation shouldBeLessThan 0.78
            target.lightness shouldBeGreaterThanOrEqualTo 0.38
            target.lightness shouldBeLessThan 0.52
            target.hue shouldBeGreaterThanOrEqualTo 0.0
            target.hue shouldBeLessThan 360.0
            target.initHue shouldBeGreaterThanOrEqualTo 0.0
            target.initHue shouldBeLessThan 360.0
        }
    }

    @Test
    fun `wraps the jitter across zero degrees`() {
        val nearZero = GuessHueDataset(
            listOf(GuessHueEntry(2, GuessHueDifficulty.HARD, "Beispieleintrag, kein Spielinhalt.")),
        )

        val hues = (0 until 500).map { nearZero.draw(SeededRandom.fromSeed(it)).hue }

        // Ein Nominalwert von 2 Grad jittert auf beide Seiten der Null, und keiner darf negativ werden.
        hues.any { it > 350.0 } shouldBe true
        hues.all { it >= 0.0 } shouldBe true
    }

    @Test
    fun `the init hue is drawn independently of the target`() {
        // Ein garantiert weit entfernter Start wuerde verraten, wo das Ziel NICHT liegt, und den
        // Suchraum von 360 auf 240 Grad schneiden. Also muss er auch mal nah dran landen.
        val close = (0 until 5_000).count { seed ->
            val target = dataset.draw(SeededRandom.fromSeed(seed))
            distanceOnCircle(target.initHue, target.hue) < 30.0
        }

        // Bei Gleichverteilung liegen rund ein Sechstel der Startwinkel innerhalb von 30 Grad.
        close shouldBeGreaterThanOrEqualTo 500
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=GuessHueDrawTest`
Expected: FAIL — `GuessHueTarget` und `draw` existieren nicht.

- [ ] **Step 3: Write the target type**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueTarget.kt`:

```kotlin
package org.unividuell.countdown.core.guesshue

/**
 * Eine gezogene Runde, vollständig — inklusive Lösung.
 *
 * [hue] ist die Antwort und darf den Server vor der Auswertung nicht verlassen, auch nicht
 * abgeleitet. Zum Client gehen ausschließlich [GuessHueEntry.description] sowie [initHue],
 * [saturation] und [lightness].
 */
data class GuessHueTarget(
    val entry: GuessHueEntry,
    val hue: Double,
    val saturation: Double,
    val lightness: Double,
    val initHue: Double,
)
```

- [ ] **Step 4: Add the draw to the dataset**

`core/src/main/kotlin/org/unividuell/countdown/core/guesshue/GuessHueDataset.kt` vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.guesshue

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * Die geladene, geprüfte Liste. Die öffentliche Fläche des Moduls: der spätere Spielrahmen
 * bekommt diesen Bean und zieht daraus die Runde.
 *
 * Unveränderlich und ohne Zustand — der Zufall lebt im übergebenen [SeededRandom], nie hier.
 */
class GuessHueDataset(val entries: List<GuessHueEntry>) {

    /**
     * **Die Reihenfolge der Ziehungen ist Vertrag.** Eintrag, Jitter, Sättigung, Helligkeit,
     * Startwinkel — wer sie umstellt, ändert rückwirkend jede Runde, die je aus einem Seed
     * abgeleitet wurde.
     *
     * Nur die vorhandene [SeededRandom]-API wird benutzt. Eine neue Methode dort zöge neue Golden
     * Vectors nach sich, und das für Arithmetik, die hierher gehört.
     */
    fun draw(random: SeededRandom): GuessHueTarget {
        val entry = random.pick(entries)
        val jittered = entry.hue + random.nextDouble() * (2 * JITTER_DEGREES) - JITTER_DEGREES
        val saturation = SATURATION_MIN + random.nextDouble() * (SATURATION_MAX - SATURATION_MIN)
        val lightness = LIGHTNESS_MIN + random.nextDouble() * (LIGHTNESS_MAX - LIGHTNESS_MIN)
        val initHue = random.nextDouble() * 360.0

        return GuessHueTarget(
            entry = entry,
            hue = wrap360(jittered),
            saturation = saturation,
            lightness = lightness,
            initHue = initHue,
        )
    }

    private fun wrap360(degrees: Double) = ((degrees % 360.0) + 360.0) % 360.0

    companion object {
        /**
         * Muss kleiner bleiben als die Wertungstoleranz von ±10°. Der Jitter macht eine aus
         * beobachteten Runden gebaute Nachschlagetabelle unzuverlässig; wäre er größer als die
         * Toleranz, könnte ein perfekter Leser des Textes unverschuldet danebenliegen.
         */
        const val JITTER_DEGREES = 5.0

        /**
         * Außerhalb dieses Korridors wird der Farbton auf dem Rad schwer unterscheidbar — ein sehr
         * dunkles oder ausgewaschenes Ziel macht das Spiel nicht schwerer, sondern zufälliger.
         */
        const val SATURATION_MIN = 0.50
        const val SATURATION_MAX = 0.78
        const val LIGHTNESS_MIN = 0.38
        const val LIGHTNESS_MAX = 0.52
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=GuessHueDrawTest`
Expected: PASS, 5 Tests.

- [ ] **Step 6: Run the whole suite**

Run: `cd core && ./mvnw test`
Expected: PASS. Testcontainers braucht einen laufenden Docker-Daemon.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/guesshue core/src/test/kotlin/org/unividuell/countdown/core/guesshue
git commit -m "feat(guesshue): derive a round's target colour from its seed

Reine Funktion ueber SeededRandom: der Spielrahmen liefert spaeter den Seed,
hier steht nur, was mit ihm geschieht. Die Reihenfolge der Ziehungen ist
Vertrag -- eine Umstellung aendert rueckwirkend jede Runde.

Der Test zieht den Stream von Hand nach, statt Magic Numbers zu pinnen: so
schlaegt er bei einer Umstellung fehl und bleibt trotzdem lesbar.

Der Startwinkel wird unabhaengig gezogen. Ein garantiert weit entfernter Start
waere ein Leck -- er verriete, wo das Ziel NICHT liegt, und schnitte den
Suchraum von 360 auf 240 Grad."
```

---

### Task 6: Die Prüfung des echten Datensets

Ein Test, den nur bekommt, wer den Klartext hat. Er hält die Regeln an einer Stelle — kein zweites Prüfskript in einer anderen Sprache, das auseinanderdriften kann.

**Files:**
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueProductionDatasetTest.kt`
- Modify: `core/README.md`

**Interfaces:**
- Consumes: `GuessHueDatasetLoader`, `GuessHueDatasetProperties`.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Write the test**

```kotlin
package org.unividuell.countdown.core.guesshue

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetLoader
import org.unividuell.countdown.core.guesshue.internal.GuessHueDatasetProperties
import java.io.File

/**
 * Prüft das **echte** Datenset gegen alle fünf Regeln — und läuft nur, wenn jemand den Klartext
 * hat und darauf zeigt:
 *
 * ```
 * ./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=../.local/guess-hue-dataset.yaml
 * ```
 *
 * Ohne die Property überspringt der Test sich selbst, damit die CI grün bleibt — sie hat den
 * Klartext nicht und soll ihn nicht haben.
 *
 * Bewusst ein Test und kein eigenes Prüfskript: die Regeln leben in
 * `GuessHueDatasetValidator` und sollen es an genau einer Stelle tun. Eine zweite Umsetzung in
 * einer anderen Sprache driftet, und zwar unbemerkt, weil beide Seiten grün bleiben.
 */
class GuessHueProductionDatasetTest {

    @Test
    fun `the production dataset obeys every rule`() {
        val path = System.getProperty("guesshue.dataset")
        assumeTrue(path != null, "set -Dguesshue.dataset=<path> to check the real dataset")

        val file = File(path!!)
        assumeTrue(file.isFile, "no dataset at $path")

        shouldNotThrowAny {
            val loaded = GuessHueDatasetLoader(GuessHueDatasetProperties(datasetPath = file.absolutePath)).load()
            loaded.entries.size shouldBe 60
        }
    }
}
```

- [ ] **Step 2: Run it without the property**

Run: `cd core && ./mvnw test -Dtest=GuessHueProductionDatasetTest`
Expected: PASS mit einem übersprungenen Test (`skipped`, nicht `failed`).

- [ ] **Step 3: Run it against the real dataset**

Die Pufferdatei liegt im **Haupt-Checkout**, die Arbeit läuft in einem Worktree — ein relativer Pfad müsste vier Ebenen hoch (`core` → Worktree → `worktrees` → `.claude` → Wurzel) und ist zu leicht falsch abgezählt. Deshalb absolut:

```bash
cd core && ./mvnw test -Dtest=GuessHueProductionDatasetTest \
  -Dguesshue.dataset=/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml
```

Expected: PASS, ein ausgeführter Test. Schlägt er fehl, nennt die Meldung jeden Verstoß — die Pufferdatei korrigieren, **nicht** die Regeln.

- [ ] **Step 4: Document the command in core/README.md**

Am Ende von `core/README.md` folgenden Abschnitt anfügen (der innere Block ist ein `bash`-Codeblock — beim Einfügen als solcher schreiben, nicht als Text):

> ## Guess Hue: das Datenset prüfen
>
> Das Produktionsdatenset liegt nicht im Repo (siehe
> [game-content.md](../.claude/guidelines/game-content.md)). Nach einer Änderung an der
> gitignorierten Pufferdatei prüfen. Die Datei liegt im Haupt-Checkout; ein relativer Pfad aus
> einem Worktree trifft sie nicht, deshalb absolut:
>
> &nbsp;&nbsp;&nbsp;&nbsp;`./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset=/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml`
>
> Ohne die Property überspringt sich der Test — so bleibt die CI grün, die den Klartext nicht hat.
> **Zeigt eine gesetzte Property ins Leere, scheitert der Test**, statt zu überspringen: wer sie
> setzt, will prüfen, und ein stilles Überspringen sähe aus wie ein bestandener Lauf.
>
> Lokal ohne gemountetes Datenset läuft die Anwendung auf `guess-hue-dataset.sample.yaml`; unter
> `production` und `staging` bricht sie damit ab.

- [ ] **Step 5: Commit**

```bash
git add core/src/test/kotlin/org/unividuell/countdown/core/guesshue/GuessHueProductionDatasetTest.kt core/README.md
git commit -m "test(guesshue): check the real dataset behind an opt-in property

Ein Test statt eines Pruefskripts, damit die Regeln an genau einer Stelle
leben. Eine zweite Umsetzung in Python waere unbemerkt auseinandergedriftet --
beide Seiten waeren gruen geblieben.

Ohne -Dguesshue.dataset ueberspringt er sich: die CI hat den Klartext nicht
und soll ihn nicht haben."
```

---

### Task 7: SOPS einrichten und das Datenset verschlüsseln

**Dieser Task braucht einen Menschen mit einem privaten Schlüssel.** Ein Agent kann ihn nicht ausführen — er kann ihn nur vorbereiten und danach prüfen.

**Files:**
- Create: `.sops.yaml`
- Create: `deploy/guess-hue-dataset.sops.yaml`

**Interfaces:**
- Consumes: die gitignorierte Pufferdatei aus dem Haupt-Checkout.
- Produces: `deploy/guess-hue-dataset.sops.yaml` — die Datei, die `update.sh` in Task 8 holt.

- [ ] **Step 1: Install the tools (Mensch)**

```bash
brew install sops age
```

- [ ] **Step 2: Create an age key pair (Mensch)**

```bash
mkdir -p ~/.config/sops/age && age-keygen -o ~/.config/sops/age/keys.txt
```

Die Ausgabe nennt den **Public Key** (`age1…`). Der private Teil liegt in der Datei und wird **nie** committet.

**Auf macOS reicht das nicht.** SOPS sucht den Schlüssel im Go-Standard-Konfigverzeichnis, und das ist auf macOS `~/Library/Application Support/sops/age/keys.txt`, nicht `~/.config`. Verschlüsseln klappt trotzdem — dafür genügt der Public Key aus `.sops.yaml` — aber **Entschlüsseln scheitert** mit „identity did not match any of the recipients".

`~/.config` ist trotzdem der bessere Ort, weil der Server denselben Pfad benutzt und `update.sh` ihn dort erwartet: ein Modell statt zwei. Also den Pfad explizit setzen, am besten dauerhaft im Shell-Profil:

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
```

Alle folgenden `sops --decrypt`-Aufrufe setzen das voraus.

- [ ] **Step 3: Write .sops.yaml**

`.sops.yaml` im Repo-Wurzelverzeichnis, `age1…` durch den echten Public Key aus Schritt 2 ersetzen:

```yaml
# Empfaengerliste fuer verschluesselte Spielinhalte. Jeder Berechtigte steht hier mit seinem
# age-Public-Key; aufnehmen heisst: Zeile ergaenzen und `sops updatekeys` laufen lassen.
#
# Entzug wirkt NICHT rueckwirkend: wer einmal Empfaenger war, kann jeden Stand der Git-History
# entschluesseln. Jemanden entfernen heisst deshalb immer auch, den Inhalt neu zu wuerfeln.
#
# Der erste Zweig trifft die gitignorierte Pufferdatei, der zweite die committete Chiffre:
# creation_rules werden auf den EINGABEpfad angewandt, nicht auf die Ausgabe. Eine Regel nur
# auf deploy/*.sops.yaml wuerde beim Verschluesseln nie greifen.
creation_rules:
  - path_regex: (\.local/.*\.yaml|deploy/.*\.sops\.yaml)$
    age: >-
      age1...
```

- [ ] **Step 4: Encrypt the buffer file (Mensch)**

Zwei Fallstricke, die den Befehl laenger machen als erwartet. Die Pufferdatei liegt im
**Haupt-Checkout**, `.sops.yaml` existiert aber vorerst nur auf diesem **Branch** — und SOPS sucht
seine Konfiguration vom Verzeichnis der Eingabedatei aufwaerts, findet sie dort also nicht. Deshalb
den Pfad zur Konfiguration explizit mitgeben. Aus dem Worktree heraus:

```bash
sops --config .sops.yaml \
  --output deploy/guess-hue-dataset.sops.yaml \
  --encrypt /opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml
```

`--output` statt einer Shell-Umleitung, damit bei einem Fehlschlag keine leere oder halbe Datei
entsteht.

- [ ] **Step 5: Verify the ciphertext carries no plaintext**

```bash
grep -c "ENC\[" deploy/guess-hue-dataset.sops.yaml
grep -ci "beschreibung\|farbe\|reinen" deploy/guess-hue-dataset.sops.yaml
```

Expected: erste Zahl ≥ 120 (Hue und Beschreibung je Eintrag), zweite Zahl `0`.

- [ ] **Step 6: Verify the round trip**

**Nicht auf Byte-Identität prüfen.** SOPS parst die YAML und gibt sie neu aus; Einrückung und
Anführungszeichen ändern sich dabei, der Inhalt nicht. Ein `diff` gegen die Pufferdatei meldet
deshalb sämtliche Datenzeilen als verschieden, obwohl nichts fehlt — eine Prüfung, die immer
fehlschlägt, prüft nichts.

Prüfe stattdessen semantisch: entschlüsseln in eine temporäre Datei **außerhalb des Repos**, den
eigenen Validator darauf loslassen, und die Werte vergleichen, ohne sie auszugeben.

```bash
TMP=$(mktemp -t guess-hue) && sops --config .sops.yaml --decrypt deploy/guess-hue-dataset.sops.yaml > "$TMP"
(cd core && ./mvnw test -Dtest=GuessHueProductionDatasetTest -Dguesshue.dataset="$TMP")
```

Expected: `Tests run: 2, Failures: 0` — die entschlüsselte Datei erfüllt alle fünf Regeln.

```bash
python3 -c "
import re,sys
def vals(p):
    t=open(p,encoding='utf-8').read()
    return (re.findall(r'hue:\s*(\d+)',t), re.findall(r'difficulty:\s*(\w+)',t),
            [d.strip().strip('\"\'') for d in re.findall(r'description:\s*(.+)',t)])
a=vals(sys.argv[1]); b=vals(sys.argv[2])
print('hues', a[0]==b[0], '| difficulties', a[1]==b[1], '| descriptions', a[2]==b[2], '| n =', len(a[0]))
" /opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml "$TMP"
```

Expected: `hues True | difficulties True | descriptions True | n = 60`.

```bash
shred -u "$TMP" 2>/dev/null || rm -f "$TMP"
```

Die temporäre Klartextkopie **muss** danach weg. Schlägt eine der beiden Prüfungen fehl, ist die
Chiffre unbrauchbar — nicht committen, sondern Schritt 4 wiederholen.

- [ ] **Step 7: Commit**

```bash
git add .sops.yaml deploy/guess-hue-dataset.sops.yaml
git commit -m "chore(guesshue): commit the encrypted production dataset

Verschluesselt gegen eine age-Empfaengerliste, damit der Inhalt versioniert und
reviewbar bleibt, ohne im oeffentlichen Repo lesbar zu sein.

Liegt in deploy/ und nicht in den Resources: update.sh zieht ohnehin alles aus
diesem Verzeichnis, und im Jar waere die Datei totes Gewicht. Das Beispiel
gehoert umgekehrt in den Classpath -- es ist der Fallback."
```

---

### Task 8: Deployment

`update.sh` entschlüsselt, Compose mountet, die Anwendung liest. Kein Krypto im Anwendungscode.

**Files:**
- Modify: `deploy/update.sh`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/.env.prod.example`, `deploy/.env.staging.example`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: `deploy/guess-hue-dataset.sops.yaml` aus Task 7, `app.guess-hue.dataset-path` aus Task 3.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Add the decryption to update.sh**

In `deploy/update.sh` nach dem `curl`-Block (direkt nach der `update.sh.new`-Zeile) einfügen:

```sh
# Das Spieldatenset liegt verschluesselt im oeffentlichen Repo; entschluesselt wird hier, nicht in
# der Anwendung -- die liest schlichtes YAML von einem Pfad und kennt weder sops noch einen Key.
# SOPS_AGE_KEY_FILE zeigt auf den privaten Schluessel, der ausserhalb des Repos auf dem Server liegt.
curl -fsSL "$BASE/guess-hue-dataset.sops.yaml" -o guess-hue-dataset.sops.yaml
mkdir -p secrets
if ! SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" \
     sops -d guess-hue-dataset.sops.yaml > secrets/guess-hue-dataset.yaml; then
  echo "sops could not decrypt the Guess Hue dataset." >&2
  echo "Install sops and put the age key at \${SOPS_AGE_KEY_FILE:-\$HOME/.config/sops/age/keys.txt}." >&2
  rm -f secrets/guess-hue-dataset.yaml
  exit 1
fi
chmod 600 secrets/guess-hue-dataset.yaml
```

- [ ] **Step 2: Mount it in compose.yaml**

Im `core`-Service von `deploy/compose.yaml` die `environment`-Liste um eine Zeile ergänzen und einen `volumes`-Block hinzufügen:

```yaml
  core:
    image: ghcr.io/unividuell/countdown-core:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment:
      - SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-production}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - SUPER_ADMIN_GITHUB_LOGINS=${SUPER_ADMIN_GITHUB_LOGINS:-}
      - GUESS_HUE_DATASET_PATH=/config/guess-hue-dataset.yaml
    volumes:
      # update.sh entschluesselt hierher, bevor es `compose up` ruft. Read-only: die Anwendung
      # liest das Datenset und schreibt es nie. Fehlt die Datei, bricht der Start ab -- gewollt,
      # ein Spiel auf Platzhalterinhalten sieht gesund aus und ist es nicht.
      - ./secrets/guess-hue-dataset.yaml:/config/guess-hue-dataset.yaml:ro
    depends_on:
      - postgres
    networks:
      - internal
```

- [ ] **Step 3: Note the prerequisite in the env examples**

Ans Ende von `deploy/.env.prod.example` **und** `deploy/.env.staging.example` anfügen:

```sh
# Optional. Nur setzen, wenn der private age-Schluessel nicht unter
# ~/.config/sops/age/keys.txt liegt. update.sh entschluesselt damit das Guess-Hue-Datenset.
# SOPS_AGE_KEY_FILE=/opt/unividuell/secrets/age.key
```

- [ ] **Step 4: Document it in deploy/README.md**

Als neuen Abschnitt in `deploy/README.md` (der Installationsbefehl wird ein `bash`-Codeblock):

> ## Voraussetzung: sops + age (Spielinhalte)
>
> `update.sh` entschlüsselt das Guess-Hue-Datenset auf dem Server, bevor es `compose up` ruft.
> Der Server braucht dafür einmalig `age` und `sops`:
>
> &nbsp;&nbsp;&nbsp;&nbsp;`apt-get install -y age`
> &nbsp;&nbsp;&nbsp;&nbsp;`curl -fsSL -o /usr/local/bin/sops https://github.com/getsops/sops/releases/latest/download/sops-linux-arm64 && chmod +x /usr/local/bin/sops`
>
> Die Images sind arm64 (siehe [deployment.md](../.claude/guidelines/deployment.md)) — auf einem
> x86-Server stattdessen `sops-linux-amd64`.
>
> Den privaten age-Schlüssel nach `~/.config/sops/age/keys.txt` legen (oder `SOPS_AGE_KEY_FILE`
> in der `.env` setzen). Der Schlüssel gehört **nicht** ins Repo.
>
> Fehlt Schlüssel oder Werkzeug, bricht `update.sh` mit einer Meldung ab und deployt nicht — statt
> einen Container zu starten, der auf Platzhalterinhalten läuft.

- [ ] **Step 5: Check the shell script**

Run: `sh -n deploy/update.sh && echo "Syntax ok"`
Expected: `Syntax ok`.

- [ ] **Step 6: Check the compose file**

Run: `cd deploy && docker compose -f compose.yaml --env-file .env.prod.example config >/dev/null && echo "compose ok"`
Expected: `compose ok`. Schlägt es an einer fehlenden Variablen fehl, fehlt sie in `.env.prod.example` — dort ergänzen.

- [ ] **Step 7: Commit**

```bash
git add deploy/
git commit -m "feat(deploy): decrypt the Guess Hue dataset before compose up

update.sh holt die verschluesselte Datei wie alles andere aus deploy/ und legt
den Klartext nach ./secrets, das compose read-only in den Container mountet.

Kein Krypto im Anwendungscode: das Backend liest schlichtes YAML von einem
Pfad. Damit braucht die CI nie einen Schluessel -- ihre Tests laufen gegen das
Beispiel-Datenset.

Schlaegt die Entschluesselung fehl, bricht update.sh ab statt zu deployen. Ein
Container auf Platzhalterinhalten sieht gesund aus und ist es nicht."
```

---

### Task 10: Das Datenset lokal verfügbar machen (Opt-in)

Ohne das echte Datenset läuft lokal das Beispiel mit sechs Einträgen — gut genug, um zu starten, zu wenig, um das Spiel zu beurteilen. Wer daran arbeitet, soll es sehen können, **bevor** deployt wird. Nicht per Default: den Schlüssel braucht nicht jeder, und ein Standard-Opt-in würde Klartext auf mehr Rechnern erzeugen als nötig.

Der Schalter existiert bereits (`GUESS_HUE_DATASET_PATH`); es fehlen der bequeme Weg dorthin und die Doku. Das Skript ist kein Luxus: beim Verschlüsseln von Hand sind drei Fallstricke aufgeschlagen — SOPS findet seine Konfiguration nicht vom Eingabeverzeichnis aus, der age-Key liegt auf macOS woanders, und die Chiffre ist nach dem Round-Trip nicht byte-identisch. Ein Skript kodiert das einmal.

**Files:**
- Create: `scripts/guess-hue-dataset.sh`
- Modify: `core/README.md`
- Modify: `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md` (Abschnitt *Ablage und Übergabe*)

**Interfaces:**
- Consumes: `deploy/guess-hue-dataset.sops.yaml`, `.sops.yaml`, `app.guess-hue.dataset-path` / `GUESS_HUE_DATASET_PATH`.
- Produces: nichts für andere Tasks.

- [ ] **Step 1: Write the script**

`scripts/guess-hue-dataset.sh`, POSIX `sh`, `set -eu`, ausführbar. Zwei Unterbefehle:

`decrypt` — entschlüsselt die committete Chiffre in die gitignorierte Pufferdatei und gibt danach die Zeile aus, die man exportieren muss.

`encrypt` — verschlüsselt die Pufferdatei zurück in die Chiffre.

Anforderungen, jede aus einem Fehler entstanden, den wir schon gemacht haben:

- **Ein kanonischer Ort für den Klartext**, auch aus einem Worktree heraus: das Hauptverzeichnis des Repos, nicht das des Worktrees. Auflösen über `git rev-parse --path-format=absolute --git-common-dir` und davon das Elternverzeichnis nehmen. Ziel ist `<haupt>/.local/guess-hue-dataset.yaml`.
- **`--config` explizit setzen** auf die `.sops.yaml` im Wurzelverzeichnis des aktuellen Checkouts. SOPS sucht sonst vom Verzeichnis der *Eingabedatei* aufwärts und findet sie im Hauptverzeichnis nicht, solange der Branch nicht gemerged ist.
- **`SOPS_AGE_KEY_FILE` vorbelegen** mit `$HOME/.config/sops/age/keys.txt`, falls nicht gesetzt — auf macOS sucht SOPS sonst in `~/Library/Application Support` und scheitert beim Entschlüsseln, obwohl Verschlüsseln lief.
- **Nicht überschreiben.** `decrypt` bricht ab, wenn die Pufferdatei existiert, es sei denn `--force` ist gesetzt; die Meldung nennt den Pfad. Sonst verliert jemand seine unverschlüsselten Änderungen.
- **Über eine temporäre Datei schreiben** und erst bei Erfolg per `mv` an die Zielstelle, in beide Richtungen. Ein Fehlschlag darf keine halbe Datei hinterlassen.
- **`umask 077`** um das Schreiben des Klartexts, danach wiederherstellen.
- Fehlt `sops`, fehlt der Key oder fehlt die Chiffre: klar benennen, was fehlt und was zu tun ist. Kein nackter Tool-Fehler.

- [ ] **Step 2: Verify the script both ways**

```bash
chmod +x scripts/guess-hue-dataset.sh
./scripts/guess-hue-dataset.sh decrypt
```

Expected: die Pufferdatei entsteht, das Skript nennt die zu exportierende Zeile. Zweiter Aufruf ohne `--force`: Abbruch mit sprechender Meldung, Datei unverändert (Prüfsumme vorher/nachher vergleichen).

```bash
(cd core && ./mvnw test -Dtest=GuessHueProductionDatasetTest \
  -Dguesshue.dataset="$(git rev-parse --path-format=absolute --git-common-dir | xargs dirname)/.local/guess-hue-dataset.yaml")
```

Expected: `Tests run: 2, Failures: 0`.

```bash
./scripts/guess-hue-dataset.sh encrypt
git diff --stat deploy/guess-hue-dataset.sops.yaml
```

Expected: die Chiffre wird neu geschrieben. Ein Diff ist normal — SOPS erneuert Nonces und `lastmodified` bei jedem Lauf, auch wenn der Inhalt gleich blieb. **Diesen Neu-Verschlüsselungs-Diff nicht committen**, wenn sich der Inhalt nicht geändert hat: `git checkout -- deploy/guess-hue-dataset.sops.yaml`.

- [ ] **Step 3: Document the opt-in in core/README.md**

Ergänze den bestehenden Guess-Hue-Abschnitt um den lokalen Weg: dass ohne `GUESS_HUE_DATASET_PATH` das Beispiel mit sechs Einträgen läuft, dass das zum Starten reicht aber nicht zum Beurteilen, und wie man opt-in geht:

&nbsp;&nbsp;&nbsp;&nbsp;`./scripts/guess-hue-dataset.sh decrypt`
&nbsp;&nbsp;&nbsp;&nbsp;`export GUESS_HUE_DATASET_PATH=…` *(den Pfad, den das Skript ausgibt)*
&nbsp;&nbsp;&nbsp;&nbsp;`cd core && ./mvnw spring-boot:run`

Nenne ausdrücklich, dass dafür ein age-Key nötig ist, dass ohne ihn alles außer diesem einen Komfort funktioniert, und dass der Klartext gitignoriert liegt und nie committet wird.

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md`, Abschnitt *Ablage und Übergabe*: die Tabelle *Der Weg eines Eintrags* beschreibt bisher nur die Autorenrichtung. Ergänze, dass dieselbe Pufferdatei auch der **lokale Opt-in-Pfad** ist — wer am Spiel arbeitet, entschlüsselt sie und zeigt `GUESS_HUE_DATASET_PATH` darauf. Halte fest, dass das bewusst opt-in bleibt: kein Default, weil jeder zusätzliche Klartext auf einem weiteren Rechner der Preis wäre.

- [ ] **Step 5: Commit**

```bash
git add scripts/guess-hue-dataset.sh core/README.md docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md
git commit -m "feat(guesshue): make the real dataset available locally, opt-in

Ohne das echte Datenset laeuft lokal das Beispiel mit sechs Eintraegen -- genug
zum Starten, zu wenig zum Beurteilen. Wer am Spiel arbeitet, soll es sehen
koennen, bevor deployt wird.

Bewusst opt-in und nicht Default: den age-Key braucht nicht jeder, und jeder
zusaetzliche Klartext auf einem weiteren Rechner waere der Preis.

Das Skript existiert, weil beim Verschluesseln von Hand drei Fallstricke
aufschlugen: SOPS findet seine Konfiguration nicht vom Eingabeverzeichnis aus,
der age-Key liegt auf macOS nicht in ~/.config, und die Chiffre ist nach dem
Round-Trip nicht byte-identisch. Einmal kodiert statt dreimal neu entdeckt."
```

---

### Task 9: Guidelines nachziehen

Pflicht-Abschlussaufgabe nach [feeding-knowledge-back.md](../../../.claude/guidelines/feeding-knowledge-back.md) — einschließlich der Feststellung, dass nichts zu ändern ist.

**Files:**
- Modify: `.claude/guidelines/game-content.md` (nur falls die Umsetzung etwas Übertragbares ergeben hat)

- [ ] **Step 1: Run the full suite one more time**

Run: `cd core && ./mvnw test`
Expected: PASS, inklusive `ModularityTests`.

- [ ] **Step 2: Confirm no plaintext leaked into the branch**

```bash
BUFFER=/opt/unividuell/projects/countdown.unividuell.org/.local/guess-hue-dataset.yaml
grep -oE '\b[A-ZÄÖÜ][a-zäöüß]{5,}' "$BUFFER" | sort -u | while read -r w; do
  n=$(git log --all --oneline -S"$w" | wc -l | tr -d ' ')
  [ "$n" != "0" ] && echo "LEAK: '$w' in $n Commits"
done
echo "Pruefung beendet"
```

Expected: nur `Pruefung beendet`, keine `LEAK:`-Zeile.

Treffer auf Allerweltswörter (`Licht`, `Punkt`, `Farbe`, `Richtung`) sind Zufall und kein Leck — die stehen auch in Spec und Guideline. Prüfe bei einem Treffer den Commit selbst, bevor du reagierst: ein echtes Leck zeigt sich daran, dass ein **Anker** auftaucht, also ein Substantiv, das nur in einer einzigen Beschreibung vorkommt.

- [ ] **Step 3: Decide on the guideline**

Die Regel selbst steht bereits in `.claude/guidelines/game-content.md`. Nur ergänzen, was sich beim **Bauen** als übertragbar erwiesen hat und dort noch fehlt — Kandidaten aus diesem Plan:

- Regeln über Inhalte gehören in **eine** Umsetzung, die per System-Property auf den Klartext gezeigt bekommt, statt in ein zweites Prüfskript.
- Der Fallback-Datensatz muss dieselben Regeln erfüllen wie der echte, sonst beweisen die Tests darauf nichts.

Ergibt die Umsetzung nichts darüber hinaus, ist „keine Änderung" das richtige Ergebnis — dann diesen Schritt ohne Commit abhaken.

- [ ] **Step 4: Commit (nur falls Schritt 3 etwas ergeben hat)**

```bash
git add .claude/guidelines/game-content.md
git commit -m "docs: feed the dataset-loading lessons back into the guidelines"
```

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin claude/guess-color-game-dev-83461a
gh pr create --base develop --title "Guess Hue: das Datenset" --body "$(cat <<'BODY'
Setzt [den Datenset-Spec](docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md) um: ein
`guesshue`-Modulith-Modul lädt das kuratierte Farbdatenset, prüft es gegen die Schreibregeln und
leitet daraus deterministisch die Zielfarbe einer Runde ab.

Der Spielrahmen — Endpunkte, Persistenz, Punkte, Vue-Komponente — ist bewusst nicht dabei und
bekommt einen eigenen Spec.

**Der Inhalt selbst ist nicht im Klartext im Repo.** Er liegt SOPS-verschlüsselt in
`deploy/guess-hue-dataset.sops.yaml`; `update.sh` entschlüsselt beim Deployment. Im Repo steht ein
offensichtlich unechtes Beispiel-Datenset, gegen das die Tests laufen — die CI braucht nie einen
Schlüssel. Unter `production` und `staging` bricht die Anwendung ab, wenn sie darauf landet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**Spec-Abdeckung.** Datensatz (Task 1) · Zweitakt-Regel und die fünf Validierungsregeln (Task 2, aufgeteilt nach dem Produktions-/Beispiel-Geltungsbereich, den der Spec fordert) · Beispiel-Datenset (Task 3) · Verteilung 12×5 und 20/20/20 (Task 2, `validateCompleteness`) · Rundenableitung inklusive Ziehungsreihenfolge, Jitter, Korridor und unabhängigem Startwinkel (Task 5) · Fail-Fast (Task 4) · Ablage und Übergabe (Tasks 7–8) · „was der Client bekommt" (als Vertrag im KDoc von `GuessHueTarget`; das DTO selbst gehört dem Spielrahmen).

**Bewusst offen gelassen.** Der Spec nennt `phaseTwoStartRound` und die Punkteberechnung als Sache des Punkte-Specs; die Modulith-Frage aus der Anti-Cheat-Spec wird hier nur so weit beantwortet, wie dieser Plan sie braucht — `guesshue` als eigenes Modul ohne Schema und ohne Flyway, nach dem Vorbild von `rng`. Entscheidet der Spielrahmen-Spec später auf ein übergreifendes `game`-Modul, steht `guesshue` daneben, statt umgeschrieben zu werden.

**Was ein Reviewer prüfen sollte.** Ob `GuessHueDataset` der richtige Ort für `draw` ist oder ob die Ziehung besser in eine eigene Klasse gehört, sobald der Spielrahmen mehr davon braucht. Und ob `secrets/` neben `backups/` auf dem Server der richtige Platz für den Klartext ist.
