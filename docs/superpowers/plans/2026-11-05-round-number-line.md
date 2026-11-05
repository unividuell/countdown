# Runden auf dem Zahlenstrahl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rundennummern steigen mit der Zeit (`neu = −alt`; `0` bleibt der letzte Tag vor dem Start), ohne dass sich außer der Anzeige irgendein Verhalten ändert.

**Architecture:** Erst ein Integrationstest, der eine Edition durch die Zeit schickt und nur Daten prüft, nie Nummern. Er ist das Orakel und bleibt danach unberührt. Dann eine Inventur aller Stellen (Compiler-Warnungen und grep), dann die Spiegelung in Backend und Frontend als ein Commit, zuletzt die Leitlinien.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 · JUnit 5 + kotest + Testcontainers · Flyway · Vue 3 + TypeScript strict + Vitest · pnpm.

**Spec:** [`docs/superpowers/specs/2026-11-05-round-number-line-design.md`](../specs/2026-11-05-round-number-line-design.md). Vor jedem Task lesen.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden):

1. **Orakel-Edition:** Start 2027-06-24 11:00 `Europe/Berlin` (der Ankerfall). Spiele vom 18. bis 25. Juni, Phase 2 ab dem 22. Das Fenster kreuzt also den Start: alt `5 … −2`, neu `−5 … 2`. Vorzeichenfehler zeigen sich genau dort.
2. **Eine Runde heißt im Orakel nach dem Datum, an dem sie beginnt.** Mittag eines Tages liegt immer in der Runde, die an diesem Tag um 11:00 beginnt.
3. **Zwei Fake-Spiele und eine eingeschränkte Auswahl.** Die echte Regel `DifferentFromPreviousRound` wählt nur zwischen `oracle-a` und `oracle-b`, also müssen sie sich Tag für Tag abwechseln. Hält die Historie ihre Reihenfolge nicht („zuletzt gespielt zuerst“), bricht der Wechsel deterministisch. Die Fakes schreiben `context.difficulty` in ihre Params; so wird die Schwierigkeit aus der DB lesbar.
4. **Inventur in Kotlin per `@Deprecated` statt Umbenennung.** Die Warnung kommt bei jedem Lesezugriff, in Main- und Testcode, und kein Build bricht ab (der Build hat kein `-Werror`). In TypeScript dagegen per Umbenennung: `vue-tsc -b` meldet alle Fehler in einem Lauf.
5. **`historyOf` behält seinen Listenvertrag** („zuletzt gespielt zuerst“, letzter Eintrag = älteste Runde). Nur die SQL dreht sich (`<`, `DESC`). `difficultyOf` (`.last()`) und `DifferentFromPreviousRound` (`.firstOrNull()`) bleiben unverändert. Der Parameter `after` heißt künftig `before`, weil „after“ nach der Spiegelung das Gegenteil sagt.
6. **Die Inventurliste ist eine Datei:** `docs/superpowers/plans/2026-11-05-round-number-line-inventory.md`. Sie wird in Task 3/4 Zeile für Zeile abgehakt und landet in der PR-Beschreibung.
7. **Ein Tag in der Link-Vorschau:** `Noch 1 Tag`. Null Tage: `Noch 0 Tage`.

## Global Constraints

- Quellcode, Kommentare, Commits, Leitlinien **englisch**; UI-Text **deutsch** mit `„…“`; Plan und Spec deutsch.
- Kotlin: benannte Argumente ab zwei Argumenten (`.claude/guidelines/kotlin.md`).
- **Nur spiegeln.** Jede Regel bleibt inhaltlich gleich: `<` ↔ `>`, `+ 1` ↔ `− 1`, `MIN` ↔ `MAX`, `ASC` ↔ `DESC`, `Int.MAX_VALUE` ↔ `Int.MIN_VALUE`. Wirkt eine Regel fragwürdig: in der Inventur notieren, nicht ändern.
- **Die Orakel-Datei ändert sich nach Task 1 nie mehr.** `git diff <Task-1-Commit> -- core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt` ist leer.
- Kommentare nur anfassen, wenn sie eine Richtung behaupten („larger = earlier“, „next = current − 1“), sonst würden sie lügen. Keine neuen Kommentare an fremden Blöcken.
- Voller Backend-Lauf immer `cd core && ./mvnw clean test` (alte `.class` im Worktree-`target`).
- Commits: Betreffzeile ≤ 50 Zeichen, Imperativ, Body auf 72 umbrochen, Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Migrationen werden **in place** umgeschrieben (Spec). Die lokale, geteilte DB darf gelöscht werden (Task 6).

## Review Focus

1. **Admin trägt aus Gewohnheit eine positive erste Spielrunde ein** (`89`): Das Backend lehnt sie mit 400 und lesbarer Meldung ab (`gamesFromRound (89) must not be above gamesUntilRound (0)`), es speichert sie nicht stillschweigend. Test in Task 3.
2. **Offenes Fenster** (`gamesFromRound = null`): Der Historien-Zeiger findet ältere Runden weiterhin (`Int.MIN_VALUE` als untere Grenze). Test in Task 3.
3. **Labor-Header zeigt nie „-0“:** `labRoundNumber` liefert für keinen Seed `-0`. Test in Task 4.
4. **Countdown genau beim Start:** Runde `0` liefert `before`, Runde `1` zur Startsekunde liefert `after` mit `0 d 00 h 00 m 00 s`. Test in Task 4.
5. **Einstellungen mit negativen Zahlen:** `-89` wird geladen und angezeigt, Speichern sendet `gamesFromRound: -89`. Test in Task 4.

---

### Task 1: Zeit-Orakel

**Files:**
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt`

**Interfaces:**
- Consumes (bestehend, Signaturen ändern sich durch den Umbau nicht): `CountdownEngine.roundAt(now, startsAt, zone)`, `CountdownEngine.intervalOf(number, startsAt, zone)`, `Round.number/start/end`, `MaterialisationSchedule.prepare(edition, now)`, `AnnouncementService.resolve(slug, userId, isSuperAdmin)`, `HistoryService.pastRound(slug, userId, isSuperAdmin, roundNumber)`, `PlayService.guess(...)`, `PlayService.asset(...)`, `RoundGameStore.find(edition, roundNumber)`, `RoundPlayPoints.standings(communityId, viewerId, userIds)`, `CountdownService.forSlug(slug, userId, isSuperAdmin)`, `CommunityService.create/update`, `EditionFrozenException`.
- Produces: nichts, das andere Tasks benutzen. Die Datei ist danach eingefroren.

**Regel für die ganze Datei:** keine Rundennummer als Literal. Jede Nummer stammt aus `numberAt(instant)`, jedes Ergebnis wird über `startDayOf(number)` in ein Datum übersetzt.

- [ ] **Step 1: Testgerüst schreiben**

Aufbau wie `MaterialisationScheduleBootTest` (`@Import(TestcontainersConfiguration::class, …)`, `@SpringBootTest`, `@Transactional`). Eigene `@TestConfiguration Oracle` mit:
- `SettableClock(var now: Instant) : Clock()` als `@Bean @Primary`, Muster `PlayServiceTimedTest.SteppingClock`.
- Zwei Beans `OracleGame("oracle-a")` und `OracleGame("oracle-b")`: `Params(val difficulty: Double)`, `draw` gibt `Params(difficulty = context.difficulty)` zurück. `judge` lässt jeden Tipp gelten (`qualifies = true, deviation = 0.0`), kein Reveal, keine Dauerwertung. Muster `CountingGame`.
- `@Bean @Primary fun oracleSelection(): GameSelection`: delegiert an `DifferentFromPreviousRound().pick(...)`, aber nur mit den Kandidaten `oracle-a`/`oracle-b`.

Konstanten und Helfer:

```kotlin
val BERLIN: ZoneId = ZoneId.of("Europe/Berlin")
val START: Instant = LocalDateTime.of(2027, 6, 24, 11, 0).atZone(BERLIN).toInstant()
fun june(day: Int): LocalDate = LocalDate.of(2027, 6, day)
fun at(date: LocalDate, hour: Int, minute: Int = 0, second: Int = 0): Instant
fun noon(date: LocalDate): Instant = at(date, hour = 12)
val STAKES: Map<LocalDate, Int> = mapOf(june(18) to 1, june(19) to 1, june(20) to 1, june(21) to 1,
    june(22) to 2, june(23) to 3, june(24) to 4, june(25) to 5)

private fun numberAt(instant: Instant): Int        // engine.roundAt(now = instant, startsAt = START, zone = BERLIN).number
private fun startDayOf(number: Int): LocalDate     // engine.intervalOf(...).start im Berliner Datum
```

`aRun()`: Uhr auf `noon(june(1))`, Owner und Community anlegen, dann `communities.update(…, startsAt = START, startsAtTimezone = "Europe/Berlin", gamesFromRound = numberAt(noon(june(18))), gamesUntilRound = numberAt(noon(june(25))), phaseTwoStartRound = numberAt(noon(june(22))))`.

`walk(run, days: IntRange = 15..27): List<Day>` mit
`data class Day(val date: LocalDate, val announcedAfterRun: Set<LocalDate>, val resolved: ResolvedRound, val standing: MemberPoints)`. Pro Tag:
1. Uhr auf `at(date, hour = 3)`, `schedule.prepare(edition, now)`.
2. `announcedAfterRun` = alle Tage aus `june(14)..june(28)`, für die `store.find(edition, numberAt(noon(d)))` eine Zeile hat.
3. Uhr auf `noon(date)`, `resolved = announcements.resolve(slug, owner, isSuperAdmin = false)`.
4. Ist `resolved` `Announced`: `plays.guess(…, roundNumber = resolved.round.number, guess = {})`.
5. `standing = points.standings(communityId, viewerId = owner, userIds = listOf(owner)).getValue(owner)`.

- [ ] **Step 2: Die zehn Tests schreiben**

```kotlin
@Test fun `games run on exactly the days from the 18th to the 25th`()
//   18..25 → Announced; 15..17 → NoGame(BEFORE_WINDOW); 26..27 → NoGame(AFTER_WINDOW)

@Test fun `each game round is announced by the run before it starts, never earlier`()
//   für jeden Tag d: announcedAfterRun == (june(18)..minOf(d, june(25))) als Menge, leer für d < 18

@Test fun `the two games alternate day by day`()
//   gameType der Zeilen 18..25 in Datumsreihenfolge: zipWithNext().none { (a, b) -> a == b }

@Test fun `difficulty starts at zero for each game and then climbs with the days to one`()
//   18 → 0.0, 19 → 0.0, 18+k → k / 7.0 für k in 2..7 (Toleranz 1e-9), 25 → 1.0
//   7 = ChronoUnit.DAYS.between(june(18), june(25)); k = ChronoUnit.DAYS.between(june(18), d)

@Test fun `phase two starts on the 22nd and raises the stake by one per round`()
//   Award der gespeicherten Zeile je Tag == STAKES[d]; 18..21 ALL_QUALIFYING, 22..25 CLOSEST_ONLY

@Test fun `standings hold finished rounds as stable and the running round as live`()
//   Tag d (15..27): stable == Summe STAKES für Tage < d; live?.points == STAKES[d] (null außerhalb)

@Test fun `the history leads back day by day and ends at the first game day`()
//   von Tag 25 aus (resolved.previousRoundNumber, dann pastRound(...).previousRoundNumber, …):
//   startDayOf-Kette == [24, 23, 22, 21, 20, 19, 18], danach null

@Test fun `neither the running nor an announced-ahead round is reachable as history`()
//   walk(15..21), dann schedule.prepare(now = noon(june(21))) kündigt den 22. an;
//   pastRound(numberAt(noon(june(21)))) und pastRound(numberAt(noon(june(22)))) → RoundNotFoundException;
//   plays.asset(… Runde vom 22. …, name = "solution") → RoundNotFoundException;
//   pastRound(numberAt(noon(june(20)))) gelingt

@Test fun `the round before the start ends at liftoff and the next one begins there`()
//   Uhr at(june(24), 10): forSlug → round.end == START, nextRound.start == round.end,
//   Duration.between(now, round.end) == 1 h
//   Uhr START: round.start == START, nextRound.start == round.end

@Test fun `start and zone stay editable until the round before the first game begins`()
//   Uhr at(june(17), 10, 59, 59): startsAt auf START + 1 Tag und zurück gelingt
//   Uhr at(june(17), 11): startsAt auf START + 1 Tag → EditionFrozenException
```

- [ ] **Step 3: Gegen die alte Nummerierung laufen lassen**

Run: `cd core && ./mvnw test -Dtest=RoundTimelineOracleTest`
Expected: 10 Tests PASS. Schlägt einer fehl, hat das Orakel das heutige Verhalten falsch verstanden. Dann **stoppen und melden**, die Erwartung nicht an die Ausgabe anpassen.

- [ ] **Step 4: Commit**

```bash
git add core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt
git commit  # Betreff: "Pin round behaviour to dates, not numbers"
```

Den Commit-Hash notieren, die Global Constraints prüfen gegen ihn.

---

### Task 2: Inventur

**Files:**
- Create: `docs/superpowers/plans/2026-11-05-round-number-line-inventory.md`
- Temporär (am Ende verworfen): die unten markierten Deklarationen

**Interfaces:**
- Produces: die Inventurdatei. Eine Tabelle je Bereich (Backend main, Backend test, Frontend, SQL/Migrationen, Doku/Leitlinien) mit den Spalten `Ort (Datei:Zeile)` · `Ausdruck` · `Einordnung` (`reicht durch` | `Richtung`) · `neu` (gespiegelter Ausdruck, nur bei „Richtung“) · `erledigt`.

- [ ] **Step 1: Kotlin markieren**

`@Deprecated("round-number inventory")` an: `Round.number`, `Round.label`, `RoundDto.number`, `RoundDto.label`, `CommunityEdition.gamesFromRound/gamesUntilRound/phaseTwoStartRound`, `RoundContext.roundNumber`, `PastRound.roundNumber`, `RoundGame.roundNumber`, `PlayPoints.roundNumber`, `RoundResponse.previousRoundNumber`, die `previousRoundNumber` der `ResolvedRound`-Varianten, `CountdownEngine.labelOf`.

Run: `cd core && ./mvnw clean test-compile 2>&1 | grep 'round-number inventory'`
Expected: Liste `w: file:///…kt:(Zeile, Spalte) … is deprecated. round-number inventory`.

- [ ] **Step 2: TypeScript umbenennen**

In `webapp-vue/src/api/types.ts` und `webapp-vue/src/api/communities.ts` (dort, wo die Typen deklariert sind): `Round.number` → `numberX`, `Round.label` → `labelX`, `previousRoundNumber` → `previousRoundNumberX`, `gamesFromRound`/`gamesUntilRound`/`phaseTwoStartRound` → `…X`.

Run: `cd webapp-vue && pnpm typecheck 2>&1 | grep -E 'error TS'`
Expected: Fehlerliste mit Datei und Zeile.

- [ ] **Step 3: grep für das, was kein Compiler sieht**

Über `core/src`, `webapp-vue/src`, `core/src/main/resources/db/migration`, `.claude/guidelines`, `shared/`:
`round_number`, `roundNumber`, `\.number\b`, `gamesFromRound|games_from_round`, `gamesUntilRound|games_until_round`, `phaseTwoStartRound|phase_two_start_round`, `previousRound`, `MAX_VALUE|MIN_VALUE`, `\bASC\b|\bDESC\b|\bMIN\(|\bMAX\(`, `first\(|last\(|firstOrNull|lastOrNull|sortedBy|reversed|minOf|maxOf`, `T-|T\+|T−`, `labelOf`, `LAB_ROUND_NUMBER|labRoundNumber`, und in Kommentaren `larger|smaller|earlier|later|older|newer`.

- [ ] **Step 4: Einordnen**

Jede Fundstelle aus Step 1–3 bekommt eine Zeile. Bei „Richtung“ steht in `neu` der gespiegelte Ausdruck. Bekannte Fälle, mit ihrer Spiegelung:

| Ort | heute | neu |
|---|---|---|
| `CountdownEngine.intervalOf` | `start = startZ − (n+1)·len`, `end = startZ − n·len` | `start = startZ + (n−1)·len`, `end = startZ + n·len` |
| `CountdownEngine.roundAt` | Suche über `boundary(k) = startZ − k·len` | gleiche Suche über `startZ + k·len`, Ergebnis `k* + 1` mit `k*` = größtes `k` mit `boundary(k) ≤ now` |
| `CountdownEngine.labelOf`, `Round.label`, `RoundDto.label` | `T-n`/`T+n` | entfallen |
| `CountdownService.forSlug` | `current.number - 1` | `current.number + 1` |
| `MaterialisationSchedule.prepare` | `listOf(current, current - 1)` | `listOf(current, current + 1)` |
| `windowReasonOf` | `n > from` → BEFORE, `n < until` → AFTER | `n < from` → BEFORE, `n > until` → AFTER |
| `difficultyOf` | `first <= until` → 1.0; `(first − n) / (first − until)` | `first >= until` → 1.0; `(n − first) / (until − first)` |
| `Phase.of` | `n <= threshold` → TWO | `n >= threshold` → TWO |
| `awardFor` | `threshold − n + 2` | `n − threshold + 2` |
| `RoundPlayPoints.standings` | stable: `roundNumber > current` | `roundNumber < current` |
| `HistoryService.resolve` | `roundNumber <= currentNumber` → 404 | `roundNumber >= currentNumber` → 404 |
| `RoundGameRepository.historyOf` | `round_number > :after ORDER BY round_number ASC` | `round_number < :before ORDER BY round_number DESC` |
| `RoundGameRepository.previousRoundNumber` | `MIN(...)`, `> :after`, `<= :notOlderThan`, `>= :notNewerThan` | `MAX(...)`, `< :before`, `>= :notOlderThan`, `<= :notNewerThan` |
| `RoundGameStore.previousRound` | `gamesFromRound ?: Int.MAX_VALUE` | `?: Int.MIN_VALUE` |
| `frozenSince` | `.minusDays(from + 2)` | `.plusDays(from − 2)` |
| `EditionService.validate` | `phaseTwo > 0`; `from >= until`; `from <= MAX_GAMES_FROM_ROUND` | `phaseTwo < 0`; `from <= until`; `from >= −MAX_GAMES_FROM_ROUND`, Meldungen entsprechend („must not be above“, „must be < 0“, „must not be below −…“) |
| `community/V3__create_editions.sql` | `CHECK (… games_from_round >= games_until_round)` | `<=`, Kommentar neu |
| `LabService.LAB_ROUND_NUMBER` | `12` | `-12` |
| `PreviewService.describe` | `number >= 0` → `"${label}: Spiel mit!"` | `number <= 0` → `"Noch ${-number} Tage: Spiel mit!"`, bei `-1` `"Noch 1 Tag: Spiel mit!"` |
| `countdown.ts computeView` | `round.number < 0` → after; `prefix`, `label` | `round.number > 0` → after; `prefix`/`label` entfallen |
| `settings.vue` | `min="1"` an beiden Feldern; „Größere Nummer = früher.“ | kein `min`; Hinweis s. Task 4 |
| `gamelab/header.ts labRoundNumber` | `0 … 140` | `-140 … 0`, nie `-0` |

- [ ] **Step 5: Markierungen verwerfen**

Run: `git checkout -- core/src webapp-vue/src && git status --short`
Expected: nur die Inventurdatei ist neu.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-11-05-round-number-line-inventory.md
git commit  # Betreff: "List every site that reads round order"
```

---

### Task 3: Backend spiegeln

**Files:** alle Backend-Zeilen der Inventur. Mindestens:
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/countdown/{CountdownEngine,Round}.kt`, `countdown/internal/{CountdownService,CountdownDtos}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/Awards.kt`, `game/internal/{Window,Difficulty,MaterialisationSchedule,RoundGameRepository,RoundGameStore,RoundPlayPoints,HistoryService}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt`, `community/internal/{EditionFreeze,EditionService}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`, `socialpreview/internal/PreviewService.kt`
- Modify: `core/src/main/resources/db/migration/community/V3__create_editions.sql`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/CountdownEngineTest.kt` (neu geschrieben), alle übrigen Backend-Tests der Inventur

**Interfaces:**
- Produces: `data class Round(val number: Int, val start: Instant, val end: Instant)`; `RoundDto(number, start, end)`; JSON eines Runde-Objekts ohne `label`. `RoundGameRepository.historyOf(editionId: UUID, before: Int)`, `previousRoundNumber(editionId: UUID, before: Int, notOlderThan: Int, notNewerThan: Int): Int?`.

- [ ] **Step 1: Engine-Tests neu schreiben**

`CountdownEngineTest` ersetzen. `START = 2027-06-24 11:00 Europe/Berlin`. Die DST-Tests bleiben inhaltlich (Runde `0` ändert ihre Nummer nicht).

```kotlin
@Test fun `the anchor - one hour before the start is round 0 with an hour left`()
//   roundAt(2027-06-24 10:00).number == 0; .end == START; Duration.between(now, end) == 1 h
@Test fun `the start instant begins round 1`()
//   roundAt(START): number 1, start START, end 2027-06-25 11:00; roundAt(10:59:59) == 0
@Test fun `round 0 begins one day before the start`()
//   roundAt(2027-06-23 11:00) == 0; roundAt(2027-06-23 10:59:59) == -1
@Test fun `round -89 is the day 90 days before the start`()
//   intervalOf(-89): start 2027-03-26 11:00, end 2027-03-27 11:00 (Berlin)
@Test fun `numbers rise with time and never skip`()
//   alle 7 h von 2027-03-20 bis 2027-07-10: roundAt nicht fallend, Sprung ≤ 1;
//   für n in -100..20: intervalOf(n).end == intervalOf(n + 1).start
@Test fun `spring-forward day is exactly one round of 23 real hours`()   // wie heute
@Test fun `fall-back day is exactly one round of 25 real hours`()       // wie heute
@Test fun `intervalOf is consistent with roundAt`()
```

Run: `cd core && ./mvnw test -Dtest=CountdownEngineTest`
Expected: FAIL (Nummern mit falschem Vorzeichen, `label` existiert noch).

- [ ] **Step 2: Engine spiegeln, `label` streichen**

`CountdownEngine.intervalOf`/`roundAt` laut Inventur. `labelOf`, `Round.label` und `RoundDto.label` entfallen. KDoc der Klasse: `round m = [startsAt + (m−1) days, startsAt + m days)`.

Run: `cd core && ./mvnw test -Dtest=CountdownEngineTest`
Expected: PASS.

- [ ] **Step 3: Review-Focus-Tests schreiben**

```kotlin
// EditionServiceTest (oder CommunityServiceTest, wo validate schon getestet wird)
@Test fun `a first game round after round 0 is rejected`()
//   gamesFromRound = 89, gamesUntilRound = 0 → IllegalArgumentException,
//   message == "gamesFromRound (89) must not be above gamesUntilRound (0)"

// RoundGameRepositoryTest
@Test fun `an open window still points back to older rounds`()
//   Zeilen -3, -2, -1; previousRoundNumber(before = -1, notOlderThan = Int.MIN_VALUE, notNewerThan = 0) == -2
```

Run: `cd core && ./mvnw test -Dtest='EditionServiceTest,RoundGameRepositoryTest'`
Expected: die beiden neuen FAIL.

- [ ] **Step 4: Alle Main-Zeilen der Inventur spiegeln**

Genau die Spalte `neu`. Richtungskommentare und KDoc anpassen (z. B. `CommunityEdition.gamesFromRound`: „the *smaller* number, because a smaller round number is earlier in time“; `difficultyOf`-Beispiel: Spiele von −30 bis 0, erstes Auftreten in −12 → 0.0, wieder in −6 → `(−6 − −30) / (0 − −30) = 0.8`). Jede erledigte Zeile in der Inventur abhaken.

- [ ] **Step 5: Migration**

`community/V3__create_editions.sql`: `CHECK (games_from_round IS NULL OR games_from_round <= games_until_round)`. Kommentar darüber ersetzen durch: `-- Round numbers rise with time, so the window is from <= number <= until.`

- [ ] **Step 6: Link-Vorschau test-first**

`PreviewServiceTest`/`PreviewControllerTest`/`PreviewPageTest`: `T-58` wird `Noch 58 Tage`. Die laufende Runde der Stubs `58` wird `-58`. Neu in `PreviewServiceTest`: Runde `-1` → `"Noch 1 Tag: Spiel mit!"`, Runde `0` → `"Noch 0 Tage: Spiel mit!"`, Runde `1` → `"Spiel mit!"`. Danach `PreviewService.describe` laut Inventur.

- [ ] **Step 7: Übrige Backend-Tests spiegeln**

Jedes Rundennummer-Literal der Inventur negieren, jede richtungsabhängige Assertion prüfen. Die Orakel-Datei nicht anfassen.

- [ ] **Step 8: Voller Lauf**

Run: `cd core && ./mvnw clean test`
Expected: BUILD SUCCESS, `RoundTimelineOracleTest` 10/10.
Run: `git diff <Task-1-Commit> -- core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt`
Expected: leer.

**Kein Commit.** Task 4 committet Backend und Frontend zusammen.

---

### Task 4: Frontend spiegeln und den Umbau committen

**Files:** alle Frontend-Zeilen der Inventur. Mindestens:
- Modify: `webapp-vue/src/api/types.ts` (`Round` ohne `label`)
- Modify: `webapp-vue/src/communities/countdown.ts` (`CountdownView` ohne `prefix` und `label`)
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Modify: `webapp-vue/src/gamelab/header.ts`
- Test: `webapp-vue/src/communities/__tests__/countdown.spec.ts`, `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`, `webapp-vue/src/gamelab/__tests__/header.spec.ts`, alle übrigen Fixture-Stellen der Inventur

**Interfaces:**
- Consumes: Runde-JSON ohne `label` (Task 3).

- [ ] **Step 1: Review-Focus-Tests schreiben**

```ts
// countdown.spec.ts — der Ankerfall
it('one hour before the start is round 0, counting down an hour', () => {
  // round { number: 0, start: '2027-06-23T09:00:00Z', end: '2027-06-24T09:00:00Z' },
  // startsAt '2027-06-24T09:00:00Z', zone 'Europe/Berlin', now '2027-06-24T08:00:00Z', days only
  // → state 'before', chips [0 d, 01 h, 00 m, 00 s]
})
it('the start instant is round 1 and counts up from zero', () => {
  // round { number: 1, start: '2027-06-24T09:00:00Z', end: '2027-06-25T09:00:00Z' }, now = startsAt
  // → state 'after', chips [0 d, 00 h, 00 m, 00 s]
})

// settings.spec.ts
it('loads and saves a negative first game round', () => {
  // community.gamesFromRound = -89 → [data-test=games-from-round] zeigt -89; Speichern sendet gamesFromRound: -89
})

// gamelab header test
it('never yields negative zero', () => {
  // für seed in 0..2000: Object.is(labRoundNumber(seed), -0) === false; Wertebereich -140..0
})
```

Run: `cd webapp-vue && pnpm test -- countdown settings header`
Expected: die neuen FAIL (Typfehler zählen mit).

- [ ] **Step 2: Frontend-Zeilen der Inventur spiegeln**

`countdown.ts`: `round.number > 0` → `after`. `prefix` und `label` aus `CountdownView` und allen Rückgaben entfernen; Tage vor dem Start bleiben `whole(round.number)`.
`settings.vue`: `min="1"` an „Phase-2-Startrunde“ und „Erste Spielrunde“ entfernen. Den Hinweis ersetzen durch: `Runde 0 ist der letzte Tag vor dem Start, -89 liegt 89 Tage davor. Leer lässt den gespeicherten Wert unverändert.`
`gamelab/header.ts`: `labRoundNumber` liefert `0 - (hash32(...) % (ROUND_MAX + 1))`; ein unäres `-` würde für 0 `-0` liefern. Kommentar `/** -140 … 0: … */`.
Fixtures: `label: 'T-…'` streichen, Nummern negieren, wo die Inventur „Richtung“ sagt. Inventur abhaken.

- [ ] **Step 3: Frontend verifizieren**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: alles grün.

- [ ] **Step 4: Inventur vollständig?**

In der Spalte `erledigt` steht bei jeder Zeile `✓`.

Run: `grep -E '^\|' docs/superpowers/plans/2026-11-05-round-number-line-inventory.md | grep -v -E '^\| *(Ort|-)' | grep -v '✓'`
Expected: keine Ausgabe.

- [ ] **Step 5: Commit (Backend + Frontend + Inventur)**

```bash
git add -A core webapp-vue docs/superpowers/plans/2026-11-05-round-number-line-inventory.md
git commit  # Betreff: "Number rounds along the time axis"
```
Body: Spiegelung `neu = −alt`, 0 bleibt; Orakel unverändert grün; Migration V3 in place, DB-Reset nötig.

---

### Task 5: Leitlinien

**Files:**
- Modify: `.claude/guidelines/countdown.md`
- Modify: jede weitere Leitlinie, die der grep in Task 2 gefunden hat (z. B. `game-rounds.md`, `game-lab.md`)

- [ ] **Step 1: `countdown.md` umschreiben**

Den Abschnitt „Round numbering — count-down with a round 0“ ersetzen durch „Round numbering — a number line“:
- Formel: `round m = [startsAt + (m−1) days, startsAt + m days)`.
- Beispiele: `0` = `[startsAt − 1d, startsAt)`, `1` = `[startsAt, startsAt + 1d)`, `−89` = 89 Tage vor `0`.
- Ankerfall 2027-06-24 11:00 MESZ.
- Anzeige: Header zeigt die Zahl. Countdown ohne Vorzeichen, die Laufrichtung trägt die Information. Kein `T−`/`T+`.
- Differences from huettehuette: Nummerierung und Anzeige weichen jetzt auch ab (gespiegelt), Grenzinklusivität wie bisher.
- „A grid that is in play is fixed“: `gamesFromRound + 1` → `gamesFromRound − 1`.
- Fast Rounds: `T{major}.{minor}` → `{major}.{minor}`, Beispiele `1.1`, `1.2`, `2.1`.
- `MaterialisationSchedule`-Hinweis und `phaseTwoStartRound`-Absatz nach Bedarf.

- [ ] **Step 2: Übrige Leitlinien und Knowledge-Feedback**

Jede Fundstelle aus Task 2 (Bereich Doku) spiegeln. Nach `.claude/guidelines/feeding-knowledge-back.md` die übertragbare Regel in `countdown.md` festhalten: „Round numbers rise with time; `0` is the last day before the start. A rule about round order is written as a comparison on the number line — never as ‘larger is earlier’.“

Run: `grep -rn -E 'T-[0-9]|T\+[0-9]|larger.*earlier|earlier.*larger' .claude/guidelines`
Expected: keine Treffer, außer in einem Absatz, der die huettehuette-Vergangenheit beschreibt.

- [ ] **Step 3: Commit**

```bash
git add .claude/guidelines
git commit  # Betreff: "Document rounds rising with time"
```

---

### Task 6: Abnahme

- [ ] **Step 1: Volle Suiten**

Run: `cd core && ./mvnw clean test` · `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: grün.

- [ ] **Step 2: Geteilte lokale DB löschen** (vom Nutzer freigegeben; nur das Postgres-Volume, pgAdmin bleibt)

```bash
docker compose -p countdown rm -sf postgres
docker volume rm countdown_postgres-data
```

- [ ] **Step 3: App booten**

`cd core && ./mvnw spring-boot:run` (Hintergrund, über das Harness). Erwartet: Flyway wendet alle Migrationen an, die App startet. Dann `pnpm dev` und im Browser:
- Einstellungen: „Erste Spielrunde“ `-89` speichern und neu laden → `-89`.
- Start auf ein Datum in 10 Tagen: Spiel-Header zeigt `-10`, der Countdown zeigt `10 d …` ohne Vorzeichen.
- `89` als erste Spielrunde → Fehlermeldung.

- [ ] **Step 4: PR-Beschreibung vorbereiten**

Inhalt: Zweck (ein Absatz), die Inventur (aus der Datei), Einmal-Schritt **DB-Reset auf Staging und Prod vor dem Deploy** (V3 in place umgeschrieben, Flyway-Prüfsumme). Andere lokale Checkouts starten erst nach Rebase auf diesen Stand. Basis `develop`. Den PR erst auf Zuruf öffnen.
