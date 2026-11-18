# Verrohrung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Verrohrung“ (`turn-pipes`) als zehntes Rundenspiel: Rohrkacheln drehen, bis das Wasser vom Zulauf zum Abfluss durch jedes Rohr läuft.

**Architecture:** Ein neues Modulith-Modul `turnpipes` (reine Logik, kein Schema) trägt Kacheln, Wasserlauf und Generator; der Adapter `TurnPipesGameType` in `game.internal` trägt Params, Ausgänge, Schwierigkeit → Größe und Validierung. Im Frontend ein neues Spielverzeichnis `games/turnpipes/` — reine Module (Typen, Drehungen, Kacheln, Zwischenstand, Rangliste, Auflösungsansicht, Klänge) unter einem Raster aus PNG-Kacheln. Blockierungs Stummschalter wird zu einem gemeinsamen in `ui/`.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher · Jackson 3 · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4 · VueUse.

**Spec:** [`docs/superpowers/specs/2026-11-18-verrohrung-design.md`](../specs/2026-11-18-verrohrung-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Referenz:** Spike-Branch `feature/pipe-puzzle-game-spike`, Stand `bd13ed45`. Dateien daraus mit `git show bd13ed45:<pfad>` — `webapp-vue/src/spike/pipes/{board,art,sounds}.ts`, `webapp-vue/src/spike/pipes/sounds/`, `webapp-vue/src/pages/c/[slug]/spike/rohre.vue`. Vorbild für jede Bauform: Blockierung (`copy-blocks`), Plan `docs/superpowers/plans/2026-10-16-blockierung.md`.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden oder schweigt):

1. **Generator-Grenzen:** Schritt 2 bekommt höchstens `100 × n²` weitere Züge, dann von vorn; nach 50 Neuanfängen `IllegalStateException` (im Spike nie nötig). Der Start wird höchstens 20-mal neu gewürfelt.
2. **Start im Generator:** `TurnPipesGenerator.scramble` würfelt den Start, der Adapter ruft nach `generate` auf — beides aus `presentation`, in dieser Reihenfolge.
3. **Gemeinsamer Stummschalter:** `ui/useGameSound.ts` (`useGameSound(): Ref<boolean>`, Schlüssel `games:sound`, Vorgabe `true`) und `ui/SoundToggle.vue` (ein Knopf, Stil über das Klassen-Attribut des Aufrufers). Blockierung stellt um.
4. **Abgabeknopf** wie bei Blockierung: runder `HoldButton` in der Spielerfarbe, `size-20`, Aufschrift „Abgeben“; der Stummschalter rechts daneben, in der Auflösung an derselben Stelle über der Rangliste.
5. **Unter der Hülle** stehen die leeren Platten im `n × n`-Raster aus der Bühne — so wird `size` aus der Bühne gebraucht, und beim Aufdecken springt nichts.
6. **Halten sperrt das Raster** wie bei Blockierung (`useHoldLock`, `useFieldTouch`, `HoldLock`).
7. **Unlesbares in der Auflösung:** ein fremder Eintrag ohne lesbare Stellungen oder Outcome zeigt die Lösung; ohne Lösung bleiben die Stellungen stehen, ohne Wasser.
8. **Neu laden auf der Auflösung** (`animate = false`) zeigt das Endbild: Wasser schon nass, Ring schon da, kein Ton.
9. **Ton im Brett:** nur das Drehen. Wasser klingt nur in der Auflösung, jedes Mal, wenn es läuft.
10. **Klangdateien** unverändert aus dem Spike (MP3), umbenannt auf `turn`, `flow`, `leak`, `success`, `dry`.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit. Branch: `feature/pipe-puzzle-game-bc0872`. Nicht pushen.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen laut `.claude/guidelines/kotlin.md`).
- **Testing:** kotest-Matcher, mockk; Frontend Vitest + `vi`. **TDD:** erst der fallende Test.
- **Keine redundanten Inline-Kommentare.** Kommentare nur, wo sie beim Lesen dieser Zeile einen Fehler verhindern — kurz, *was* und *warum*.
- **Namen:** Spiel-Id `turn-pipes`, Anzeigename `Verrohrung`, Modul `turnpipes`, Klassen `TurnPipes*`. Die Bühne heißt im Code `scene`.
- **Ströme:** alles aus `random.presentation`: erst `generate`, dann `scramble`. `scene` und `solution` bleiben unberührt.
- **Konventionen (Spec, wörtlich):** Richtungen `0` Nord, `1` Ost, `2` Süd, `3` West; Öffnungen bei Stellung 0: `STRAIGHT` N+S, `ELBOW` N+O, `INLET`/`OUTLET` N; Stellung `r` = `r` Vierteldrehungen im Uhrzeigersinn; Zellen zeilenweise, `index = y × n + x`, `(0, 0)` oben links.
- **Feste Zahlen (Spec):**
  - Größe `n = 6 + min(2, floor(difficulty × 3))`; Enden auf Randfeldern, Manhattan-Abstand `≥ 3`; Backbite `20 × n²` Züge.
  - Drehen `150 ms`; Wasser `110 ms` je Kachel (Startwerte).
  - Ton: Drehen Lautstärke `0.6`, Tonhöhe `1 ± 0.05`; Fließen Schleife, Lautstärke `0.5`, Ausblenden `0.3 s`; Leck, Erfolg, Trocken Lautstärke `0.8`; Erfolg blendet nach `2.5 s` in `0.6 s` aus; Vorlauf `START_LOOKAHEAD_SECONDS` aus `ui/audio.ts`.
  - Takte: `SOLUTION_DELAY_MS`, `RESULTS_DELAY_MS` aus `games/revealChoreography.ts`, nie eigene Zahlen.
- **Wörtliche Texte:**
  - InfoBox-Kurztext: `Dreh die Rohre, bis das Wasser vom Handrad zum Abfluss durch jedes Rohr läuft.`
  - Regeln: `Tippen dreht eine Kachel um eine Vierteldrehung.` · `Auch Zulauf und Abfluss drehen sich.` · `Es zählt nur eine Leitung durch alle Rohre.` · `Abgegeben wird, indem du den Knopf unter dem Brett gedrückt hältst.`
  - AwardBox: qualifiziert `Deine Leitung muss durch jedes Rohr führen.`, schnellster `Die Leitung durch jedes Rohr — und von allen, die sie haben, die kürzeste Zeit.`
  - Abgabe: Aufschrift `Abgeben`, Label `Leitung abgeben — gedrückt halten`. Stummschalter: Label `Ton`.
  - Ohne Darstellung: `Diese Runde lässt sich hier nicht anzeigen.` · Ranglisten-Caption: `Alle Tipps der Runde, nach Punkten sortiert`.
- **Kein Zähler, kein Rückgängig, kein Live-Feedback** im Brett; der Ecken-Trick steht nirgends.
- **Lizenzen:** fünf Klänge CC0 1.0 (Freesound), Quellen in `sounds/CREDITS.md`; kein Abschnitt auf der Rechtliches-Seite.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Vor `pnpm lint` die geänderten Dateien mit `pnpm exec prettier --write <Dateien>` formatieren; `pnpm lint` endet bei Prettier-Warnungen mit 0 — Ausgabe auf `warning` prüfen.
- **Browser-Pane:** meldet sich oft als versteckt; Halten (`requestAnimationFrame`) und Takte gehören in die Handprobe am Handy (Task 9).

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Ein Zwischenstand, der nicht mehr passt** (andere Länge, Wert außerhalb 0..3, kaputtes JSON, alte Version) wird verworfen; das Brett beginnt mit dem Start, nichts wirft; ein Speicher, der wirft, lässt das Spiel ohne Zwischenstand weiterlaufen. → Task 5.
2. **Schnelles Mehrfachtippen** während der 150-ms-Drehung geht nicht verloren: drei Tipps sind drei Vierteldrehungen, die Stellung ist `3`. → Task 7.
3. **Ein Finger auf dem Brett während des Haltens** dreht nichts; das Halten bleibt aus, solange ein Finger liegt. → Task 7.
4. **Ein unlesbarer fremder Eintrag** (Guess oder Outcome fehlt oder hat falsche Länge) lässt sich antippen, ohne Fehler — gezeigt wird die Lösung. → Task 8.
5. **Neu laden auf der Auflösung** zeigt sofort das Endbild, ohne Wasserlauf und ohne Ton. → Task 8.

## File Structure

**Backend, neu:**

| Datei | Aufgabe |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/Pipes.kt` | `PipeKind`, Richtungen, Öffnungen, Nachbarn |
| `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/PipeFlow.kt` | `Leak`, `Flow`, der Wasserlauf |
| `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/TurnPipesGenerator.kt` | `PipeBoard`, Weg durch alle Zellen, Arten, Lösung, Start |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/TurnPipesGameType.kt` | der Adapter |

**Backend, geändert:** `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`), `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt` (Katalogliste).

**Frontend, neu:** `webapp-vue/src/ui/useGameSound.ts`, `webapp-vue/src/ui/SoundToggle.vue`; unter `webapp-vue/src/games/turnpipes/`: `types.ts`, `turns.ts`, `tiles.ts` + `tiles/*.png`, `draft.ts`, `scoreboard.ts`, `reveal.ts`, `water.ts`, `sounds.ts` + `sounds/*.mp3` + `sounds/CREDITS.md`, `PipeGrid.vue`, `TurnPipesRules.vue`, `TurnPipesBriefing.vue`, `TurnPipesBoard.vue`, `TurnPipesScoreboard.vue`, `TurnPipesReveal.vue`, `TurnPipesGame.vue`, Tests unter `__tests__/`.

**Frontend, geändert:** `games/copyblocks/CopyBlocksBoard.vue` + `__tests__/CopyBlocksBoard.spec.ts` (Stummschalter), `games/registry.ts`, `gamelab/games.ts`.

**Doku:** `.claude/guidelines/frontend-state.md`, `docs/superpowers/specs/2026-10-16-blockierung-design.md` (Ton-Abschnitt).

Reihenfolge: Modul `turnpipes` (1–2) → Adapter (3) → Stummschalter (4) → Frontend rein (5) → Ton (6) → Brett (7) → Auflösung (8) → Spiel, Registrierung, Labor, Doku (9). Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

**Nach Task 1 (neues Modul):** `./mvnw clean test` — die generierte `application-modules.json` ist sonst veraltet (`.claude/guidelines/modules-and-migrations.md`).

---

### Task 1: `turnpipes` — Kacheln und Wasserlauf

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/Pipes.kt`, `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/PipeFlow.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/turnpipes/PipesTest.kt`, `core/src/test/kotlin/org/unividuell/countdown/core/turnpipes/PipeFlowTest.kt`

**Interfaces:**
- Produces:
  - `enum class PipeKind { STRAIGHT, ELBOW, INLET, OUTLET }`
  - `object Pipes { const val NORTH = 0; const val EAST = 1; const val SOUTH = 2; const val WEST = 3; fun openings(kind: PipeKind, rotation: Int): Int; fun neighbour(size: Int, cell: Int, direction: Int): Int?; fun opposite(direction: Int): Int }` — `openings` als Bitmaske, Bit `d` gesetzt = offen nach `d`; `neighbour` ist `null` jenseits des Rands.
  - `data class Leak(val at: Int?, val from: Int)` — `at = null`: übers Brett hinaus.
  - `data class Flow(val wet: List<Int>, val reached: Boolean, val leak: Leak?)`
  - `object PipeFlow { fun trace(size: Int, kinds: List<PipeKind>, rotations: List<Int>): Flow }`

Das Testbrett (3 × 3, Schlange `0 → 1 → 2 → 5 → 4 → 3 → 6 → 7 → 8`) brauchen Task 1 und 3:

```kotlin
val KINDS = listOf(INLET, STRAIGHT, ELBOW, ELBOW, STRAIGHT, ELBOW, ELBOW, STRAIGHT, OUTLET)
val SOLVED = listOf(1, 1, 2, 1, 1, 3, 0, 1, 3)
```

- [ ] **Step 1: Die fallenden Tests schreiben**

`PipesTest`:
- `openings at rotation 0 follow the table` — `STRAIGHT → 0b0101`, `ELBOW → 0b0011`, `INLET`/`OUTLET → 0b0001`.
- `every rotation turns clockwise` — `openings(ELBOW, 1) == 0b0110`, `openings(ELBOW, 2) == 0b1100`, `openings(ELBOW, 3) == 0b1001`, `openings(STRAIGHT, 1) == 0b1010`, `openings(INLET, 3) == 0b1000`, `openings(STRAIGHT, 2) == openings(STRAIGHT, 0)`.
- `neighbours stop at the border` — Größe 3: `neighbour(3, 0, NORTH) == null`, `neighbour(3, 0, WEST) == null`, `neighbour(3, 0, EAST) == 1`, `neighbour(3, 0, SOUTH) == 3`, `neighbour(3, 8, EAST) == null`.

`PipeFlowTest` (mit `KINDS`/`SOLVED`):
- `the solved board carries water through every cell` — `trace(3, KINDS, SOLVED) == Flow(wet = listOf(0, 1, 2, 5, 4, 3, 6, 7, 8), reached = true, leak = null)`.
- `a pipe with no opening back stops the water` — `SOLVED` mit Zelle 1 auf `2`: `Flow(wet = listOf(0), reached = false, leak = Leak(at = 1, from = 0))`.
- `water off the board leaks into nothing` — Zulauf auf `0`: `Flow(wet = listOf(0), reached = false, leak = Leak(at = null, from = 0))`.
- `reaching the outlet past dry pipes is reached, not all wet` — Stellungen `listOf(2, 1, 2, 0, 1, 2, 0, 1, 0)`: `wet == listOf(0, 3, 4, 5, 8)`, `reached == true`, `leak == null`.
- `a straight turned half way is the same pipe` — `SOLVED` mit Zelle 1 auf `3`: `reached == true`, `wet.size == 9`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='PipesTest,PipeFlowTest'`
Expected: Kompilierfehler — `PipeKind` unbekannt.

- [ ] **Step 3: `Pipes.kt` und `PipeFlow.kt` schreiben**

`openings`: Basismaske um `rotation mod 4` Bits nach links rotieren (4 Bit). `trace` nach dem Pseudocode der Spec (*Der Wasserlauf*), höchstens `size²` Schritte. KDoc auf `trace`: das Wasser nimmt genau einen Weg — zwei Öffnungen je Kachel, ein Endstück eine.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS, auch `ModularityTests`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/turnpipes core/src/test/kotlin/org/unividuell/countdown/core/turnpipes
git commit -F - <<'EOF'
Add the pipe tiles and the water trace

A new module turnpipes, pure logic: what a tile opens to in each of
its four rotations, and where water from the inlet runs - the cells it
wets in order, whether it reaches the outlet, and where it leaks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `turnpipes` — Generator

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/TurnPipesGenerator.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/turnpipes/TurnPipesGeneratorTest.kt`

**Interfaces:**
- Consumes: `PipeKind`, `Pipes`, `PipeFlow` (Task 1); `org.unividuell.countdown.core.rng.SeededRandom` (`nextInt(boundExclusive)`, `nextBoolean()`).
- Produces:
  - `data class PipeBoard(val size: Int, val kinds: List<PipeKind>, val solution: List<Int>, val path: List<Int>)`
  - `object TurnPipesGenerator { const val MIN_END_DISTANCE = 3; fun generate(random: SeededRandom, size: Int): PipeBoard; fun scramble(random: SeededRandom, board: PipeBoard): List<Int> }`

- [ ] **Step 1: Die fallenden Tests schreiben**

Über `seed in 1..200` und `size in 6..8` (`generate(SeededRandom.fromSeed(seed), size)`):
- `the path visits every cell once, neighbour after neighbour` — `path.sorted() == (0 until size * size).toList()`; je zwei Folgezellen sind Nachbarn (`Pipes.neighbour`).
- `the ends sit on the border, at least three apart` — `kinds[path.first()] == INLET`, `kinds[path.last()] == OUTLET`, genau ein `INLET` und ein `OUTLET`; beide Randfelder; Manhattan-Abstand `≥ 3`.
- `the kinds follow the path` — innen: gegenüberliegende Öffnungen → `STRAIGHT`, sonst `ELBOW`.
- `the solution carries water through every cell` — `PipeFlow.trace(size, kinds, solution)` hat `reached` und `wet == path`.
- `the scrambled start is not solved` — `scramble(…)` hat `size²` Werte in `0..3`, und `trace` mit ihnen ist nicht `reached && wet.size == size²`.
- `the same seed draws the same board` — `generate` und `scramble` zweimal mit Seed 7 gleich; über die 200 Seeds mehr als 190 verschiedene `path`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='TurnPipesGeneratorTest'`
Expected: Kompilierfehler — `TurnPipesGenerator` unbekannt.

- [ ] **Step 3: `TurnPipesGenerator.kt` schreiben**

`generate` nach der Spec (*Der Generator*, Schritte 1–4), Übertragung von `hamiltonian` aus `bd13ed45:webapp-vue/src/spike/pipes/board.ts`. Münzwürfe mit `random.nextBoolean()`, Nachbarwahl mit `random.nextInt(bites.size)`. Grenzen: Entscheidung 1. `scramble`: je Zelle `random.nextInt(4)`, gelöst → neu, höchstens 20-mal (danach `IllegalStateException`). KDoc auf dem Objekt: keine Eindeutigkeitsprüfung, weil jedes Brett mit zwei Endstücken höchstens eine Stellung ohne Leck hat — Verweis auf die Spec (*Warum es genau eine Lösung gibt*).

- [ ] **Step 4: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/turnpipes/TurnPipesGenerator.kt core/src/test/kotlin/org/unividuell/countdown/core/turnpipes/TurnPipesGeneratorTest.kt
git commit -F - <<'EOF'
Draw pipe boards through every cell

A path through every cell, stirred by backbite moves until both ends
sit on the border at least three apart; the tile kinds and the solving
rotations follow from it, and the start is scrambled until unsolved.
No uniqueness check: with two end pieces a board has at most one
leak-free arrangement.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Der Adapter `TurnPipesGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/TurnPipesGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/TurnPipesGameTypeTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`), `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt`

**Interfaces:**
- Consumes: Task 1 und 2.
- Produces (Wire-Vertrag fürs Frontend): Game-Id `turn-pipes`; Bühne `{ size }`; Payload `{ size, kinds: [code], start: [Int] }`; Lösung `{ rotations: [Int], path: [Int] }`; Outcome `{ correct, wet: [Int], leak: { at: Int|null, from: Int } | null }`; Tipp `{ rotations: [Int] }`.
- Kotlin: `data class TurnPipesParams(val size: Int, val kinds: List<PipeKind>, val start: List<Int>, val solution: List<Int>, val path: List<Int>, val timed: Boolean)` — KDoc wörtlich aus der Spec (*Der Zug*); `TurnPipesScene(size) : GameScene`; `TurnPipesPayload(size, kinds, start) : GamePayload`; `TurnPipesSolution(rotations, path) : GameSolution`; `TurnPipesOutcome(correct, wet, leak: Leak?) : GameOutcome`; `@Component class TurnPipesGameType(private val mapper: ObjectMapper) : GameType<TurnPipesParams>` mit `companion object { const val MIN_SIZE = 6; const val MAX_SIZE = 8; fun sizeFor(difficulty: Double): Int }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`TurnPipesGameTypeTest` — Gerüst (`random(…)`, `draw(…)`, `tree(…)`, `guess(json)`) wie `CopyBlocksGameTypeTest`; `draw` nimmt zusätzlich `difficulty: Double = 0.0` in den `RoundContext`.

- `it is registered under a stable id and a German display name` — `"turn-pipes"`, `"Verrohrung"`.
- `the size follows the difficulty` — `sizeFor`: `0.0 → 6`, `0.33 → 6`, `0.34 → 7`, `0.66 → 7`, `0.67 → 8`, `1.0 → 8`; `draw(difficulty = 0.9).size == 8`.
- `everything follows the presentation seed only` — `draw(random(solution = 9, scene = 9, presentation = 2)) == draw(random(presentation = 2))`.
- `phase two is timed - one deliberate reveal, scored on the clock` — wie bei Blockierung.
- `every exit carries exactly its fields` — Bühne `{size}`, Payload `{size, kinds, start}` (`kinds[0]` ist ein Code-String), Lösung `{rotations, path}`, Outcome `{correct, wet, leak}`; ein Outcome mit Leck hat `leak` mit `{at, from}`.
- `the solution is a hit, and so is a straight turned half way` — `judge` mit `params.solution` → `qualifies`, `deviation == 0.0`, `outcome.correct`, `wet.size == size²`; dasselbe mit einem `STRAIGHT` um `+2`.
- `the start is a miss, and the outcome says where it stopped` — `judge` mit `params.start` → nicht `qualifies`, `outcome.correct == false`.
- `the stored guess is the validated rotations and nothing else` — `{"rotations":[…], "note":"hi"}` → gespeichert nur `{"rotations"}`.
- `a malformed guess is refused before anything is written` — je `InvalidGuessException`: `{}`, `{"rotations":"0"}`, Länge `size² − 1` und `size² + 1`, ein Wert `-1`, `4`, `1.5`, `"1"`, `9999999999`, `null`.
- `it is always available`.

`LabServiceTest.aValidGuessFor`, vor dem `else`:

```kotlin
        // Seed 42 → labDifficulty 0.9 → an 8×8 board.
        "turn-pipes" -> mapper.readTree("""{"rotations":[${List(64) { 0 }.joinToString(",")}]}""")
```

`SongSnippetBootTest`: `"turn-pipes"` ans Ende der Liste, Testname „all ten real games“.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='TurnPipesGameTypeTest'`
Expected: Kompilierfehler — `TurnPipesGameType` unbekannt.

- [ ] **Step 3: Den Adapter schreiben**

`draw`: `size = sizeFor(context.difficulty)`, `board = TurnPipesGenerator.generate(random = random.presentation, size = size)`, `start = TurnPipesGenerator.scramble(random = random.presentation, board = board)`, `timed = context.phase == Phase.TWO`. `requiresReveal = scoresOnDuration = params.timed`. `scene`, `present`, `solution` aus den Params. `judge`: `rotations` muss ein Array mit genau `size²` Elementen sein, jedes ganzzahlig, `canConvertToInt()` (wie `FindPatternGameType.judge`) und in `0..3` — sonst `InvalidGuessException` mit Feld und Wert; dann `PipeFlow.trace`, `qualifies = flow.reached && flow.wet.size == size²`, `deviation = 0.0`, `guess = mapper.valueToTree(mapOf("rotations" to rotations))`. KDoc auf der Klasse: Verrohrung als ankündbares Spiel, `turnpipes` weiß nichts davon; alles aus `presentation`, weil die Lösung ab dem Aufdecken aus dem Brett folgt; die Integritätsdecke in einem Satz.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS — darunter `TurnPipesGameTypeTest`, `LabServiceTest` (Schleife über alle Spiele), `LabPointsParityTest`, `SongSnippetBootTest`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/TurnPipesGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/TurnPipesGameTypeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt
git commit -F - <<'EOF'
Announce Verrohrung as a round game

A 6x6 to 8x8 board, sized by the round's difficulty, whose pipes must
be turned until the water runs through every one of them. Phase one
pays every solved board, phase two needs the one reveal and pays the
fastest - requiresReveal = scoresOnDuration = timed.

Everything comes from the presentation stream: the solution follows
from the board anyway. The outcome tells where the water ran and where
it leaked, for the reveal to replay.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Ein Stummschalter für alle Spiele

**Files:**
- Create: `webapp-vue/src/ui/useGameSound.ts`, `webapp-vue/src/ui/SoundToggle.vue`
- Test: `webapp-vue/src/ui/__tests__/SoundToggle.spec.ts`
- Modify: `webapp-vue/src/games/copyblocks/CopyBlocksBoard.vue`, `webapp-vue/src/games/copyblocks/__tests__/CopyBlocksBoard.spec.ts`

**Interfaces:**
- Produces: `export const GAME_SOUND_KEY = 'games:sound'`; `export function useGameSound(): Ref<boolean>` (`useLocalStorage(GAME_SOUND_KEY, true)`); `SoundToggle.vue` — ein `<button type="button" aria-label="Ton" :aria-pressed="…">` mit `IconVolume`/`IconMuted` (`~icons/lucide/volume-2`, `~icons/lucide/volume-x`), schaltet `useGameSound()`; Stil kommt über das Klassen-Attribut.

- [ ] **Step 1: Die fallenden Tests schreiben**

`SoundToggle.spec.ts`:
- `starts on and says so` — `aria-pressed="true"` ohne gespeicherten Wert.
- `a click mutes and is remembered for every game` — nach Klick `aria-pressed="false"` und `localStorage.getItem('games:sound') === 'false'`.
- `two toggles show the same setting` — zwei gemountete Instanzen, Klick auf eine → beide `false`.

`CopyBlocksBoard.spec.ts`: die Erwartung auf `'copy-blocks:sound'` (Zeile ~300) wird `'games:sound'`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- SoundToggle CopyBlocksBoard`
Expected: FAIL — `SoundToggle.vue` fehlt; Blockierung schreibt noch den alten Schlüssel.

- [ ] **Step 3: Schreiben und umstellen**

In `CopyBlocksBoard.vue` wird `useLocalStorage('copy-blocks:sound', true)` zu `useGameSound()` und der Ton-Knopf zu `<SoundToggle :class="TOOL_BUTTON" />`.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/useGameSound.ts webapp-vue/src/ui/SoundToggle.vue webapp-vue/src/ui/__tests__/SoundToggle.spec.ts webapp-vue/src/games/copyblocks/CopyBlocksBoard.vue webapp-vue/src/games/copyblocks/__tests__/CopyBlocksBoard.spec.ts
git commit -F - <<'EOF'
Share one sound switch across games

Verrohrung brings the second game with sound. Whoever mutes one wants
silence in all, so Blockierung's switch becomes a shared component
with one setting per device. Its old key is dropped; there are no
users yet to lose it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Frontend rein — Typen, Drehungen, Kacheln, Zwischenstand, Rangliste

**Files:**
- Create in `webapp-vue/src/games/turnpipes/`: `types.ts`, `turns.ts`, `tiles.ts`, `tiles/{plate,straight-dry,straight-wet,elbow-dry,elbow-wet,inlet,outlet-dry,outlet-wet}.png`, `draft.ts`, `scoreboard.ts`
- Test: `__tests__/types.spec.ts`, `__tests__/turns.spec.ts`, `__tests__/tiles.spec.ts`, `__tests__/draft.spec.ts`, `__tests__/scoreboard.spec.ts`

**Interfaces:**
- Consumes: der Wire-Vertrag aus Task 3; `games/drafts.ts`, `games/ranking.ts` (`rankByClock`), `games/scoreboardColumns.ts` (`rowHead`, `ScoreboardRow`).
- Produces:
  - `types.ts`: `type PipeKindCode = 'STRAIGHT' | 'ELBOW' | 'INLET' | 'OUTLET'`; `MIN_SIZE = 6`, `MAX_SIZE = 8`; Interfaces `TurnPipesScene { size }`, `TurnPipesPayload { size; kinds: PipeKindCode[]; start: number[] }`, `TurnPipesSolution { rotations: number[]; path: number[] }`, `Leak { at: number | null; from: number }`, `TurnPipesOutcome { correct: boolean; wet: number[]; leak: Leak | null }`, `TurnPipesGuess { rotations: number[] }`; je `asTurnPipesScene|Payload|Solution|Outcome|Guess(raw: unknown): T | null`.
  - `turns.ts`: `rotationOf(turns: number): number`; `turnTo(turns: number, target: number, kind: PipeKindCode): number`; `rotationsOf(turns: readonly number[]): number[]`.
  - `tiles.ts`: `PLATE_URL: string`; `tileUrl(kind: PipeKindCode, wet: boolean): string`.
  - `draft.ts`: `draftKey({ userId, payload, timed }): string` → `turn-pipes:draft:<userId>:<1|2>:<fingerprint(JSON.stringify([size, kinds, start]))>`; `loadDraft(storage, key, size): number[] | null`; `saveDraft(storage, key, rotations, now?)` → `{ v: 1, at, rotations }`; `sweepDrafts(storage, keep, now?)`; Re-Export `clearDraft`, `deviceStorage`.
  - `scoreboard.ts`: `interface ScoreRow extends ScoreboardRow { correct: boolean; durationLabel: string | null; outcome: TurnPipesOutcome | null; rotations: number[] | null }`; `scoreRows({ entries, awardRule, mineUserId, size: number | null }): ScoreRow[]`.

- [ ] **Step 1: Die Kacheln erzeugen**

Einmalig, aus dem Zeichencode des Spikes (Spec *Bilder*). Das Skript wird nicht committet:

```bash
mkdir -p /tmp/turnpipes-tiles webapp-vue/src/games/turnpipes/tiles
git show bd13ed45:webapp-vue/src/spike/pipes/art.ts > /tmp/turnpipes-tiles/art.ts
```

`/tmp/turnpipes-tiles/export.mts`:

```ts
// Paints the spike's tiles into 32×32 RGBA PNGs. Node 24: zlib.crc32 is built in.
import { crc32, deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [artPath, outDir] = process.argv.slice(2) as [string, string]
const painted = readFileSync(artPath, 'utf8').replace(
  /function render\(paint: Painter\): string \{[\s\S]*?\n\}\n/,
  'function render(paint: Painter): any {\n  return paint\n}\n',
)
const tmp = `${artPath}.painters.mts`
writeFileSync(tmp, painted.replace(/^import .*$/m, ''))
const { art } = await import(pathToFileURL(tmp).href)

function png(paint: (x: number, y: number) => string | null): Buffer {
  const S = 32
  const row = 1 + S * 4
  const raw = Buffer.alloc(S * row)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = paint(x, y)
      if (c === null) continue
      const o = y * row + 1 + x * 4
      raw.set([1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255), o)
    }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const a = art()
const files = {
  'plate.png': a.plate,
  'straight-dry.png': a.pipe.straight.dry,
  'straight-wet.png': a.pipe.straight.wet,
  'elbow-dry.png': a.pipe.elbow.dry,
  'elbow-wet.png': a.pipe.elbow.wet,
  'inlet.png': a.pipe.inlet.wet,
  'outlet-dry.png': a.pipe.outlet.dry,
  'outlet-wet.png': a.pipe.outlet.wet,
}
for (const [name, paint] of Object.entries(files)) writeFileSync(`${outDir}/${name}`, png(paint))
```

Run: `node --experimental-strip-types --no-warnings /tmp/turnpipes-tiles/export.mts /tmp/turnpipes-tiles/art.ts webapp-vue/src/games/turnpipes/tiles && file webapp-vue/src/games/turnpipes/tiles/*.png`
Expected: acht Dateien `PNG image data, 32 x 32, 8-bit/color RGBA`. Einmal ansehen: das Rohr in `elbow-dry.png` biegt von oben nach rechts.

- [ ] **Step 2: Die fallenden Tests schreiben**

- `types.spec.ts`: ein gültiges Payload kommt durch; fällt raus: `size` 5 oder 9, `kinds` falscher Länge, unbekannter Code, zwei `INLET`, `start` mit `4`/`NaN`/falscher Länge. Outcome: `leak: null` und `leak: { at: null, from: 3 }` kommen durch; `wet` mit `-1` oder `1.5` fällt raus. Guess und Lösung ebenso (ganze Zahlen; Länge prüft der Aufrufer).
- `turns.spec.ts`: `rotationOf(5) == 1`, `rotationOf(-1) == 3`; `turnTo(5, 0, 'ELBOW') == 8` (nur vorwärts); `turnTo(5, 1, 'ELBOW') == 5`; `turnTo(5, 3, 'STRAIGHT') == 5` und `turnTo(6, 0, 'STRAIGHT') == 6` (schon gleichwertig); `turnTo(4, 3, 'STRAIGHT') == 5` (die nähere der zwei); `rotationsOf([4, 7]) == [0, 3]`.
- `tiles.spec.ts`: `tileUrl` liefert für jede Art × nass/trocken eine URL; `tileUrl('INLET', false) === tileUrl('INLET', true)`.
- `draft.spec.ts` (Bauform von `copyblocks/__tests__/draft.spec.ts`): Schlüssel trägt Spieler, Phase, Fingerabdruck; gespeichert → geladen; verworfen und entfernt: falsche Länge, Wert `4`, kaputtes JSON, `v: 2`; `null`-Speicher und ein werfender Speicher → `null` bzw. kein Fehler; `sweepDrafts` räumt eigene Einträge älter als zwei Tage, lässt jüngere und fremde stehen.
- `scoreboard.spec.ts`: Sortierung wie bei Blockierung (Punkte absteigend, `null` zuletzt, richtig vor falsch, Dauer aufsteigend, `userId`); `durationLabel` nur bei `CLOSEST_ONLY`; `rotations` aus `entry.guess`, `null` bei falscher Länge; `outcome` `null`, wenn unlesbar.

- [ ] **Step 3: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- turnpipes`
Expected: FAIL — Module fehlen.

- [ ] **Step 4: Die Module schreiben**

`tiles.ts` importiert die PNGs als URLs (`import plateUrl from './tiles/plate.png'`). `draft.ts` folgt `copyblocks/draft.ts`, Präfix `turn-pipes:draft:`. `scoreboard.ts` folgt `copyblocks/scoreboard.ts` ohne K/D.

- [ ] **Step 5: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/turnpipes
git commit -F - <<'EOF'
Add Verrohrung's pure frontend pieces

Narrowing for every exit, quarter turns that always run clockwise, the
eight pixel tiles exported once from the spike's painter, the draft of
rotations per player, round and phase, and the scoreboard rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Frontend — Klänge

**Files:**
- Create: `webapp-vue/src/games/turnpipes/sounds.ts`, `webapp-vue/src/games/turnpipes/sounds/{turn,flow,leak,success,dry}.mp3`, `webapp-vue/src/games/turnpipes/sounds/CREDITS.md`
- Test: `webapp-vue/src/games/turnpipes/__tests__/sounds.spec.ts`

**Interfaces:**
- Consumes: `audioGraph`, `START_LOOKAHEAD_SECONDS` aus `ui/audio.ts`; `Leak` (Task 5).
- Produces: `type SoundName = 'turn' | 'flow' | 'leak' | 'success' | 'dry'`; `interface Playing { stop(fadeS?: number): void }`; `preloadSounds(): void`; `playSound(name: SoundName): Playing`; `startFlow(): Playing`; `endSoundOf(run: { leak: Leak | null; correct: boolean }): 'leak' | 'success' | 'dry'`.

- [ ] **Step 1: Die Dateien holen**

```bash
cd webapp-vue/src/games/turnpipes && mkdir -p sounds
for pair in turn:drehen-323374 flow:fliessen-571551 leak:leck-186748 success:erfolg-271668 dry:trocken-244983; do
  git show "bd13ed45:webapp-vue/src/spike/pipes/sounds/${pair#*:}.mp3" > "sounds/${pair%%:*}.mp3"
done
file sounds/*.mp3
```

Expected: fünf `MPEG ADTS, layer III`. `sounds/CREDITS.md`: die fünf Zeilen der Spec-Tabelle (*Ton*) mit Datei, Aufnahme, Autor, Quelle `https://freesound.org/s/<id>/`, `CC0 1.0`, dazu der Satz „HQ-Vorschau von freesound.org, unverändert“.

- [ ] **Step 2: Die fallenden Tests schreiben**

- `the end sound follows the run` — `endSoundOf({ leak: { at: 3, from: 2 }, correct: false }) == 'leak'`, `{ leak: null, correct: true } → 'success'`, `{ leak: null, correct: false } → 'dry'`.
- `without Web Audio nothing plays and nothing throws` — `AudioContext` per `vi.stubGlobal` auf `undefined`; `preloadSounds()`, `playSound('turn').stop()`, `startFlow().stop(0.3)` werfen nicht.
- `a turn varies its pitch by at most five per cent, at 0.6` — mit einem `AudioContext`-Double (Bauform von `copyblocks/__tests__/sounds.spec.ts`): `playbackRate.value` in `[0.95, 1.05]`, Gain `0.6`; `startFlow` setzt `loop = true` und Gain `0.5`.

- [ ] **Step 3: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- turnpipes/__tests__/sounds`
Expected: FAIL — `sounds.ts` fehlt.

- [ ] **Step 4: `sounds.ts` schreiben**

Übertragung von `bd13ed45:webapp-vue/src/spike/pipes/sounds.ts` ohne Kandidaten: je Name eine Datei (`import turnUrl from './sounds/turn.mp3'`), `claimPlayback()` vor jedem Abspielen, Werte aus *Global Constraints*. `playSound('success')` blendet selbst nach 2,5 s aus. Ob der Ton an ist, prüft der Aufrufer (`useGameSound`).

- [ ] **Step 5: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/turnpipes/sounds.ts webapp-vue/src/games/turnpipes/sounds webapp-vue/src/games/turnpipes/__tests__/sounds.spec.ts
git commit -F - <<'EOF'
Add Verrohrung's sounds

Five CC0 recordings from Freesound, picked by ear in the spike: a
click per turn, running water while it flows, then a splash, a jet or
a dull hit - leak, success or dry pipes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Frontend — Raster, Erklärung, Brett

**Files:**
- Create in `webapp-vue/src/games/turnpipes/`: `PipeGrid.vue`, `TurnPipesRules.vue`, `TurnPipesBriefing.vue`, `TurnPipesBoard.vue`
- Test: `__tests__/PipeGrid.spec.ts`, `__tests__/TurnPipesBoard.spec.ts`

**Interfaces:**
- Consumes: Task 4, 5, 6; `HoldButton`, `HoldLock`, `RevealCover`, `useHoldLock`, `useFieldTouch`, `readableTextColor`, `prefersReducedMotion` (`ui/motion`), `InfoBox`, `AwardBox`.
- Produces:
  - `PipeGrid.vue` — Props `{ size: number; kinds: readonly PipeKindCode[] | null; turns: readonly number[]; wet: ReadonlySet<number>; leakCell: number | null; interactive: boolean }`, Emit `tap: [cell: number]`. `kinds === null`: nur Platten (unter der Hülle). Je Zelle ein `<button>` (`aria-label="Kachel {n}"`) mit Platte und Rohr als `<img draggable="false">`, `pointer-events: none`, `-webkit-user-drag: none`, `-webkit-touch-callout: none`, `image-rendering: pixelated`; Rohr mit `transform: rotate(turns × 90deg)`, Übergang 150 ms (ohne bei reduzierter Bewegung); roter Ring um `leakCell`; Raster mit `touch-action: manipulation`.
  - `TurnPipesBoard.vue` — Props `{ payload: TurnPipesPayload | null; scene: TurnPipesScene | null; sealed: boolean; disabled: boolean; draftKey: string | null; awardRule: AwardRule | null; awardPoints: number | null; myColorHex: string }`; Emits `guess: [value: TurnPipesGuess]`, `reveal: []`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`PipeGrid.spec.ts`:
- `one button per cell, the pipe turned by its turns` — `size: 6` → 36 Knöpfe; Zelle mit `turns 5` hat `rotate(450deg)`.
- `the images neither drag nor take the tap` — jedes `img` hat `draggable="false"` und die Klasse für `pointer-events: none`.
- `a tap emits its cell only when interactive`.
- `wet cells show the wet tile; the leak cell wears the ring`.
- `sealed shows plates only` — `kinds: null` → keine Rohrbilder.

`TurnPipesBoard.spec.ts`:
- `a tap turns that tile a quarter, and three quick taps are three quarters` — Stellung danach `3`.
- `a tap clicks when sound is on, and is silent when muted` — `playSound` per `vi.mock('../sounds')`.
- `holding submits every rotation` — `HoldButton` `confirm` → `guess` mit `{ rotations }` der Länge `size²`, in `0..3`.
- `a finger on the board keeps the hold off and turns nothing while it locks` — `useFieldTouch`-Verhalten wie bei Blockierung (`pointerdown` auf dem Raster → `HoldButton` `disabled`; Tipp auf gesperrtem Raster dreht nicht).
- `the draft is restored, saved after a tap, and a broken one falls back to the start`.
- `sealed shows the cover over size² empty plates` — Bühne `{ size: 7 }` → 49 Platten, `RevealCover` da, `reveal` beim Start.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- turnpipes`
Expected: FAIL — Komponenten fehlen.

- [ ] **Step 3: Die Komponenten schreiben**

`TurnPipesBoard` nach dem Muster von `CopyBlocksBoard`: äußere Box `-mx-4 -mt-4 -mb-4 pb-4` (kartenbreit, randlos); Größe `payload?.size ?? scene?.size ?? MIN_SIZE`; `RevealCover v-if="!round"`; `turns` aus Zwischenstand oder `start`; `sweepDrafts`/`loadDraft` beim Erscheinen, `saveDraft` nach jedem Tipp; darunter `HoldButton` (rund, `size-20`, Spielerfarbe, Aufschrift über `readableTextColor`) und rechts daneben `SoundToggle`; `preloadSounds` beim Mount; darunter `TurnPipesBriefing`. Texte aus *Global Constraints*.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/turnpipes
git commit -F - <<'EOF'
Add Verrohrung's board

Card-wide on a phone so an 8x8 board keeps tiles above 44 px. Plates
stand still, pipes turn a quarter clockwise per tap; images neither
drag nor open a callout, so grabbing a tile turns it. A hold submits,
the draft survives a reload, and the cover hides the board's plates
in phase two.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Frontend — Auflösung und Rangliste

**Files:**
- Create in `webapp-vue/src/games/turnpipes/`: `reveal.ts`, `water.ts`, `TurnPipesScoreboard.vue`, `TurnPipesReveal.vue`
- Test: `__tests__/reveal.spec.ts`, `__tests__/water.spec.ts`, `__tests__/TurnPipesReveal.spec.ts`

**Interfaces:**
- Consumes: Task 5–7; `RevealScoreboard`, `isStill`, `SOLUTION_DELAY_MS` (`games/revealChoreography.ts`), `useRevealArming`.
- Produces:
  - `reveal.ts`: `interface ShownBoard { rotations: number[]; wet: number[]; leak: Leak | null; endSound: 'leak' | 'success' | 'dry' }`; `shownBoard(input: { selectedUserId: string | null; mineUserId: string | null; myRotations: number[] | null; myOutcome: TurnPipesOutcome | null; rows: readonly ScoreRow[]; solution: TurnPipesSolution | null }): ShownBoard | null`.
  - `water.ts`: `WATER_STEP_MS = 110`; `useWaterRun(): { wet: Readonly<Ref<ReadonlySet<number>>>; run(cells: readonly number[], onEnd: () => void): void; fill(cells: readonly number[]): void; stop(): void }`.
  - `TurnPipesScoreboard.vue` — wie `CopyBlocksScoreboard` ohne Spalte und Legende: Props `{ rows; live; animate; selectedUserId }`, Emit `select: [userId]`.
  - `TurnPipesReveal.vue` — Props `{ payload: TurnPipesPayload; solution: TurnPipesSolution | null; rows: ScoreRow[]; mineUserId: string | null; myRotations: number[] | null; myOutcome: TurnPipesOutcome | null; live: boolean; animate: boolean }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`reveal.spec.ts`:
- `my own tip shows my rotations and my water` — gewählt = ich → `rotations = myRotations`, `wet = myOutcome.wet`, `leak = myOutcome.leak`, `endSound` aus `endSoundOf`.
- `another name shows that tip` — aus der Zeile.
- `nobody selected shows the solution, wet along its path` — `wet = solution.path`, `leak = null`, `endSound = 'success'`.
- `an unreadable tip shows the solution` — Zeile mit `rotations: null` → wie „nobody selected“.
- `without a solution an unreadable tip shows nothing` → `null`.

`water.spec.ts` (`vi.useFakeTimers()`): `run([0, 1, 2], onEnd)` macht alle 110 ms eine Zelle nass, `onEnd` nach der letzten; `stop()` hält an; `fill` setzt alles sofort.

`TurnPipesReveal.spec.ts`:
- `the water runs after SOLUTION_DELAY_MS along my wet cells, then the ring sits at the leak`.
- `a reload shows the end at once — no run, no sound` — `animate: false`: sofort nass, Ring da, `startFlow`/`playSound` nie aufgerufen.
- `the run sounds: flow while it runs, then the end sound` — `vi.mock('../sounds')`; stumm → nichts.
- `tapping another name turns the grid to that tip; the same name again shows the solution`.
- `an unreadable name can be tapped without error and shows the solution`.
- `without a tip of my own the solution stands and nobody is selected`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- turnpipes`
Expected: FAIL.

- [ ] **Step 3: Schreiben**

`TurnPipesReveal`: Auswahl wie `CopyBlocksReveal` (eigener Tipp vorausgewählt, gleicher Name hebt auf). Bei jedem Wechsel von `shownBoard`: Stellungen mit `turnTo` auf die neuen drehen, nach 150 ms das Wasser laufen lassen (`useWaterRun`) mit `startFlow`, am Ende `stop(0.3)` und `playSound(endSound)`, dann den Ring um `leak.at ?? leak.from` setzen. Beim ersten Bild wartet der Lauf `SOLUTION_DELAY_MS` (`useRevealArming`); bei `isStill(animate)` gleich das Endbild (`fill`). Darüber rechts `SoundToggle`, darunter `TurnPipesScoreboard`.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/turnpipes
git commit -F - <<'EOF'
Add Verrohrung's reveal and scoreboard

The submitted board stays; the water runs from the inlet, sounds, and
stops at the leak. A name in the table turns the grid to that tip and
replays its water; letting go shows the solution filling every pipe.
A reload lands on the finished picture without replaying it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Spiel, Registrierung, Labor, Doku, Handprobe

**Files:**
- Create: `webapp-vue/src/games/turnpipes/TurnPipesGame.vue`
- Test: `webapp-vue/src/games/turnpipes/__tests__/TurnPipesGame.spec.ts`
- Modify: `webapp-vue/src/games/registry.ts`, `webapp-vue/src/gamelab/games.ts`, `.claude/guidelines/frontend-state.md`, `docs/superpowers/specs/2026-10-16-blockierung-design.md`

**Interfaces:**
- Consumes: alles aus Task 5–8; `GameProps`, `GameEmits`, `useAuth`, `useMyColorHex`, `useRevealedLive`.
- Produces: `'turn-pipes': TurnPipesGame` in `gameComponents` (synchron, keine schwere Abhängigkeit); `{ id: 'turn-pipes', title: 'Verrohrung' }` am Ende von `labGameList`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`TurnPipesGame.spec.ts` (Bauform von `copyblocks/__tests__/CopyBlocksGame.spec.ts`):
- `an unreadable payload says so` — Text `Diese Runde lässt sich hier nicht anzeigen.`
- `sealed shows the board with the scene's size`.
- `a guess of mine shows the reveal and clears my draft`.
- `the board's guess is passed up`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- TurnPipesGame`
Expected: FAIL.

- [ ] **Step 3: Schreiben und eintragen**

`TurnPipesGame.vue` nach `CopyBlocksGame.vue`: engt `payload`, `scene` (nur wenn `sealed`), `myGuess`, `outcome`, `solution` ein; `done = closed || myGuess !== null`; Zeilen über `scoreRows` mit `size`; Zwischenstand-Schlüssel und Löschen wie dort; `live = awardRule === 'CLOSEST_ONLY'`. Dazu Registry und `labGameList`.

Doku: in `.claude/guidelines/frontend-state.md` beim Audio-Abschnitt eine Zeile — „Ton an/aus ist **ein** Schalter für alle Spiele: `useGameSound()` und `SoundToggle` aus `ui/`; kein Spiel speichert ihn selbst.“ In der Blockierung-Spec (*Ton*) den Satz zum Merken des Schalters ergänzen: „… seit Verrohrung ein gemeinsamer Schalter für alle Spiele (`ui/useGameSound.ts`).“

- [ ] **Step 4: Alles laufen lassen**

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

Expected: PASS, Lint ohne `warning`.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/turnpipes webapp-vue/src/games/registry.ts webapp-vue/src/gamelab/games.ts .claude/guidelines/frontend-state.md docs/superpowers/specs/2026-10-16-blockierung-design.md
git commit -F - <<'EOF'
Wire Verrohrung into rounds and the lab

The game component picks the card - cover, board or reveal - and is
registered for real rounds and the lab. The sound switch shared since
Blockierung is written down as the rule for every game.

Closes #143

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Handprobe im Labor**

Backend und Frontend aus diesem Worktree starten (`.claude/launch.json`, Konfigurationen `backend` und `frontend`), am Handy über die LAN-IP `/c/<slug>/lab/turn-pipes` öffnen. Prüfen und dem Menschen berichten, was davon nur er am Gerät beurteilen kann:
- Seeds mit Schwierigkeit 0,0–0,3 / 0,4–0,6 / 0,7–1,0 zeigen 6×6 / 7×7 / 8×8; bei 8×8 sind die Kacheln am Handy ≥ 44 px.
- Phase eins: Brett sofort da. Phase zwei: Hülle, Halten zählt ein, Uhr im Band.
- Tippen dreht ohne Ziehen, langes Drücken öffnet kein Menü.
- Auflösung: Wasser läuft, Ring am Leck, Klänge; Namen und Abwählen; Neuladen zeigt das Endbild.
- Ton aus in Verrohrung ist auch in Blockierung aus.
