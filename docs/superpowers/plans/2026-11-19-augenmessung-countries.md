# Augenmaß (Länder) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Augenmaß“ (`match-scale`) als elftes Rundenspiel, mit der Kategorie Länder: zwei Silhouetten, A fest, B zieht der Spieler auf das wahre Größenverhältnis.

**Architecture:** Ein Offline-Skript erzeugt aus Natural Earth eine Kategorie-Datei (normierte SVG-Pfade + `metresPerUnit`), sops verschlüsselt sie ganz, `update.sh` entschlüsselt alle Kategorien aus `deploy/match-scale/categories.txt` in ein Verzeichnis, das Backend lädt es. Neues Modulith-Modul `matchscale` (Datensatz, Ziehung, kein Schema), Adapter `MatchScaleGameType` in `game.internal`. Frontend `games/matchscale/`: reine Module (Typen, Gesten/Ansicht, Zwischenstand, Rangliste) unter einer SVG-Spielfläche.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher + mockk · Jackson 3 · Node 24 (Skript, keine Abhängigkeiten) · sops/age · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-11-19-augenmessung-design.md`](../specs/2026-11-19-augenmessung-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr. **Tiere sind nicht Teil dieses Plans** (Folge-PR).

**Vorbilder:** Datensatz + Fail-Fast: `spotobject/internal/SpotObject{Configuration,TermsLoader,Properties}.kt` und `guesshue/`; Adapter + Feldmengen-Tests: `GuessHueGameType` / `GuessHueGameTypeTest`; Wiederholung vermeiden: `PlacePatchGameType` (`context.previousParams`); sops-Skript: `scripts/guess-hue-dataset.sh`; Deploy: `prepare_spot_object_terms` in `deploy/update.sh`; Frontend-Bauform und Zwischenstand: `games/turnpipes/`; Rangliste und Auflösungstakt: `games/guesshue/`.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden oder schweigt):

1. **Natural Earth 1:50m** Admin-0 (`ne_50m_admin_0_countries.geojson`). Länder = `TYPE ∈ {"Sovereign country", "Country"}`, Name aus `NAME_DE` (sonst `NAME`).
2. **Projektion** sphärisch (R = 6 371 008,8 m), Lambert azimutal flächentreu um den Mittelpunkt des größten Polygons — Mittelpunkt als Mittel der Einheitsvektoren seiner Punkte (antimeridian-fest).
3. **Teile:** behalten wird ein Polygon, wenn sein projizierter Bbox-Mittelpunkt in der Bbox des größten Polygons liegt, erweitert um `PART_REACH = 0.5 ×` deren längste Seite, und seine Fläche `≥ MIN_PART_SHARE = 0.002 ×` die des größten. Beide Konstanten oben im Skript, gestimmt auf der Prüfseite.
4. **Vereinfachen** Douglas-Peucker mit `SIMPLIFY_UNITS = 1.5` in normierten Einheiten; danach Bbox der vereinfachten Punkte **neu** auf 1000 normieren, dann runden — so ist `max(width, height) == 1000` exakt und `metresPerUnit` misst die gezeichnete Form. Pfad: je Ring `M x y` + relative `l`, `z`; ganze Zahlen; y nach unten (Norden oben).
5. **Länder-Eingabe** `.local/match-scale-input/countries.yaml` enthält JSON (gültiges YAML, ohne Parser lesbar): `{"exclude": ["<ADM0_A3>", …]}`. Ausgabe-YAML schreibt das Skript selbst, Strings JSON-gequotet.
6. **Sample** im Classpath: zwei feste Ressourcen `/match-scale-sample/shapes.yaml` und `/match-scale-sample/blocks.yaml` (ein Classpath-Verzeichnis lässt sich im JAR nicht auflisten).
7. **Grenze für `scale`** im Server: endlich und `> 0`. Client klemmt auf `[0.05, 20]`.
8. **Toleranzgrenze** inklusive: `deviation <= ln(1.1) + 1e-9`.
9. **Gespeicherter Tipp** wird verengt auf `{"scale": <Double>}` (`Judgement.guess`), wie Weltanschauung: fremde Felder werden nie anderen Spielern gezeigt.
10. **Spielfläche:** quadratisch, 9 × 9 Kästchen bei Zoom 1, Welt in Kästchen, y nach oben, Bodenlinie `y = 0`, sichtbar `y ∈ [-2, 7]`, `x ∈ [0, 9]`. A: längste Seite `START_CELLS = 3`, unten links bei `(1, 0)`. B: unten links bei `(2 + Breite(A), 0)`, Faktor 1. Zoom `[1/8, 8]` relativ zur Startgröße.
11. **Raster beim Zoomen:** alle drei Kandidaten der Spec hinter einer Konstante `GRID_MODE: 'screen' | 'world' | 'stepped'`, Vorgabe `'stepped'` (Linienabstand `2^k` Kästchen, so dass er auf dem Schirm in `[24, 48)` px liegt). Entscheidung in der Handprobe (Task 9), danach fliegen die anderen zwei raus.
12. **Farben:** A in `--color-on-surface-variant`, B in der eigenen Spielerfarbe (`useMyColorHex`), Labels in derselben Farbe. Labor kann umstimmen.
13. **Griff:** sichtbarer Kreis, 44 px Durchmesser, Mittelpunkt auf B's Ecke oben rechts. Skalieren projiziert den Finger auf die Diagonale von B (unten links fest).
14. **Gesten:** ein Finger auf B → verschieben; auf dem Griff → skalieren; auf leerer Fläche → Ansicht verschieben; zwei Finger → Pinch-Zoom um ihre Mitte; Mausrad → Zoom um den Zeiger (fürs Labor am Desktop). Während der Abgabeknopf gehalten wird, nimmt die Fläche nichts an (wie Verrohrung).
15. **Auflösung:** Ansicht passt sich an, so dass A, wahres B und eigener Umriss sichtbar sind (`fitView`, höchstens Zoom-Minimum). Fremde Umrisse stehen an derselben Ecke unten links wie das wahre B.
16. **Rangliste:** Abweichung vorzeichenbehaftet `(scale / factor − 1) × 100`, gerundet, mit `+`/`−`; Sortierung über `outcome.deviation`.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**. Branch: `feature/mini-game-size-comparison-415306`. Nicht pushen.
- **Spielinhalt nie im Klartext** in Commit, Plan, Test oder Chat: keine echten Ländernamen mit Maßen, keine Ausgabe des Skripts ins Repo. Klartext liegt nur in `.local/` **des Hauptcheckouts** (`git rev-parse --git-common-dir`/..), nie im Worktree. Tests nutzen erfundene Einträge.
- **Kotlin:** named arguments ab zwei Argumenten (Ausnahmen laut `.claude/guidelines/kotlin.md`). Logger per `KotlinLogging.logger {}` in der Klasse, Lambda-Nachrichten.
- **Testing:** kotest-Matcher, mockk; Frontend Vitest + `vi`. **TDD:** erst der fallende Test.
- **Keine redundanten Inline-Kommentare.** Nur wo die Zeile sonst falsch gelesen wird.
- **Namen:** Spiel-Id `match-scale`, Anzeigename `Augenmaß`, Modul `matchscale`, Klassen `MatchScale*`, Frontend `games/matchscale/`, Storage-Key `match-scale`.
- **Feste Zahlen (Spec):** Faktor zwischen A und B in `[1/10, 10]`; Toleranz Phase eins `1.1` (±10 % im Log), Phase zwei `null`; `deviation = |ln(scale / factor)|`; normierte längste Seite `1000`; Raster 9 Kästchen hoch, Bodenlinie 2 Kästchen über dem Rand; Griff ≥ 44 px; Richtwert Länder-Datei `< 500 KB` Klartext.
- **Ströme:** die Ziehung nur aus `random.presentation`; `scene` und `solution` bleiben unberührt.
- **Wörtliche Texte** (Entscheidung dieses Plans, deutsch):
  - InfoBox-Kurztext: `Zieh deine Silhouette so groß, wie sie im Vergleich wirklich ist.`
  - Regeln: `Ziehen verschiebt deine Silhouette — auch über die andere.` · `Der Griff oben rechts ändert ihre Größe.` · `Mit zwei Fingern zoomst du.` · `Abgegeben wird, indem du den Knopf gedrückt hältst.`
  - AwardBox: qualifiziert `Höchstens 10 % daneben.`, nächster `Der Tipp, der am nächsten dran ist.`
  - Abgabe: Aufschrift `Abgeben`, Label `Größe abgeben — gedrückt halten`. Griff-Label `Größe ändern`.
  - Auflösung: `Dein Tipp: {tip}× · tatsächlich: {factor}×` (Zahlen `de-DE`, höchstens 2 Nachkommastellen).
  - Ohne Darstellung: `Diese Runde lässt sich hier nicht anzeigen.` · Ranglisten-Caption: `Alle Tipps der Runde, nach Punkten sortiert`.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Vor `pnpm lint` geänderte Dateien mit `pnpm exec prettier --write <Dateien>` formatieren; `pnpm lint` endet bei Warnungen mit 0 — Ausgabe auf `warning` prüfen. Voller Backend-Lauf nach gelöschten Quellen: `./mvnw clean test`.
- **Downloads** (Natural-Earth-Datei, Task 4) erst nach ausdrücklichem OK des Nutzers; Ziel ein eigenes leeres Verzeichnis.
- **Browser-Pane:** meldet sich als versteckt, kein `requestAnimationFrame` — Gesten, Halten und Takte gehören in die Handprobe am Handy (Task 9).

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Ein Land über den Antimeridian** (Ringe mit Längen um ±180°) wird nicht quer über die Welt gezogen: die Projektion um den Vektor-Mittelpunkt hält es zusammen. → Task 4, Prüfseite + Stichprobe im Skript-Selbsttest.
2. **Ein Zwischenstand, der nicht mehr passt** (kaputtes JSON, `scale` ≤ 0 oder `NaN`, alte Version) wird verworfen; ein Speicher, der wirft, lässt das Spiel ohne Zwischenstand laufen. → Task 6.
3. **Ein Tipp mit Zusatzfeldern oder als String** (`{"scale":"2"}`, `{"scale":2,"x":1}`) wird abgelehnt bzw. verengt gespeichert. → Task 3.
4. **Eine Edition, die alle Paare einer Kategorie verbraucht hat,** zieht trotzdem (Sperre fällt für die Kategorie), statt zu werfen. → Task 2.
5. **Ein Pinch, bei dem ein Finger auf B beginnt,** verschiebt B nicht, sondern zoomt; ein zweiter Finger beendet laufendes Verschieben/Skalieren ohne Sprung. → Task 7.

---

### Task 1: Modul `matchscale` — Datensatz laden

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/matchscale/MatchScaleEntry.kt`, `MatchScaleCategory.kt`, `MatchScaleDataset.kt` (vorerst nur Halter, Ziehung in Task 2)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/matchscale/internal/MatchScaleDatasetYamlReader.kt`, `MatchScaleDatasetLoader.kt`, `MatchScaleDatasetProperties.kt`, `MatchScaleDatasetConfiguration.kt`, `MatchScaleDatasetException.kt`
- Create: `core/src/main/resources/match-scale-sample/shapes.yaml`, `blocks.yaml`
- Modify: `core/src/main/resources/application.yaml` (Block `app.match-scale`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/matchscale/MatchScaleDatasetYamlReaderTest.kt`, `MatchScaleDatasetLoaderTest.kt`, `MatchScaleDatasetFailFastTest.kt`

**Interfaces:**
- Produces:
  - `data class MatchScaleEntry(val name: String, val path: String, val width: Double, val height: Double, val metresPerUnit: Double, val attribution: String?)` — `attribution` ist bereits aufgelöst (Eintrag, sonst Kategorie).
  - `data class MatchScaleCategory(val key: String, val displayName: String, val entries: List<MatchScaleEntry>)`
  - `open class MatchScaleDataset(open val categories: List<MatchScaleCategory>)` (`open` wegen Modulith-Observability, siehe `GuessHueDataset`)
  - `object MatchScaleDatasetYamlReader { fun read(input: InputStream, origin: String): MatchScaleCategory }`
  - `class MatchScaleDatasetLoader(properties) { fun load(): LoadedMatchScaleDataset }`, `data class LoadedMatchScaleDataset(val categories: List<MatchScaleCategory>, val origin: String, val isSample: Boolean)`
  - `@ConfigurationProperties("app.match-scale") open class MatchScaleDatasetProperties(val datasetDir: String = "")`
  - Bean `matchScaleDataset(loader, environment): MatchScaleDataset`
  - `const val MAX_FACTOR = 10.0` in `MatchScaleDataset.Companion` (wird hier schon fürs Auslassen gebraucht).

- [ ] **Step 1: Write the failing reader tests** — `MatchScaleDatasetYamlReaderTest`:
  - `reads a category with its entries` — erfundene Datei mit zwei Einträgen; `key`, `displayName`, Felder, `attribution` vom Eintrag überschreibt die der Kategorie, fehlt sie am Eintrag, gilt die der Kategorie, fehlt beides → `null`.
  - je ein Fall → `MatchScaleDatasetException`, Meldung nennt `origin` und den Eintrag: Schlüssel nicht `[a-z0-9-]+`; `displayName` leer; keine Einträge; `path` leer; `width`, `height` oder `metresPerUnit` ≤ 0, `NaN` oder fehlend; `max(width, height)` ≠ 1000 (Toleranz `1e-9`); Name doppelt in der Kategorie.
- [ ] **Step 2: Run** `./mvnw test -Dtest='MatchScaleDatasetYamlReaderTest'` — FAIL (Klassen fehlen).
- [ ] **Step 3: Implement** Typen und Reader. YAML lesen wie `SpotObjectTermsYamlReader` (Jackson YAML).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Write the failing loader + fail-fast tests:**
  - `MatchScaleDatasetLoaderTest`: leeres `datasetDir` → beide Sample-Kategorien, `isSample = true`; Verzeichnis mit zwei `.yaml` (in `@TempDir`) → beide, `isSample = false`, Dateien ohne `.yaml`-Endung ignoriert; doppelter Kategorie-Schlüssel über Dateien → Exception; Pfad ist keine lesbares Verzeichnis → Exception mit `datasetDir`; eine Kategorie mit weniger als zwei Paaren im Faktor `[1/10, 10]` wird ausgelassen (Paar = ungeordnet, verschiedene Einträge); bleibt keine Kategorie → Exception.
  - `MatchScaleDatasetFailFastTest` (Bauform `SpotObjectTermsFailFastTest`, `MockEnvironment`): Sample unter `production` → Exception mit `production` und `MATCH_SCALE_DATASET_DIR`; unter `staging` → Exception; ohne Profil → zwei Kategorien.
- [ ] **Step 6: Run** — FAIL.
- [ ] **Step 7: Implement** Loader, Properties, Configuration (`DEPLOYED_PROFILES = setOf("production", "staging")`, Warnung bei Sample, bei echter Quelle `logger.info { "Augenmaß loaded ${n} categories (${keys}) from ${origin}" }`, Warnung je ausgelassener Kategorie). Sample-Dateien: je drei bis vier erfundene Einträge (Rechtecke/Dreiecke als Pfad, z. B. `M0 0 l1000 0 l0 500 l-1000 0 z`, Namen „Beispielform Alpha“ …), so dass jede Kategorie ≥ 2 Paare hat. `application.yaml`:
  ```yaml
  app:
    match-scale:
      # Empty means: the sample dataset from the classpath — a boot failure in production/staging,
      # where update.sh decrypts every category with sops into one directory and compose mounts it.
      dataset-dir: ${MATCH_SCALE_DATASET_DIR:}
  ```
- [ ] **Step 8: Run** `./mvnw test -Dtest='MatchScaleDataset*' ` — PASS; dann `./mvnw test -Dtest=ModularityTests` — PASS.
- [ ] **Step 9: Boot** (Configuration-Guideline): `./mvnw spring-boot:run` mit leerem `MATCH_SCALE_DATASET_DIR` startet, Log zeigt die Sample-Warnung. Abbrechen.
- [ ] **Step 10: Commit** — `Add the match-scale dataset module`.

### Task 2: Ziehung

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/matchscale/MatchScaleDataset.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/matchscale/MatchScalePair.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/matchscale/MatchScaleDrawTest.kt`

**Interfaces:**
- Consumes: Task 1.
- Produces: `data class MatchScalePair(val category: MatchScaleCategory, val a: MatchScaleEntry, val b: MatchScaleEntry) { val factor: Double = b.metresPerUnit / a.metresPerUnit }` und `open fun draw(presentation: SeededRandom, used: Map<String, Set<String>>): MatchScalePair` — `used`: Kategorie-Schlüssel → schon gezogene Namen (A und B).

- [ ] **Step 1: Write the failing tests** (`MatchScaleDrawTest`, erfundener Datensatz im Test gebaut, kein Spring):
  - `the factor always lies within one tenth and ten` — 500 Seeds, `1/10 <= factor <= 10`.
  - `a and b are different entries of the same category`.
  - `the same seed draws the same pair`.
  - `an entry used earlier in the edition is not drawn again` — `used` mit allen bis auf zwei passende Einträge → genau diese zwei.
  - `once a category has no unused pair, its block is lifted` — `used` enthält alle Namen → zieht trotzdem, wirft nicht.
  - `every category is drawn` — 200 Seeds treffen beide Kategorien.
- [ ] **Step 2: Run** `./mvnw test -Dtest=MatchScaleDrawTest` — FAIL.
- [ ] **Step 3: Implement.** Reihenfolge ist Vertrag (KDoc wie `GuessHueDataset.draw`): `category = presentation.pick(categories)`; Pool = unbenutzte Einträge, die einen unbenutzten Partner im Faktor-Fenster haben, leer → alle Einträge der Kategorie (mit Partner); `a = pick(pool)`; `b = pick(partner von a im selben Pool)`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `Draw match-scale pairs within a tenfold factor`.

### Task 3: `MatchScaleGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MatchScaleGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/MatchScaleGameTypeTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/songsnippet/SongSnippetBootTest.kt` (Id-Liste, „eleven“), `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`"match-scale" -> {"scale":1.0}`)

**Interfaces:**
- Consumes: `MatchScaleDataset.draw`, `MatchScalePair` (Task 2).
- Produces (Wire, vom Frontend gelesen):
  - `data class MatchScaleSilhouette(val name: String, val path: String, val width: Double, val height: Double, val attribution: String?)`
  - `data class MatchScaleParams(val category: String, val categoryName: String, val a: MatchScaleSilhouette, val b: MatchScaleSilhouette, val factor: Double, val toleranceFactor: Double?)`
  - Payload `{categoryName, a, b, toleranceFactor}` · Solution `{factor, toleranceFactor}` · Outcome `{scale, deviation, withinTolerance}` (`withinTolerance` `null` in Phase zwei) · Tipp `{scale}`.
  - `id = "match-scale"`, `displayName = "Augenmaß"`, `requiresReveal = scoresOnDuration = false`, `TOLERANCE_FACTOR = 1.1`.

- [ ] **Step 1: Write the failing tests** (`MatchScaleGameTypeTest`, `@SpringBootTest` + Testcontainers wie `GuessHueGameTypeTest`, läuft aufs Sample):
  - Id und Anzeigename.
  - gleicher Seed → gleiche Params; `toleranceFactor` `1.1` in Phase eins, `null` in Phase zwei.
  - Feldmengen: Payload `setOf("categoryName", "a", "b", "toleranceFactor")`; `a`/`b` je `setOf("name", "path", "width", "height", "attribution")`; Solution `setOf("factor", "toleranceFactor")`; Outcome `setOf("scale", "deviation", "withinTolerance")`. Phase zwei: `toleranceFactor` explizit `null` im Payload.
  - `the payload never carries a metre value` — weder `factor` noch `metresPerUnit` irgendwo im JSON-Baum.
  - `nothing the player sees moves when only the solution stream changes` (20 Seeds im `solution`-Strom, ein Payload).
  - `previousParams` mit beiden Namen eines Paares → das Paar wird nicht wieder gezogen (Sample groß genug).
  - Wertung: `scale == factor` → `deviation 0`, qualifiziert; `scale = 2 × factor` und `factor / 2` → gleiche `deviation` (`ln 2`); Phase eins `factor × 1.1` qualifiziert, `factor × 1.11` nicht; Phase zwei `factor × 9` qualifiziert.
  - ungültig → `InvalidGuessException`: `scale` fehlt, `0`, `-1`, als String `"2"`; `NaN`/`Infinity` (als Node `DoubleNode`).
  - `the stored guess keeps only the scale` — `{"scale":2.0,"x":1}` → `judgement.guess` ist `{"scale":2.0}`.
- [ ] **Step 2: Run** `./mvnw test -Dtest=MatchScaleGameTypeTest` — FAIL.
- [ ] **Step 3: Implement** nach `GuessHueGameType`. `used` aus `context.previousParams` wie `PlacePatchGameType` (Kategorie → Namen von `a` und `b`). KDocs: Payload-Felder kommen nur aus `presentation`, Faktor folgt aus dem Paar und bleibt im Server.
- [ ] **Step 4: Run** `MatchScaleGameTypeTest`, `SongSnippetBootTest`, `LabServiceTest`, `LabPointsParityTest`, `ModularityTests` — PASS.
- [ ] **Step 5: Commit** — `Add Augenmaß as a round game`.

### Task 4: Offline-Skript (Länder)

**Files:**
- Create: `scripts/match-scale-dataset.mts`

**Interfaces:**
- Produces: `node scripts/match-scale-dataset.mts countries --source <geojson> --input <countries.yaml> --out <countries.yaml> --review <countries.html>` und `node scripts/match-scale-dataset.mts selftest`. Ausgabe im Format der Spec (`category: countries`, `displayName: Länder`, `attribution: "Umrisse: Natural Earth"`).

- [ ] **Step 1: Fragen, dann laden.** Den Nutzer um OK bitten: `ne_50m_admin_0_countries.geojson` (einige MB) von `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/`. Nach OK in `<Hauptcheckout>/.local/match-scale-raw/natural-earth/` laden.
- [ ] **Step 2: Write `selftest` first** — reine Prüfungen ohne Datei, Ausgabe `selftest ok` oder Abbruch mit Grund:
  - Projektion: ein Quadrat 1° × 1° am Äquator und eines bei 60° N haben, projiziert um ihren Mittelpunkt, Flächen im Verhältnis `cos 60°` (±1 %).
  - Antimeridian: ein Polygon mit Längen 179°…−179° projiziert zu einer Breite < 300 km.
  - Douglas-Peucker: kollineare Punkte fallen weg, Ecken bleiben.
  - Normierung: `max(width, height) == 1000`, alle Koordinaten ganzzahlig in `[0, 1000]`.
  - Leck: dasselbe Polygon, einmal ×1 und einmal ×10 skaliert, ergibt **denselben** Pfad.
- [ ] **Step 3: Run** `node scripts/match-scale-dataset.mts selftest` — FAIL (Skript fehlt) → implementieren (Entscheidungen 1–5) → `selftest ok`.
- [ ] **Step 4: Generate.** Länder-Eingabe `{"exclude": []}` im Hauptcheckout anlegen, `countries` laufen lassen. Erwartet: Ausgabe der Statistik (Dateigröße, Punkte Mittel/Max, größter Eintrag); Warnung, falls ≥ 500 KB. Prüfseite markiert winzige Länder (längste Seite < 50 km), Pfade > 400 Punkte und zeigt 12 gezogene Paare im wahren Verhältnis.
- [ ] **Step 5: Prüfseite dem Nutzer zeigen** (Pfad nennen, im Browser-Pane öffnen); `PART_REACH`, `MIN_PART_SHARE`, `SIMPLIFY_UNITS` und `exclude` nach seinem Urteil stimmen, neu erzeugen. Keine Namen oder Maße in den Chat kopieren.
- [ ] **Step 6: Commit** nur das Skript — `Add the match-scale dataset generator`.

### Task 5: sops, Deployment, lokaler Start

**Files:**
- Create: `scripts/match-scale-dataset.sh`, `deploy/match-scale/categories.txt` (eine Zeile `countries`), `deploy/match-scale/countries.sops.yaml`, `deploy/match-scale-input/countries.sops.yaml`
- Modify: `deploy/update.sh`, `deploy/compose.yaml`, `deploy/README.md`, `.gitignore`, `.claude/launch.json`

**Interfaces:**
- Consumes: Ausgabe von Task 4 in `<Hauptcheckout>/.local/match-scale/` und `.local/match-scale-input/`.
- Produces: `scripts/match-scale-dataset.sh decrypt [--force] | encrypt | dev-path` über beide Verzeichnispaare; `dev-path` druckt das Klartext-Verzeichnis `.local/match-scale` (entschlüsselt fehlende Dateien vorher) oder nichts.

- [ ] **Step 1: Write `scripts/match-scale-dataset.sh`** nach `guess-hue-dataset.sh` (Hauptcheckout finden, `--force`-Regeln, `dev-path` still erfolgreich ohne sops/Schlüssel). `encrypt`: jede `.local/match-scale/*.yaml` → `deploy/match-scale/<name>.sops.yaml`, jede `.local/match-scale-input/*.yaml` → `deploy/match-scale-input/<name>.sops.yaml`. `.sops.yaml` bleibt unverändert — prüfen: `sops -e` auf beiden Pfaden greift die bestehende Regel.
- [ ] **Step 2: Run** `./scripts/match-scale-dataset.sh encrypt`; dann `git diff --stat` zeigt nur die zwei Cipher-Dateien; `grep -c ENC\\[ deploy/match-scale/countries.sops.yaml` > 0 und kein Klartext-Pfad (`grep -c '"M' …` = 0). Dateigröße nennen.
- [ ] **Step 3: `update.sh`** — `prepare_match_scale_dataset` nach `prepare_spot_object_terms`:
  - `curl -fsSL "$BASE/match-scale/categories.txt"`; schlägt das fehl → Hinweis „no match-scale categories on '$REF', skipping“, `return 0`, nichts exportiert.
  - Jede nicht-leere Zeile ohne `#` muss `[a-z0-9-]+` sein, sonst Abbruch. Je Schlüssel Cipher laden und mit `sops -d` nach `./secrets/match-scale.$TARGET.new/<key>.yaml` (umask 077); ein Fehler → `.new` löschen, Abbruch, altes Verzeichnis unberührt.
  - Erfolg: altes `./secrets/match-scale.$TARGET` löschen, `.new` dorthin `mv`; Verzeichnis `755`, Dateien `644` (Begründung wie beim Guess-Hue-File: Container-UID). `export MATCH_SCALE_DATASET_HOST_DIR=./secrets/match-scale.$TARGET`.
  - `sh -n deploy/update.sh` — keine Ausgabe.
- [ ] **Step 4: `compose.yaml`** — Umgebung `MATCH_SCALE_DATASET_DIR=/config/match-scale`, Volume `${MATCH_SCALE_DATASET_HOST_DIR:?MATCH_SCALE_DATASET_HOST_DIR is not set -- export it yourself, or run this via deploy/update.sh, see deploy/README.md}:/config/match-scale:ro`. `docker compose -f deploy/compose.yaml config` mit gesetzten Pflichtvariablen läuft durch.
- [ ] **Step 5: `deploy/README.md`** — Abschnitt „Prerequisite: the Augenmaß categories“ (Dauerwissen: `categories.txt`, eine Datei pro Kategorie, `encrypt`, `update.sh` überspringt ohne Liste). Die Reihenfolge des ersten Rollouts **nicht** hier, sondern in die PR-Beschreibung (`update.sh` zuerst auf `main`).
- [ ] **Step 6: `.gitignore`** — `deploy/match-scale.*.sops.yaml` (Download-Kopien beim lokalen Test von `update.sh`); `.claude/launch.json` — `MATCH_SCALE_DATASET_DIR="$(../scripts/match-scale-dataset.sh dev-path)"` neben den anderen beiden.
- [ ] **Step 7: Boot mit echten Daten:** Backend über die launch-Konfiguration starten; Log meldet „Augenmaß loaded … categories“ mit `countries`, keine Sample-Warnung. Stoppen.
- [ ] **Step 8: Commit** — `Deploy Augenmaß's categories via sops` (Body: nur Cipher, kein Inhalt).

### Task 6: Frontend — reine Module

**Files:**
- Create: `webapp-vue/src/games/matchscale/types.ts`, `gestures.ts`, `draft.ts`, `scoreboard.ts`
- Test: `webapp-vue/src/games/matchscale/__tests__/types.spec.ts`, `gestures.spec.ts`, `draft.spec.ts`, `scoreboard.spec.ts`

**Interfaces:**
- Consumes: Wire aus Task 3.
- Produces:
  - `types.ts`: `Silhouette {name, path, width, height, attribution: string | null}`, `MatchScalePayload {categoryName, a, b, toleranceFactor: number | null}`, `MatchScaleSolution {factor, toleranceFactor}`, `MatchScaleOutcome {scale, deviation, withinTolerance: boolean | null}`; `asMatchScalePayload(unknown)`, `asMatchScaleSolution(unknown)`, `asMatchScaleOutcome(unknown)`, `scaleOf(guess: unknown): number | null`.
  - `gestures.ts`: Konstanten `FIELD_CELLS = 9`, `GROUND_OFFSET = 2`, `START_CELLS = 3`, `SCALE_MIN = 0.05`, `SCALE_MAX = 20`, `ZOOM_MIN = 1/8`, `ZOOM_MAX = 8`, `GRID_MODE`; Typen `Point {x, y}`, `View {left, top, cellPx}` (Welt-Punkt oben links, y nach oben), `Placement {x, y, scale}` (Welt, unten links); `baseCellPx(fieldPx)`, `initialView(fieldPx)`, `toScreen(view, p)`, `toWorld(view, p)`, `sizeAt(s: Silhouette, scale)`: `{w, h}` in Kästchen, `initialPlacements(a, b): {a: Placement, b: Placement}`, `pan(view, dx, dy)`, `zoomAt(view, screenPoint, factor, fieldPx)`, `pinch(view, from: [Point, Point], to: [Point, Point], fieldPx)`, `moveBy(placement, dx, dy)`, `scaleToHandle(placement, silhouette, handleWorld)`, `fitView(boxes: Box[], fieldPx)`, `gridLines(view, fieldPx, mode): {xs: number[], ys: number[]}`.
  - `draft.ts`: `draftKey({userId, payload, timed})`, `loadDraft(storage, key): Draft | null`, `saveDraft(storage, key, draft)`, re-export `clearDraft`, `deviceStorage`; `Draft {v: 1, b: Placement, zoom: number, centre: Point}`.
  - `scoreboard.ts`: `scoreboardRows({entries, factor, awardRule, mineUserId}): ScoreboardRow[]` mit `tip` (`"1,3×"`), `off` (`"+23 %"`/`"−18 %"`), Sortierung Punkte ↓ (`null` zuletzt), `deviation` ↑, `userId`; `formatFactor(x)`.

- [ ] **Step 1: Write the failing tests:**
  - `types.spec`: gültige Formen; Junk fällt raus — `NaN`, `width ≤ 0`, fehlender Pfad, `toleranceFactor` fehlend (nur `null` zählt), `scale ≤ 0`, String statt Zahl.
  - `gestures.spec`: `initialView` zeigt `y ∈ [-2, 7]` über die ganze Höhe; `toWorld(toScreen(p)) == p`; `scaleToHandle` hält `x, y` fest und ergibt Faktor 2 für einen Griff auf der doppelten Diagonale, klemmt auf `[0.05, 20]`; `moveBy` lässt `scale` unverändert; `zoomAt` lässt den Weltpunkt unter dem Zeiger fest und klemmt auf `[1/8, 8] × baseCellPx`; `pinch` mit gleichem Abstand verschiebt nur; `fitView` enthält alle Boxen; `gridLines('stepped')` Abstand in `[24, 48)` px bei Zoom 1/8, 1, 8; `'screen'` Abstand konstant `baseCellPx`; `initialPlacements`: A bei `(1, 0)`, B bei `(2 + w(A), 0)`, beide Faktor 1, längste Seite 3 Kästchen.
  - `draft.spec`: Rundlauf; kaputtes JSON, `v ≠ 1`, `scale ≤ 0`, `NaN` → `null` und Eintrag entfernt; werfender Speicher → `null`, kein Fehler; anderer Payload → anderer Schlüssel; Phase im Schlüssel.
  - `scoreboard.spec`: Sortierung, Formate (`1,3×`, `+23 %`, `−18 %`), fehlendes Outcome ans Ende.
- [ ] **Step 2: Run** `pnpm test src/games/matchscale` — FAIL.
- [ ] **Step 3: Implement.** `draft.ts` nach `turnpipes/draft.ts` (Prefix `match-scale:draft:`, Fingerprint über `[a.path, b.path]`). `scoreboard.ts` nach `guesshue/scoreboard.ts` (shared `rowHead`, Ticks).
- [ ] **Step 4: Run** — PASS. `pnpm exec vue-tsc -b` — keine Fehler.
- [ ] **Step 5: Commit** — `Add Augenmaß's view, gesture and draft logic`.

### Task 7: Frontend — Spielfläche und Abgabe

**Files:**
- Create: `webapp-vue/src/games/matchscale/ScaleField.vue`, `MatchScaleBoard.vue`, `MatchScaleBriefing.vue`, `MatchScaleRules.vue`, `MatchScaleGame.vue`
- Modify: `webapp-vue/src/games/registry.ts` (`'match-scale': MatchScaleGame`), `webapp-vue/src/gamelab/games.ts` (`{ id: 'match-scale', title: 'Augenmaß' }`)
- Test: `webapp-vue/src/games/matchscale/__tests__/ScaleField.spec.ts`, `MatchScaleBoard.spec.ts`, `MatchScaleGame.spec.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: `ScaleField` Props `{a: Silhouette, b: Silhouette, aColor, bColor, view: View, placementA, placementB, outlines: {placement, color, dashed}[], interactive: boolean}`, Emits `update:view`, `update:placementB`. `MatchScaleBoard` emittiert `guess` mit `{scale}`. `MatchScaleGame` wie `GuessHueGame.vue`: Board bis zur Lösung, dann Reveal (Task 8).

- [ ] **Step 1: Write the failing tests:**
  - `ScaleField`: rendert Raster, Bodenlinie, A unter B (B später im DOM), Griff mit `aria-label="Größe ändern"` und ≥ 44 px; Pointer-Folge auf B (down/move/up) → `update:placementB` mit verschobenem `x`, gleichem `scale`; auf dem Griff → größerer `scale`, gleiche `x, y`; auf leerer Fläche → `update:view`; zwei Pointer, einer auf B → nur `update:view`, kein `update:placementB` (Review Focus 5); `interactive = false` → keine Emits.
  - `MatchScaleBoard`: Labels außerhalb der Fläche in A- bzw. B-Farbe mit den Namen; `HoldButton` vollendet → `guess` mit `{scale}` des aktuellen B; Zwischenstand wird nach Bewegung gespeichert und beim Mount geladen, nach angenommenem Tipp gelöscht.
  - `MatchScaleGame`: kaputter Payload → `Diese Runde lässt sich hier nicht anzeigen.`; mit Lösung → Reveal statt Board.
- [ ] **Step 2: Run** `pnpm test src/games/matchscale` — FAIL.
- [ ] **Step 3: Implement.** SVG mit `touch-action: none`; Pfade per `transform` (`translate` + `scale` aus Placement und View), A deckend, B deckend obenauf; Griff als eigener Kreis außerhalb der Pfad-Transformation (bleibt 44 px bei jedem Zoom). Pointer-Zustand lokal in `ScaleField` (Map aktiver Pointer); Mathematik nur über `gestures.ts`. Halten sperrt die Fläche wie in `TurnPipesBoard` (`useHoldLock`). Briefing nach `TurnPipesBriefing` mit den wörtlichen Texten.
- [ ] **Step 4: Run** — PASS; `pnpm exec vue-tsc -b`; Prettier + `pnpm lint` ohne `warning`.
- [ ] **Step 5: Commit** — `Add Augenmaß's board`.

### Task 8: Frontend — Auflösung und Rangliste

**Files:**
- Create: `webapp-vue/src/games/matchscale/MatchScaleReveal.vue`, `MatchScaleScoreboard.vue`
- Modify: `webapp-vue/src/games/matchscale/MatchScaleGame.vue`
- Test: `webapp-vue/src/games/matchscale/__tests__/MatchScaleReveal.spec.ts`

**Interfaces:**
- Consumes: `ScaleField` (`interactive = false`), `scoreboardRows`, `fitView`, `revealChoreography.ts`.

- [ ] **Step 1: Write the failing tests:**
  - eigener Tipp: B steht am Ende bei `scale = factor`, gestrichelter Umriss bei `scale = Tipp` an derselben Ecke; Zeile `Dein Tipp: 1,3× · tatsächlich: 1,6×`.
  - `animate = false` (Neuladen): Endbild sofort, keine Transition-Klasse.
  - Name in der Rangliste antippen → dessen Umriss in dessen Farbe; nochmal → weg.
  - ohne eigenen Tipp: B bei `factor`, kein Umriss, keine „Dein Tipp“-Zeile.
  - Attribution sichtbar unter der Fläche, wenn vorhanden.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Takt: Wechsel → ab `SOLUTION_DELAY_MS` wächst B per CSS-Transition (kein `requestAnimationFrame`) von Tipp zu Faktor → ab `RESULTS_DELAY_MS` Rangliste. Ansicht über `fitView` aus A, wahrem B und eigenem Umriss.
- [ ] **Step 4: Run** — PASS; `vue-tsc -b`; Prettier + `pnpm lint` ohne `warning`.
- [ ] **Step 5: Commit** — `Add Augenmaß's reveal and scoreboard`.

### Task 9: Handprobe und Abschluss

- [ ] **Step 1:** Backend (echte Daten) und Frontend über `.claude/launch.json` starten; Labor-Seite von `match-scale` im Browser-Pane: beide Phasen, mehrere Seeds, Screenshot. Konsole ohne Fehler.
- [ ] **Step 2: Handprobe am Handy** (LAN-HTTP, Zug offen halten): Nutzer prüft Verschieben, Griff, Pinch, Halten, Auflösung. Er entscheidet `GRID_MODE`, Startgröße, Farben, Zoomgrenzen. Die verworfenen Raster-Modi aus `gestures.ts` und Tests entfernen; Werte setzen; Commit `Settle Augenmaß's grid and sizes`.
- [ ] **Step 3:** Spec nachziehen: unter *Spielfläche* die entschiedenen Werte, unter *Dem Bauenden überlassen* Erledigtes streichen. Erkenntnisse nach `.claude/guidelines/` (feeding-knowledge-back). Commit.
- [ ] **Step 4: Volle Läufe:** `./mvnw clean test` — grün; `pnpm test`, `pnpm exec vue-tsc -b`, `pnpm lint` — grün, ohne `warning`.
- [ ] **Step 5:** PR-Beschreibung vorbereiten (nicht anlegen, nicht pushen): Rollout-Reihenfolge — erst `update.sh` auf `main` (ohne Liste harmlos), dann der Branch nach `develop`.
