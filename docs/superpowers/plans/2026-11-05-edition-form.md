# Edition-Formular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Community hat 0..1 aktive Edition; die Edition wird über ein eigenes Formular mit Wochenkalender erzeugt (`POST`) und ersetzt (`PUT`), der Community-`PATCH` ändert nur noch den Namen.

**Architecture:** Backend: `CommunityEdition` bekommt Pflicht-`startsAt`/`gamesFromRound` und optionales `label`; `EditionService` bietet `create`/`replace` über einen `EditionDraft`; die Community-Antwort trägt die Edition verschachtelt. Frontend: eine reine Rechenschicht `editionGrid.ts` (gegen Kotlin-Golden-Vectors gepinnt), eine Anzeige-Komponente `EditionCalendar.vue`, eine neue Seite `/c/[slug]/edition`, die Einstellungen schrumpfen auf Name + Zusammenfassung.

**Tech Stack:** Spring Boot 4 · Kotlin · Spring Data JDBC · Flyway · kotest/mockk/MockMvc DSL · Vue 3 · TypeScript strict · Luxon · Tailwind v4 · Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-edition-form-design.md`

## Global Constraints

- Basis: Branch `feature/round-numbering-redesign-820c15` (stacked PR, Basis dieses Branches). Neue Rundenzählung: Runde `m` = `[startsAt + (m−1) Tage, startsAt + m Tage)` in `startsAtTimezone`; `0` = letzter Tag vor dem Start, `1` = erster Eventtag.
- Schemaänderungen **in place** in `core/src/main/resources/db/migration/community/V3__create_editions.sql`; keine neue Migration. Danach lokale DB zurücksetzen (compose `countdown`, Volume `countdown_postgres-data`).
- Höchstens eine aktive Edition je Community (bestehender partieller Unique-Index bleibt).
- `startsAt` und `gamesFromRound` sind Pflicht; `label` und `phaseTwoStartRound` optional; `gamesUntilRound` nicht im Formular, Default `0`, bleibt bei `PUT` erhalten.
- Validierung bleibt: `label` (getrimmt) 3..50, `phaseTwoStartRound < 0`, IANA-Zone, `gamesFromRound <= gamesUntilRound`, `gamesFromRound >= -36500`.
- Deutsche UI-Texte mit „…“. Fehlertexte vom Server bleiben Englisch (wie heute) und werden über `saveErrorMessage` zitiert.
- Phase-Farben nur aus dem Theme: `--color-phase-one`, `--color-phase-two` (Tailwind `bg-phase-one`, `bg-phase-two`), Phase 2 **einfarbig**.
- Leitlinien: `.claude/guidelines/kotlin.md` (benannte Argumente ab zwei), `testing.md`, `frontend*.md` (mobile-first, kein Secure-Context-API), `cross-runtime-parity.md`, `logging.md`. Commit-Messages nach den 7 Regeln in `CLAUDE.md`, Englisch.

## Review Focus

1. **DST:** Ein Start kurz nach der Zeitumstellung (z. B. `2027-03-29T18:00` Europe/Berlin) — Kästchen-Daten, „fix ab“-Zeitpunkt und „heute“ im Frontend stimmen mit `CountdownEngine` überein. → Vectors mit DST-Fällen (Task 4).
2. **Eingefrorene Edition bearbeiten:** Die #120-Regel („Freeze-Zeitpunkt vorbei“) darf eine schon eingefrorene Edition nicht sperren; das Formular zeigt dort keine rote Warnung, nur gesperrte Start-/Zonenfelder. → Tests in Task 1 und Task 5.
3. **Bezeichnung nur aus Leerzeichen:** wird `null` (heißt wie die Community), kein 400. → Test in Task 1.
4. **Langer Lauf** (`gamesFromRound = -365`): Kalender scrollt seitlich im eigenen Container, die Seite selbst nicht. → Test in Task 4.
5. **Mitglied ohne Admin, Community ohne Edition:** Shell lädt (200, `edition: null`), Countdown zeigt „Noch kein Termin“, Header ohne `'JJ`. → Tests in Task 1 und Task 3.

---

### Task 1: Community-Modul — Edition optional, eigene Schreibwege

Ein Task, weil Typ, Service und Controller nur gemeinsam kompilieren: sobald `startsAt` Pflicht ist,
kann `CommunityService.create` keine Edition mehr anlegen, und der gemischte `PATCH` hat keinen Platz mehr.

**Files:**
- Modify: `core/src/main/resources/db/migration/community/V3__create_editions.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/{EditionFreeze,EditionService,CommunityService,CommunityController,CommunityDtos,CommunityExceptions,CommunityExceptionHandler}.kt`
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFixtures.kt`
- Modify: alle Tests, die `CommunityEdition(` bauen (`grep -rln "CommunityEdition(" core/src/test`)
- Test: `CommunityEditionRepositoryTest`, `EditionFreezeTest`, `EditionServiceTest`, `CommunityServiceTest`, `CommunityControllerTest`

**Interfaces:**
- Produces:
  - `data class CommunityEdition(id: UUID? = null, communityId: UUID, label: String?, startsAt: Instant, startsAtTimezone: String = DEFAULT_TIMEZONE, phaseTwoStartRound: Int? = null, gamesFromRound: Int, gamesUntilRound: Int = 0, archivedAt: Instant? = null, createdAt: Instant? = null, updatedAt: Instant? = null)`
  - `fun frozenSince(edition: CommunityEdition): Instant` (nicht nullable; `frozenSinceDescription` entfällt)
  - `data class EditionDraft(val label: String?, val startsAt: Instant, val startsAtTimezone: String, val phaseTwoStartRound: Int?, val gamesFromRound: Int)`
  - `EditionService.active(communityId: UUID): CommunityEdition?`, `isFrozen(edition): Boolean` (bleiben)
  - `EditionService.create(communityId: UUID, draft: EditionDraft): CommunityEdition` — `EditionConflictException` (409), wenn schon eine aktiv ist
  - `EditionService.replace(communityId: UUID, draft: EditionDraft): CommunityEdition` — `EditionNotFoundException` (404) ohne aktive
  - entfernt: `EditionService.requireActive`, `startNew`, `update`; `StartEditionRequest`
  - `class EditionNotFoundException(message: String = "No active edition")` → 404
  - `CommunityService.create(creatorUserId: UUID, rawName: String): Community` (keine Edition), `CommunityService.rename(community: Community, name: String): Community`
  - JSON fürs Frontend:
    - `EditionResponse(label: String?, startsAt: Instant, startsAtTimezone: String, phaseTwoStartRound: Int?, gamesFromRound: Int, gamesUntilRound: Int, frozen: Boolean)`
    - `CommunityResponse(id, name, slug, edition: EditionResponse?, viewerIsAdmin, pendingCount, viewerIdentity)` — flache Edition-Felder entfallen
    - `UpdateCommunityRequest(name: String)`
    - `EditionRequest(label: String?, startsAt: Instant, startsAtTimezone: String, phaseTwoStartRound: Int?, gamesFromRound: Int)`
    - `POST /api/communities` → 201, `edition: null`
    - `PATCH /api/communities/{slug}` → nur Name
    - `POST /api/communities/{slug}/editions` (Admin) → 201 `CommunityResponse`; 409 bei aktiver Edition
    - `PUT /api/communities/{slug}/editions/active` (Admin) → 200 `CommunityResponse`; 404 ohne aktive; 400 bei fehlendem Pflichtfeld
  - Test-Fixture `fun anEdition(communityId: UUID, label: String? = "Run 2026", startsAt: Instant = Instant.parse("2099-12-20T17:00:00Z"), startsAtTimezone: String = "Europe/Berlin", phaseTwoStartRound: Int? = null, gamesFromRound: Int = -30, gamesUntilRound: Int = 0, id: UUID? = null): CommunityEdition`

- [ ] **Step 1: Failing tests — Schema und Freeze**

`CommunityEditionRepositoryTest`:
```kotlin
@Test fun `saves an edition without label`() {
    val saved = editions.save(anEdition(communityId = communityId, label = null))
    editions.findById(saved.id!!).get().label shouldBe null
}
@Test fun `rejects an edition without startsAt at the database`() {
    shouldThrow<DataIntegrityViolationException> {
        jdbc.update("INSERT INTO community.editions (community_id, games_from_round) VALUES (?, -5)", communityId)
    }
}
// analog: `rejects an edition without gamesFromRound at the database`
```
`EditionFreezeTest`: `startsAt = 2026-12-20T17:00Z`, `Europe/Berlin`, `gamesFromRound = -30` → `2026-11-18T17:00:00Z` (Beginn von Runde `-31`). Den Fall „unbegrenztes Fenster → `Instant.MIN`“ löschen.

- [ ] **Step 2: Failing tests — EditionService** (Clock fest `2026-11-05T12:00:00Z`, Repository als mockk)

```
`create stores the draft as the active edition`            // label getrimmt, gamesUntilRound == 0
`create turns a blank label into null`                     // "   " → null
`create rejects a second active edition with 409`
`create rejects a draft whose freeze moment has passed`    // startsAt 2026-11-10T17:00Z, gamesFromRound -89
                                                           // → IllegalArgumentException, message enthält "already"
`replace swaps every field, null clears phase two`         // -7 → null
`replace keeps gamesUntilRound`                            // gespeichert -2 bleibt -2
`replace without an active edition throws EditionNotFoundException`
`replace on a frozen run rejects a new startsAt`           // EditionFrozenException
`replace on a frozen run rejects thawing`                  // gamesFromRound später → EditionFrozenException
`replace on a frozen run allows a new label`               // kein Fehler, obwohl frozenSince < now
```

- [ ] **Step 3: Failing tests — HTTP** (MockMvc Kotlin DSL; `CommunityServiceTest`: `create makes no edition`)

```
`create answers with edition null`                          // editions.create nie aufgerufen
`get without an active edition answers 200 with edition null` // auch als Nicht-Admin-Mitglied
`get with an active edition nests it`                       // $.edition.gamesFromRound == -30, $.edition.frozen
`patch renames only`                                        // {"name":"Neu Name"}; EditionService unberührt
`post editions creates and answers 201`                     // $.edition.label == null bei leerem Label
`post editions answers 409 when one is active`
`put active edition answers 404 without one`
`put active edition answers 400 without gamesFromRound`
`put active edition answers 409 with the reason when frozen` // $.detail enthält "fixed"
`post and put editions are admin-only`                      // Mitglied → 403
```

- [ ] **Step 4: Run, expect FAIL**

Run: `cd core && ./mvnw test -Dtest='CommunityEditionRepositoryTest,EditionFreezeTest,EditionServiceTest,CommunityServiceTest,CommunityControllerTest'`
Expected: Kompilierfehler (`anEdition`, `EditionDraft` unbekannt).

- [ ] **Step 5: Implement**

- V3: `label TEXT NULL`, `starts_at TIMESTAMPTZ NOT NULL`, `games_from_round INT NOT NULL`, `CHECK (games_from_round <= games_until_round)`; Index-Kommentar „at most one active edition per community“; Backfill-`INSERT` löschen.
- `CommunityEdition`, `frozenSince` wie oben; KDocs von „exactly one“ auf „at most one“.
- `EditionService.replace`, in dieser Reihenfolge: aktive holen (sonst 404) → `next` aus Draft (`id`, `communityId`, `gamesUntilRound`, `createdAt` vom alten) → `current` eingefroren: Start/Zone unverändert und `next` weiter eingefroren, sonst `EditionFrozenException` → sonst `frozenSince(next)` muss nach `clock.instant()` liegen, sonst `IllegalArgumentException("the run would be fixed since ${frozenSince(next)}, which has already begun")` → `validate` → `saveOrConflict`. `create` prüft dieselbe Freeze-Regel und vorab `active() == null`.
- Label: `draft.label?.trim()?.takeIf { it.isNotEmpty() }`; `validate` prüft die Länge nur bei Nicht-`null`.
- Controller/DTOs/`CommunityService` wie in Interfaces.
- Alle Test-Konstruktionen auf `anEdition(...)` (Werte, die ein Test prüft, explizit). Tests, die „Edition ohne `startsAt`“ oder „unbegrenztes Fenster“ prüfen, löschen, nicht umbiegen.
- Lokale DB zurücksetzen (Compose laut `core/README.md`, `down -v`).

- [ ] **Step 6: Run, expect PASS**

Run: `cd core && ./mvnw clean test`
Expected: grün.

- [ ] **Step 7: Commit** — `Let a community exist without an active edition`

---

### Task 2: Tote Zweige außerhalb des Community-Moduls

Nach Task 1 sind `edition.startsAt ?: …` und `gamesFromRound ?: …` nur noch Compiler-Warnungen. Sie und die Logs „has no active edition“ (jetzt ein Normalfall) gehen weg.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/countdown/internal/CountdownService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/{Window,RoundGameStore,HistoryService,MaterialisationSchedule,RoundPlayPoints,Difficulty}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/SuperAdminOverviewService.kt`
- Test: `CountdownServiceTest`, `SuperAdminOverviewServiceTest`, `WindowTest` (o. ä.), `MaterialisationScheduleTest`

**Interfaces:**
- Produces: `fun windowReasonOf(roundNumber: Int, gamesFromRound: Int, gamesUntilRound: Int): NoGameReason?`

- [ ] **Step 1: Tests anpassen** — Fälle mit `gamesFromRound = null` bzw. `startsAt = null` löschen; bestehen bleiben: Community ohne Edition → Countdown `startsAt` null, Super-Admin-Übersicht Default-Zone, Materialisierung überspringt sie.
- [ ] **Step 2: Implement** — Null-Zweige und Kommentare zu „unbounded“/„open bound“ entfernen, `warn`-Logs „has no active edition“ entfernen. Kontrolle: `grep -rn "no active edition\|unbounded\|Instant.MIN\|exactly one" core/src/main` → nur noch zutreffende Treffer; `./mvnw clean compile` ohne Warnung „Elvis operator always returns the left operand“.
- [ ] **Step 3: Run, expect PASS** — `cd core && ./mvnw clean test`
- [ ] **Step 4: Commit** — `Drop the branches for an edition without a date`

---

### Task 3: Frontend-Vertrag, Header und Fallback

**Files:**
- Modify: `webapp-vue/src/api/types.ts`, `api/communities.ts`, `communities/context.ts`, `communities/routeData.ts`, `communities/fallbacks/RoundFallback.vue`, `App.vue`, `communities/routes.ts`
- Test: `communities/__tests__/routeData.spec.ts`, Tests von `RoundFallback`/`App`-Header (bestehende anpassen)

**Interfaces:**
- Consumes: JSON aus Task 1
- Produces:
  - `interface EditionResponse { label: string | null; startsAt: string; startsAtTimezone: string; phaseTwoStartRound: number | null; gamesFromRound: number; gamesUntilRound: number; frozen: boolean }`
  - `CommunityResponse.edition: EditionResponse | null` (flache Felder weg)
  - `interface EditionRequest { label: string | null; startsAt: string; startsAtTimezone: string; phaseTwoStartRound: number | null; gamesFromRound: number }`
  - `updateCommunity(slug: string, name: string): Promise<CommunityResponse>`, `createEdition(slug: string, body: EditionRequest)`, `replaceEdition(slug: string, body: EditionRequest)` (beide `Promise<CommunityResponse>`)
  - `ActiveCommunity`: `startsAt: string | null`, `startsAtTimezone: string` bleiben (aus `edition`, sonst `null`/`'Europe/Berlin'`), neu `editionLabel: string | null`
  - `CommunitySubPage` um `'edition'` erweitert

- [ ] **Step 1: Failing tests**
  - `publishCommunity` mit `edition: null` → `activeCommunity.startsAt === null`, `editionLabel === null`.
  - mit Edition `label: 'Hüttenwochenende'` → `editionLabel === 'Hüttenwochenende'`.
  - Header: Brand zeigt `editionLabel ?? name` plus `'26`; ohne Edition nur den Namen.
  - `RoundFallback` mit `edition: null` zeigt „Noch kein Termin“.

- [ ] **Step 2: Run, expect FAIL** — `cd webapp-vue && pnpm test -- routeData RoundFallback App`

- [ ] **Step 3: Implement** — wie Interfaces; `settings.vue` nur so weit, dass `vue-tsc -b` grün ist (Neuaufbau in Task 5).

- [ ] **Step 4: Run, expect PASS** — `pnpm test && pnpm lint && pnpm exec vue-tsc -b`

- [ ] **Step 5: Commit** — `Read the active edition from a nested field`

---

### Task 4: Kalender-Rechnung und -Anzeige

Die Engine lebt in Kotlin; das Formular muss aber ungespeicherte Werte live zeigen. Deshalb ein TS-Spiegel, gepinnt per Golden Vectors (`cross-runtime-parity.md`).

**Files:**
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/countdown/EditionGridVectors.kt`, `EditionGridGoldenVectorTest.kt`
- Create: `shared/edition-grid/vectors.json` (vom Kotlin-Test geschrieben)
- Create: `webapp-vue/src/communities/edition/editionGrid.ts`, `EditionCalendar.vue`
- Test: `webapp-vue/src/communities/edition/__tests__/editionGrid.spec.ts`, `EditionCalendar.spec.ts`

**Interfaces:**
- Produces:
  - `roundStart(startsAt: string, zone: string, round: number): DateTime` — `startsAt` in `zone` plus `round − 1` Kalendertage
  - `roundAt(now: DateTime, startsAt: string, zone: string): number`
  - `frozenSince(startsAt: string, zone: string, gamesFromRound: number): DateTime` = `roundStart(…, gamesFromRound − 1)`
  - `type CellKind = 'none' | 'phase-one' | 'phase-two' | 'start'`
  - `interface GridCell { round: number; start: DateTime; kind: CellKind; today: boolean; freezesHere: boolean }`
  - `editionCells(e: { startsAt: string; zone: string; gamesFromRound: number; gamesUntilRound: number; phaseTwoStartRound: number | null }, now: DateTime): GridCell[]` — Runden `min(roundAt(now), gamesFromRound) … 1`; `start` für Runde `1`; `phase-two` für `phaseTwoStartRound ≤ m ≤ gamesUntilRound`; `freezesHere` an `gamesFromRound − 1`
  - `<EditionCalendar :cells="GridCell[]" />`

- [ ] **Step 1: Vectors + failing TS tests**
  - Kotlin `EditionGridGoldenVectorTest` (Muster: `SeededRandomGoldenVectorTest`, Schreiben mit `-Dedition.vectors.write=true`): Fälle `{startsAt, zone, round, roundStart}` aus `CountdownEngine.intervalOf` und `{now, startsAt, zone, round}` aus `roundAt` — mindestens: Ankerfall `2027-06-24T09:00Z` Europe/Berlin (Runden −1, 0, 1), DST vor/nach `2027-03-28` und `2026-10-25`, `America/New_York`, Runde `-365`. Datei mit `version: 1` und Regenerations-Hinweis.
  - `editionGrid.spec.ts`: liest `../shared/edition-grid/vectors.json`, prüft `roundStart` und `roundAt` gegen jeden Fall (ISO-Instant-Vergleich).
  - `editionCells` mit `now = 2026-11-05T11:00Z`, Start `2026-12-20T17:00Z`, `gamesFromRound -30`, `phaseTwo -7`: erste Zelle Runde `-45` mit `today` (läuft 4. Nov. 18:00 bis 5. Nov. 18:00), `-31` `freezesHere` und `none`, `-30…-8` `phase-one`, `-7…0` `phase-two`, letzte Runde `1` `start`.
  - `EditionCalendar.spec.ts`: 7 Zeilen-Raster mit Auffüllung bis Montag; Legende mit genau „kein Spiel“, „Phase 1“, „Phase 2“, „Start“, „heute“, „ab hier fix“; Klick auf eine Zelle zeigt „Runde -7 · Sa., 12. Dez. 18:00 · Phase 2“ (Zahl mit ASCII-Minus, wie im Spiel-Header); Raster-Container hat `overflow-x-auto` (Review Focus 4).

- [ ] **Step 2: Run, expect FAIL** — `cd core && ./mvnw test -Dtest=EditionGridGoldenVectorTest -Dedition.vectors.write=true` (schreibt Datei), dann `cd webapp-vue && pnpm test -- editionGrid EditionCalendar` → FAIL (Modul fehlt).

- [ ] **Step 3: Implement** — TS-Header-Kommentar nennt `CountdownEngine` als Gegenstück. Kalender: Spalten = Wochen (Mo–So), Monatsname über der ersten Spalte eines Monats, Farben `bg-stone-200` / `bg-phase-one` / `bg-phase-two` / `bg-stone-900`, heute als Ring, „fix“ als linke rote Kante mit Schloss-Icon, Legende immer sichtbar, Details per Tap unter dem Raster.

- [ ] **Step 4: Run, expect PASS** — `./mvnw test -Dtest=EditionGridGoldenVectorTest` und `pnpm test -- editionGrid EditionCalendar`

- [ ] **Step 5: Commit** — `Draw an edition's rounds as a week grid`

---

### Task 5: Edition-Seite und schlanke Einstellungen

**Files:**
- Create: `webapp-vue/src/pages/c/[slug]/edition.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/edition.spec.ts`, `settings.spec.ts`

**Interfaces:**
- Consumes: `createEdition`, `replaceEdition`, `updateCommunity` (Task 3), `editionCells`, `frozenSince`, `roundStart`, `EditionCalendar` (Task 4), `saveErrorMessage` (`@/profile/saveError`), `useAdminGuard`, `useCommunityContext().refresh`, `communityPath(slug, 'edition' | 'settings')`

- [ ] **Step 1: Failing tests**

`settings.spec.ts`:
- ohne Edition: Name-Feld, Text „Kein Lauf aktiv.“, Link „Edition erzeugen“ → `/c/<slug>/edition`; keine Zeitzone/Start-Felder.
- mit Edition: Bezeichnung (oder Community-Name), Kalender, Link „Edition bearbeiten“.
- Speichern schickt `updateCommunity(slug, 'Neu Name')`.

`edition.spec.ts`:
- ohne Edition: leeres Formular, Label-Placeholder = Community-Name, Absenden ruft `createEdition` mit `{label: null, startsAt: '2026-12-20T17:00:00.000Z', startsAtTimezone: 'Europe/Berlin', phaseTwoStartRound: -7, gamesFromRound: -30}` (Eingabe 20.12.2026, 18:00).
- mit Edition: befüllt, Absenden ruft `replaceEdition`; geleertes „Phase 2 ab“ schickt `phaseTwoStartRound: null`.
- Kopfzeilen-Vorschau „Hütte Hütte '26“, mit Bezeichnung „Hüttenwochenende '26“.
- abgeleitete Daten unter den Rundenfeldern („beginnt Do., 19. Nov. 18:00“).
- erste Spielrunde so früh, dass der Freeze vorbei ist → rote Zeile, Absenden trotzdem möglich (Server entscheidet).
- eingefrorene Edition (`frozen: true`): Datum, Uhrzeit, Zone `disabled`; **keine** rote Zeile (Review Focus 2).
- 409 mit `detail` → „Speichern fehlgeschlagen: „…““.
- Erfolg → `refresh()` und Navigation nach `/c/<slug>/settings`.
- ohne Start oder erste Spielrunde: Hinweis statt Kalender, Absenden gesperrt.

- [ ] **Step 2: Run, expect FAIL** — `pnpm test -- edition settings`

- [ ] **Step 3: Implement** — Felder: Bezeichnung (optional), Start-Datum (`type="date"`), Uhrzeit (`type="time"`), Zeitzone (`Intl.supportedValuesOf('timeZone')`, wie heute), Erste Spielrunde (`type="number"`, `max="0"`, Pflicht), Phase 2 ab (`type="number"`, `max="-1"`, optional). Zeile unter den Rundenfeldern nennt den Nullpunkt (Wortlaut frei, „…“). Datum+Uhrzeit in der gewählten Zone → ISO-Instant mit Luxon. Mobile-first, eine Spalte; Datum/Uhrzeit und die beiden Rundenfelder je nebeneinander.

- [ ] **Step 4: Run, expect PASS** — `pnpm test && pnpm lint && pnpm exec vue-tsc -b`

- [ ] **Step 5: Commit** — `Edit a community's edition on its own page`

---

### Task 6: Abschluss

**Files:**
- Modify: passende Datei unter `.claude/guidelines/` (laut `feeding-knowledge-back.md`)

- [ ] **Step 1:** Übertragbare Regeln festhalten: „0..1 aktive Edition; eine Edition hat immer Termin und erste Spielrunde“ (in die Leitlinie, die Editionen beschreibt — `grep -rln "edition" .claude/guidelines`), „Community- und Edition-Schreibwege getrennt, Edition per `PUT` vollständig ersetzt“.
- [ ] **Step 2:** Volle Läufe: `cd core && ./mvnw clean test`; `cd webapp-vue && pnpm test && pnpm lint && pnpm exec vue-tsc -b`. Expected: alles grün.
- [ ] **Step 3:** App starten (Backend + `pnpm dev`), am Handy-Viewport durchklicken: Community anlegen → „Edition erzeugen“ → speichern → Countdown läuft → „Edition bearbeiten“.
- [ ] **Step 4: Commit** — `Note the edition rules in the guidelines`
- [ ] **Step 5:** PR gegen `feature/round-numbering-redesign-820c15`; Einmal-Schritt in die Beschreibung: DB-Reset fällt mit dem der Rundennummerierung zusammen (V3 in place).
