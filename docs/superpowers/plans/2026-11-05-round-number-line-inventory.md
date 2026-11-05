# Runden auf dem Zahlenstrahl — Inventur

Jede Stelle, die eine Rundennummer liest, vergleicht, verrechnet, sortiert oder anzeigt — Stand vor
dem Umbau (`ff1204c6`). Quellen: `@Deprecated`-Warnungen des Kotlin-Compilers (137), `vue-tsc` nach
Umbenennung (82), grep (SQL, Kommentare, Reihenfolgen, Literale).

**Einordnung:** `Richtung` = Vergleich, Arithmetik, Sortierung, Grenzwert, Anzeige oder Text, der
eine Richtung behauptet — wird gespiegelt. `durch` = reicht den Wert nur weiter (Gleichheit,
Parameter, Pfad, Log, Schlüssel) — bleibt.

## Backend — Produktivcode

| Ort | Ausdruck | Einordnung | neu | erledigt |
|---|---|---|---|---|
| `countdown/CountdownEngine.kt:11-13` | KDoc `round n = [startsAt - (n+1) days, …)`, „Numbers decrease“ | Richtung | `round m = [startsAt + (m-1) days, startsAt + m days)`, Zahlen steigen | ✓ |
| `countdown/CountdownEngine.kt:18-19` | `labelOf` → `T-n` / `T+n` | Richtung | entfällt | ✓ |
| `countdown/CountdownEngine.kt:22-33` | `roundAt`: `boundary(k) = startZ.minus(len·k)`, Ergebnis `k - 1` | Richtung | `boundary(k) = startZ.plus(len·k)`, Ergebnis `k* + 1` | ✓ |
| `countdown/CountdownEngine.kt:36-41` | `intervalOf`: `minus(n+1)`, `minus(n)`, `Round(number, labelOf(number), …)` | Richtung | `plus(n-1)`, `plus(n)`, `Round(number, start, end)` | ✓ |
| `countdown/Round.kt:6` | `Round(number, label, start, end)` | Richtung | ohne `label` | ✓ |
| `countdown/internal/CountdownDtos.kt:6,15` | `RoundDto(number, label, …)`, `toDto` | Richtung | ohne `label` | ✓ |
| `countdown/internal/CountdownService.kt:58-59` | „later in time = number - 1“, `current.number - 1` | Richtung | `current.number + 1` | ✓ |
| `game/internal/RoundDtos.kt:215` | `Round.toDto()` mit `label` | Richtung | ohne `label` | ✓ |
| `game/internal/RoundDtos.kt:21,24` | KDoc BEFORE/AFTER_WINDOW „larger/smaller number than …“ | Richtung | „a smaller number than `games_from_round`“ / „a larger number than `games_until_round`“ | ✓ |
| `game/internal/Window.kt:7,21-28` | `until <= n <= from`; `n > from` → BEFORE, `n < until` → AFTER | Richtung | `from <= n <= until`; `n < from` → BEFORE, `n > until` → AFTER | ✓ |
| `game/internal/Window.kt:33-34` | Felder an `windowReasonOf` | durch | — | ✓ |
| `game/internal/Difficulty.kt:4-19` | KDoc-Beispiel `T-30 … T-0`, „numbers ascending, last = oldest“ | Richtung | Beispiel `-30 … 0`, erstes Auftreten `-12` → 0.0, wieder in `-6` → `(-6 - -30) / (0 - -30) = 0.8`; „numbers descending, last = oldest“ | ✓ |
| `game/internal/Difficulty.kt:24-28` | `history.last()`; `first <= until` → 1.0; `(first - n) / (first - until)` | Richtung | `.last()` bleibt; `first >= until` → 1.0; `(n - first) / (until - first)` | ✓ |
| `game/Awards.kt:8-10` | KDoc; `n <= threshold` → TWO | Richtung | `n >= threshold` → TWO, KDoc „Later in time means a larger round number“ | ✓ |
| `game/Awards.kt:39-40` | `threshold - n + 2` | Richtung | `n - threshold + 2` | ✓ |
| `game/Awards.kt:13` | `edition.phaseTwoStartRound` an `of` | durch | — | ✓ |
| `game/internal/GameSelection.kt:18,32-36` | Vertrag „history is most-recently-played first“, `history.firstOrNull()` | durch (Vertrag bleibt) | — | ✓ |
| `game/internal/RoundGameRepository.kt:29-46` | `historyOf(after)`: `round_number > :after ORDER BY round_number ASC`, KDoc | Richtung | `historyOf(before)`: `round_number < :before ORDER BY round_number DESC`, KDoc | ✓ |
| `game/internal/RoundGameRepository.kt:48-67` | `previousRoundNumber(after, …)`: `MIN`, `> :after`, `<= :notOlderThan`, `>= :notNewerThan`, KDoc | Richtung | `before`: `MAX`, `< :before`, `>= :notOlderThan`, `<= :notNewerThan`, KDoc | ✓ |
| `game/internal/RoundGameRepository.kt:82-84` | Insert, `ON CONFLICT (edition_id, round_number)` | durch | — | ✓ |
| `game/internal/RoundGameStore.kt:28-29` | `history(…) = historyOf(after = roundNumber)` | Richtung | `before = roundNumber` | ✓ |
| `game/internal/RoundGameStore.kt:31-45` | KDoc „`Int.MAX_VALUE` stands in…“, `gamesFromRound ?: Int.MAX_VALUE`, `after = roundNumber` | Richtung | `Int.MIN_VALUE`, `before = roundNumber` | ✓ |
| `game/internal/MaterialisationSchedule.kt:13-14` | KDoc-Diagramm `round n−1 (next)` | Richtung | `round n+1 (next)` | ✓ |
| `game/internal/MaterialisationSchedule.kt:67-71` | Kommentar „larger … earlier: next is `current - 1`“, `listOf(current, current - 1)` | Richtung | `current + 1`, Kommentar | ✓ |
| `game/internal/RoundPlayPoints.kt:63-64` | Kommentar, `stable = roundNumber > current` | Richtung | `roundNumber < current` | ✓ |
| `game/internal/RoundPlayPoints.kt:55,61,67` | `.number`, Fensterfilter, `== current` | durch | — | ✓ |
| `game/internal/HistoryService.kt:53-56` | Kommentar, `roundNumber <= currentNumber` → 404 | Richtung | `roundNumber >= currentNumber` → 404 | ✓ |
| `game/internal/PlayService.kt:242-247` | Kommentar, `roundNumber > currentNumber` → Historie, `< currentNumber` → 404 | Richtung | `<` → Historie, `>` → 404 | ✓ |
| `game/internal/PlayService.kt:51,81,163,181,205` | Gleichheit gegen laufende Runde, Log | durch | — | ✓ |
| `game/internal/ReviewService.kt:74,107,121-124` | Log; `currentNumber` / `previousRoundNumber` per Gleichheit | durch | — | ✓ |
| `game/internal/RoundScoring.kt:68` | Log | durch | — | ✓ |
| `game/internal/AnnouncementService.kt:72-86,116` | Weitergabe, Log | durch | — | ✓ |
| `game/internal/RoundResponses.kt:40,82` | `previousRoundNumber` weitergereicht | durch | — | ✓ |
| `game/internal/RoundMaterialiser.kt:77,81` | Felder an `difficultyOf`/`awardFor` | durch | — | ✓ |
| `game/internal/RoundPlayRepository.kt:163` | `g.round_number` gelesen | durch | — | ✓ |
| `community/CommunityEdition.kt:14` | KDoc „`(community, T-58)` … its own T-58“ | Richtung | `(community, -58)`, „its own round -58“ | ✓ |
| `community/CommunityEdition.kt:31-36` | KDoc „the *larger* number … earlier“, „the smaller number. `0` is T-0“ | Richtung | „the *smaller* number, because a smaller round number is earlier in time“, „the larger number. `0` is the last day before the start“ | ✓ |
| `community/internal/EditionFreeze.kt:7-8,20-23` | KDoc „round `gamesFromRound + 1`“, `.minusDays(first + 2)` | Richtung | „round `gamesFromRound - 1`“, `.plusDays(first - 2)` | ✓ |
| `community/internal/EditionService.kt:113` | `phaseTwoStartRound > 0` | Richtung | `< 0`, Meldung „must be < 0“ | ✓ |
| `community/internal/EditionService.kt:118-127` | Kommentar, `from >= until` „must not be below“, `from <= MAX_GAMES_FROM_ROUND` „must not exceed“, Kommentar „close enough to Int.MAX_VALUE“ | Richtung | `from <= until` „must not be above“; `from >= -MAX_GAMES_FROM_ROUND` „must not be below -36500“; `Int.MIN_VALUE` | ✓ |
| `community/internal/EditionService.kt:40-42,76-78` | Felder kopiert | durch | — | ✓ |
| `community/internal/CommunityDtos.kt:58-61` | Felder ins DTO | durch | — | ✓ |
| `socialpreview/internal/PreviewService.kt:43-46` | KDoc „A negative round number is at or past the start“, `number >= 0` → `"${label}: Spiel mit!"` | Richtung | KDoc „A positive …“; `number <= 0` → `"Noch ${-number} Tage: Spiel mit!"`, `-1` → `"Noch 1 Tag: Spiel mit!"` | ✓ |
| `gamelab/internal/LabService.kt:564` | `LAB_ROUND_NUMBER = 12` | Richtung | `-12` | ✓ |
| `gamelab/internal/LabService.kt:415-429` | KDoc, Verwendung als Runde und Schwelle | durch | — | ✓ |

## Backend — SQL-Migrationen

| Ort | Ausdruck | Einordnung | neu | erledigt |
|---|---|---|---|---|
| `community/V3__create_editions.sql:13-16` | Kommentar „larger … EARLIER“, `CHECK (… games_from_round >= games_until_round)` | Richtung | `-- Round numbers rise with time, so the window is from <= number <= until.`, `<=` | ✓ |
| `community/V3__create_editions.sql:9` | `games_until_round … DEFAULT 0` | durch (`0` bleibt `0`) | — | ✓ |
| `community/V1__create_communities.sql:8`, `V4…:6` | Spalte `phase_two_start_round` | durch | — | ✓ |
| `game/V1__create_round_games.sql:6,13,17` | Spalte, Kommentar ohne Richtung, `UNIQUE` | durch | — | ✓ |

## Frontend — Produktivcode

| Ort | Ausdruck | Einordnung | neu | erledigt |
|---|---|---|---|---|
| `api/types.ts:112-114` | KDoc „Signed T-offset. A larger number is *earlier*“, `label` | Richtung | „Round number; rises with time, `0` = last day before the start“, ohne `label` | ✓ |
| `communities/countdown.ts:9-14` | `CountdownView.prefix`, `.label` | Richtung | entfallen | ✓ |
| `communities/countdown.ts:34-37` | KDoc „number >= 0 … number < 0“ | Richtung | „number <= 0 … number > 0“ | ✓ |
| `communities/countdown.ts:50` | `round.number < 0` → after | Richtung | `round.number > 0` | ✓ |
| `communities/countdown.ts:67,89` | `prefix: 'T+'/'T-', label: round.label` | Richtung | entfallen | ✓ |
| `communities/countdown.ts:84` | `whole(round.number)` (Betrag) | durch | — | ✓ |
| `pages/c/[slug]/settings.vue:137-152` | `min="1"` an Phase-2 und Erster Spielrunde; „Größere Nummer = früher.“ | Richtung | kein `min`; „Runde 0 ist der letzte Tag vor dem Start, -89 liegt 89 Tage davor. Leer lässt den gespeicherten Wert unverändert.“ | ✓ |
| `pages/c/[slug]/settings.vue:51-52` | Felder geladen | durch | — | ✓ |
| `gamelab/header.ts:16-20` | KDoc „T-0 … T-140“, `hash % 141` | Richtung | „-140 … 0“, `0 - hash % 141` | ✓ |
| `api/rounds.ts:62`, `pages/c/[slug]/index.vue:56,150`, `rounds/useRound.ts:56-98`, `rounds/useRoundHistory.ts:30`, `rounds/RoundHistory.vue:44-81`, `rounds/RoundCard.vue:133,149,173` | Pfad, Schlüssel, Gleichheit, Zeiger | durch | — | ✓ |

## Tests

Geändert wird, wo eine Assertion oder Fixture eine Richtung oder das `label` trägt (Fenster,
Reihenfolge, Phase-2-Schwelle, Einsatz, Freeze, Historie, Countdown-Zustand, Vorschau-Text). Reine
Durchreich-Nummern (z. B. `RoundContext(roundNumber = 3, phase = ONE)` in Spieltests) bleiben.

| Datei | Fundstellen | erledigt |
|---|---|---|
| `countdown/CountdownEngineTest.kt` | ganze Datei, neu geschrieben | ✓ |
| `countdown/CountdownServiceTest.kt`, `CountdownControllerTest.kt` | `nextRound`, `label`-Fixtures | ✓ |
| `community/EditionServiceTest.kt` | Fenster-/Phase-2-Validierung, Freeze (12 Stellen) | ✓ |
| `community/EditionFreezeTest.kt`, `EditionFreezeGridParityTest.kt` | `gamesFromRound + 1` | ✓ |
| `community/CommunityServiceTest.kt`, `CommunityControllerTest.kt`, `CommunityEditionRepositoryTest.kt`, `SuperAdmin*Test.kt` | Fensterwerte, `CHECK` | ✓ |
| `game/RoundGameRepositoryTest.kt` | `historyOf`, `previousRoundNumber` | ✓ |
| `game/RoundHistoryServiceTest.kt` | Historie, Fenstergrenzen | ✓ |
| `game/AnnouncementServiceTest.kt`, `AnnouncementMaterialisedHookTest.kt`, `AnnouncementServiceNoGameTypeTest.kt` | Fenster, Zeiger | ✓ |
| `game/MaterialisationScheduleTest.kt`, `MaterialisationScheduleBootTest.kt` | `current - 1` | ✓ |
| `game/DifficultyTest.kt`, `RoundMaterialiserDifficultyTest.kt` | Historie, Kurve | ✓ |
| `game/AwardTest.kt` | Schwelle, Einsatz | ✓ |
| `game/RoundPlayPointsTest.kt` | stable/live | ✓ |
| `game/PlayService*Test.kt`, `RoundAssetGateTest.kt`, `RoundLockTest.kt`, `ReviewServiceTest.kt`, `RoundResponsePeerReviewTest.kt`, `SpotObjectSubmissionTest.kt`, `RoundMaterialiserRollbackTest.kt`, `GameCatalogTest.kt`, `GameSelectionTest.kt` | laufende/ältere Runde | ✓ |
| `gamelab/LabPointsParityTest.kt`, `LabServiceTest.kt` | `LAB_ROUND_NUMBER`, Einsatz | ✓ |
| `socialpreview/Preview{Service,Controller,Page}Test.kt` | `T-58` | ✓ |
| `webapp-vue/src/communities/__tests__/countdown.spec.ts`, `CountdownDisplay.spec.ts`, `sharedClock.spec.ts` | Zustand, `label`, `prefix` | ✓ |
| `webapp-vue/src/api/__tests__/{countdown,rounds,communities}.spec.ts` | `label`-Fixtures | ✓ |
| `webapp-vue/src/pages/c/[slug]/__tests__/{index,settings,members,requests}.spec.ts`, `pages/c/__tests__/slug-shell.spec.ts`, `pages/communities/__tests__/new.spec.ts` | `label`, Fensterwerte | ✓ |
| `webapp-vue/src/rounds/__tests__/{useRound,useRoundHistory,RoundHistory,RoundCard}.spec.ts` | `label`-Fixtures | ✓ |
| `webapp-vue/src/communities/__tests__/{routeData,landingGuard}.spec.ts`, `fallbacks/__tests__/RoundFallback.spec.ts`, `ui/__tests__/GameHeader.spec.ts` | `label`-Fixtures, Nummern | ✓ |
| `webapp-vue/src/gamelab/__tests__/header.spec.ts` | Wertebereich | ✓ |

## Doku & Leitlinien (Task 5)

| Ort | Ausdruck | erledigt |
|---|---|---|
| `.claude/guidelines/countdown.md:42-88` | Abschnitt „count-down with a round 0“, `T−`/`T+` | ✓ |
| `.claude/guidelines/countdown.md:136-138` | Freeze ab `gamesFromRound + 1` | ✓ |
| `.claude/guidelines/countdown.md:154-166` | `phaseTwoStartRound` „T-offset“, Fast Rounds `T+1.1` | ✓ |
| `.claude/guidelines/game-rounds.md:8-17` | `T-58`, Abschnitt „A larger round number is earlier“, `<= phase_two_start_round` | ✓ |

## Notiert, nicht geändert

- `rounds/RoundCard.vue:133`: `round?.round?.number ? … : undefined` — Runde `0` bekommt kein
  Anker-`id` (falsy). Bestand vor dem Umbau, keine Richtungsfrage.
