# Edition archivieren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Admin beendet die aktive Edition. Die Endrangliste bleibt ohne `user_id` an der
Edition, alle Spieldaten der Edition werden gelöscht.

**Architecture:** `community` bekommt die Schnittstelle `EditionGameData`, implementiert in `game`
(Muster `MemberPointsQuery`). `EditionArchiver` sperrt die aktive Edition, holt die Endpunkte, baut
die Rangliste, lässt `game` löschen und setzt `final_standings` + `archived_at`, alles in einer
Transaktion. Die Rundenansage sperrt die Edition-Zeile geteilt und legt für eine archivierte Edition
keine Runde mehr an.

**Tech Stack:** Spring Boot 4.1, Kotlin, Spring Data JDBC, Flyway (modulbasiert), Postgres 18,
mockk + kotest + MockMvc-DSL + Testcontainers; Vue 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-edition-archivieren-design.md`

## Global Constraints

- Endpunkt: `POST /api/communities/{slug}/editions/active/archive`, nur Admin/Super-Admin
  (`access.requireAdmin`), 404 ohne aktive Edition (`EditionNotFoundException`), Antwort
  `CommunityResponse` mit `edition = null`.
- Spalte: `community.editions.final_standings JSONB NULL`; Flyway `community/V7__add_edition_final_standings.sql`.
- JSON-Zeile genau: `{ "rank", "name", "shortName", "bgColorHex", "points" }`, keine `user_id`.
- Ranking: Wettkampf-Ranking (1, 1, 3), sortiert nach Punkten absteigend, Gleichstand in
  Roster-Reihenfolge (`createdAt` des Mitglieds, dann `userId`).
- Rangliste = aktive Mitglieder zum Zeitpunkt des Beendens; Name/Kürzel/Farbe über
  `MemberIdentityResolver.resolve` (wie `RosterService`).
- Punkte = Summe der `round_plays.points` der Edition je Spieler, nur Runden im Spielfenster
  (`windowReasonOf(...) == null`), betrachterunabhängig, laufende Runde eingeschlossen.
- Button-Text „Edition beenden“, Klasse `text-error`. Rückfrage per `window.confirm`, Text genau:
  `Edition „{Titel}“ beenden? Alle Runden, Tipps und Spieldaten werden gelöscht. Nur die Endrangliste bleibt.`
  (`{Titel}` = `edition.label ?? community.name`).
- Kotlin: benannte Argumente ab zwei Argumenten (`.claude/guidelines/kotlin.md`).
- Commits: englisch, 7 Regeln aus `CLAUDE.md`, Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Archivieren während einer Rundenansage:** Danach existiert keine `round_games`-Zeile für die
   archivierte Edition (Task 3: Sperre + Test „announce refuses an archived edition“).
2. **Edition ohne gespielte Runde** (vor dem ersten Spiel beendet): Rangliste mit allen aktiven
   Mitgliedern, alle `points = 0`, alle `rank = 1`; kein Fehler (Task 2 Test).
3. **Mitglied ohne Tipp / ausstehendes Mitglied:** Ohne Tipp steht man mit 0 Punkten in der
   Liste. `PENDING`-Mitglieder stehen nicht drin (Task 2 Test).
4. **Nach dem Archivieren lässt sich eine neue Edition anlegen** (Task 2 Integrationstest:
   `create` nach `archive` gelingt).
5. **Nutzer nach dem Archivieren löschen:** `final_standings` bleibt unverändert, kein FK hält den
   Nutzer (Task 2 Integrationstest löscht den Nutzer per `UserRepository.deleteById`).

---

### Task 1: Spalte und Schnittstelle

**Files:**
- Create: `core/src/main/resources/db/migration/community/V7__add_edition_final_standings.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/EditionGameData.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityEdition.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityEditionRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityEditionRepositoryTest.kt`

**Interfaces:**
- Produces:
  - `CommunityEdition.finalStandings: JsonNode? = null` (`tools.jackson.databind.JsonNode`, wird
    vom vorhandenen Converter gemappt). KDoc: die Endrangliste, gesetzt genau beim Archivieren,
    ohne `user_id`.
  - `CommunityEditionRepository.lockActiveByCommunityId(communityId: UUID): CommunityEdition?`
    — `SELECT * FROM community.editions WHERE community_id = :communityId AND archived_at IS NULL FOR UPDATE`.
  - `interface EditionGameData { fun finalPoints(edition: CommunityEdition, userIds: Collection<UUID>): Map<UUID, Int>; fun purge(editionId: UUID) }`
    im Paket `org.unividuell.countdown.core.community`. KDoc wie `MemberPointsQuery`: Schnittstelle
    lebt im Konsumenten, `game` implementiert. `finalPoints` liefert nur Spieler mit Punkten.

- [ ] **Step 1: Failing test** in `CommunityEditionRepositoryTest`:
  `final standings round-trip as json` — Edition speichern mit
  `finalStandings = mapper.readTree("""[{"rank":1,"name":"Fry","shortName":"FR","bgColorHex":"#123456","points":12}]""")`,
  neu laden, `loaded.finalStandings shouldBe saved.finalStandings`.
  `lock active edition finds only the active one` — eine archivierte und eine aktive Edition
  derselben Community; `lockActiveByCommunityId(cid)?.id shouldBe active.id`.
- [ ] **Step 2:** `cd core && ./mvnw test -Dtest=CommunityEditionRepositoryTest` → FAIL (Feld/Methode fehlt).
- [ ] **Step 3:** Migration `ALTER TABLE community.editions ADD COLUMN final_standings JSONB NULL;`
  mit Kommentar (was, warum ohne `user_id`). Feld, Repository-Methode und Schnittstelle anlegen.
- [ ] **Step 4:** Test erneut → PASS.
- [ ] **Step 5: Commit** `Add final standings column and edition game data port`

### Task 2: `EditionArchiver` und Endpunkt

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionArchiver.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionArchiverTest.kt` (mockk, Unit)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

**Interfaces:**
- Consumes: Task 1.
- Produces: `@Service class EditionArchiver(editions: CommunityEditionRepository, members: CommunityMemberRepository, users: UserQuery, gameData: EditionGameData, mapper: ObjectMapper, clock: Clock)`
  mit `@Transactional fun archive(communityId: UUID): CommunityEdition`.

Ablauf in `archive`: `lockActiveByCommunityId` (sonst `EditionNotFoundException`) → aktive
Mitglieder (`status == ACTIVE`) → `gameData.finalPoints(edition, ids)` → Zeilen sortieren und ranken
→ `gameData.purge(edition.id)` → `save(edition.copy(archivedAt = clock.instant(), finalStandings = …))`.
Die Zeile als private `data class FinalStanding(rank: Int, name: String, shortName: String, bgColorHex: String, points: Int)`,
per `mapper.valueToTree` zu `JsonNode`.

- [ ] **Step 1: Failing tests** in `EditionArchiverTest`:
  - `archive ranks active members by points with shared ranks` — drei aktive Mitglieder mit 12, 12,
    5 Punkten, ein `PENDING`-Mitglied → JSON `rank` = `[1, 1, 3]`, `points` = `[12, 12, 5]`,
    drei Zeilen, kein Feld `userId` in irgendeiner Zeile.
  - `archive keeps roster order on a tie` — zwei mit gleichen Punkten, älteres `createdAt` zuerst.
  - `archive without any play lists everyone with zero` — `finalPoints` liefert `emptyMap()` →
    alle `points = 0`, alle `rank = 1`.
  - `archive purges game data and stamps archivedAt` — `verify { gameData.purge(editionId) }`,
    gespeicherte Edition hat `archivedAt = now`.
  - `archive without an active edition throws not found` — `lockActiveByCommunityId` → `null` →
    `shouldThrow<EditionNotFoundException>`, `purge` nie aufgerufen.
- [ ] **Step 2:** `./mvnw test -Dtest=EditionArchiverTest` → FAIL.
- [ ] **Step 3:** `EditionArchiver` implementieren.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Failing controller tests** in `CommunityControllerTest` (`EditionArchiver` als Mock
  wie `editions`):
  - `archive answers the community without an edition` — POST `…/team/editions/active/archive`
    als Admin, `archiver.archive(c.id)` gibt archivierte Edition zurück, `editions.active` danach
    `null` → `status isOk`, `jsonPath("$.edition") { value(null) }`.
  - `archive answers 404 without an active edition` — wirft `EditionNotFoundException` → 404.
  - `archive is admin only` — `access.requireAdmin` wirft `NotAdminException` → 403.
- [ ] **Step 6:** Endpunkt `archiveEdition` im Controller, KDoc „Ends the active run: keeps the final
  standings, deletes its game data; 404 without one.“ Antwort über `respond(community = c, edition = null, …)`.
- [ ] **Step 7:** `./mvnw test -Dtest='EditionArchiverTest,CommunityControllerTest'` → PASS.
- [ ] **Step 8: Commit** `Let an admin end the active edition`

### Task 3: `game` implementiert `EditionGameData`, Ansage respektiert das Archiv

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameEditionData.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt` (`announce`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundGameEditionDataTest.kt` (Testcontainers, `@Transactional`, Aufbau wie `RoundPlayPointsTest`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionArchiveIntegrationTest.kt` (Testcontainers)

**Interfaces:**
- Consumes: `EditionGameData` (Task 1), `EditionArchiver` (Task 2), `RoundPlayRepository.pointsOf`,
  `windowReasonOf`.
- Produces:
  - `@Component class RoundGameEditionData(plays: RoundPlayRepository, rounds: RoundGameRepository) : EditionGameData`.
  - `RoundGameRepository.deleteByEditionId(editionId: UUID): Int` — `@Modifying DELETE FROM game.round_games WHERE edition_id = :editionId`
    (Cascade auf `round_plays`, `round_play_votes`, `round_assets`).
  - `RoundGameRepository.lockActiveEdition(editionId: UUID): Int?` — `SELECT 1 FROM community.editions WHERE id = :editionId AND archived_at IS NULL FOR SHARE`.
    KDoc: `FOR SHARE` wartet auf die `FOR UPDATE`-Sperre des Archivierens und prüft `archived_at`
    danach neu; ohne sie legte eine gleichzeitige Ansage eine Runde für die archivierte Edition an.
  - `RoundGameStore.announce` ruft `lockActiveEdition` zuerst; `null` → `IllegalStateException("edition $editionId is archived")`.

- [ ] **Step 1: Failing tests** in `RoundGameEditionDataTest`:
  - `final points sum every play inside the window, running round included` — Runden −3, −2
    (abgeschlossen) und die laufende Runde mit Punkten 4, 3, 2 für Spieler A, eine Runde außerhalb
    des Fensters mit 9 → `finalPoints(edition, [A]) shouldBe mapOf(A to 9)`.
  - `purge deletes the edition's rounds, plays and assets only` — zwei Editionen mit je einer Runde,
    Play und Asset; `purge(e1)` → für e1 nichts mehr in `round_games`/`round_plays`/`round_assets`,
    e2 unverändert.
  - `announce refuses an archived edition` — Edition mit `archivedAt` gesetzt →
    `shouldThrow<IllegalStateException> { store.announce(...) }`, keine Zeile angelegt.
- [ ] **Step 2:** `./mvnw test -Dtest=RoundGameEditionDataTest` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Failing test** `EditionArchiveIntegrationTest` (echter `EditionArchiver`, echte DB):
  - `archive keeps standings when a player is deleted afterwards` — Community, zwei aktive Mitglieder,
    eine Runde mit Play (5 Punkte) für A (A ist **nicht** `created_by` der Community: dort gilt
    `ON DELETE RESTRICT`), archivieren, dann `UserRepository.deleteById(A)` →
    Edition neu laden: `finalStandings[0].name` und `points = 5` unverändert, kein Fehler beim Löschen.
  - `a new edition can be created after archiving` — archivieren, dann `EditionService.create(...)` gelingt.
- [ ] **Step 6:** `./mvnw test -Dtest=EditionArchiveIntegrationTest` → PASS (sonst Fehler suchen,
  nicht Test anpassen).
- [ ] **Step 7:** `cd core && ./mvnw clean test` → alles grün (inkl. `ModularityTests`: `community`
  hängt nicht von `game` ab).
- [ ] **Step 8: Commit** `Purge an archived edition's game data`

### Task 4: Frontend „Edition beenden“

**Files:**
- Modify: `webapp-vue/src/api/communities.ts`
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue` (Abschnitt „Edition“, unter „Edition bearbeiten“)
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`

**Interfaces:**
- Consumes: Endpunkt aus Task 2.
- Produces: `export const archiveEdition = (slug: string) => apiFetch<CommunityResponse>(\`/api/communities/${slug}/editions/active/archive\`, { method: 'POST' })`.

- [ ] **Step 1: Failing tests** in `settings.spec.ts`, neuer `describe('settings — end edition')`:
  - `asks before ending and ends on yes` — `window.confirm` → `true`; Klick auf
    `[data-test="archive-edition"]` → `confirm` mit genau dem Text aus *Global Constraints*
    (Titel „Hüttenwochenende“), `archiveEdition` mit `'team'` aufgerufen, `refresh` aufgerufen.
  - `does nothing when the confirm is declined` — `confirm` → `false` → `archiveEdition` nicht aufgerufen.
  - `shows the reason when ending fails` — `archiveEdition` wirft `ApiError` → Fehlertext über
    `saveErrorMessage` sichtbar.
  - `offers no end button without an edition` — `useCommunity(null)` → kein `[data-test="archive-edition"]`.
  (`refresh` im Context-Mock dafür als prüfbares `vi.fn()` herausziehen.)
- [ ] **Step 2:** `cd webapp-vue && pnpm test settings` → FAIL.
- [ ] **Step 3:** API-Funktion und Button (`<button data-test="archive-edition" class="… text-error …">Edition beenden</button>`,
  gleiche Grundklassen wie „Edition bearbeiten“) mit `async function archive()`; Fehler in eigenem
  `ref`, angezeigt im Edition-Abschnitt.
- [ ] **Step 4:** `pnpm test` → PASS; `pnpm lint` (Ausgabe auf `warning` prüfen); `pnpm exec vue-tsc -b` → ohne Fehler.
- [ ] **Step 5: Commit** `Add an end-edition button to the settings`

### Task 5: Wissen zurückführen und im Browser prüfen

**Files:**
- Modify: `.claude/guidelines/countdown.md` (Abschnitt „Editions: 0..1 active, always dated“)

- [ ] **Step 1:** Regel ergänzen (eine Aufzählung): Archivieren beendet einen Lauf
  (`POST .../editions/active/archive`), behält nur `final_standings` ohne `user_id`, löscht alle
  `game.round_games` der Edition per Cascade; neue edition-gebundene Tabellen hängen per
  `ON DELETE CASCADE` an `round_games` oder `editions`, sonst bleiben sie beim Archivieren liegen.
- [ ] **Step 2:** App starten (`preview_start`, Backend + Frontend), als Admin `c/{slug}/settings`
  öffnen, „Edition beenden“ → Rückfrage bestätigen → Abschnitt zeigt „Kein Lauf aktiv.“, Request
  im Netzwerk-Log 200. Danach „Edition erzeugen“ funktioniert.
- [ ] **Step 3: Commit** `Note how archiving ends a run`
