# Runden per Tageslauf materialisieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein täglicher Lauf um 03:00 Europe/Berlin legt für jede aktive Edition die laufende (falls fehlend) und die nächste Runde an; der `GET` bleibt Fallback.

**Architecture:** `AnnouncementService.materialise` wandert unverändert in eine eigene Komponente `RoundMaterialiser`, die Fallback und Lauf teilen. `MaterialisationSchedule` (`@Scheduled`) geht über `CommunityQuery.activeEditions()`, prüft Fenster und vorhandene Zeile und ruft je Runde den Materialiser in eigener Transaktion. Weil eine Runde nun bis zu einen Tag vor Beginn existiert, rückt der Einfrierpunkt um eine Runde vor, und die Stufen-Freigabe trifft nur noch Runden älter als die laufende.

**Tech Stack:** Spring Boot 4.1.1 · Kotlin 2.4 · Spring Modulith 2.1 · Spring Data JDBC · PostgreSQL 18 · Testcontainers · JUnit 5 + kotest-Matcher + mockk · Vue 3 + Vitest · pnpm.

**Spec:** [`docs/superpowers/specs/2026-10-11-round-materialisation-schedule-design.md`](../specs/2026-10-11-round-materialisation-schedule-design.md) — vor jedem Task lesen.

**Wo:** Worktree `/opt/unividuell/projects/countdown.unividuell.org/.claude/worktrees/cool-heisenberg-0bc007`, Branch `feature/game-materialization-scheduler-8b7aa1`. Alle Pfade unten relativ dazu. Docker muss laufen (Testcontainers, Boot-Check).

## Global Constraints

- Quelltext, KDoc, Kommentare, Commit-Messages: **Englisch**. Nutzertext auf Deutsch mit `„…“`.
- Kotlin-Aufrufe: **benannte Argumente ab zwei Argumenten** (Ausnahmen: ein Argument, Varargs, Java-Funktionen, Trailing-Lambdas, infix) — `.claude/guidelines/kotlin.md`.
- Tests: kotest-Matcher, mockk, JUnit 5; Testcontainers für DB-Verhalten. Kein Mockito, kein `kotlin.test`.
- Logging: `private val logger = KotlinLogging.logger {}` in der Klasse, Nachricht immer als Lambda. Niemals `params` loggen.
- Property: `countdown.game.materialisation-cron`, Default `0 0 3 * * *`, Zone fest `Europe/Berlin` (`CommunityEdition.DEFAULT_TIMEZONE`), Test-`application.yaml`: `"-"`.
- Freigabe: `round_number > n` (älter als die laufende Runde `n`), nie `<> n`.
- Einfrierpunkt: `startsAt − (gamesFromRound + 2) Tage`, kalendarisch in `startsAtTimezone`; unbegrenztes Fenster bleibt `Instant.MIN`.
- Commit-Messages nach den 7 Regeln aus `CLAUDE.md`; Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Git-Identität des Repos ist `cleemansen@gmail.com` — nicht ändern.
- Nur Code anfassen, der zum Feature gehört; keine Kommentare an fremden Blöcken.
- Backend-Befehle laufen in `core/` (`./mvnw …`), Frontend-Befehle in `webapp-vue/` (`pnpm …`).

## Review Focus

1. **Lauf und Fallback rennen um dieselbe Runde** → eine Zeile, kein Fehler, alle spielen das Spiel des Gewinners. Gepinnt in Task 3 (`losing the race to the fallback returns the winner's row without an error`).
2. **Lauf nach dem Event** (laufende Runde jenseits von `gamesUntilRound`) → nichts angelegt, kein Fehler. Gepinnt in Task 3 (`after the window nothing is materialised`).
3. **Freigabe scheitert für eine Edition** → die übrigen Editionen werden trotzdem vorbereitet. Gepinnt in Task 3 (`a failing release does not stop the next edition`).
4. **Archivierte Edition** → bekommt nie eine Runde. Gepinnt in Task 3 (`CommunityQueryServiceTest`).
5. **Cron-Ausdruck aus der `application.yaml`** → App bootet und der Lauf feuert; in Tests feuert er nie. Geprüft in Task 4 (Boot-Check) bzw. implizit durch jeden `@SpringBootTest`.

---

### Task 1: `RoundMaterialiser` herauslösen, Freigabe nur älter als laufend

Reine Verlagerung plus eine Verhaltensänderung: die Freigabe nach einer Materialisierung trifft nur Runden **älter** als die gerade angekündigte, nicht mehr alle anderen. Heute schon testbar: eine vorab geschriebene nächste Runde darf ihre Stufen-Assets nicht verlieren.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundMaterialiser.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameStore.kt:58-61`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundGameRepository.kt:17-20`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt:238-248` (KDoc)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementMaterialisedHookTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceNoGameTypeTest.kt`

**Interfaces:**
- Produces:
  - `RoundMaterialiser.materialise(edition: CommunityEdition, roundNumber: Int): RoundGame?` — `@Transactional`; `null` nur ohne verfügbaren Spieltyp; bei verlorenem Rennen die Zeile des Gewinners.
  - `RoundMaterialiser.releaseStagesOlderThan(edition: CommunityEdition, roundNumber: Int)` — `@Transactional`.
  - `RoundGameStore.roundIdsOlderThan(edition: CommunityEdition, roundNumber: Int): List<UUID>`
  - `RoundGameRepository.idsOfOlderRounds(editionId: UUID, roundNumber: Int): List<UUID>`
  - `AnnouncementService`-Konstruktor: `selection: GameSelection` entfällt, `materialiser: RoundMaterialiser` kommt dazu.

- [ ] **Step 1: Failing Test — der Fallback lässt eine vorab angekündigte Runde in Ruhe**

In `AnnouncementMaterialisedHookTest.kt` den Import `io.kotest.matchers.collections.shouldNotContain` ergänzen und nach dem Test `` `materialising a round releases every earlier round's stage assets, and only those` `` einfügen:

```kotlin
    @Test
    fun `the fallback leaves a round announced ahead alone`() {
        val (community, viewer) = aCommunity("Ahead Round")
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        // A larger round number is earlier: `roundNumber - 1` is tomorrow's round, not yet playable.
        val ahead = store.announce(
            edition = edition, roundNumber = roundNumber - 1, gameType = "guess-hue",
            params = mapper.readTree("""{"n":3}"""), award = anAward(), announcedAt = clock.instant(),
        )

        announcements.resolve(slug = community.slug, userId = viewer, isSuperAdmin = false)

        recorder.stagesReleasedRounds shouldNotContain requireNotNull(ahead.id)
    }
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run (in `core/`): `./mvnw test -Dtest=AnnouncementMaterialisedHookTest`
Expected: FAIL in `the fallback leaves a round announced ahead alone` — die Liste enthält die ID von `ahead` (heute `round_number <> n`).

- [ ] **Step 3: Repository-Query auf „älter als“ umstellen**

In `RoundGameRepository.kt` die Methode `idsOfOtherRounds` samt KDoc ersetzen durch:

```kotlin
    /** The rounds of the edition older than [roundNumber] — a larger number is earlier. Once a later
     *  round runs they are no longer playable, and their stage assets may go. */
    @Query("SELECT id FROM game.round_games WHERE edition_id = :editionId AND round_number > :roundNumber")
    fun idsOfOlderRounds(editionId: UUID, roundNumber: Int): List<UUID>
```

In `RoundGameStore.kt` `roundIdsExcept` samt KDoc ersetzen durch:

```kotlin
    /** Every round id of [edition] older than [roundNumber] — the rounds that stopped being playable. */
    @Transactional(readOnly = true)
    fun roundIdsOlderThan(edition: CommunityEdition, roundNumber: Int): List<UUID> =
        rounds.idsOfOlderRounds(editionId = requireNotNull(edition.id), roundNumber = roundNumber)
```

- [ ] **Step 4: `RoundMaterialiser` anlegen**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundMaterialiser.kt` — der Körper ist `AnnouncementService.materialise`/`releaseEarlierStages` von heute, mit `roundNumber` statt `round` und `edition.communityId` statt eines eigenen Parameters. Die Freigabe ist **nicht** mehr Teil von `materialise`: wer vorab ankündigt, darf nicht alles vor der angekündigten Runde freigeben, das wäre die laufende.

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
import java.security.SecureRandom
import java.time.Clock

/**
 * Announces a round: picks its game, draws its params, persists the row and lets the game store its
 * assets. Called by [AnnouncementService] for a round that has no row yet.
 */
@Component
class RoundMaterialiser(
    private val store: RoundGameStore,
    private val catalog: GameCatalog,
    private val selection: GameSelection,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** The hidden seed is drawn, never derived: `(edition, round)` would be guessable. */
    private val secureRandom = SecureRandom()

    /**
     * Announce [roundNumber] of [edition] — or, on a lost race, return the winner's row. `null` when
     * no game type is available.
     */
    @Transactional
    fun materialise(edition: CommunityEdition, roundNumber: Int): RoundGame? {
        val history = store.history(edition = edition, roundNumber = roundNumber)
        val random = GameRandom.independent(secureRandom)
        val context = RoundContext(
            communityId = edition.communityId,
            roundNumber = roundNumber,
            phase = Phase.of(edition = edition, roundNumber = roundNumber),
        )
        val typeId = selection.pick(
            candidates = catalog.availableIds(context),
            history = history,
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            random = random.presentation,
        ) ?: run {
            // Unreachable today, but not because Spring would refuse to inject an empty
            // List<GameType<*>> — it does that happily. It is unreachable because GuessHueGameType
            // is an unconditional bean, so the catalogue this branch guards against never empties.
            logger.warn { "no game type available for round $roundNumber of edition ${edition.id}" }
            return null
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val announced = store.announce(
            edition = edition,
            roundNumber = roundNumber,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = context.copy(
                    previousParams = store.previousParams(edition = edition, gameType = typeId),
                ),
            ),
            award = awardFor(roundNumber = roundNumber, phaseTwoStartRound = edition.phaseTwoStartRound),
            announcedAt = clock.instant(),
        )
        // On a lost announce race, `announced` is the WINNER's row, possibly of a different type
        // than `typeId` drew — so the hook must run against the type the persisted row actually
        // carries, not against this caller's `handle`. Both first callers reach this line and call
        // the winner's hook, which is exactly why it must be idempotent.
        val materialisedHandle = requireNotNull(catalog.handle(announced.gameType)) {
            "announced round carries unknown type '${announced.gameType}'"
        }
        materialisedHandle.materialised(params = announced.params, roundGameId = requireNotNull(announced.id))
        return announced
    }

    /**
     * Every round older than [roundNumber] — the running one — has stopped being playable, so
     * whatever only a playable round needed may go. **Not** everything it stored: a past round's
     * reveal is still rendered by the history, and its asset has to survive — which is why this is
     * `releaseStageAssets` and not `releaseAssets`. Every game is asked; each releases only what it
     * owns, a no-op for most.
     */
    @Transactional
    fun releaseStagesOlderThan(edition: CommunityEdition, roundNumber: Int) {
        val older = store.roundIdsOlderThan(edition = edition, roundNumber = roundNumber)
        if (older.isEmpty()) return
        for (id in catalog.ids()) {
            catalog.handle(id)?.releaseStageAssets(older)
        }
    }
}
```

- [ ] **Step 5: `AnnouncementService` auf den Materialiser umstellen**

In `AnnouncementService.kt`:

1. Konstruktor: `private val selection: GameSelection,` ersetzen durch `private val materialiser: RoundMaterialiser,`.
2. Die Zeilen `/** The hidden seed is drawn, never derived: … */` und `private val secureRandom = SecureRandom()` löschen.
3. Imports löschen: `org.unividuell.countdown.core.game.GameRandom`, `org.unividuell.countdown.core.game.Phase`, `org.unividuell.countdown.core.game.RoundContext`, `org.unividuell.countdown.core.game.awardFor`, `java.security.SecureRandom`. (`Round`, `CommunityEdition`, `GameCatalog`, `Clock`, `KotlinLogging` bleiben in Gebrauch.)
4. In `resolve` die Zeile
   ```kotlin
               roundGame = existing ?: materialise(communityId = communityId, edition = edition, round = round)
   ```
   ersetzen durch
   ```kotlin
               roundGame = existing ?: materialiseNow(edition = edition, roundNumber = round.number)
   ```
5. Die privaten Funktionen `materialise(...)` und `releaseEarlierStages(...)` samt KDoc vollständig ersetzen durch:

```kotlin
    /** Announce the running round, then release what stopped being playable with it. */
    private fun materialiseNow(edition: CommunityEdition, roundNumber: Int): RoundGame? =
        materialiser.materialise(edition = edition, roundNumber = roundNumber)
            ?.also { materialiser.releaseStagesOlderThan(edition = edition, roundNumber = roundNumber) }
```

- [ ] **Step 6: KDoc von `GameType.releaseStageAssets` anpassen**

In `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt` die Zeile

```
     * Fires at announce time, for every round of the run except the one just announced.
```

ersetzen durch

```
     * Fires for every round of the run older than the running one.
```

- [ ] **Step 7: `AnnouncementServiceNoGameTypeTest` an den neuen Konstruktor anpassen**

Import `org.unividuell.countdown.core.game.internal.RoundMaterialiser` ergänzen. Im KDoc `` `AnnouncementService.materialise` `` ersetzen durch `` `RoundMaterialiser.materialise` ``. Die Konstruktion von `service` ersetzen durch:

```kotlin
    private val service = AnnouncementService(
        communities = communities, memberships = memberships, engine = engine, store = store,
        catalog = catalog,
        materialiser = RoundMaterialiser(store = store, catalog = catalog, selection = selection, clock = clock),
        responses = responses, clock = clock,
    )
```

- [ ] **Step 8: KDoc und Testnamen in `AnnouncementMaterialisedHookTest` nachziehen**

Im Klassen-KDoc `Three hooks [AnnouncementService.materialise] must fire` ersetzen durch `Three hooks a materialisation must fire`. Den Test `` `materialising a round releases every earlier round's stage assets, and only those` `` umbenennen in `` `materialising a round releases the stage assets of rounds older than it` `` (Körper unverändert).

- [ ] **Step 9: Tests laufen lassen**

Run (in `core/`): `./mvnw test -Dtest='AnnouncementMaterialisedHookTest,AnnouncementServiceNoGameTypeTest,AnnouncementServiceTest,RoundGameRepositoryTest,ModularityTests'`
Expected: PASS, alle.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -F - <<'EOF'
Extract the round materialisation from the GET

A daily schedule is going to announce rounds a day ahead; it needs the
same draw the announcing GET makes, without the membership gate.

Release now covers only rounds older than the announced one: with a
round announced ahead, "all but the one just announced" would strip
the running round of its stage assets.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Einfrierpunkt eine Runde früher

Der Lauf schreibt Runde `gamesFromRound` schon während `gamesFromRound + 1`. Ab dann darf sich das Raster nicht mehr verschieben.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionFreeze.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/EditionService.kt:92-97` (KDoc von `isFrozen`)
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue:135`
- Modify: `.claude/guidelines/countdown.md` (Abschnitt „A grid that is in play is fixed“)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/EditionFreezeGridParityTest.kt`

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `frozenSince(edition)` liefert den Beginn von Runde `gamesFromRound + 1`.

- [ ] **Step 1: Failing Tests — Erwartungen auf `gamesFromRound + 1`**

In `EditionFreezeTest.kt`:

```kotlin
    @Test
    fun `the freeze point is the start of the round before the first game round`() {
        // 09:00Z is 11:00 in Berlin (CEST); round 25 starts 26 days earlier, same wall-clock.
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = 24)

        frozenSince(e) shouldBe Instant.parse("2026-05-30T09:00:00Z")
    }

    @Test
    fun `day stepping is calendar-aware across a DST boundary`() {
        // 16:00Z is 18:00 in Berlin (CEST). Eleven days earlier is 2026-03-25, still CET (UTC+1),
        // so the same wall-clock 18:00 is 17:00Z — an instant-based minus(11 days) would say 16:00Z.
        val e = edition(startsAt = Instant.parse("2026-04-05T16:00:00Z"), gamesFromRound = 9)

        frozenSince(e) shouldBe Instant.parse("2026-03-25T17:00:00Z")
    }

    @Test
    fun `a window that opens only after the start freezes a day before the start`() {
        val e = edition(startsAt = Instant.parse("2026-06-25T09:00:00Z"), gamesFromRound = -1)

        frozenSince(e) shouldBe Instant.parse("2026-06-24T09:00:00Z")
    }
```

(ersetzen die drei Tests `the freeze point is the start of the first game round`, `day stepping is calendar-aware across a DST boundary`, `a window that opens only after the start freezes at the start itself`). Im Kommentar über `an enormous gamesFromRound …` `` `gamesFromRound + 1` `` durch `` `gamesFromRound + 2` `` ersetzen.

In `EditionFreezeGridParityTest.kt` in `assertMatchesEngine` `number = gamesFromRound,` ersetzen durch `number = gamesFromRound + 1,` und den ersten Test umbenennen in `` `the freeze point is the engine's start of the round before the first game round` ``.

- [ ] **Step 2: Tests laufen lassen, sie müssen scheitern**

Run (in `core/`): `./mvnw test -Dtest='EditionFreezeTest,EditionFreezeGridParityTest'`
Expected: FAIL — drei Fälle in `EditionFreezeTest`, alle drei in `EditionFreezeGridParityTest` (Ist-Wert einen Tag zu spät).

- [ ] **Step 3: `frozenSince` umstellen**

`EditionFreeze.kt`, KDoc und Rechnung von `frozenSince`:

```kotlin
/**
 * From when on this run's round grid is fixed — `null` while there is no grid at all.
 *
 * The moment is the start of round `gamesFromRound + 1`, the day before the first game round: the
 * daily schedule announces each round a day ahead, so that is the earliest instant a
 * `game.round_games` row can exist. An unbounded window (`gamesFromRound == null`) has no such
 * moment, so it answers [Instant.MIN] and every caller's `now >= frozenSince` holds.
 *
 * Deliberately not `CountdownEngine.intervalOf`: `countdown` depends on `community`, never the other
 * way round. `EditionFreezeGridParityTest` pins this copy against the engine.
 */
fun frozenSince(edition: CommunityEdition): Instant? {
    val startsAt = edition.startsAt ?: return null
    val firstGameRound = edition.gamesFromRound ?: return Instant.MIN
    return startsAt.atZone(ZoneId.of(edition.startsAtTimezone))
        .minusDays(firstGameRound.toLong() + 2)
        .toInstant()
}
```

In `EditionService.kt` den KDoc von `isFrozen` ersetzen durch:

```kotlin
    /**
     * Whether this run's grid is fixed — the day before its first game round has begun, so the
     * schedule may have announced that round and moving the grid would hand out a round number twice.
     */
```

- [ ] **Step 4: Backend-Tests laufen lassen**

Run (in `core/`): `./mvnw test -Dtest='EditionFreezeTest,EditionFreezeGridParityTest,EditionServiceTest,CommunityControllerTest,CommunityCreationClearanceSeamTest'`
Expected: PASS.

- [ ] **Step 5: Hinweis in den Einstellungen**

`webapp-vue/src/pages/c/[slug]/settings.vue`, Zeile 135:

```
            : 'Änderbar, bis die erste Spielrunde beginnt — danach ist der Lauf fix.'
```

ersetzen durch

```
            : 'Änderbar bis einen Tag vor der ersten Spielrunde — danach ist der Lauf fix.'
```

Run (in `webapp-vue/`): `pnpm test && pnpm lint && pnpm typecheck`
Expected: alles grün.

- [ ] **Step 6: `countdown.md` nachziehen**

In `.claude/guidelines/countdown.md`, Abschnitt „A grid that is in play is fixed“, den Absatz

```
A run is therefore **frozen** from the start of round `gamesFromRound` on — the earliest instant
anyone could announce a round (`gamesFromRound = null` means unbounded, so a run freezes with its
date). From then on the two fields are 409, and the way forward is a new edition.
```

ersetzen durch

```
A run is therefore **frozen** from the start of round `gamesFromRound + 1` on — the day before its
first game round: the daily schedule announces each round a day ahead, so that is the earliest
instant a `round_games` row can exist (`gamesFromRound = null` means unbounded, so a run freezes
with its date). From then on the two fields are 409, and the way forward is a new edition.
```

und den Absatz

```
What does **not** freeze: `phaseTwoStartRound` and the game window. Rule and stake are frozen per
round at announcement time (`award_rule`, `award_points`), so moving them only touches rounds still
to come — a game-master decision with visible effect, not a silent rewrite of history.
```

ersetzen durch

```
What does **not** freeze: `phaseTwoStartRound` and the game window. Rule and stake are frozen per
round at announcement time (`award_rule`, `award_points`), so moving them only touches rounds not yet
announced — tomorrow's usually is — a game-master decision with visible effect, not a silent rewrite
of history.
```

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community core/src/test/kotlin/org/unividuell/countdown/core/community "webapp-vue/src/pages/c/[slug]/settings.vue" .claude/guidelines/countdown.md
git commit -F - <<'EOF'
Freeze a run one round before its first game

The daily schedule will announce each round a day ahead, so the first
game round's row can exist from the start of the round before it. A
grid moved in that day would point at an announced number.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Der Tageslauf

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityQuery.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityQueryService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MaterialisationSchedule.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/SchedulingConfiguration.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundMaterialiser.kt` (KDoc)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt` (KDoc)
- Modify: `core/src/main/resources/application.yaml`
- Modify: `core/src/test/resources/application.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityQueryServiceTest.kt`
- Test (neu): `core/src/test/kotlin/org/unividuell/countdown/core/game/MaterialisationScheduleTest.kt`
- Test (neu): `core/src/test/kotlin/org/unividuell/countdown/core/game/MaterialisationScheduleBootTest.kt`

**Interfaces:**
- Consumes (Task 1): `RoundMaterialiser.materialise(edition, roundNumber): RoundGame?`, `RoundMaterialiser.releaseStagesOlderThan(edition, roundNumber)`, `RoundGameStore.find(edition, roundNumber): RoundGame?`.
- Produces:
  - `CommunityQuery.activeEditions(): List<CommunityEdition>`
  - `MaterialisationSchedule.run()` — Cron-Einstieg.
  - `MaterialisationSchedule.prepare(edition: CommunityEdition, now: Instant): Int` — Anzahl angelegter Runden.

- [ ] **Step 1: Failing Test — `activeEditions()` lässt Archiviertes aus**

In `CommunityQueryServiceTest.kt` Imports `io.kotest.matchers.collections.shouldContain`, `io.kotest.matchers.collections.shouldNotContain` und `org.unividuell.countdown.core.community.internal.EditionService` ergänzen, den Konstruktorparameter `@Autowired val editions: EditionService,` anhängen und einfügen:

```kotlin
    @Test
    fun `activeEditions lists a community's running edition and not the one it archived`() {
        val uid = user("u").id!!
        val cid = communityService.create(creatorUserId = uid, rawName = "Team").id!!
        val archived = requireNotNull(query.activeEditionOf(cid))
        val running = editions.startNew(communityId = cid, rawLabel = "Run 2027")

        val ids = query.activeEditions().map { it.id }

        ids shouldContain running.id
        ids shouldNotContain archived.id
    }
```

- [ ] **Step 2: Failing Unit-Test für die Schleife**

`core/src/test/kotlin/org/unividuell/countdown/core/game/MaterialisationScheduleTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.MaterialisationSchedule
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

/**
 * The run's loop on its own: which rounds it asks for, which it skips, and that one failure costs
 * nothing else. Persistence and the hooks are [MaterialisationScheduleBootTest]'s.
 */
class MaterialisationScheduleTest {

    /** 03:00 in Berlin (CEST), when the cron fires. */
    private val now = Instant.parse("2026-10-11T01:00:00Z")

    private val engine = CountdownEngine()
    private val communities = mockk<CommunityQuery>()
    private val store = mockk<RoundGameStore>()
    private val materialiser = mockk<RoundMaterialiser>()

    private val schedule = MaterialisationSchedule(
        communities = communities,
        engine = engine,
        store = store,
        materialiser = materialiser,
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )

    @BeforeEach
    fun nothingAnnouncedYet() {
        every { store.find(edition = any(), roundNumber = any()) } returns null
        every { materialiser.materialise(edition = any(), roundNumber = any()) } returns mockk<RoundGame>()
        justRun { materialiser.releaseStagesOlderThan(edition = any(), roundNumber = any()) }
    }

    private fun anEdition(startsAt: Instant? = Instant.parse("2026-12-24T17:00:00Z")) = CommunityEdition(
        id = UUID.randomUUID(),
        communityId = UUID.randomUUID(),
        label = "Run 2026",
        startsAt = startsAt,
    )

    private fun currentOf(edition: CommunityEdition): Int = engine.roundAt(
        now = now,
        startsAt = requireNotNull(edition.startsAt),
        zone = ZoneId.of(edition.startsAtTimezone),
    ).number

    @Test
    fun `the running and the next round are materialised when both are missing`() {
        val edition = anEdition()
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 2

        // A larger round number is earlier: the next round is `current - 1`.
        verify { materialiser.materialise(edition = edition, roundNumber = current) }
        verify { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `a round that already has a row is left alone, whoever wrote it`() {
        val edition = anEdition()
        val current = currentOf(edition)
        every { store.find(edition = edition, roundNumber = current - 1) } returns mockk<RoundGame>()

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `on the window's last round the next one is not materialised`() {
        val dated = anEdition()
        val edition = dated.copy(gamesUntilRound = currentOf(dated))
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify { materialiser.materialise(edition = edition, roundNumber = current) }
        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `the day before the window only its first round is materialised`() {
        val dated = anEdition()
        val edition = dated.copy(gamesFromRound = currentOf(dated) - 1)
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = now) shouldBe 1

        verify(exactly = 0) { materialiser.materialise(edition = edition, roundNumber = current) }
        verify { materialiser.materialise(edition = edition, roundNumber = current - 1) }
    }

    @Test
    fun `after the window nothing is materialised`() {
        val dated = anEdition()
        val current = currentOf(dated)
        val edition = dated.copy(gamesFromRound = current + 5, gamesUntilRound = current + 1)

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify(exactly = 0) { materialiser.materialise(edition = any(), roundNumber = any()) }
    }

    @Test
    fun `a run without a date has no grid to prepare`() {
        val edition = anEdition(startsAt = null)

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify(exactly = 0) { materialiser.materialise(edition = any(), roundNumber = any()) }
        verify(exactly = 0) { materialiser.releaseStagesOlderThan(edition = any(), roundNumber = any()) }
    }

    @Test
    fun `stages older than the running round are released even when nothing was materialised`() {
        val edition = anEdition()
        val current = currentOf(edition)
        every { store.find(edition = edition, roundNumber = any()) } returns mockk<RoundGame>()

        schedule.prepare(edition = edition, now = now) shouldBe 0

        verify { materialiser.releaseStagesOlderThan(edition = edition, roundNumber = current) }
    }

    @Test
    fun `a failing round costs neither the other round nor the next edition`() {
        val failing = anEdition()
        val healthy = anEdition()
        val failingCurrent = currentOf(failing)
        val healthyCurrent = currentOf(healthy)
        every { communities.activeEditions() } returns listOf(failing, healthy)
        every {
            materialiser.materialise(edition = failing, roundNumber = failingCurrent)
        } throws IllegalStateException("preview download failed")

        schedule.run()

        verify { materialiser.materialise(edition = failing, roundNumber = failingCurrent - 1) }
        verify { materialiser.releaseStagesOlderThan(edition = failing, roundNumber = failingCurrent) }
        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent) }
        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent - 1) }
    }

    @Test
    fun `a failing release does not stop the next edition`() {
        val failing = anEdition()
        val healthy = anEdition()
        val healthyCurrent = currentOf(healthy)
        every { communities.activeEditions() } returns listOf(failing, healthy)
        every {
            materialiser.releaseStagesOlderThan(edition = failing, roundNumber = any())
        } throws IllegalStateException("delete failed")

        schedule.run()

        verify { materialiser.materialise(edition = healthy, roundNumber = healthyCurrent) }
        verify { materialiser.releaseStagesOlderThan(edition = healthy, roundNumber = healthyCurrent) }
    }
}
```

- [ ] **Step 3: Failing Boot-Test gegen die Datenbank**

`core/src/test/kotlin/org/unividuell/countdown/core/game/MaterialisationScheduleBootTest.kt`. Gleiche `@Import`-Menge wie `AnnouncementMaterialisedHookTest`, damit beide einen Kontext und dessen Recorder teilen. Gepflanzte Zeilen tragen den Typ `recording-fake`: dessen Params lassen sich parsen, wenn ein Hook auf ihnen läuft (`guess-hue` mit Fantasie-Params täte das nicht).

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.HistoryService
import org.unividuell.countdown.core.game.internal.MaterialisationSchedule
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGame
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundMaterialiser
import org.unividuell.countdown.core.game.internal.RoundNotFoundException
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.songsnippet.SongSnippetTestCatalogConfiguration
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/**
 * The run against a real database: what it persists, what it leaves alone, which stage assets it
 * releases, and that a round announced ahead stays out of reach. Calls
 * [MaterialisationSchedule.prepare] for this class's own edition, never `run()`: that walks every
 * active edition of the context, other test classes' included.
 */
@Import(
    TestcontainersConfiguration::class,
    AnnouncementMaterialisedHookTest.RecordingGame::class,
    SongSnippetTestCatalogConfiguration::class,
)
@SpringBootTest
@Transactional
class MaterialisationScheduleBootTest(
    @Autowired val schedule: MaterialisationSchedule,
    @Autowired val materialiser: RoundMaterialiser,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val history: HistoryService,
    @Autowired val plays: PlayService,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
    @Autowired val recorder: AnnouncementMaterialisedHookTest.RecordingGame.Recorder,
) {
    private data class Run(val community: Community, val owner: UUID, val edition: CommunityEdition)

    /** A run far in the future with an unbounded window, so every round near today carries a game. */
    private fun aRun(name: String): Run {
        val owner = requireNotNull(
            users.save(User(subject = System.nanoTime().toString(), githubLogin = "owner")).id,
        )
        val community = communities.create(creatorUserId = owner, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return Run(community = community, owner = owner, edition = edition)
    }

    private fun currentOf(edition: CommunityEdition): Int = engine.roundAt(
        now = clock.instant(),
        startsAt = requireNotNull(edition.startsAt),
        zone = ZoneId.of(edition.startsAtTimezone),
    ).number

    private fun aPlantedRound(edition: CommunityEdition, roundNumber: Int): RoundGame = store.announce(
        edition = edition,
        roundNumber = roundNumber,
        gameType = "recording-fake",
        params = mapper.valueToTree(AnnouncementMaterialisedHookTest.RecordingGame.RecParams(n = 7)),
        award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1),
        announcedAt = clock.instant(),
    )

    @Test
    fun `the running and the next round are persisted, and a second call changes neither`() {
        val edition = aRun("Schedule Persists").edition
        val current = currentOf(edition)

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 2
        val running = store.find(edition = edition, roundNumber = current).shouldNotBeNull()
        val next = store.find(edition = edition, roundNumber = current - 1).shouldNotBeNull()

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 0
        store.find(edition = edition, roundNumber = current) shouldBe running
        store.find(edition = edition, roundNumber = current - 1) shouldBe next
    }

    @Test
    fun `a row written before the run is left as it was`() {
        val edition = aRun("Schedule Leaves Alone").edition
        val current = currentOf(edition)
        val planted = aPlantedRound(edition = edition, roundNumber = current - 1)

        schedule.prepare(edition = edition, now = clock.instant()) shouldBe 1

        store.find(edition = edition, roundNumber = current - 1) shouldBe planted
    }

    @Test
    fun `losing the race to the fallback returns the winner's row without an error`() {
        val edition = aRun("Schedule Loses Race").edition
        val current = currentOf(edition)
        // The run found no row, then the fallback wrote one before the run's insert.
        val winner = aPlantedRound(edition = edition, roundNumber = current)

        materialiser.materialise(edition = edition, roundNumber = current) shouldBe winner
    }

    @Test
    fun `the run releases the stages of rounds older than the running one, and only those`() {
        val edition = aRun("Schedule Releases").edition
        val current = currentOf(edition)
        val earlier = aPlantedRound(edition = edition, roundNumber = current + 1)

        schedule.prepare(edition = edition, now = clock.instant())

        val running = store.find(edition = edition, roundNumber = current).shouldNotBeNull()
        val next = store.find(edition = edition, roundNumber = current - 1).shouldNotBeNull()
        recorder.stagesReleasedRounds shouldContain requireNotNull(earlier.id)
        recorder.stagesReleasedRounds shouldNotContain requireNotNull(running.id)
        recorder.stagesReleasedRounds shouldNotContain requireNotNull(next.id)
    }

    @Test
    fun `a round announced ahead is reachable through neither the history nor the asset path`() {
        val (community, owner, edition) = aRun("Schedule Keeps Ahead Sealed")
        val current = currentOf(edition)
        schedule.prepare(edition = edition, now = clock.instant())
        store.find(edition = edition, roundNumber = current - 1).shouldNotBeNull()

        shouldThrow<RoundNotFoundException> {
            history.pastRound(slug = community.slug, userId = owner, isSuperAdmin = false, roundNumber = current - 1)
        }
        shouldThrow<RoundNotFoundException> {
            plays.asset(
                slug = community.slug, userId = owner, isSuperAdmin = false,
                roundNumber = current - 1, key = SOLUTION_ASSET_KEY,
            )
        }
    }
}
```

- [ ] **Step 4: Tests laufen lassen, sie dürfen nicht kompilieren**

Run (in `core/`): `./mvnw test -Dtest='MaterialisationScheduleTest,MaterialisationScheduleBootTest,CommunityQueryServiceTest'`
Expected: FAIL — Kompilierfehler, `MaterialisationSchedule` und `activeEditions` existieren nicht.

- [ ] **Step 5: `CommunityQuery.activeEditions()`**

In `CommunityQuery.kt` nach `activeEditionOf` einfügen:

```kotlin

    /** Every community's current run — one per community, archived runs left out. */
    fun activeEditions(): List<CommunityEdition>
```

In `CommunityQueryService.kt` nach `activeEditionOf` einfügen:

```kotlin
    override fun activeEditions(): List<CommunityEdition> = editions.findAllActive()
```

- [ ] **Step 6: `MaterialisationSchedule` und `SchedulingConfiguration`**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/MaterialisationSchedule.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.CommunityEdition
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * Announces every active run's rounds a day ahead, so no player's request draws a round's seed and a
 * day nobody opens still gets its round.
 *
 * A round boundary is the time of day of `startsAt` in the run's own zone — a different hour per
 * community — so one daily run cannot meet them; it can only prepare the next round, which always
 * starts within the next 24 hours. The running round is taken along in case yesterday's run missed it.
 *
 *   03:00 ─┬─ for each active edition
 *          ├─ round n   (running)  missing? → materialise
 *          ├─ round n−1 (next)     missing? → materialise
 *          └─ release stages of rounds older than n
 *
 * A round that has a row is left alone, whoever wrote it. [AnnouncementService] stays the fallback
 * for a round this run missed.
 */
@Component
class MaterialisationSchedule(
    private val communities: CommunityQuery,
    private val engine: CountdownEngine,
    private val store: RoundGameStore,
    private val materialiser: RoundMaterialiser,
    private val clock: Clock,
) {
    private val logger = KotlinLogging.logger {}

    /** Berlin like the default run, so a Berlin run's DST shift moves this run with it. */
    @Scheduled(cron = "\${countdown.game.materialisation-cron}", zone = CommunityEdition.DEFAULT_TIMEZONE)
    fun run() {
        val now = clock.instant()
        val editions = communities.activeEditions()
        val materialised = editions.sumOf { prepare(edition = it, now = now) }
        logger.info { "$materialised rounds materialised across ${editions.size} editions" }
    }

    /**
     * The running and the next round of [edition], each in its own transaction: a failed download for
     * tomorrow must not cost today's round. Returns how many rounds this call announced.
     */
    fun prepare(edition: CommunityEdition, now: Instant): Int {
        val startsAt = edition.startsAt ?: return 0
        val current = engine.roundAt(
            now = now,
            startsAt = startsAt,
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number

        // A larger round number is earlier: the next round is `current - 1`.
        var materialised = 0
        for (roundNumber in listOf(current, current - 1)) {
            if (windowReasonOf(edition = edition, roundNumber = roundNumber) != null) continue
            if (store.find(edition = edition, roundNumber = roundNumber) != null) continue
            try {
                if (materialiser.materialise(edition = edition, roundNumber = roundNumber) != null) materialised++
            } catch (e: Exception) {
                logger.warn(e) { "round $roundNumber of edition ${edition.id} not materialised" }
            }
        }

        try {
            materialiser.releaseStagesOlderThan(edition = edition, roundNumber = current)
        } catch (e: Exception) {
            logger.warn(e) { "stage assets of edition ${edition.id} older than round $current not released" }
        }
        return materialised
    }
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/SchedulingConfiguration.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/** Switches `@Scheduled` on for the whole application — today only [MaterialisationSchedule] uses it. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfiguration
```

- [ ] **Step 7: Cron in beiden `application.yaml`**

`core/src/main/resources/application.yaml`, ans Ende anhängen:

```yaml

countdown:
  game:
    # When MaterialisationSchedule announces every active run's running and next round. The zone is
    # Europe/Berlin, fixed in the code. "-" switches it off — the test application.yaml does.
    materialisation-cron: "0 0 3 * * *"
```

`core/src/test/resources/application.yaml`, unter dem bestehenden `countdown:` vor `public-rate-limit:` einfügen:

```yaml
  game:
    # Off: a test run crossing 03:00 must not announce rounds behind the tests' backs. This file
    # replaces the main application.yaml, so the key has to be here at all.
    materialisation-cron: "-"
```

- [ ] **Step 8: KDoc von `RoundMaterialiser` und `AnnouncementService`**

`RoundMaterialiser.kt`, Klassen-KDoc ersetzen durch:

```kotlin
/**
 * Announces a round: picks its game, draws its params, persists the row and lets the game store its
 * assets. Two callers, one draw — [MaterialisationSchedule] a day ahead, [AnnouncementService] for a
 * round the schedule missed — so the frozen round does not depend on which of them wrote it.
 */
```

`AnnouncementService.kt`:

1. Im Klassen-KDoc den Absatz
   ```
    * The read path is a `SELECT`; only the first caller of a round writes. That is why this is a `GET`
    * that materialises: the announcement **is** the materialisation. Were the row written on first
    * reveal instead, the announcement would have to be computed unpersisted beforehand and could differ
    * from the row written later — exactly the drift the frozen round exists to prevent.
   ```
   ersetzen durch
   ```
    * The read path is a `SELECT`: [MaterialisationSchedule] has normally announced the round a day
    * ahead. Only a round the schedule missed is written here, by its first caller — which is why this
    * `GET` may still materialise. Were that row written on first reveal instead, the announcement
    * would have to be computed unpersisted beforehand and could differ from the row written later —
    * exactly the drift the frozen round exists to prevent.
   ```
2. KDoc von `currentRound`
   ```
        /**
         * Not `readOnly`: the first call of a round inserts. Every later call of the same round only
         * reads, which is where practically all traffic lands.
         */
   ```
   ersetzen durch
   ```
        /**
         * Not `readOnly`: the first call of a round the schedule missed inserts. Every other call only
         * reads, which is where practically all traffic lands.
         */
   ```
3. KDoc von `resolve`
   ```
        /**
         * The gate and the materialisation, shared by all four endpoints: membership, the run, the
         * window, then the announced round — created here if this is the first caller of the round.
         */
   ```
   ersetzen durch
   ```
        /**
         * The gate and the materialisation, shared by all four endpoints: membership, the run, the
         * window, then the announced round — created here if the schedule missed it and this is its
         * first caller.
         */
   ```

- [ ] **Step 9: Tests laufen lassen**

Run (in `core/`): `./mvnw test -Dtest='MaterialisationScheduleTest,MaterialisationScheduleBootTest,CommunityQueryServiceTest,AnnouncementMaterialisedHookTest,AnnouncementServiceTest,ModularityTests'`
Expected: PASS, alle.

- [ ] **Step 10: Commit**

```bash
git add core/src/main core/src/test
git commit -F - <<'EOF'
Announce rounds a day ahead from a daily schedule

The first GET of a round drew its seed, so one player shaped the
round, and a day nobody opened left a gap in the history. At 03:00
Europe/Berlin every active run now gets its next round, and its
running one if a previous run missed it. A row that exists is left
alone; the GET stays the fallback.

Each round runs in its own transaction, so a failed preview download
for tomorrow costs neither today's round nor another community's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Guidelines, voller Testlauf, Boot-Check

**Files:**
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/countdown.md` (Fast-Rounds-Eintrag unter „Related / future“)

- [ ] **Step 1: `game-rounds.md` — Materialisierung**

Den Abschnitt `## What must be fixed per round is materialised on the first announcement` bis einschließlich des Absatzes „First writer wins, the loser reads the winner's row and plays their game.“ ersetzen durch (der Absatz „Persisting is allowed. …“ bleibt danach stehen):

```markdown
## What must be fixed per round is materialised a day ahead

`MaterialisationSchedule` announces every active run's next round once a day — and the running one if
an earlier run missed it. Ahead, because a round boundary is `startsAt`'s time of day in the run's own
zone, a different hour per community: one daily run can only prepare the round that starts within the
next 24 hours. The announcing `GET` is the fallback for a round the run missed.

Both write via `INSERT … ON CONFLICT DO NOTHING` followed by a `SELECT` — **not** by catching
`DuplicateKeyException`: a constraint violation marks the transaction rollback-only in Postgres, so
the re-read inside the same transaction would fail. First writer wins, the loser reads the winner's
row and plays their game. The run checks for a row before drawing, so whatever exists stays.

A round announced ahead holds its solution a day before it is playable: nothing may hand out a round
newer than the running one (`MaterialisationScheduleBootTest` pins it with the row present).
```

- [ ] **Step 2: `game-rounds.md` — Lücke und Freigabe**

Im Abschnitt „A closed round is open“ den Absatz

```
The way back through a run is a pointer on every round's own answer, not a page to request:
`previousRoundNumber` is `MIN(round_number)` strictly above the current one within the game window,
and `NULL` means „ganz am Anfang“. A day nobody opened the app has no `round_games` row, so it is
simply not a link in the chain — nothing has to count the gap. The pointer lives on `ResolvedRound`
itself rather than travelling as a parameter into `RoundResponses.of`: the client replaces its whole
round object with every action response, so a pointer threaded through only one call site is a
pointer some other call site can forget.
```

ersetzen durch

```
The way back through a run is a pointer on every round's own answer, not a page to request:
`previousRoundNumber` is `MIN(round_number)` strictly above the current one within the game window,
and `NULL` means „ganz am Anfang“. A day without a `round_games` row — one before the schedule
existed, or one both the schedule and the fallback missed — is simply not a link in the chain;
nothing has to count the gap. The pointer lives on `ResolvedRound` itself rather than travelling as a
parameter into `RoundResponses.of`: the client replaces its whole round object with every action
response, so a pointer threaded through only one call site is a pointer some other call site can
forget.
```

Weiter unten den Absatz

```
Cleanup at announce time releases what stopped being **playable**, not everything a round stored.
That is one hook per lifetime event, not one hook with a flag: `releaseStageAssets` fires for every
round but the one just announced, and `releaseAssets` — the archival one — is still deliberately
without a caller, for the day a whole edition is put to rest. Collapsing them into a single call with
a `keepReveal` boolean would move a per-lifetime-event answer into a per-call decision.
```

ersetzen durch

```
Cleanup on each announcement and each daily run releases what stopped being **playable**, not
everything a round stored. That is one hook per lifetime event, not one hook with a flag:
`releaseStageAssets` fires for every round older than the running one — never "all but the one just
announced", which with rounds announced ahead is tomorrow's — and `releaseAssets` — the archival
one — is still deliberately without a caller, for the day a whole edition is put to rest. Collapsing
them into a single call with a `keepReveal` boolean would move a per-lifetime-event answer into a
per-call decision.
```

- [ ] **Step 3: `countdown.md` — Fast Rounds**

Im Eintrag **Fast rounds** unter „Related / future“ nach dem Satz `Don't build this yet; just don't model rounds in a way that assumes one-game-per-day or that lets a fast round break the daily grid.` anhängen:

```
  When it is specced: `MaterialisationSchedule` walks day numbers and must then announce every
  sub-round of the next day, and `releaseStagesOlderThan` counts days — a morning sub-round stops
  being playable mid-day.
```

- [ ] **Step 4: Prüfen, ob sonst etwas in die Guidelines gehört**

`.claude/guidelines/feeding-knowledge-back.md` lesen. Kandidat: „ein `@Scheduled` mit Cron aus der yaml braucht `"-"` in der Test-`application.yaml`, weil diese die Haupt-yaml ersetzt“ — die Test-yaml selbst trägt das als Kommentar, der nächste Scheduler fällt beim ersten Boot-Test darüber. Entscheiden und im Commit nennen, ob er in `testing.md` oder `configuration.md` gehört; Default: nein.

- [ ] **Step 5: Voller Backend-Testlauf**

Run (in `core/`): `./mvnw test`
Expected: `BUILD SUCCESS`, keine Fehler.

- [ ] **Step 6: Boot-Check (Configuration-Guideline)**

Die Haupt-`application.yaml` ist durch keinen Test abgedeckt. Backend mit Cron alle 10 Sekunden und Zufallsport starten — **im Hintergrund über das Harness** (`run_in_background`), nicht mit `nohup … &`:

```bash
./scripts/link-dev-env.sh && cd core && SPRING_APPLICATION_JSON='{"server":{"port":0},"countdown":{"game":{"materialisation-cron":"*/10 * * * * *"}}}' ./mvnw spring-boot:run
```

Expected in der Ausgabe binnen ~10 s nach `Started CoreApplication`: eine Zeile `… rounds materialised across … editions`. Danach den Prozess beenden. Achtung: der Lauf legt in der lokalen Dev-Datenbank echte Runden für lokale Communities an — gewollt.

Danach einmal ohne `SPRING_APPLICATION_JSON`-Cron starten (nur `{"server":{"port":0}}`) und prüfen, dass `Started CoreApplication` erscheint und **keine** `rounds materialised`-Zeile — der Default feuert erst um 03:00.

- [ ] **Step 7: Commit**

```bash
git add .claude/guidelines/game-rounds.md .claude/guidelines/countdown.md
git commit -F - <<'EOF'
Teach the guidelines that rounds come a day ahead

Materialisation moved from the first GET to a daily schedule; the
rules on races, gaps and stage release now say so, and the fast-round
note names the two places that count days.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
