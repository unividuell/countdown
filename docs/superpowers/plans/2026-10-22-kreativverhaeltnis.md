# Kreativverhältnis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Kreativverhältnis“ (`paint-ratio`) als achtes Rundenspiel: ein Gemälde mit demselben Anteil bemalter Fläche wie das Werk des „Kollektiv Kommune“ malen, gezählt nur auf dem Server.

**Architecture:** Ein neues Modulith-Modul `paintratio` (reine Logik, kein Schema) trägt die Zählregel (eigener Rasterer aus Kapseln und Gerade-ungerade-Flächen, alles ganzzahlig), den rauen Strich nach roughjs und die zehn Formen des Kollektivs. Der Adapter `PaintRatioGameType` in `game.internal` trägt Params, Ausgänge, Validierung und das Bild als Asset. Im Frontend ein neues Spielverzeichnis `games/paintratio/`: reine Module (Typen, Striche, Verlauf, Zeichnen, Entwurf, Ebenen, Rangliste) unter zwei Canvas-Komponenten, die nur anzeigen.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher · Jackson 3 · `javax.imageio` für PNG · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-10-22-kreativverhaeltnis-design.md`](../specs/2026-10-22-kreativverhaeltnis-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden oder schweigt):

1. **Alles ganzzahlig.** Auch der raue Strich und die Formen geben nur `Int`-Geometrie aus (gerundet beim Zerlegen der Kurven). Damit gibt es **einen** exakten Rasterer für Werk und Tipp, ohne Gleitkomma-Sonderweg.
2. **Kapsel- und Flächentest in `Long`** mit verdoppelten Koordinaten; Gleichstand beim Flächentest (Schnittpunkt genau auf der Feldmitte) zählt als außen.
3. **`Raster` speichert ARGB pro Feld** (`IntArray`, `0` = leer). Ein Raster dient Zählung und PNG; für den Tipp ist die Farbe gleichgültig, kostet aber nichts.
4. **Geteilter Entwurfsspeicher:** `deviceStorage`, `fingerprint`, `clearDraft`, `sweepDrafts` ziehen aus `copyblocks/draft.ts` nach `games/drafts.ts`; Blockierung behält seine Exporte als dünne Weiterleitung, seine Tests bleiben unverändert.
5. **Entwurfsschlüssel** aus `mineUserId` (Prop des Spielvertrags) und dem Fingerabdruck von `assets.url('target')`. Kein `useAuth`.
6. **Zwei Canvas-Komponenten:** `LayerCanvas.vue` zeigt Ebenen (Werk-Bild oder Striche) und wird von Brett, Auflösung und Historie benutzt; `PaintCanvas.vue` legt die Pointer-Aufnahme darüber. Während eines Strichs zeichnet sie nur das neue Stück, sonst alles neu.
7. **Das Halten bricht über `disabled` ab:** solange ein Finger auf der Leinwand liegt, ist der `HoldButton` deaktiviert; dessen bestehender `watch(disabled)` bricht ab. Neu am `HoldButton` ist nur die Emission `progress`.
8. **Kopf der Auflösung als `fact`** der Spalten von `RevealScoreboard`: „Anteil“ trägt den Zielanteil, „Differenz“ in Phase eins die Toleranz.
9. **Die Zeile „Kollektiv Kommune“** steht als eigener Knopf unter der Tabelle, nicht als Scheinzeile in `rows` (sie hat weder Punkte noch Rang).
10. **Zahlen deutsch:** `Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })`, die Differenz mit `signDisplay: 'exceptZero'`.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit. Branch: `feature/ratio-game-port-059dc9`. Nicht pushen.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — `.claude/guidelines/kotlin.md`.
- **Testing:** JUnit 5 + kotest-Matcher, mockk; Frontend Vitest + `vi`. **TDD:** erst der fallende Test.
- **Keine redundanten Inline-Kommentare**, kein Grabstein-Kommentar. Kommentare kurz, *was* und *warum*.
- **Namen:** Spiel-Id `paint-ratio`, Anzeigename `Kreativverhältnis`, Modul `paintratio`, Klassen `PaintRatio*`, Künstler `Kollektiv Kommune`, Asset `target`, InfoBox-Key `paint-ratio`.
- **Gemessen wird nie aus einem Canvas:** kein `getImageData`, kein `toDataURL`, nirgends im Spiel.
- **Ströme:** alles aus `random.presentation`, in dieser Reihenfolge: Form, dann `artSeed` (bei Neuziehen weitere `artSeed`). `scene` und `solution` bleiben unberührt.
- **Feste Zahlen (Spec, wörtlich):**
  - Leinwand `W = 1200`, `H = 900`; Pinsel-Durchmesser `[40, 80, 160]`, Radius = Durchmesser ÷ 2.
  - Feldmitte `(i + ½, j + ½)`; Kapsel: Abstand Mitte–Strecke `≤ r`; Fläche: Gerade-ungerade.
  - Toleranzen Phase eins: `SPARKLE 0.05`, `CIRCLE 0.01`, `ELLIPSE 0.01`, `REGION 0.08`, `POLYGON 0.01`, `RING 0.01`, `STRIPES 0.03`, `SPLATTER 0.05`, `FREEHAND 0.05`, `COMPOSITION 0.08`; Phase zwei `null`.
  - Gate: `|cells − targetCells| ≤ round(tolerance × W × H)`. `deviation = |cells − targetCells| / (W × H)`.
  - Mindestziel: `targetCells ≥ round(2 × shape.tolerance × W × H)`, in beiden Phasen; höchstens `100` Züge.
  - Tipp: höchstens `100 000` Punkte und `5 000` Striche, Koordinaten in `[−10 000, 10 000]`, Farbe `#rrggbb` klein, `brush` Index in `brushes`. Ein leeres `strokes` ist gültig, ein leerer Strich nicht.
  - Ausdünnen im Client: ein Punkt näher als `2` Einheiten am zuletzt behaltenen fällt weg.
  - Original-Bereiche (Faktor 4): Funken `10..2000`, Radius `20`, `#EFC202`; Kreis Mitte `40..W−40` / `40..H−40`, Radius `40..600`; Ellipse Mitte wie Kreis, Breite `40..1200`, Höhe `80..1200`, Kreis und Ellipse `#841ED6`; Region `3..90` Punkte über die ganze Leinwand, `#008000`, scharf, deckend.
  - Rauer Strich: Umriss schwarz, Radius `2`, zwei Durchgänge; Füllinien Radius `8`, Winkel `−41°`, Abstand `16..64`; Füllarten `HACHURE, CROSS_HATCH, ZIGZAG, DOTS`.
  - Takte: `SOLUTION_DELAY_MS`, `RESULTS_DELAY_MS`, `FADE_MS` aus `games/revealChoreography.ts`, nie eigene Zahlen. Haltedauer `DEFAULT_HOLD_MS`.
- **Wörtliche Texte:**
  - Aufforderung: `Male ein Bild mit demselben Farbanteil.`
  - Knopf: Aufschrift `Signieren`, Label `Gemälde signieren — gedrückt halten`; Sperre: `Signieren …`.
  - Werkzeuge (aria): `Pinsel klein`, `Pinsel mittel`, `Pinsel groß`, `Farbe`, `Rückgängig`, `Wiederholen`.
  - InfoBox-Kurztext: `Male ein Bild mit demselben Farbanteil wie das Kollektiv Kommune.`
  - Regeln: `Wie dein Bild aussieht, spielt keine Rolle. Sei kreativ.` · `Gezählt wird, wie viel der Leinwand bemalt ist. Doppelt bemalte Stellen zählen einmal, die Farbe ist egal.` · `Die Vorlage verschwindet mit deinem ersten Strich. Rückgängig bis zum Anfang zeigt sie wieder.` · `Zum Abgeben „Signieren“ gedrückt halten.`
  - AwardBox: qualifiziert `Dein Anteil darf um höchstens {Toleranz} vom Ziel abweichen.`, nächster `Der Anteil, der dem Ziel am nächsten kommt.`
  - Rangliste: Caption `Alle Gemälde der Runde, nach Abweichung sortiert`, Spalten `Anteil`, `Differenz`; Zeile `Kollektiv Kommune`.
  - Bildfehler: `Das Bild ließ sich nicht laden.`
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Vor `pnpm lint` die geänderten Dateien mit `pnpm exec prettier --write <Dateien>` formatieren.
- **Nicht im Browser-Pane prüfbar:** Halten und Takte laufen über `requestAnimationFrame`, der Pane meldet sich immer als versteckt; Malen braucht echte Finger. Die Handprobe gehört aufs Handy, im Labor (Task 11).

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Eine Farbe in Großbuchstaben** (Avatarfarbe `#3049E8`) wird vor dem Senden klein geschrieben; der Server lehnt `#3049E8` ab, der Spieler darf das nie erleben. → Task 5 (`normalizeColor`), Task 8 (Startfarbe des Bretts).
2. **Ein Finger, der weit über die Leinwand hinaus zieht** (jenseits ±10 000 Einheiten), verliert dort Punkte, der Strich geht bei der Rückkehr weiter; gesendet wird nie etwas Ungültiges. → Task 5 (`appendPoint`).
3. **Die Leinwand ändert mitten im Strich ihre Größe** (Drehen, Tastatur): Einheiten kommen aus dem aktuellen Rechteck, der Strich bleibt in Leinwand-Einheiten stimmig. → Task 5 (`toUnits` mit zwei Rechtecken), Task 8 (Rechteck bei jedem Ereignis).
4. **Ein Entwurf, der nicht mehr passt** (fremde Runde, kaputtes JSON, Pinsel-Index jenseits des Payloads, Großbuchstaben-Farbe, zu viele Punkte), wird verworfen; das Brett zeigt die Vorlage. → Task 6.
5. **Ein fremder Eintrag mit unlesbaren Strichen oder Outcome** in der Auflösung: die Zeile bleibt (zuletzt), ihr Name ist kein Knopf, nichts wirft. → Task 9.

## File Structure

**Backend, neu (`core/src/main/kotlin/org/unividuell/countdown/core/`):**

| Datei | Aufgabe |
|---|---|
| `paintratio/PaintCanvas.kt` | Leinwand und Pinsel als Konstanten |
| `paintratio/Marks.kt` | `Point`, `Mark`, `Capsule`, `Area`, die Regel `covers` |
| `paintratio/Raster.kt` | Rastern über Zeilenspannen, zählen, PNG |
| `paintratio/PaintStroke.kt` | ein Pinselstrich → Kapseln |
| `paintratio/Rough.kt` | der raue Strich: Umriss und Füllarten |
| `paintratio/PaintRatioArtist.kt` | `Shape`, `Layer`, `Artwork`, die zehn Formen |
| `game/internal/PaintRatioGameType.kt` | der Adapter |

Tests unter `core/src/test/kotlin/org/unividuell/countdown/core/paintratio/` und `.../game/PaintRatioGameTypeTest.kt`.

**Backend, geändert:** `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (ein gültiger Tipp), `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt` (Katalog).

**Frontend, neu (`webapp-vue/src/games/paintratio/`):** `types.ts`, `strokes.ts`, `paintHistory.ts`, `render.ts`, `draft.ts`, `layers.ts`, `scoreboard.ts`, `LayerCanvas.vue`, `PaintCanvas.vue`, `PaintRatioRules.vue`, `PaintRatioBriefing.vue`, `PaintRatioBoard.vue`, `PaintRatioScoreboard.vue`, `PaintRatioReveal.vue`, `PaintRatioGame.vue`, Tests unter `__tests__/`; dazu `webapp-vue/src/games/drafts.ts` + `games/__tests__/drafts.spec.ts`.

**Frontend, geändert:** `games/copyblocks/draft.ts`, `ui/HoldButton.vue` + `ui/__tests__/HoldButton.spec.ts`, `games/registry.ts`, `gamelab/games.ts`.

**Doku:** `.claude/guidelines/frontend.md`, `.claude/guidelines/frontend-ui.md`, Spec-Status.

Reihenfolge: Modul `paintratio` (1–3) → Adapter (4) → Frontend rein (5) → Entwurf (6) → `HoldButton` (7) → Brett (8) → Auflösung (9) → Spiel, Registrierung, Labor (10) → Doku (11). Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

**Achtung nach Task 1 (neues Modul):** Spring Modulith liest eine generierte `application-modules.json`; nach einem neuen Modul ist sie veraltet. Deshalb dort `./mvnw clean test` — siehe `.claude/guidelines/modules-and-migrations.md`.

---

### Task 1: `paintratio` — die Zählregel

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/PaintCanvas.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/Marks.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/Raster.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/PaintStroke.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/paintratio/RasterTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/paintratio/PaintStrokeTest.kt`

**Interfaces:**
- Produces (Paket `org.unividuell.countdown.core.paintratio`):
  - `object PaintCanvas { const val WIDTH = 1200; const val HEIGHT = 900; val BRUSHES: List<Int> = listOf(40, 80, 160) }`
  - `data class Point(val x: Int, val y: Int)`
  - `sealed interface Mark`
  - `data class Capsule(val ax: Int, val ay: Int, val bx: Int, val by: Int, val radius: Int) : Mark` — `init { require(radius >= 0) }`
  - `data class Area(val points: List<Point>) : Mark` — Gerade-ungerade, `init { require(points.size >= 3) }`
  - `fun covers(mark: Mark, x: Int, y: Int): Boolean` — **die Regel** für Feld `(x, y)`, exakt; Referenz für Tests und Randfelder.
  - `class Raster(val width: Int, val height: Int)` mit `fun paint(mark: Mark, argb: Int)`, `fun cells(): Int`, `fun png(): ByteArray`
  - `data class PaintStroke(val brush: Int, val color: String, val points: List<Int>)` mit `fun marks(brushes: List<Int>): List<Capsule>` und `fun argb(): Int` — **Funktionen, keine Properties**: Jackson serialisiert genau `brush, color, points`.
  - `fun Raster.paint(strokes: List<PaintStroke>, brushes: List<Int>)`

- [ ] **Step 1: Die fallenden Tests schreiben**

`RasterTest.kt` — von Hand gezählte Fälle und der Abgleich mit der Referenz:

```kotlin
@Test
fun `a dot of radius 3 at a grid point covers 32 cells`() {
    val raster = Raster(width = 100, height = 100)
    raster.paint(mark = Capsule(ax = 50, ay = 50, bx = 50, by = 50, radius = 3), argb = BLACK)
    raster.cells() shouldBe 32
}

@Test
fun `a horizontal stroke of radius 1 covers two rows of twelve`() {
    val raster = Raster(width = 100, height = 100)
    raster.paint(mark = Capsule(ax = 10, ay = 10, bx = 20, by = 10, radius = 1), argb = BLACK)
    raster.cells() shouldBe 24
}

@Test
fun `a square area covers exactly its inside`() {
    val raster = Raster(width = 100, height = 100)
    raster.paint(mark = Area(points = listOf(Point(0, 0), Point(10, 0), Point(10, 10), Point(0, 10))), argb = BLACK)
    raster.cells() shouldBe 100
}

@Test
fun `painting twice counts once`()                       // derselbe Tupfer zweimal → 32

@Test
fun `the fast raster agrees with the rule cell by cell`() // 200 Zufallskapseln (SeededRandom.fromSeed(7)),
                                                          // Radien 0..80, Enden in [−200, 300], dazu ein
                                                          // Pentagramm und ein selbstüberschneidendes
                                                          // Vieleck, je auf 240 × 180: jedes Feld
                                                          // isPainted == covers(mark, x, y)

@Test
fun `marks reaching outside count only their inside part`() // Kapsel (−10, 50)–(10, 50), r = 2 und ein
                                                             // Vieleck über den Rand: cells == Anzahl der
                                                             // Felder der Leinwand mit covers == true

@Test
fun `the png decodes to exactly the painted cells, in their colours`() // ImageIO.read: Alpha ≠ 0 zählt
                                                                       // cells(); ein Feld trägt die zuletzt
                                                                       // gemalte Farbe

@Test
fun `the largest guess counts in under a second`() // 100 000 Punkte als Zufallsweg (Schritt 6, im Bereich
                                                   // [−10 000, 10 000] geklemmt) mit Pinsel 160 auf
                                                   // 1200 × 900: einmal aufwärmen, dann < 1000 ms
```

`PaintStrokeTest.kt`:

```kotlin
@Test
fun `a stroke of one point is a dot of half the brush`() {
    PaintStroke(brush = 0, color = "#000000", points = listOf(50, 50)).marks(brushes = listOf(6, 12)) shouldBe
        listOf(Capsule(ax = 50, ay = 50, bx = 50, by = 50, radius = 3))
}

@Test
fun `consecutive points become capsules`() // points (0,0),(10,0),(10,10) mit Pinsel 1 aus [6, 12]
                                           // → zwei Kapseln mit Radius 6

@Test
fun `the colour becomes opaque argb`()     // "#3049e8" → 0xFF3049E8.toInt()

@Test
fun `it serialises as brush, color and points only`() // Jackson-Feldmenge
```

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd core && ./mvnw test -Dtest='RasterTest,PaintStrokeTest'`
Expected: FAIL (Kompilierfehler, die Typen fehlen).

- [ ] **Step 3: Implementieren**

`covers` mit verdoppelten Koordinaten in `Long`: Feldmitte `c = (2x + 1, 2y + 1)`, Enden `2a`, `2b`, Radius `2r`.

```
Kapsel:  d = b − a, w = c − a, t = w·d, len2 = d·d
         len2 == 0 oder t ≤ 0   → |w|² ≤ R²
         t ≥ len2               → |c − b|² ≤ R²
         sonst                  → (w × d)² ≤ R² · len2
Fläche:  Strahl nach rechts ab c; eine Kante (p, q) mit (2p.y − c.y) und (2q.y − c.y) verschiedenen
         Vorzeichens kreuzt, wenn ihr Schnittpunkt echt rechts von c liegt — als Bruch in Long
         verglichen, ohne Division. Ungerade Zahl der Kreuzungen = innen. c.y ist ungerade, eine
         Ecke liegt nie genau auf dem Strahl.
```

`Raster.paint` arbeitet zeilenweise: für eine Kapsel die Zeilen ihres Begrenzungsrechtecks, je Zeile das Intervall per `Double` grob bestimmen, die beiden Randfelder mit `covers` nachziehen (nach innen und außen schieben, bis die Regel kippt); für eine Fläche je Zeile die Kreuzungen sammeln, sortieren, Paare füllen, Randfelder ebenso mit `covers` prüfen. Alles auf `[0, width) × [0, height)` beschnitten. `png()` über `BufferedImage.TYPE_INT_ARGB` und `ImageIO.write(…, "png", …)`.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd core && ./mvnw clean test -Dtest='RasterTest,PaintStrokeTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/paintratio core/src/test/kotlin/org/unividuell/countdown/core/paintratio
git commit   # z. B. "Count painted cells with one exact rule"
```

---

### Task 2: `paintratio` — der raue Strich

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/Rough.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/paintratio/RoughTest.kt`

**Interfaces:**
- Consumes: `Mark`, `Capsule`, `Area`, `Raster` (Task 1); `org.unividuell.countdown.core.rng.SeededRandom`.
- Produces:
  - `enum class FillStyle { HACHURE, CROSS_HATCH, ZIGZAG, DOTS }`
  - `data class Fill(val style: FillStyle, val gap: Int)`
  - `data class Vec(val x: Double, val y: Double)`
  - `data class Sketch(val outline: List<Mark>, val fill: List<Mark>)`
  - `class Rough(private val random: SeededRandom)` mit
    - `fun ellipse(center: Vec, width: Double, height: Double, fill: Fill?): Sketch`
    - `fun shape(contours: List<List<Vec>>, fill: Fill?): Sketch` — mehrere Konturen, Gerade-ungerade (Ring = zwei Ellipsen-Konturen)
    - `fun line(from: Vec, to: Vec, radius: Int): List<Mark>`
  - `companion object { const val OUTLINE_RADIUS = 2; const val FILL_RADIUS = 8; const val HACHURE_ANGLE_DEG = -41.0; val GAPS = 16..64; fun fillOf(random: SeededRandom): Fill }` — `fillOf`: Füllart gleichverteilt, Abstand `random.nextIntBetween(min = 16, maxInclusive = 64)`.

- [ ] **Step 1: Die fallenden Tests schreiben**

```kotlin
@Test fun `the same seed draws the same sketch`()
@Test fun `another seed draws another outline`()
@Test fun `the outline is no perfect ellipse`()            // Umriss-Raster ≠ Raster einer glatten Ellipsen-
                                                            // Kapselkette gleicher Größe
@Test fun `a narrower gap paints more`()                    // Ellipse 600 × 400, HACHURE: Abstand 16 > Abstand 64
@Test fun `dots paint less than hachure at the same gap`()
@Test fun `cross-hatch paints more than hachure at the same gap`()
@Test fun `zigzag connects its lines`()                     // ZIGZAG hat ≥ so viele Felder wie HACHURE
@Test fun `fill lines fray past the outline`()             // es gibt Füllfelder außerhalb der exakten
                                                            // Ellipse, aber keins weiter als 24 Einheiten
@Test fun `a ring leaves its hole empty`()                 // zwei Konturen: die Mitte bleibt unbemalt
@Test fun `everything is integer marks`()                   // nur Capsule/Area, Radien OUTLINE_RADIUS
                                                            // bzw. FILL_RADIUS
```

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd core && ./mvnw test -Dtest='RoughTest'`
Expected: FAIL.

- [ ] **Step 3: Implementieren — das Verfahren von roughjs, nicht sein Code**

Kopfkommentar: `After roughjs (https://roughjs.com, MIT, Preet Shihn): the procedure, not its code or its random sequence.`

- **Umriss:** Stützpunkte etwa alle 40 Einheiten Umfang (mindestens 12), jeder radial um bis zu ±3 % des Radius verschoben (mindestens ±4 Einheiten); Catmull-Rom durch die Punkte, in Stücke von etwa 4 Einheiten zerlegt, gerundet, als Kapseln mit `OUTLINE_RADIUS`. **Zwei Durchgänge** mit eigenem Zittern; jeder beginnt bei einem zufälligen Winkel und läuft ein Stück über den Anfang hinaus (der Kreis schließt nicht exakt).
- **Füllfläche:** die Konturen ohne Zittern als Vielecke (dieselben Stützpunkte).
- **HACHURE:** Linien im Winkel `HACHURE_ANGLE_DEG` im Abstand `gap`, gegen die Füllfläche mit Gerade-ungerade geschnitten; jedes Stück verlängert sich an beiden Enden um zufällig `−4..+12` Einheiten (die Fransen) und wölbt sich in der Mitte um bis zu ±1 % seiner Länge; als Kapseln mit `FILL_RADIUS`.
- **CROSS_HATCH:** HACHURE zweimal, im Winkel und rechtwinklig dazu.
- **ZIGZAG:** die HACHURE-Stücke abwechselnd an ihren Enden verbunden.
- **DOTS:** Tupfer mit Radius `FILL_RADIUS` auf einem Gitter mit Abstand `gap` im Winkel, je um bis zu ±`gap / 4` verschoben, nur innerhalb der Füllfläche.
- `line`: eine gewölbte, leicht zitternde Polylinie aus Kapseln mit dem gegebenen Radius, zweimal gezogen.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd core && ./mvnw test -Dtest='RoughTest'`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Draw rough outlines and fills after roughjs“)

---

### Task 3: `paintratio` — die zehn Formen des Kollektivs

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/paintratio/PaintRatioArtist.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/paintratio/PaintRatioArtistTest.kt`

**Interfaces:**
- Consumes: Task 1 und 2.
- Produces:
  - `enum class Shape(val tolerance: Double) { SPARKLE(0.05), CIRCLE(0.01), ELLIPSE(0.01), REGION(0.08), POLYGON(0.01), RING(0.01), STRIPES(0.03), SPLATTER(0.05), FREEHAND(0.05), COMPOSITION(0.08) }`
  - `data class Layer(val mark: Mark, val argb: Int)`
  - `class Artwork(val layers: List<Layer>)` mit `fun raster(width: Int, height: Int): Raster` (malt in Reihenfolge)
  - `object PaintRatioArtist` mit
    - `fun paint(shape: Shape, artSeed: Int, width: Int, height: Int, brushes: List<Int>): Artwork`
    - `fun freehand(random: SeededRandom, width: Int, height: Int, brushes: List<Int>): List<PaintStroke>`

- [ ] **Step 1: Die fallenden Tests schreiben**

```kotlin
@Test
fun `the tolerances are the spec's`() {
    Shape.entries.associateWith { it.tolerance } shouldBe mapOf(
        Shape.SPARKLE to 0.05, Shape.CIRCLE to 0.01, Shape.ELLIPSE to 0.01, Shape.REGION to 0.08,
        Shape.POLYGON to 0.01, Shape.RING to 0.01, Shape.STRIPES to 0.03, Shape.SPLATTER to 0.05,
        Shape.FREEHAND to 0.05, Shape.COMPOSITION to 0.08,
    )
}

@Test fun `every shape paints something and never everything`()  // alle Formen × Seeds 1..20 auf
                                                                   // 1200 × 900: 0 < cells < W · H
@Test fun `the same seed paints the same bytes`()                  // png() gleich für gleiche Argumente
@Test fun `the original four wear the original colours`()          // SPARKLE #EFC202, CIRCLE/ELLIPSE
                                                                   // #841ED6 als Füllfarbe, REGION #008000
@Test fun `sparkles are dots of radius 20`()                       // alle Marken Capsule mit a == b, r = 20
@Test fun `a region is one sharp area`()                           // genau eine Area, 3..90 Punkte in der
                                                                   // Leinwand
@Test fun `freehand paints with the players' brushes`()            // 1..5 Striche, brush in brushes.indices,
                                                                   // Punkte in ±10 000, benachbarte Punkte
                                                                   // ≥ 2 Einheiten auseinander
```

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd core && ./mvnw test -Dtest='PaintRatioArtistTest'`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`paint` startet `SeededRandom.fromSeed(artSeed)` und zeichnet:

| Form | Zeichnung |
|---|---|
| `SPARKLE` | `nextIntBetween(10, 2000)` Tupfer, Radius 20, Mitte `0..W`, `0..H`, `#EFC202` |
| `CIRCLE` | Mitte `40..W−40` / `40..H−40`, Radius `40..600`; `Rough.ellipse` mit `fillOf`; Füllung `#841ED6`, Umriss schwarz |
| `ELLIPSE` | Mitte wie Kreis, Breite `40..1200`, Höhe `80..1200`; sonst wie Kreis |
| `REGION` | `3..90` Punkte über die Leinwand, eine `Area`, `#008000`, kein Umriss |
| `POLYGON` | rau, 3–8 Ecken oder ein Stern mit 5–9 Zacken (Innenradius 40–70 % des Außenradius), Mitte und Größe wie Kreis; `#2563EB` |
| `RING` | Ellipse wie oben, Loch 30–70 % ihrer Größe, gleiche Mitte; `Rough.shape` mit beiden Konturen; `#DC2626` |
| `STRIPES` | 2–6 raue Linien quer über die Leinwand (Enden außerhalb), gemeinsamer Grundwinkel ±15°, Radius je 20–100; `#0F766E` |
| `SPLATTER` | 2–5 Häufungen, je 5–80 Tupfer, Radius 8–60, Versatz als Summe dreier Gleichverteilungen mit Streuung 40–200; `#EA580C` |
| `FREEHAND` | `freehand(…)`, gemalt über `PaintStroke.marks`, Farben aus `#3049E8, #E8304F, #F2B705, #2A9D4B, #111111, #8E44AD, #F07C1B` |
| `COMPOSITION` | 2–3 Formen aus allen außer `COMPOSITION`, jede mit eigenem `artSeed` aus diesem Strom, übereinander |

`freehand`: Start in der Leinwand, Richtung zufällig, Schritt 6 Einheiten, Länge 300–4000 Einheiten, Drehung pro Schritt aus geglättetem Rauschen (Stärke 0,05–0,4 rad), Punkte gerundet und auf ≥ 2 Einheiten ausgedünnt, darf die Leinwand verlassen. Die Bereiche der neuen Formen sind Startwerte; sie werden im Labor nachgestimmt.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd core && ./mvnw test -Dtest='PaintRatioArtistTest'`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Paint the Kollektiv Kommune's ten shapes“)

---

### Task 4: Der Adapter `PaintRatioGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PaintRatioGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PaintRatioGameTypeTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt` (Katalog)

**Interfaces:**
- Consumes: Task 1–3; `GameType`, `GameRandom`, `RoundContext`, `Judgement`, `RoundAsset`, `AssetVisibility.FromStage`, `InvalidGuessException`.
- Produces (Paket `org.unividuell.countdown.core.game.internal`):
  - `data class PaintRatioParams(val shape: Shape, val artSeed: Int, val width: Int, val height: Int, val brushes: List<Int>, val targetCells: Int, val tolerance: Double?)`
  - `data class PaintRatioPayload(val width: Int, val height: Int, val brushes: List<Int>, val tolerance: Double?) : GamePayload`
  - `data class PaintRatioSolution(val targetRatio: Double, val tolerance: Double?) : GameSolution`
  - `data class PaintRatioOutcome(val ratio: Double, val difference: Double, val withinTolerance: Boolean?) : GameOutcome`
  - `@Component class PaintRatioGameType(private val mapper: ObjectMapper) : GameType<PaintRatioParams>` — `id = "paint-ratio"`, `displayName = "Kreativverhältnis"`
  - `companion object { const val MAX_STROKES = 5_000; const val MAX_POINTS = 100_000; const val COORDINATE_LIMIT = 10_000; const val MAX_DRAWS = 100 }`
  - Leitung: `{ "strokes": [ { "brush": Int, "color": "#rrggbb", "points": [Int, …] } ] }`

- [ ] **Step 1: Die fallenden Tests schreiben**

Gerüst wie `CopyBlocksGameTypeTest` (`random(solution, presentation, scene)`, `draw(random, phase, previous)`, `tree`, `guess(json)`).

```kotlin
@Test fun `it is registered under a stable id and a German display name`()  // "paint-ratio", "Kreativverhältnis"
@Test fun `everything follows the presentation seed only`()
@Test fun `the shape skips those this edition had and falls back to all`()  // previousParams mit neun Formen
                                                                             // → immer die zehnte; mit allen
                                                                             // zehn → jede möglich
@Test fun `phase one freezes the shape's tolerance, phase two none`()
@Test fun `no artwork is smaller than twice its shape's tolerance, in either phase`()
                                                                             // Seeds 1..60 je Phase:
                                                                             // targetCells ≥ round(2 × tol × W × H)
@Test fun `the image is exactly the counted raster`()                       // PNG aus produceAssets: Name
                                                                             // "target", FromStage(0),
                                                                             // "image/png"; Alpha ≠ 0 zählt
                                                                             // targetCells
@Test fun `a changed painter fails the materialisation loudly`()            // targetCells + 1 →
                                                                             // shouldThrow<IllegalStateException>
@Test fun `the payload carries width, height, brushes and tolerance`()      // Feldmenge
@Test fun `the solution carries targetRatio and tolerance`()                // Feldmenge
@Test fun `the outcome carries ratio, difference and withinTolerance`()     // Feldmenge
@Test fun `it never asks for a reveal and never scores on time`()           // beide Phasen false
```

Das Gate an seiner Grenze, mit einem Tupfer bekannter Größe:

```kotlin
@Test
fun `a guess exactly at the tolerance hits, one cell further misses`() {
    val dot = """{"strokes":[{"brush":0,"color":"#3049e8","points":[600,450]}]}"""
    val cells = Raster(width = 1200, height = 900)
        .also { it.paint(strokes = listOf(PaintStroke(brush = 0, color = "#3049e8", points = listOf(600, 450))), brushes = listOf(40, 80, 160)) }
        .cells()
    val tolerance = 0.01
    val toleranceCells = 10_800
    val atEdge = params(targetCells = cells + toleranceCells, tolerance = tolerance)
    val beyond = params(targetCells = cells + toleranceCells + 1, tolerance = tolerance)

    game.judge(params = atEdge, guess = guess(dot)).qualifies shouldBe true
    game.judge(params = beyond, guess = guess(dot)).qualifies shouldBe false
    game.judge(params = beyond.copy(tolerance = null), guess = guess(dot)).qualifies shouldBe true
}
```

Weitere:

```kotlin
@Test fun `the outcome is the ratio and the signed difference`()   // ratio = cells / (W·H), difference =
                                                                   // ratio − target, withinTolerance null in
                                                                   // Phase zwei; deviation = |difference|
@Test fun `an empty painting is valid and has ratio 0`()           // {"strokes":[]}
@Test fun `the stored guess is rebuilt from the checked fields`()  // judgement.guess == tree des Eingangs
@Test fun `malformed guesses are rejected before anything is written`()
```

Die Ablehnungen, je als `shouldThrow<InvalidGuessException>`: fehlendes `strokes`; `strokes` kein Feld; zusätzliches Feld oben; zusätzliches Feld im Strich; `brush` `3`, `-1`, `"0"`; `color` `"#3049E8"`, `"red"`, `"#12345"`; `points` ungerade Länge; `points` leer; Koordinate `10001` und `-10001`; Koordinate `1.5`; Koordinate `1099511627776`; 5 001 Striche; 100 001 Punkte insgesamt.

In `LabServiceTest.aValidGuessFor`: `"paint-ratio" -> mapper.readTree("""{"strokes":[{"brush":0,"color":"#000000","points":[600,450]}]}""")`. In `SongSnippetBootTest`: der Katalog trägt alle **acht** Spiele, sortiert, `"paint-ratio"` zwischen `"guess-hue"` und `"place-patch"`; den Testnamen auf „eight“ ändern.

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd core && ./mvnw test -Dtest='PaintRatioGameTypeTest,LabServiceTest,SongSnippetBootTest'`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

- `draw`: verwendete Formen aus `context.previousParams` (`mapper.treeToValue(it, PaintRatioParams::class.java).shape`); `shape = random.presentation.pick(Shape.entries.filterNot { it in used }.ifEmpty { Shape.entries })`; dann bis zu `MAX_DRAWS` mal `artSeed = random.presentation.nextInt(Int.MAX_VALUE)`, malen, zählen, bis `cells ≥ round(2 × shape.tolerance × W × H)`; danach `check`. `tolerance = shape.tolerance` in `Phase.ONE`, sonst `null`.
- `judge`: Felder strikt lesen (wie `CopyBlocksGameType.coordinateOf`: `isIntegralNumber && canConvertToInt`), Farbe gegen `^#[0-9a-f]{6}$`, Feldmengen exakt (`propertyNames()`); rastern, `deviation = |cells − targetCells| / (W·H)`, Gate in ganzen Feldern; `guess = mapper.valueToTree(mapOf("strokes" to strokes))`.
- `produceAssets`: `Artwork.raster`, `check(raster.cells() == params.targetCells)`, ein `RoundAsset(name = "target", visibility = AssetVisibility.FromStage(0), mediaType = "image/png", bytes = raster.png())`.
- `requiresReveal = scoresOnDuration = false`; `solution` aus `targetCells / (W·H)` und `tolerance`.
- KDoc des Adapters: die Decke „Lösung liegt im Sichtbaren“, ein Satz.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd core && ./mvnw test`
Expected: PASS, alles grün (auch `ModularityTests`, `LabPointsParityTest`).

- [ ] **Step 5: Commit** (z. B. „Announce Kreativverhältnis as a game“)

---

### Task 5: Frontend — Typen, Striche, Verlauf, Zeichnen

**Files:**
- Create: `webapp-vue/src/games/paintratio/types.ts`
- Create: `webapp-vue/src/games/paintratio/strokes.ts`
- Create: `webapp-vue/src/games/paintratio/paintHistory.ts`
- Create: `webapp-vue/src/games/paintratio/render.ts`
- Test: `webapp-vue/src/games/paintratio/__tests__/types.spec.ts`, `strokes.spec.ts`, `paintHistory.spec.ts`, `render.spec.ts`

**Interfaces:**
- Produces:
  - `types.ts`:
    ```ts
    export const COORDINATE_LIMIT = 10_000
    export const MAX_POINTS = 100_000
    export const MAX_STROKES = 5_000
    export interface PaintRatioPayload { width: number; height: number; brushes: number[]; tolerance: number | null }
    export interface PaintRatioSolution { targetRatio: number; tolerance: number | null }
    export interface PaintRatioOutcome { ratio: number; difference: number; withinTolerance: boolean | null }
    export interface Stroke { brush: number; color: string; points: number[] }
    export interface PaintRatioGuess { strokes: Stroke[] }
    export function asPaintRatioPayload(raw: unknown): PaintRatioPayload | null
    export function asPaintRatioSolution(raw: unknown): PaintRatioSolution | null
    export function asPaintRatioOutcome(raw: unknown): PaintRatioOutcome | null
    export function strokesOf(raw: unknown, brushCount: number): Stroke[] | null
    export function normalizeColor(raw: string): string | null
    ```
  - `strokes.ts`:
    ```ts
    export const MIN_STEP = 2
    export interface Rect { left: number; top: number; width: number; height: number }
    export function toUnits(clientX: number, clientY: number, rect: Rect, size: { width: number; height: number }): [number, number] | null
    export function appendPoint(points: number[], point: readonly [number, number], pointsSoFar: number): boolean
    export function pointCount(strokes: readonly Stroke[]): number
    ```
  - `paintHistory.ts`:
    ```ts
    export interface PaintState { strokes: Stroke[]; redo: Stroke[] }
    export const EMPTY_PAINT: PaintState
    export function addStroke(state: PaintState, stroke: Stroke): PaintState
    export function undo(state: PaintState): PaintState
    export function redo(state: PaintState): PaintState
    export function showsTemplate(state: PaintState): boolean
    ```
  - `render.ts`:
    ```ts
    export type CanvasLayer = { kind: 'template' } | { kind: 'strokes'; strokes: readonly Stroke[] }
    export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], brushes: readonly number[], scale: number): void
    export function drawSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number, brushes: readonly number[], scale: number): void
    ```

- [ ] **Step 1: Die fallenden Tests schreiben**

`types.spec.ts`:

```ts
it('narrows a payload and keeps a null tolerance', () => {
  expect(asPaintRatioPayload({ width: 1200, height: 900, brushes: [40, 80, 160], tolerance: null }))
    .toEqual({ width: 1200, height: 900, brushes: [40, 80, 160], tolerance: null })
})
it('drops a payload with junk', () => { /* width 0, brushes [], tolerance NaN, fehlendes Feld → null */ })
it('narrows solution and outcome; NaN or a missing field is null', () => { /* … */ })
it('reads strokes and rejects any stroke that is off', () => {
  expect(strokesOf({ strokes: [{ brush: 1, color: '#3049e8', points: [1, 2, 3, 4] }] }, 3)).toEqual([
    { brush: 1, color: '#3049e8', points: [1, 2, 3, 4] },
  ])
  // je null: brush 3 bei brushCount 3; color '#3049E8'; points ungerade; points leer; 1.5; 10001
})
it('lowers a colour and refuses anything not #rrggbb', () => {
  expect(normalizeColor('#3049E8')).toBe('#3049e8')
  expect(normalizeColor('red')).toBeNull()
  expect(normalizeColor('#12345')).toBeNull()
})
```

`strokes.spec.ts`:

```ts
it('maps a pointer into canvas units, whatever the rendered size', () => {
  const size = { width: 1200, height: 900 }
  expect(toUnits(150, 75, { left: 0, top: 0, width: 300, height: 225 }, size)).toEqual([600, 300])
  expect(toUnits(400, 200, { left: 100, top: 50, width: 600, height: 450 }, size)).toEqual([600, 300])
})
it('refuses a rect without size', () => {
  expect(toUnits(1, 1, { left: 0, top: 0, width: 0, height: 0 }, { width: 1200, height: 900 })).toBeNull()
})
it('thins points closer than two units to the last one kept', () => {
  const points = [100, 100]
  expect(appendPoint(points, [101, 101], 1)).toBe(false)
  expect(appendPoint(points, [102, 100], 1)).toBe(true)
  expect(points).toEqual([100, 100, 102, 100])
})
it('drops points beyond the coordinate limit and continues on return', () => {
  const points = [1100, 450]
  expect(appendPoint(points, [10_001, 450], 1)).toBe(false)
  expect(appendPoint(points, [1150, 450], 1)).toBe(true)
})
it('stops at the point limit', () => {
  expect(appendPoint([0, 0], [10, 10], MAX_POINTS)).toBe(false)
})
```

`paintHistory.spec.ts`: Rückgängig bis null Striche → `showsTemplate` wahr; Wiederholen bringt den Strich zurück; ein neuer Strich leert `redo`; Rückgängig bei null Strichen ändert nichts.

`render.spec.ts` mit einem aufzeichnenden Kontext (ein Objekt, das `beginPath`, `moveTo`, `lineTo`, `arc`, `stroke`, `fill` und die gesetzten Eigenschaften protokolliert, als `CanvasRenderingContext2D` gecastet): ein Strich mit drei Punkten zeichnet `moveTo` + zwei `lineTo` mit `lineWidth = Durchmesser × scale`, `lineCap`/`lineJoin` `'round'`, `strokeStyle` = Farbe; ein Strich mit einem Punkt zeichnet einen gefüllten Kreis mit Radius `Durchmesser / 2 × scale`; `drawSegment(…, from = 2)` zeichnet nur das letzte Stück.

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd webapp-vue && pnpm test src/games/paintratio`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`toUnits`: `Math.round((clientX − left) / width × size.width)`, ebenso `y`; `null` ohne Breite oder Höhe. `appendPoint` hängt an, außer: Abstand zum letzten Punkt (`dx² + dy² < MIN_STEP²`), Koordinate außerhalb `±COORDINATE_LIMIT`, `pointsSoFar ≥ MAX_POINTS`. `strokesOf` liest `{ strokes }` streng wie der Server (Feldmengen, ganze Zahlen, Grenzen, Farbe nach `normalizeColor` unverändert).

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd webapp-vue && pnpm test src/games/paintratio && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Record and draw Kreativverhältnis strokes“)

---

### Task 6: Frontend — der Entwurf auf dem Gerät

**Files:**
- Create: `webapp-vue/src/games/drafts.ts`
- Create: `webapp-vue/src/games/__tests__/drafts.spec.ts`
- Modify: `webapp-vue/src/games/copyblocks/draft.ts`
- Create: `webapp-vue/src/games/paintratio/draft.ts`
- Test: `webapp-vue/src/games/paintratio/__tests__/draft.spec.ts`

**Interfaces:**
- Consumes: `Stroke`, `strokesOf`, `PaintState` (Task 5).
- Produces:
  - `games/drafts.ts`:
    ```ts
    export const STALE_AFTER_MS = 48 * 60 * 60 * 1000
    export function deviceStorage(): Storage | null
    export function fingerprint(text: string): string
    export function clearDraft(storage: Storage | null, key: string): void
    export function sweepDrafts(storage: Storage | null, prefix: string, keep: string, now?: number): void
    ```
  - `copyblocks/draft.ts` behält `deviceStorage`, `clearDraft` (Re-Export) und `sweepDrafts(storage, keep, now)` (ruft die geteilte mit seinem Präfix aus `OWN_KEY`); `draftKey`, `loadDraft`, `saveDraft` bleiben dort.
  - `paintratio/draft.ts`:
    ```ts
    export function draftKey(input: { userId: string; assetUrl: string }): string  // `paint-ratio:draft:${userId}:${fingerprint(assetUrl)}`
    export function draftPrefix(userId: string): string
    export function loadDraft(storage: Storage | null, key: string, brushCount: number): PaintState | null
    export function saveDraft(storage: Storage | null, key: string, state: PaintState, now?: number): void
    ```
    Gespeichert: `{ v: 1, at, strokes, redo }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`drafts.spec.ts`: `fingerprint` ist stabil und unterscheidet zwei Texte; `sweepDrafts` entfernt nur Schlüssel mit dem Präfix, nicht `keep`, nur älter als `STALE_AFTER_MS` oder ohne lesbare Zeit; ein werfender Speicher wirft nicht weiter.

`paintratio/__tests__/draft.spec.ts`:

```ts
it('keys a draft by player and round address', () => {
  const a = draftKey({ userId: 'u1', assetUrl: '/api/communities/x/rounds/12/assets/target?round=r1' })
  const b = draftKey({ userId: 'u1', assetUrl: '/api/communities/x/rounds/12/assets/target?round=r2' })
  expect(a).toMatch(/^paint-ratio:draft:u1:[0-9a-f]{8}$/)
  expect(a).not.toBe(b)
})
it('saves and loads strokes and redo', () => { /* Rundreise über einen Speicher-Fake */ })
it('discards a draft that no longer fits', () => {
  // je null und entfernt: kaputtes JSON; v 2; brush 3 bei brushCount 3; color '#3049E8'; mehr als MAX_POINTS
})
it('plays on without storage', () => { /* storage null und ein Speicher, dessen getItem/setItem wirft */ })
```

Die bestehenden Tests unter `copyblocks/__tests__/` bleiben **unverändert** und grün.

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd webapp-vue && pnpm test src/games/__tests__/drafts.spec.ts src/games/paintratio/__tests__/draft.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — die geteilten Teile wörtlich aus `copyblocks/draft.ts` hinüberziehen; `loadDraft` liest mit `strokesOf` (Task 5) für `strokes` und `redo`.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd webapp-vue && pnpm test src/games && pnpm typecheck`
Expected: PASS, Blockierung eingeschlossen.

- [ ] **Step 5: Commit** (z. B. „Share draft storage between Blockierung and Kreativverhältnis“)

---

### Task 7: `HoldButton` meldet seinen Fortschritt

**Files:**
- Modify: `webapp-vue/src/ui/HoldButton.vue`
- Test: `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`

**Interfaces:**
- Produces: `defineEmits<{ confirm: []; progress: [value: number] }>()` — `progress` bei jeder Änderung von `0 … 1`, auch beim Zurücklaufen; am Ende eines Abbruchs `0`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
it('reports its progress while held and as it runs back', async () => {
  // halten bis ~halb (Fake-rAF wie die Nachbartests), loslassen, zurücklaufen lassen:
  // emitted('progress') steigt zuerst, fällt dann und endet bei 0
})
```

- [ ] **Step 2: Laufen lassen, er scheitert**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/HoldButton.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — ein `watch(progress, (value) => emit('progress', value))`; im Kopfkommentar ein Satz: ein Brett, dessen Knopf verdeckt sein kann (Handballen), zeigt diesen Wert selbst groß.

- [ ] **Step 4: Laufen lassen, er besteht** — `pnpm test src/ui` grün.

- [ ] **Step 5: Commit** (z. B. „Let HoldButton report its progress“)

---

### Task 8: Frontend — Leinwand und Brett

**Files:**
- Create: `webapp-vue/src/games/paintratio/LayerCanvas.vue`
- Create: `webapp-vue/src/games/paintratio/PaintCanvas.vue`
- Create: `webapp-vue/src/games/paintratio/PaintRatioRules.vue`
- Create: `webapp-vue/src/games/paintratio/PaintRatioBriefing.vue`
- Create: `webapp-vue/src/games/paintratio/PaintRatioBoard.vue`
- Test: `webapp-vue/src/games/paintratio/__tests__/PaintRatioBoard.spec.ts`, `LayerCanvas.spec.ts`

**Interfaces:**
- Consumes: Task 5 (auch `CanvasLayer` aus `render.ts`), 6, 7; `InfoBox`, `AwardBox`, `HoldButton`, `readableTextColor`.
- Produces:
  - `LayerCanvas.vue` Props: `width: number`, `height: number`, `brushes: number[]`, `layers: CanvasLayer[]`, `templateSrc: string | null`. Zeichnet die Ebenen in Reihenfolge; Backing-Store = CSS-Größe × `devicePixelRatio` per `ResizeObserver`; weiß; ohne 2D-Kontext (happy-dom) zeichnet es nichts und wirft nicht. Exponiert `drawSegment(stroke, from)` für die inkrementelle Spur.
  - `PaintCanvas.vue` Props: `width`, `height`, `brushes`, `state: PaintState`, `brush: number`, `color: string`, `templateSrc: string | null`, `locked: boolean`. Emits: `commit: [stroke: Stroke]`, `touch: [down: boolean]` (`true` bei `pointerdown` eines Fingers auf der Leinwand, `false`, wenn kein Finger mehr liegt).
  - `PaintRatioBoard.vue` Props: `payload: PaintRatioPayload`, `templateSrc: string | null`, `pictureFailed: boolean`, `myColorHex: string`, `draftKey: string | null`, `disabled: boolean`, `awardRule: AwardRule | null`, `awardPoints: number | null`. Emits: `guess: [value: PaintRatioGuess]`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`PaintRatioBoard.spec.ts` (das Rechteck der Leinwand per `vi.spyOn(Element.prototype, 'getBoundingClientRect')` auf 300 × 225 setzen; `HoldButton` gestubbt, damit `progress` und `confirm` gezielt emittiert werden):

```ts
it('shows the template until the first stroke and again after undoing it')
it('starts with the player colour in lower case')                  // myColorHex '#3049E8' → input value
                                                                    // '#3049e8'
it('records a stroke in canvas units')                              // pointerdown (0,0) → move (150,75) →
                                                                    // up → confirm: emitted('guess')
                                                                    // strokes[0].points == [0, 0, 600, 300]
it('reads the canvas rect on every move')                           // Rechteck wechselt mitten im Strich
                                                                    // von 300 × 225 auf 600 × 450: der
                                                                    // nächste Punkt folgt dem neuen
it('lets a finger paint that is not the primary pointer')           // isPrimary false malt
it('ignores a second finger while one paints')
it('enables „Signieren“ only from the first stroke')
it('greys the canvas and shows „Signieren …“ while the hold runs')  // progress 0.4 → Sperre sichtbar;
                                                                    // progress 0 → weg
it('cancels the hold when a finger touches the canvas, and paints nothing then')
                                                                    // bei progress 0.4: pointerdown auf der
                                                                    // Leinwand → HoldButton disabled, kein
                                                                    // neuer Strich; nach pointerup und
                                                                    // progress 0 malt der nächste Finger
it('keeps the hold from starting while a finger paints')            // pointerdown auf der Leinwand →
                                                                    // HoldButton disabled bis pointerup
it('sends exactly the strokes on the canvas')                       // confirm → emitted('guess') ==
                                                                    // { strokes: state.strokes }
it('saves the draft after every change and restores it on mount')   // Speicher-Fake über deviceStorage
it('says so when the picture failed to load')                       // pictureFailed → „Das Bild ließ sich
                                                                    // nicht laden.“
```

`LayerCanvas.spec.ts`: mountet ohne 2D-Kontext, ohne zu werfen; mit einem Fake-Kontext (`HTMLCanvasElement.prototype.getContext` gespyt) zeichnet es das Bild der Vorlage für `{ kind: 'template' }` und die Striche für `{ kind: 'strokes' }` in der Reihenfolge der Ebenen.

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd webapp-vue && pnpm test src/games/paintratio`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

- **Layout** (Spec, *Brett*, gewählt an Mockup A und I): Leinwand kartenbreit wie `PlacePatchBoard` (`-mx-4 -mt-4`), Seitenverhältnis `width / height`, `touch-none select-none`; darunter die Werkzeugzeile: drei runde Pinselpunkte in der aktuellen Farbe (Größe 10/16/24 px, gewählter mit Ring, aria `Pinsel klein|mittel|groß`, `aria-pressed`), `<input type="color">` (aria `Farbe`, Wert durch `normalizeColor`), Rückgängig/Wiederholen (aria, ausgegraut ohne Ziel); die Aufforderung; ein runder `HoldButton` (`size-24`, `color` = aktuelle Farbe) mit `Signieren` darüber in `readableTextColor`; dann `PaintRatioBriefing`.
- **Pointer** in `PaintCanvas`: `pointerdown` nur auf der Leinwand, `setPointerCapture`; ein Pointer zur Zeit, egal ob primär; Rechteck bei **jedem** Ereignis neu lesen (`toUnits`); `appendPoint` mit `pointCount(state.strokes)`; während des Strichs `drawSegment`; bei `pointerup`/`pointercancel` `commit`. Bei `locked` emittiert `pointerdown` nur `touch` und malt nicht. Ab `MAX_STROKES` Strichen beginnt kein neuer.
- **Sperre** im Brett: `holdProgress` aus `@progress`; `locked = holdProgress > 0`; über der Leinwand ein grauer Schleier mit großem Ring (`conic-gradient` wie der Ring des `HoldButton`) und `Signieren …`. `touching` aus `@touch`; `HoldButton :disabled="props.disabled || state.strokes.length === 0 || touching"`.
- **Entwurf:** beim Mount `sweepDrafts(…, draftPrefix(userId), key)` und `loadDraft`; nach jeder Änderung `saveDraft`. Ohne `draftKey` kein Entwurf.
- `PaintRatioBriefing` wie `CopyBlocksBriefing`: `InfoBox storage-key="paint-ratio"` mit Kurztext und `PaintRatioRules` (die vier Regeln wörtlich); `AwardBox game-id="paint-ratio"` mit den Texten aus *Global Constraints*, die Toleranz als `formatPercent` aus Task 9 — bis dahin lokal `Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })`, in Task 9 auf `formatPercent` umgestellt.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Paint on the Kreativverhältnis board and sign by holding“)

---

### Task 9: Frontend — Auflösung und Rangliste

**Files:**
- Create: `webapp-vue/src/games/paintratio/layers.ts`
- Create: `webapp-vue/src/games/paintratio/scoreboard.ts`
- Create: `webapp-vue/src/games/paintratio/PaintRatioScoreboard.vue`
- Create: `webapp-vue/src/games/paintratio/PaintRatioReveal.vue`
- Modify: `webapp-vue/src/games/paintratio/PaintRatioBriefing.vue` (auf `formatPercent`)
- Test: `webapp-vue/src/games/paintratio/__tests__/layers.spec.ts`, `scoreboard.spec.ts`, `PaintRatioReveal.spec.ts`

**Interfaces:**
- Consumes: Task 5, 8; `RevealScoreboard`, `rowHead`, `withTicks`, `ScoreboardRow`, `ScoreboardColumn`, `revealChoreography`.
- Produces:
  - `layers.ts`: `export const KOLLEKTIV = 'kollektiv-kommune'`, `export const DEFAULT_LAYERS: readonly string[] = [KOLLEKTIV]`, `export function toggleLayer(selected: readonly string[], id: string): string[]`
  - `scoreboard.ts`:
    ```ts
    export interface ScoreRow extends ScoreboardRow { ratioLabel: string | null; differenceLabel: string | null; strokes: Stroke[] | null }
    export function scoreRows(input: { entries: readonly GameEntry[]; awardRule: AwardRule | null; mineUserId: string | null; brushCount: number }): ScoreRow[]
    export function formatPercent(fraction: number): string
    export function formatDifference(fraction: number): string
    ```
  - `PaintRatioScoreboard.vue` Props: `rows`, `live`, `animate`, `selected: readonly string[]`, `targetRatio: number`, `tolerance: number | null`. Emits `select: [id: string]`.
  - `PaintRatioReveal.vue` Props: `payload`, `solution`, `templateSrc`, `rows`, `live`, `animate`, `mineUserId`.

- [ ] **Step 1: Die fallenden Tests schreiben**

```ts
// layers.spec.ts
it('adds a layer on top and removes it on the second tap', () => {
  expect(toggleLayer([KOLLEKTIV], 'u1')).toEqual([KOLLEKTIV, 'u1'])
  expect(toggleLayer([KOLLEKTIV, 'u1', 'u2'], 'u1')).toEqual([KOLLEKTIV, 'u2'])
  expect(toggleLayer([], KOLLEKTIV)).toEqual([KOLLEKTIV])
})

// scoreboard.spec.ts
it('formats German percent with one decimal', () => {
  expect(formatPercent(0.4234)).toBe('42,3 %')
  expect(formatDifference(0.012)).toBe('+1,2 %')
  expect(formatDifference(0)).toBe('0,0 %')
})
it('ranks by the size of the difference, unreadable rows last, then by user id')
it('keeps a row whose strokes or outcome are unreadable, without strokes')
it('gives up rows no strokes')                                      // entry.guess null
```

`formatDifference(-0.008)` gibt aus, was `Intl` für `de-DE` mit `signDisplay: 'exceptZero'` liefert; der Test prüft ihn gegen `new Intl.NumberFormat(…)`, nicht gegen ein von Hand geschriebenes Minuszeichen.

`PaintRatioReveal.spec.ts`:

```ts
it('shows the target ratio and, in phase one, the tolerance in the head')
it('starts on the Kollektiv's picture after a reload')              // animate false → Ebenen DEFAULT_LAYERS
it('keeps the own painting, then fades to the picture at SOLUTION_DELAY_MS')
                                                                    // vi.useFakeTimers; animate true
it('lays a painting over the picture when its name is tapped, in tap order')
it('switches the picture itself from the Kollektiv Kommune row')
it('offers no button for a row without strokes')                    // aufgegeben oder unlesbar
```

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd webapp-vue && pnpm test src/games/paintratio`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

- `scoreRows`: `rowHead` je Eintrag, `asPaintRatioOutcome`, `strokesOf(entry.guess, brushCount)`; Sortierung `|difference|` aufsteigend, Zeilen ohne lesbares Outcome zuletzt, dann `userId`; `withTicks`.
- `PaintRatioScoreboard`: `RevealScoreboard` mit den Spalten `ratio` (`Anteil`, `fact` = `formatPercent(targetRatio)`) und `difference` (`Differenz`, `fact` = `± ${formatPercent(tolerance)}` nur in Phase eins), Caption wörtlich; `#name`-Slot als Knopf wie `CopyBlocksScoreboard` (`aria-pressed`, `data-test="select-<userId>"`), nur für Zeilen mit `strokes`; darunter, mit Trennlinie, ein Knopf `Kollektiv Kommune` (`data-test="select-kollektiv"`) mit Zielanteil.
- `PaintRatioReveal`: `LayerCanvas` mit den Ebenen aus `selected` (`KOLLEKTIV` → `{ kind: 'template' }`, sonst die Striche der Zeile). Mit `animate`: zuerst nur das eigene Gemälde, nach `SOLUTION_DELAY_MS` Überblenden (`FADE_MS`, zwei gestapelte `LayerCanvas`, das obere wird durchsichtig) auf `DEFAULT_LAYERS`; ohne `animate` sofort `DEFAULT_LAYERS`.
- `PaintRatioBriefing` nimmt `formatPercent`.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Reveal the Kreativverhältnis gallery and ranking“)

---

### Task 10: Frontend — Spiel, Registrierung, Labor

**Files:**
- Create: `webapp-vue/src/games/paintratio/PaintRatioGame.vue`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Test: `webapp-vue/src/games/paintratio/__tests__/PaintRatioGame.spec.ts`

**Interfaces:**
- Consumes: `GameProps`, `GameEmits`, `useSealedAsset`, `useMyColorHex`, `useRevealedLive`, Task 5–9.
- Produces: `'paint-ratio': PaintRatioGame` (direkter Import, keine schwere Abhängigkeit); `{ id: 'paint-ratio', title: 'Kreativverhältnis' }` in `labGameList` nach `copy-blocks`.

- [ ] **Step 1: Die fallenden Tests schreiben**

```ts
it('shows the board until the solution arrives')
it('shows the reveal once there is a solution, also for a closed round without own guess')
it('emits the board's guess as its own')                           // emitted('guess')
it('clears the draft once the solution is there')
it('keys the draft by mineUserId and the target's address')        // assets.url('target')
it('renders nothing playable without a readable payload')
```

- [ ] **Step 2: Laufen lassen, sie scheitern**

Run: `cd webapp-vue && pnpm test src/games/paintratio/__tests__/PaintRatioGame.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — Aufbau wie `GuessHueGame.vue`: Einengen (`asPaintRatioPayload`, `asPaintRatioSolution`), `useSealedAsset(() => props.assets, 'target')` für `templateSrc` und `pictureFailed` (Zustand `failed`), `myColorHex` aus `useMyColorHex`, `rows` aus `scoreRows`, `live = awardRule === 'CLOSEST_ONLY'`, `animate = useRevealedLive(() => solution.value !== null)`; Brett ohne Lösung, Auflösung mit Lösung; `clearDraft`, sobald die Lösung da ist.

- [ ] **Step 4: Laufen lassen, sie bestehen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** (z. B. „Register Kreativverhältnis in rounds and the lab“)

---

### Task 11: Doku nachziehen, Gesamtlauf, Handprobe

**Files:**
- Modify: `.claude/guidelines/frontend.md` — Regel „Gemessen wird nie aus einem Canvas“: der Canvas zeigt nur; was zählt oder gespeichert wird, sind Modelldaten (hier Striche). Grund in zwei Sätzen: Kantenglättung je Pixeldichte, verrauschtes `getImageData` durch Anti-Fingerprinting; das Original „Ratio“ hat so falsch gezählt.
- Modify: `.claude/guidelines/frontend-ui.md` — ein Brett, dessen Halteknopf verdeckt sein kann (Handballen beim Malen), zeigt den Fortschritt selbst groß und bricht das Halten ab, sobald die Spielfläche berührt wird (`HoldButton` `progress` + `disabled`).
- Modify: `docs/superpowers/specs/2026-10-22-kreativverhaeltnis-design.md` — Status `umgesetzt (Datum)`.

- [ ] **Step 1: Doku schreiben** (je wenige Sätze, englisch in den Guidelines).

- [ ] **Step 2: Gesamtlauf**

Run: `cd core && ./mvnw clean test` und `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: alles grün.

- [ ] **Step 3: Commit** (z. B. „Note the canvas and hold rules from Kreativverhältnis“)

- [ ] **Step 4: Handprobe im Labor — für Clemens, auf dem Handy**

Nicht im Browser-Pane prüfbar (siehe *Global Constraints*). Die Liste für Clemens: alle zehn Formen über Seeds ansehen (Toleranzen, Dichte, Freihand, Komposition); 66 % in einer Bewegung füllen und abgeben; Handballen auf „Signieren“ beim Malen; Rückgängig bis zur Vorlage und zurück; Neuladen mitten im Malen; Auflösung mit mehreren Testern, Ebenen antippen; Takte.
