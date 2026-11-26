# Hochstapler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Hochstapler“ (`stack-floor`) als dreizehntes Rundenspiel: gleitende Balken anhalten, Überstand fällt weg, Phase eins verlangt N Stockwerke, Phase zwei zahlt den höchsten Turm.

**Architecture:** Ein neues Modulith-Modul `stackfloor` (reine Logik, kein Schema) trägt die ganzzahlige Turm-Funktion; der Adapter `StackFloorGameType` in `game.internal` trägt Params, Ausgänge, Schwierigkeit → N, Validierung und Markierungen. Das Frontend spiegelt die Turm-Funktion bit-genau (`games/stackfloor/tower.ts`), beide Seiten prüfen gegen `shared/stack-floor/tower.json`. Start, Neuladen und Zeit-Untergrenze wie Entstauber.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher · Jackson 3 · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-11-26-hochstapler-design.md`](../specs/2026-11-26-hochstapler-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Vorbilder:** Entstauber (`DedusterGameType.kt`, `games/deduster/`: Hülle in beiden Phasen, eigene Hülle nach Neuladen, `restarted`, Zeit-Untergrenze, erneutes Senden) und Verrohrung (Plan `docs/superpowers/plans/2026-11-18-verrohrung.md`: Bauform von Modul, Adapter, Rangliste, Auflösung mit antippbaren Namen). Parität wie Blockierungs `Fit` (`shared/copy-blocks/fit.json`, `FitGoldenVectorTest`, `copyblocks/__tests__/fit.spec.ts`).

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden):

1. **Geometrie (vorläufig, in den Params eingefroren):** Feldbreite `1000`, Startbreite `660`, Geschwindigkeit `1/2` Einheit je ms (`speedNum = 1`, `speedDen = 2`), Pause zwischen Stockwerken `300 ms`, `maxFloors = 999`, eine Klickzeit höchstens `3_600_000 ms`.
2. **Fundament** mittig: `left = (fieldWidth − startWidth) / 2`.
3. **Startlagen fest:** Stockwerk `k` (= Zahl der schon liegenden Balken über dem Fundament, ab `0`) beginnt bei geradem `k` links und gleitet nach rechts, bei ungeradem rechts und gleitet nach links. Nichts gezogen.
4. **Lage:** `S = fieldWidth − width`, `d = floor(ms × speedNum / speedDen)`, `m = d mod 2S`, `p = m ≤ S ? m : 2S − m`, `x = links ? p : S − p`.
5. **Schnitt:** Überlappung `[max(l₀, x), min(l₀ + w₀, x + w))`; Breite `≤ 0` ist der Fehlgriff — Berühren an der Kante zählt nicht.
6. **N:** `6 + floor(difficulty × 10) + presentation.nextIntBetween(-2, 2)` → `4..18`, nur Phase eins; Phase zwei `target = null`.
7. **Farbe:** `hueStart` aus `random.scene` (`nextInt(360)`), damit das Fundament unter der Hülle schon seine Farbe hat. Balken `i` (Fundament `0`) hat Farbton `(hueStart + 12 × i) mod 360`, `oklch(70% 0.13 h)`, im Dunkeln `oklch(62% 0.13 h)`.
8. **Ziel-Balken:** Stockwerk `target` trägt Streifen (SVG-`<pattern>`, 45°, weiß 35 %) und eine weiße Kontur — Startpunkt fürs Labor.
9. **Ton:** ein Holzklopfen je Halt (`knocks`, Bauform `deduster/tileSound.ts`, `A5 = 880 Hz`), sonst nichts.
10. **Darstellung:** SVG, `viewBox` `1000 × 1333` (3:4), Balkenhöhe `60`; der Turm rollt, sodass der gleitende Balken im oberen Drittel bleibt. Abgeschnittenes fällt in `600 ms` um `800` Einheiten und blendet aus; bei reduzierter Bewegung verschwindet es sofort.
11. **Markierungen** als eine Liste `marks` (`RESTARTED`, `SUBMITTED_BEFORE_RUN_END`), ein Zeichen in der Rangliste wie Entstauber.
12. **Auflösung:** der Turm des gewählten Namens steht still als Endbild, ohne Wiederabspielen.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Ein neuer Commit je Task.** Branch: `feature/turme-bauen-game-fda6b9`. Nicht pushen.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (`.claude/guidelines/kotlin.md`).
- **Testing:** kotest-Matcher, mockk; Frontend Vitest + `vi`. **TDD:** erst der fallende Test.
- **Keine redundanten Inline-Kommentare.** Kommentare nur, wo sie beim Lesen dieser Zeile einen Fehler verhindern.
- **Namen:** Spiel-Id `stack-floor`, Anzeigename `Hochstapler`, Modul `stackfloor`, Klassen `StackFloor*`, Frontend `games/stackfloor/`.
- **Ströme:** `hueStart` aus `scene`, `target` aus `presentation`; `solution` unberührt.
- **Parität:** nur Ganzzahlen und die sicheren Operationen aus `.claude/guidelines/cross-runtime-parity.md`. Kotlin ist die Quelle; TS spiegelt im selben Commit und nennt sein Kotlin-Gegenstück im Kopfkommentar.
- **Ein Versuch.** Kein Wiederholen, keine Stufen, keine Schritte (`stages = 1`).
- **Wörtliche Texte:**
  - InfoBox-Kurztext: `Tipp, um den gleitenden Balken anzuhalten. Was übersteht, fällt weg.`
  - Regeln: `Tippen hält den Balken an.` · `Was über den Balken darunter hinausragt, wird abgeschnitten.` · `Ohne Kontakt zum Balken darunter ist dein Turm fertig.` · `Du hast genau einen Versuch.` — nur Phase eins zusätzlich: `Ein Balken sieht anders aus. Erreichst du ihn, hast du den Punkt.`
  - AwardBox: Phase eins `Erreiche den besonderen Balken.`, Phase zwei `Der höchste Turm nimmt alles. Bei gleicher Höhe bekommen alle die vollen Punkte.`
  - Neu geladen: `Neu geladen — dein Lauf wird markiert.`
  - Höhe: `1 Stockwerk` / `{n} Stockwerke`.
  - Markierung (Titel): `Markiert: neu geladen` · `Markiert: früher abgegeben, als der Lauf dauern kann`.
  - Ohne Darstellung: `Diese Runde lässt sich hier nicht anzeigen.` · Ranglisten-Caption: `Alle Türme der Runde, nach Punkten sortiert`.
  - Erneut senden (wie Entstauber): `Erneut senden`.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Vor `pnpm lint` die geänderten Dateien mit `pnpm exec prettier --write <Dateien>` formatieren; `pnpm lint` endet bei Prettier-Warnungen mit 0 — Ausgabe auf `warning` prüfen.
- **Nach Task 1 (neues Modul):** `./mvnw clean test` — die generierte `application-modules.json` ist sonst veraltet.

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Ein Tipp in der Pause nach einem Halt** (Doppeltipp, zitternder Finger) zählt nicht als Klick des nächsten Stockwerks. → Task 4.
2. **Ein Tab im Hintergrund** mitten im Lauf: die Lage folgt der Uhr, nicht den Frames — nach der Rückkehr steht der Balken dort, wo die Zeit ihn hinträgt; ein Klick danach zählt mit seiner wahren Zeit. → Task 4.
3. **Neuladen mitten im Lauf** legt die eigene Hülle mit dem Satz zum Markieren auf und sendet `restarted: true`; Neuladen nach der Abgabe zeigt die Auflösung, keine Hülle. → Task 5.
4. **Senden scheitert:** derselbe Tipp lässt sich erneut senden, ohne neuen Lauf. → Task 5.
5. **Ein unlesbarer fremder Tipp** in der Auflösung lässt sich antippen, ohne Fehler; das Brett sagt „Diese Runde lässt sich hier nicht anzeigen.“ statt eines Turms. → Task 6.

## File Structure

**Backend, neu:**

| Datei | Aufgabe |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/stackfloor/Tower.kt` | `TowerGeometry`, `Bar`, `TowerResult`, `Tower.position/place/build` |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/StackFloorGameType.kt` | der Adapter |
| `shared/stack-floor/tower.json` | Golden Vectors |

**Backend, geändert:** `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`), `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt` (Katalogliste), `shared/README.md`.

**Frontend, neu** unter `webapp-vue/src/games/stackfloor/`: `types.ts`, `tower.ts`, `colors.ts`, `scoreboard.ts`, `useStackRun.ts`, `stopSound.ts`, `TowerView.vue`, `StackFloorRules.vue`, `StackFloorBriefing.vue`, `StackFloorBoard.vue`, `StackFloorMark.vue`, `StackFloorScoreboard.vue`, `StackFloorReveal.vue`, `StackFloorGame.vue`, Tests unter `__tests__/`.

**Frontend, geändert:** `webapp-vue/src/games/registry.ts`. Die Labor-Liste kommt aus dem Server-Katalog, kein Eintrag nötig.

**Doku:** `.claude/guidelines/game-integrity.md`.

Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

---

### Task 1: `stackfloor` — die Turm-Funktion und ihre Vektoren

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/stackfloor/Tower.kt`, `shared/stack-floor/tower.json`
- Modify: `shared/README.md` (Tabellenzeile)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/stackfloor/TowerTest.kt`, `core/src/test/kotlin/org/unividuell/countdown/core/stackfloor/TowerGoldenVectorTest.kt`

**Interfaces:**
- Produces:
  - `data class TowerGeometry(val fieldWidth: Int, val startWidth: Int, val speedNum: Int, val speedDen: Int, val maxFloors: Int)`
  - `data class Bar(val left: Int, val width: Int)`
  - `data class TowerResult(val bars: List<Bar>, val missed: Boolean)` — `bars[0]` ist das Fundament; `val height get() = bars.size - 1`.
  - `object Tower { fun foundation(geometry): Bar; fun fromLeft(floor: Int): Boolean; fun position(geometry, floor: Int, width: Int, ms: Int): Int; fun place(below: Bar, x: Int, width: Int): Bar?; fun build(geometry, clicks: List<Int>): TowerResult }`
  - `build` verarbeitet Klicks, bis einer fehlgreift (`missed = true`) oder `maxFloors` Balken liegen; spätere Klicks ignoriert es — ob es welche gibt, prüft der Adapter.

- [ ] **Step 1: Die fallenden Tests schreiben**

`TowerTest`, Geometrie `G = TowerGeometry(fieldWidth = 1000, startWidth = 660, speedNum = 1, speedDen = 2, maxFloors = 999)`:

- `the foundation is centred` — `foundation(G) == Bar(170, 660)`.
- `even floors start left, odd floors start right` — `position(G, floor = 0, width = 660, ms = 0) == 0`; `position(G, floor = 1, width = 660, ms = 0) == 340`.
- `the bar bounces off the edges` — Breite 660, `S = 340`: `ms = 680 → 340`, `ms = 1000 → 180`, `ms = 1360 → 0`, `ms = 1361 → 0` (`d` abgerundet), `ms = 1362 → 1`.
- `the overhang is cut on either side` — `place(Bar(170, 660), x = 0, width = 660) == Bar(170, 490)`; `place(Bar(170, 660), x = 340, width = 660) == Bar(340, 490)`.
- `touching the edge is a miss` — `place(Bar(170, 660), x = 830, width = 100) == null`; `place(Bar(170, 660), x = 70, width = 100) == null`.
- `three clicks at zero build two floors and miss` — `build(G, listOf(0, 0, 0))`: `bars == [Bar(170,660), Bar(170,490), Bar(510,150)]`, `missed`, `height == 2`.
- `clicks after the miss are ignored` — `build(G, listOf(0, 0, 0, 5)) == build(G, listOf(0, 0, 0))`.
- `the tower stops at maxFloors` — `G.copy(maxFloors = 2)`, Klicks `[0, 0, 0]` → `height == 2`, `missed == false`.

`TowerGoldenVectorTest` (Bauform von `EditionGridGoldenVectorTest`): Fälle von Hand gewählt, Ausgaben gerechnet — mit `-Dstackfloor.vectors.write=true` schreibt der Test `shared/stack-floor/tower.json`, sonst prüft er sie:
- `version: 1`, `geometry` = `G`;
- `positions`: je `{ floor, width, ms, x }` für Böden `0, 1, 7`, Breiten `660, 1, 999`, `ms` `0, 1, 679, 680, 681, 1361, 3_600_000`;
- `places`: je `{ below: [left, width], x, width, bar: [left, width] | null }` — beide Schnittseiten, deckungsgleich, Kante links, Kante rechts, ganz daneben;
- `towers`: je `{ clicks, height, missed, bars: [[left, width], …] }` — `[0,0,0]`, zwanzig Klicks aus `nextIntBetween(0, 2000)` eines `SeededRandom.fromSeed(7)`, ein Turm bis `maxFloors` mit `G.copy(maxFloors = 5)`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='TowerTest,TowerGoldenVectorTest'`
Expected: Kompilierfehler — `Tower` unbekannt.

- [ ] **Step 3: `Tower.kt` schreiben**

Formeln aus *Entscheidungen* 2–5. `d` in `Long` rechnen (`ms.toLong() * speedNum / speedDen`), Ergebnis wieder `Int`. KDoc am Objekt: rein, ganzzahlig, gespiegelt in `webapp-vue/src/games/stackfloor/tower.ts`, Vektoren in `shared/stack-floor/tower.json`.

- [ ] **Step 4: Vektoren schreiben, dann prüfen**

Run: `cd core && ./mvnw test -Dtest=TowerGoldenVectorTest -Dstackfloor.vectors.write=true && ./mvnw clean test`
Expected: `shared/stack-floor/tower.json` existiert; alles PASS. Datei einmal ansehen: `[0,0,0]` ergibt `height 2`.

`shared/README.md`: Zeile `stack-floor/tower.json` | Hochstaplers Turm: Lage des gleitenden Balkens, Schnitt, ganzer Turm aus Klickzeiten | `TowerGoldenVectorTest` (`-Dstackfloor.vectors.write=true`) | dieselbe Kotlin-Klasse **und** `webapp-vue/src/games/stackfloor/__tests__/tower.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/stackfloor core/src/test/kotlin/org/unividuell/countdown/core/stackfloor shared/stack-floor shared/README.md
git commit -F - <<'EOF'
Add Hochstapler's tower function

Integer only: where the sliding bar is after a number of milliseconds,
what is left once its overhang is cut, and the whole tower from a list
of click times. The browser mirrors it to draw the tower live, so the
golden vectors pin both sides.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Der Adapter `StackFloorGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/StackFloorGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/StackFloorGameTypeTest.kt` (reiner Unit-Test wie `TurnPipesGameTypeTest`)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`), `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt`

**Interfaces:**
- Consumes: Task 1.
- Produces (Wire-Vertrag fürs Frontend): Game-Id `stack-floor`; Bühne `{ fieldWidth, startWidth, hueStart }`; Payload `{ fieldWidth, startWidth, speedNum, speedDen, pauseMs, maxFloors, hueStart, target: Int|null }`; Tipp `{ clicks: [Int], restarted: Boolean }` (`restarted` optional, Vorgabe `false`); Outcome `{ height, marks: ["RESTARTED" | "SUBMITTED_BEFORE_RUN_END"] }`; Lösung `null`.
- Kotlin: `data class StackFloorParams(val fieldWidth: Int, val startWidth: Int, val speedNum: Int, val speedDen: Int, val pauseMs: Int, val maxFloors: Int, val hueStart: Int, val target: Int?)` mit `fun geometry(): TowerGeometry`; `StackFloorScene : GameScene`; `StackFloorPayload : GamePayload`; `enum class StackFloorMark { RESTARTED, SUBMITTED_BEFORE_RUN_END }`; `StackFloorOutcome(height: Int, marks: List<StackFloorMark>) : GameOutcome`; `@Component class StackFloorGameType(private val mapper: ObjectMapper) : GameType<StackFloorParams>` mit `companion object { FIELD_WIDTH = 1000; START_WIDTH = 660; SPEED_NUM = 1; SPEED_DEN = 2; PAUSE_MS = 300; MAX_FLOORS = 999; MAX_CLICK_MS = 3_600_000; fun targetBase(difficulty: Double): Int }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`StackFloorGameTypeTest` — Gerüst (`random(…)`, `draw(phase, difficulty)`, `guess(json)`) wie `TurnPipesGameTypeTest`:

- `it is registered under a stable id and a German display name` — `"stack-floor"`, `"Hochstapler"`.
- `the target follows the difficulty, only in phase one` — `targetBase(0.0) == 6`, `targetBase(0.5) == 11`, `targetBase(1.0) == 16`; über 200 Seeds liegt `draw(ONE, d).target` in `targetBase(d) − 2 .. targetBase(d) + 2`; `draw(TWO, …).target == null`.
- `the hue comes from the scene stream, the target from the presentation stream` — `hueStart` gleich bei gleichem `scene`-Seed und verschiedenen anderen; `target` gleich bei gleichem `presentation`-Seed und verschiedenen anderen.
- `both phases need the one reveal and score no duration` — `requiresReveal == true`, `scoresOnDuration == false` in beiden Phasen; `stages == 1`.
- `every exit carries exactly its fields` — Bühne `{fieldWidth, startWidth, hueStart}`, Payload `{fieldWidth, startWidth, speedNum, speedDen, pauseMs, maxFloors, hueStart, target}`, Outcome `{height, marks}`, `solution == null`.
- `phase one qualifies from the target on` — Params mit `target = 2`: Klicks `[0,0,0]` → `qualifies`, `deviation == 0.0`, `outcome.height == 2`; mit `target = 3` → nicht `qualifies`.
- `phase two always qualifies, higher is smaller` — `target = null`: `[0,0,0]` → `qualifies`, `deviation == -2.0`.
- `the stored guess is the checked clicks and the restart flag` — `{"clicks":[0,0,0],"note":"x"}` → gespeichert `{"clicks":[0,0,0],"restarted":false}`.
- `a restart is marked, not refused` — `restarted: true` → `marks == [RESTARTED]`, Höhe unverändert.
- `a guess faster than its run is marked, not refused` — `[0,0,0]` mit `GuessContext(sinceRevealMs = 599, …)` → `marks` enthält `SUBMITTED_BEFORE_RUN_END` (frühestes Ende `0+0+0 + 2 × 300 = 600`); mit `600` nicht; mit `null` nicht.
- `a malformed guess is refused before anything is written` — je `InvalidGuessException`: `{}`, `{"clicks":[]}`, `{"clicks":"0"}`, ein Wert `-1`, `1.5`, `"1"`, `3600001`, `9999999999`, `null`; `restarted: "yes"`; Klicks nach dem Fehlgriff `[0,0,0,0]`; ein Lauf ohne Fehlgriff unter `maxFloors` `[0,0]`.
- `a run that reaches maxFloors needs no miss` — Params mit `maxFloors = 2`: `[0,0]` gültig, Höhe `2`.

`LabServiceTest.aValidGuessFor`, vor dem `else`:

```kotlin
        // Start left, start right, start left: two floors, then a miss — valid at every target.
        "stack-floor" -> mapper.readTree("""{"clicks":[0,0,0]}""")
```

`SongSnippetBootTest`: `"stack-floor"` alphabetisch einsortieren (nach `"spot-object"`), Testname „all thirteen real games“.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='StackFloorGameTypeTest'`
Expected: Kompilierfehler — `StackFloorGameType` unbekannt.

- [ ] **Step 3: Den Adapter schreiben**

`draw`: erst `hueStart = random.scene.nextInt(360)`, dann in Phase eins `target = targetBase(difficulty) + random.presentation.nextIntBetween(-2, 2)`; Konstanten in die Params. `judge(params, guess, context)` nach `DedusterGameType.judge`: Klicks prüfen (Array, nicht leer, jedes `isIntegralNumber && canConvertToInt()` in `0..MAX_CLICK_MS`, höchstens `maxFloors + 1`), `Tower.build`, dann Gültigkeit: ein Fehlgriff vor dem letzten Klick oder kein Fehlgriff unter `maxFloors` → `InvalidGuessException`. Untergrenze: `sum(clicks) + (clicks.size − 1) × pauseMs`, als `Long`. Markierungen in Deklarationsreihenfolge, `logger.warn` mit `context.playId ?: "lab"` wie Entstauber. `judge(params, guess)` delegiert mit `GuessContext(sinceRevealMs = null, playId = null)`. KDoc auf der Klasse: Hochstapler als ankündbares Spiel; der Server rechnet den Turm aus Klickzeiten nach; die Decke (perfekte Klickzeiten aus der Payload) in einem Satz.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS — darunter `StackFloorGameTypeTest`, `LabServiceTest`, `LabPointsParityTest`, `SongSnippetBootTest`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/StackFloorGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/StackFloorGameTypeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt
git commit -F - <<'EOF'
Announce Hochstapler as a round game

One run per round behind the reveal, in both phases: phase one pays
whoever reaches N floors, N from the round's difficulty; phase two
pays the highest tower, ties all win. The client sends click times,
never a height - the server rebuilds the tower from them.

A reload mid-run and a guess faster than its run are marked, never
refused.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Frontend rein — Typen, Turm-Spiegel, Farben, Rangliste

**Files:**
- Create in `webapp-vue/src/games/stackfloor/`: `types.ts`, `tower.ts`, `colors.ts`, `scoreboard.ts`
- Test: `__tests__/types.spec.ts`, `__tests__/tower.spec.ts`, `__tests__/colors.spec.ts`, `__tests__/scoreboard.spec.ts`

**Interfaces:**
- Consumes: der Wire-Vertrag aus Task 2; `shared/stack-floor/tower.json`; `games/scoreboardColumns.ts` (`rowHead`, `ScoreboardRow`).
- Produces:
  - `types.ts`: `type StackFloorMark = 'RESTARTED' | 'SUBMITTED_BEFORE_RUN_END'`; Interfaces `StackFloorScene { fieldWidth; startWidth; hueStart }`, `StackFloorPayload { fieldWidth; startWidth; speedNum; speedDen; pauseMs; maxFloors; hueStart; target: number | null }`, `StackFloorOutcome { height; marks: StackFloorMark[] }`, `StackFloorGuess { clicks: number[]; restarted: boolean }`; je `asStackFloorScene|Payload|Outcome|Guess(raw: unknown): T | null`; `geometryOf(payload): TowerGeometry`.
  - `tower.ts`: `interface TowerGeometry`, `interface Bar { left; width }`, `interface TowerResult { bars: Bar[]; missed: boolean }`, `foundation`, `fromLeft`, `position`, `place`, `buildTower(geometry, clicks): TowerResult` — gleiche Semantik wie Task 1; `d = Math.floor((ms * speedNum) / speedDen)` (Werte `< 2³¹`, exakt).
  - `colors.ts`: `HUE_STEP = 12`; `barHue(hueStart: number, index: number): number`; `barFill(hue: number, dark: boolean): string`.
  - `scoreboard.ts`: `interface ScoreRow extends ScoreboardRow { height: number | null; marks: StackFloorMark[]; clicks: number[] | null }`; `scoreRows({ entries, mineUserId }): ScoreRow[]`; `heightLabel(height: number): string`.

- [ ] **Step 1: Die fallenden Tests schreiben**

- `tower.spec.ts`: liest `shared/stack-floor/tower.json` (Pfad wie `copyblocks/__tests__/fit.spec.ts`) und prüft jede `position`, jedes `place`, jeden `tower` gegen die Datei; `version === 1`.
- `types.spec.ts`: ein gültiges Payload kommt durch, `target: null` auch; fällt raus: fehlendes Feld, `speedDen: 0`, `target: 1.5`, negative Breite. Outcome mit unbekannter Markierung fällt raus. Guess: `clicks` mit `-1` oder `1.5` fällt raus; fehlendes `restarted` liest sich als `false`.
- `colors.spec.ts`: `barHue(350, 2) == 14`; `barFill(14, false) == 'oklch(70% 0.13 14)'`, dunkel `62%`.
- `scoreboard.spec.ts`: Sortierung Punkte absteigend (`null` zuletzt), dann Höhe absteigend, dann `userId`; `clicks` aus `entry.guess`, `null` bei unlesbarem Tipp; `heightLabel(1) == '1 Stockwerk'`, `heightLabel(0) == '0 Stockwerke'`, `heightLabel(5) == '5 Stockwerke'`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- stackfloor`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Die Module schreiben**

`tower.ts` mit Kopfkommentar „Mirror of `core/…/stackfloor/Tower.kt` — change Kotlin first“. `scoreboard.ts` folgt `turnpipes/scoreboard.ts` ohne Dauer.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/stackfloor
git commit -F - <<'EOF'
Add Hochstapler's pure frontend pieces

Narrowing for every exit, the tower function mirrored from Kotlin and
checked against the shared vectors, a hue per bar stepping round the
colour wheel, and the scoreboard rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Der Lauf ohne Bildschirm, und sein Klopfen

**Files:**
- Create: `webapp-vue/src/games/stackfloor/useStackRun.ts`, `webapp-vue/src/games/stackfloor/stopSound.ts`
- Test: `webapp-vue/src/games/stackfloor/__tests__/useStackRun.spec.ts`, `webapp-vue/src/games/stackfloor/__tests__/stopSound.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`buildTower`, `position`, `place`, `foundation`, `fromLeft`); `RunClock`, `browserClock` aus `games/deduster/useDedusterRun.ts`.
- Produces:
  - `interface Cut { floor: number; left: number; width: number }` — ein abgeschnittenes Stück.
  - `useStackRun(input: { geometry: TowerGeometry; pauseMs: number; onEnd: (clicks: number[]) => void; clock?: RunClock })` → `{ bars: Readonly<Ref<Bar[]>>; cuts: Readonly<Ref<Cut[]>>; slider: Readonly<Ref<{ floor: number; width: number; x: number } | null>>; running; ended; start(at: number): void; tap(): 'placed' | 'missed' | 'ignored'; frame(): void }`.
  - `stopSound.ts`: `STOP_HZ = 880`; `playStop(): void`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`useStackRun.spec.ts` mit einer Fake-Uhr (`now` steuerbar, `schedule` sammelt):
- `the slider sits where the clock carries it` — `start(0)`, `now = 1000`, `frame()` → `slider.x == position(G, 0, 660, 1000)`.
- `a tap places the bar from its whole-millisecond time` — `now = 680.4` → `tap() == 'placed'`, Klick `680`, `bars[1]` wie `place`; `cuts` hält das Stück.
- `taps in the pause are ignored` — direkt nach einem Halt `tap() == 'ignored'` bis `pauseMs` vergangen; dann misst der nächste Klick ab Ende der Pause.
- `a background tab does not freeze the bar` — `start(0)`, kein `frame()` bis `now = 5000`, dann `tap()` → Klick `5000`.
- `the miss ends the run with every click` — Klicks `0, 0, 0` (je nach der Pause) → drittes `tap() == 'missed'`, `onEnd([0, 0, 0])`, `ended`, weitere Taps `'ignored'`.
- `maxFloors ends the run without a miss` — `geometry.maxFloors = 2` → nach dem zweiten Halt `onEnd`.

`stopSound.spec.ts`: ohne Web Audio wirft `playStop()` nicht (Bauform `deduster/__tests__/tileSound.spec.ts`).

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- stackfloor/__tests__/useStackRun stackfloor/__tests__/stopSound`
Expected: FAIL.

- [ ] **Step 3: Schreiben**

`useStackRun`: Stockwerk `k` beginnt bei `start`, danach je `haltZeit + pauseMs`; Klick = `Math.round(now − beginn)`. Die Lage des haltenden Balkens kommt aus `place(…, position(…, klick))`, nie aus `slider.x`. `frame()` setzt nur `slider` (der Aufrufer ruft es per `requestAnimationFrame`). `stopSound.ts` nach `deduster/tileSound.ts`.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/stackfloor
git commit -F - <<'EOF'
Add Hochstapler's run logic and stop knock

The run keeps its own clock: the sliding bar is wherever the time
since its floor began puts it, so a hidden tab does not freeze it and
a click counts with its true time. The resting bar comes from the
tower function, never from the animated pixel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Brett — Turm, Regeln, Hülle, Neuladen, Abgabe

**Files:**
- Create in `webapp-vue/src/games/stackfloor/`: `TowerView.vue`, `StackFloorRules.vue`, `StackFloorBriefing.vue`, `StackFloorBoard.vue`
- Test: `__tests__/TowerView.spec.ts`, `__tests__/StackFloorBoard.spec.ts`

**Interfaces:**
- Consumes: Task 3, 4; `RevealCover`, `useSoundStage`, `prefersReducedMotion`, `inBackground` (`ui/motion`), `useDarkScheme` (`ui/colorScheme.ts`), `InfoBox`, `AwardBox`.
- Produces:
  - `TowerView.vue` — Props `{ fieldWidth: number; hueStart: number; bars: readonly Bar[]; cuts: readonly Cut[]; slider: { floor; width; x } | null; target: number | null }`. SVG nach *Entscheidungen* 7, 8, 10; Hilfslinie mittig über dem obersten Balken; `aria-label` = `heightLabel(bars.length − 1)`.
  - `StackFloorBoard.vue` — Props `{ payload: StackFloorPayload | null; scene: StackFloorScene | null; sealed: boolean; disabled: boolean; submitted: boolean; awardRule: AwardRule | null; awardPoints: number | null }`; Emits `guess: [value: StackFloorGuess]`, `reveal: []`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`TowerView.spec.ts`:
- `one rect per bar, coloured round the wheel` — drei Balken → drei `rect` mit `fill` aus `barFill(barHue(…))`.
- `the target floor wears the stripes` — `target: 2` → Balken 2 hat das Muster, die anderen nicht; `target: null` → keiner.
- `the guide line stands on the top bar's centre` — `x1 == left + width / 2` des obersten Balkens.
- `cuts fall, or vanish under reduced motion` — mit `prefersReducedMotion` gemockt → kein Fall-Element.
- `a tall tower scrolls, the board keeps its size` — 40 Balken → `viewBox`-Höhe bleibt `1333`, der Versatz hält den Schieber im oberen Drittel.

`StackFloorBoard.spec.ts` (Bauform `deduster/__tests__/DedusterBoard.spec.ts`, Fake-Timer):
- `sealed shows the foundation under the cover; start emits reveal` — Bühne → ein Balken, `RevealCover` da.
- `a tap stops the bar with a knock, silent when muted` — `vi.mock('../stopSound')`.
- `the miss sends every click` — `guess` mit `{ clicks, restarted: false }`.
- `mounted with a payload and no guess, never sealed: own cover with the reload note, then restarted` — Text `Neu geladen — dein Lauf wird markiert.`, Abgabe trägt `restarted: true`.
- `mounted after the guess: no cover, no run`.
- `a failed send offers the same guess again` — `disabled` true → false ohne `submitted` → Knopf `Erneut senden` sendet denselben Tipp.
- `phase one shows the target line in the rules; phase two does not`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- stackfloor`
Expected: FAIL.

- [ ] **Step 3: Schreiben**

`StackFloorBoard` nach `DedusterBoard`: `sawSealed`/`restart`, `RevealCover` mit `timed = false` und `note` beim Neuladen, `useSoundStage()`, Senden/Erneut senden. Der Lauf beginnt mit dem vollen Ring bzw. mit dem Payload (das Spätere); `requestAnimationFrame` ruft `run.frame()`, `pointerdown` aufs ganze Brett ruft `run.tap()` und bei `'placed'`/`'missed'` `playStop()` (nicht im Hintergrund). Kartenbreit wie Verrohrung (`-mx-4`). Darunter `StackFloorBriefing` mit InfoBox, `StackFloorRules`, AwardBox; Texte aus *Global Constraints*.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/stackfloor
git commit -F - <<'EOF'
Add Hochstapler's board

Card-wide SVG tower: each bar a step further round the colour wheel,
the target floor striped in phase one, cut pieces falling away. The
cover starts the one run in both phases; a reload mid-run lays the
cover again and marks the run, as in Entstauber.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Auflösung, Rangliste, Spiel, Registrierung, Doku, Handprobe

**Files:**
- Create in `webapp-vue/src/games/stackfloor/`: `StackFloorMark.vue`, `StackFloorScoreboard.vue`, `StackFloorReveal.vue`, `StackFloorGame.vue`
- Test: `__tests__/StackFloorReveal.spec.ts`, `__tests__/StackFloorGame.spec.ts`
- Modify: `webapp-vue/src/games/registry.ts`, `.claude/guidelines/game-integrity.md`

**Interfaces:**
- Consumes: Task 3–5; `RevealScoreboard`, `useRevealArming`, `GameProps`, `GameEmits`.
- Produces:
  - `StackFloorScoreboard.vue` — Props `{ rows: ScoreRow[]; live: boolean; animate: boolean; selectedUserId: string | null }`, Emit `select: [userId]`; Spalte Höhe (`heightLabel`), Zeichen `StackFloorMark` bei `marks.length > 0`.
  - `StackFloorReveal.vue` — Props `{ payload: StackFloorPayload; rows: ScoreRow[]; mineUserId: string | null; live: boolean; animate: boolean }`.
  - `'stack-floor': StackFloorGame` in `gameComponents`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`StackFloorReveal.spec.ts`:
- `my tower stands first` — eigener Name vorausgewählt; `TowerView` zeigt `buildTower(geometryOf(payload), meineKlicks).bars`, ohne Schieber, ohne Schnitte.
- `tapping another name shows that tower, one at a time` — genau ein `TowerView`.
- `an unreadable tip can be tapped and says so` — Zeile mit `clicks: null` → Text `Diese Runde lässt sich hier nicht anzeigen.`, kein Fehler.
- `a marked row wears the mark` — Titel `Markiert: neu geladen`.

`StackFloorGame.spec.ts` (Bauform `turnpipes/__tests__/TurnPipesGame.spec.ts`):
- `an unreadable payload says so`.
- `sealed shows the board with the scene`.
- `a guess of mine shows the reveal`.
- `the board's guess is passed up`.

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test -- stackfloor`
Expected: FAIL.

- [ ] **Step 3: Schreiben und eintragen**

`StackFloorGame.vue` nach `DedusterGame.vue`/`TurnPipesGame.vue`: engt `payload`, `scene` (nur `sealed`), `myGuess`, `outcome` ein; `done = closed || myGuess !== null`; `live = awardRule === 'CLOSEST_ONLY'`. Registry-Eintrag synchron.

`.claude/guidelines/game-integrity.md`, nach *The ceiling, named — Entstauber* ein Abschnitt *The second ceiling — Hochstapler*: Klickzeiten statt Höhe, der Server rechnet den Turm über die geteilte Ganzzahl-Funktion nach; die Payload reicht, um perfekte Zeiten zu errechnen — ein Bot baut bis `maxFloors`; dagegen nur die Untergrenze `Σ clicks + (n − 1) × pauseMs`, Mark, never reject.

- [ ] **Step 4: Alles laufen lassen**

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

Expected: PASS, Lint ohne `warning`.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/stackfloor webapp-vue/src/games/registry.ts .claude/guidelines/game-integrity.md
git commit -F - <<'EOF'
Wire Hochstapler into rounds and the lab

The reveal rebuilds each tower from its click times; a name in the
table shows that tower, one at a time. The guidelines name Hochstapler
as the second ceiling next to Entstauber.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Handprobe im Labor**

Backend und Frontend aus diesem Worktree starten (`.claude/launch.json`, Konfigurationen `backend` und `frontend`; cwd prüfen), am Handy über die LAN-IP `/c/<slug>/lab/stack-floor` öffnen. Prüfen und dem Menschen berichten, was nur er am Gerät beurteilen kann:
- Rampe → Hülle → START in beiden Phasen; der Balken gleitet erst nach dem Vorhang.
- Tipp hält mit Klopfen; Überstand fällt; Hilfslinie mittig; Farben wandern, hell und dunkel lesbar.
- Phase eins: Ziel-Balken erkennbar, keine Zahl N zu sehen.
- Geschwindigkeit, Startbreite, N-Bereich: Gefühl melden — die Zahlen sind vorläufig.
- Neuladen mitten im Lauf: eigene Hülle mit Satz, Zeichen in der Rangliste.
- Auflösung: Namen antippen zeigt je einen Turm.
