# Community Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf `/c/{slug}` steht die Rangliste der Community als dichte Reihe überlappender Avatar-Kreise, die beim Laden von den Bildschirmrändern zusammenfinden; die Punkte kommen aus einer gestubbten API-Naht.

**Architecture:** Ein neuer member-sichtbarer Endpoint `GET /api/communities/{slug}/roster` liefert pro aktivem Mitglied Kürzel, aufgelöste Avatarfarbe und Punkte, fertig sortiert — das Frontend sortiert nicht nach. Punkte kommen über den Port `MemberPointsQuery`, dessen einzige echte Implementierung heute Nullen liefert. Im Frontend rendert `MemberRow.vue` die Reihe im normalen Fluss und schreibt nur `transform`, gespeist von der Schwarm-Physik aus dem Spike.

**Tech Stack:** Backend Spring Boot 4.1 / Kotlin 2.4 / Spring Modulith 2.1, Tests mockk + kotest + MockMvc-Kotlin-DSL + Testcontainers. Frontend Vite 8 / Vue 3 / TypeScript strict / Tailwind v4, Tests Vitest + happy-dom + `@vue/test-utils`.

**Spec:** [2026-08-03-community-members-design.md](../specs/2026-08-03-community-members-design.md)

## Global Constraints

- **Branch:** alles auf `feat/community-members` (bereits von `develop` erstellt). PRs gegen `develop`, nie `main`.
- **Keine Flyway-Migration.** Es kommt keine Spalte dazu. Wer eine Migration schreibt, hat den Plan missverstanden.
- **Mobile-first.** Telefone sind die Zielgruppe: narrow-viewport-first, keine hover-only-Affordanzen, wischbare Streifen ohne sichtbaren Scrollbalken. Siehe [frontend.md](../../../.claude/guidelines/frontend.md).
- **TDD, kleine Commits.** Jeder Task: Test schreiben → rot sehen → minimal implementieren → grün sehen → committen.
- **TypeScript sehr strikt:** `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes` sind an. Indexzugriffe brauchen eine Prüfung; optionale Properties dürfen nicht auf `undefined` gesetzt, sondern müssen weggelassen werden.
- **Kein neues npm-Runtime-Paket.** Ausdrückliches Projektziel. Insbesondere **kein chroma-js** — die Kontrastfarbe wird selbst gerechnet.
- **Backend-Tests:** `@Import(TestcontainersConfiguration::class) @SpringBootTest @AutoConfigureMockMvc`, Kollaborateure als `@MockkBean`, Principal über `with(principalFor())`, Nutzer-ID `TEST_USER_ID`. Docker muss laufen.
- **Frontend prüfen mit** `pnpm -C webapp-vue test`, `pnpm -C webapp-vue typecheck`, `pnpm -C webapp-vue lint`. Backend mit `cd core && ./mvnw test`.
- **Keine Kommentare, die nur wiederholen, was der Code sagt.** Begründungen gehören in die Commit-Message; Kommentare im Code erklären nur, was nicht ableitbar ist.

---

## File Structure

**Backend** (`core/src/main/kotlin/org/unividuell/countdown/core/`):

| Datei | Verantwortung |
|---|---|
| `community/MemberPointsQuery.kt` | **neu**, publizierte Schnittstelle: Punktestände + `MemberPoints` |
| `community/internal/MemberShortName.kt` | **neu**, die 4-Zeichen-Regel |
| `community/internal/AvatarColor.kt` | **neu**, Profilfarbe oder deterministische Ersatzfarbe |
| `community/internal/ZeroMemberPoints.kt` | **neu**, liefert überall Nullen |
| `community/internal/StubMemberPoints.kt` | **neu**, deterministische Dev-/Staging-Werte |
| `community/internal/RosterService.kt` | **neu**, setzt die Roster-Antwort zusammen und sortiert |
| `community/internal/CommunityDtos.kt` | **ändern**, `RosterMemberResponse` + `RosterPointsResponse` |
| `community/internal/MemberController.kt` | **ändern**, `GET /{slug}/roster` |
| `resources/application.yaml`, `-staging.yaml`, `-production.yaml` | **ändern**, `app.stub-points.enabled` |

`MemberShortName` und `AvatarColor` liegen in `community/internal`, weil das Roster ihr einziger Konsument ist. Werden sie ein zweiter, wandern sie — nicht vorher.

**Frontend** (`webapp-vue/src/`):

| Datei | Verantwortung |
|---|---|
| `members/swarm.ts` | **neu** (aus dem Spike), die Physik |
| `members/readableTextColor.ts` | **neu**, Kontrastfarbe aus einem Hex-Wert |
| `members/useRoster.ts` | **neu**, Laden + Lade-/Fehlerzustand |
| `members/MemberRow.vue` | **neu**, die Reihe |
| `api/types.ts` | **ändern**, `RosterMemberResponse` |
| `api/communities.ts` | **ändern**, `getRoster` |
| `pages/c/[slug]/index.vue` | **ändern**, rendert die Reihe |

**Abweichung von der Spec:** kein eigenes `swarmTuning.ts`. Die Werte stehen als `defaultTuning` schon in `swarm.ts` und kommen von dort mit — eine zweite Datei mit denselben Zahlen wäre nicht DRY.

---

### Task 1: Die Kürzel-Regel

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberShortName.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberShortNameTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: `MemberShortName.of(username: String): String` — max. 4 Zeichen.

Die Regel stammt aus `huettehuette.unividuell.org`, `composables/useUsers.ts`, `viewSafeDisplayName`. **Die Bedingung „nur wenn länger als 4" ist wesentlich:** ein kurzer Name wie `":-|"` bleibt dadurch wörtlich stehen. Wer sie wegoptimiert, löscht solche Namen.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.MemberShortName

class MemberShortNameTest {
    @Test
    fun `keeps a short name verbatim, punctuation included`() {
        MemberShortName.of(":-|") shouldBe ":-|"
        MemberShortName.of("Fry") shouldBe "FRY"
        MemberShortName.of("anna") shouldBe "ANNA"
    }

    @Test
    fun `drops vowels only once the name is too long`() {
        MemberShortName.of("Bender") shouldBe "BNDR"
        MemberShortName.of("hubert") shouldBe "HBRT"
    }

    @Test
    fun `collapses repeats and truncates the longest names`() {
        MemberShortName.of("Turanga Leela") shouldBe "TRNG"
        MemberShortName.of("Prof Farnsworth") shouldBe "PRFR"
    }

    @Test
    fun `falls back when nothing printable survives`() {
        MemberShortName.of("aeiou") shouldBe ":/"
        MemberShortName.of("") shouldBe ":/"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=MemberShortNameTest`
Expected: FAIL — `Unresolved reference: MemberShortName`.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package org.unividuell.countdown.core.community.internal

/**
 * The 4-character avatar label, ported from the origin app's `viewSafeDisplayName`.
 *
 * Each reduction is applied ONLY while the name is still too long — that is what lets a short,
 * punctuation-only name such as ":-|" survive intact, and it is the reason the two length checks
 * are separate statements rather than one chain.
 */
object MemberShortName {
    private const val MAX = 4
    private val VOWELS = Regex("[AEIOU]")
    private val NON_ALPHANUMERIC = Regex("[^A-Z0-9]")
    private val REPEATS = Regex("(.)\\1+")

    fun of(username: String): String {
        var name = username.uppercase()
        if (name.length > MAX) name = name.replace(VOWELS, "").replace(NON_ALPHANUMERIC, "")
        if (name.length > MAX) name = name.replace(REPEATS, "$1")
        return name.take(MAX).ifEmpty { ":/" }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=MemberShortNameTest`
Expected: PASS, 4 Tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberShortName.kt core/src/test/kotlin/org/unividuell/countdown/core/community/MemberShortNameTest.kt
git commit -m "feat(community): derive the 4-character avatar label

Ported from the origin app's viewSafeDisplayName. Each reduction applies only
while the name is still too long, which is what keeps a short punctuation-only
name such as \":-|\" intact — the separate length checks are load-bearing, not
style."
```

---

### Task 2: Die Avatarfarbe

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/AvatarColor.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/AvatarColorTest.kt`

**Interfaces:**
- Consumes: `SeededRandom.fromSeed(seed: String)` und `nextIntBetween(min: Int, maxInclusive: Int): Int` aus `org.unividuell.countdown.core.rng`.
- Produces: `AvatarColor.resolve(profileHex: String?, userId: UUID): String` — immer ein `#rrggbb`.

Sättigung und Helligkeit stehen fest bei 0,5 wie im Original: dadurch liegen alle Kanäle zwischen 64 und 191, also keine Neonfarben und kein Schwarz oder Weiß.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.AvatarColor
import java.util.UUID

class AvatarColorTest {
    private val hex = Regex("^#[0-9a-f]{6}$")

    @Test
    fun `prefers the colour the user chose`() {
        AvatarColor.resolve("#8e44ad", UUID.randomUUID()) shouldBe "#8e44ad"
    }

    @Test
    fun `treats a blank profile colour as unset`() {
        val id = UUID.randomUUID()
        AvatarColor.resolve("   ", id) shouldBe AvatarColor.resolve(null, id)
    }

    @Test
    fun `derives the same colour for the same user every time`() {
        val id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
        val first = AvatarColor.resolve(null, id)
        first shouldMatch hex
        first shouldBe AvatarColor.resolve(null, id)
    }

    @Test
    fun `derives different colours for different users`() {
        val a = AvatarColor.resolve(null, UUID.fromString("0190f1b2-0000-7000-8000-000000000001"))
        val b = AvatarColor.resolve(null, UUID.fromString("0190f1b2-0000-7000-8000-000000000002"))
        (a == b) shouldBe false
    }

    @Test
    fun `keeps every channel in the mid range, so text of either colour can be legible`() {
        repeat(50) {
            val c = AvatarColor.resolve(null, UUID.randomUUID())
            listOf(1..2, 3..4, 5..6).forEach { range ->
                val channel = c.substring(range.first, range.last + 1).toInt(16)
                (channel in 60..195) shouldBe true
            }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=AvatarColorTest`
Expected: FAIL — `Unresolved reference: AvatarColor`.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.rng.SeededRandom
import java.util.UUID
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The avatar background. Resolved here rather than in the browser because the fallback needs the
 * seeded RNG, and promoting the TS reference implementation out of test scope is a decision with
 * weight (see `webapp-vue/src/lib/rng/__tests__/seededRandom.reference.ts`). Computing it in exactly
 * one place also means there is no cross-runtime parity question at all.
 */
object AvatarColor {
    private const val SATURATION = 0.5
    private const val LIGHTNESS = 0.5

    fun resolve(profileHex: String?, userId: UUID): String =
        profileHex?.takeIf { it.isNotBlank() } ?: derive(userId)

    private fun derive(userId: UUID): String {
        val hue = SeededRandom.fromSeed(userId.toString()).nextIntBetween(0, 359)
        return hslToHex(hue, SATURATION, LIGHTNESS)
    }

    private fun hslToHex(hue: Int, saturation: Double, lightness: Double): String {
        val chroma = (1 - abs(2 * lightness - 1)) * saturation
        val sector = hue / 60.0
        val second = chroma * (1 - abs(sector % 2 - 1))
        val (r, g, b) = when (sector.toInt()) {
            0 -> Triple(chroma, second, 0.0)
            1 -> Triple(second, chroma, 0.0)
            2 -> Triple(0.0, chroma, second)
            3 -> Triple(0.0, second, chroma)
            4 -> Triple(second, 0.0, chroma)
            else -> Triple(chroma, 0.0, second)
        }
        val match = lightness - chroma / 2
        return "#%02x%02x%02x".format(
            ((r + match) * 255).roundToInt(),
            ((g + match) * 255).roundToInt(),
            ((b + match) * 255).roundToInt(),
        )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=AvatarColorTest`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/AvatarColor.kt core/src/test/kotlin/org/unividuell/countdown/core/community/AvatarColorTest.kt
git commit -m "feat(community): resolve every member's avatar colour server-side

The profile colour when set, else a hue derived deterministically from the user
id via SeededRandom at fixed saturation and lightness 0.5 — the same palette the
origin app used, which keeps every channel between 64 and 191 so text of either
colour can be legible.

Deriving it in the browser instead would mean promoting the TS reference RNG out
of test scope, which that file restricts on purpose. Computing it in exactly one
place also removes any cross-runtime parity question."
```

---

### Task 3: Die Punkte-Naht

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/MemberPointsQuery.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ZeroMemberPoints.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/StubMemberPoints.kt`
- Modify: `core/src/main/resources/application.yaml`, `application-staging.yaml`, `application-production.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberPointsTest.kt`

**Interfaces:**
- Consumes: `SeededRandom` (Task 2 hat es schon benutzt, hier erneut).
- Produces:
  - `interface MemberPointsQuery { fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> }`
  - `data class MemberPoints(val stable: Int, val live: Int?)`
  - Beans `ZeroMemberPoints` und `StubMemberPoints`.

`live = null` heißt bewusst zweierlei: „du darfst es nicht sehen" **und** „dieses Mitglied hat die Runde noch nicht gespielt". Beide Fälle rendern und sortieren identisch, also sind sie nicht unterscheidbar — und das Zusammenlegen ist die sichere Richtung, weil kein Zustand existiert, in dem versehentlich etwas durchsickert.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.StubMemberPoints
import org.unividuell.countdown.core.community.internal.ZeroMemberPoints
import java.util.UUID

class MemberPointsTest {
    private val communityId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000aa")
    private val viewer = UUID.fromString("0190f1b2-0000-7000-8000-0000000000bb")
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")

    @Test
    fun `zero points has an entry per member and never exposes live points`() {
        val result = ZeroMemberPoints().standings(communityId, viewer, listOf(alice, bob))
        result.keys shouldBe setOf(alice, bob)
        result.values.forEach {
            it.stable shouldBe 0
            it.live shouldBe null
        }
    }

    @Test
    fun `stub points are deterministic per community and member`() {
        val stub = StubMemberPoints()
        val first = stub.standings(communityId, viewer, listOf(alice, bob))
        val second = stub.standings(communityId, viewer, listOf(alice, bob))
        first shouldBe second
    }

    @Test
    fun `stub points differ between communities for the same member`() {
        val other = UUID.fromString("0190f1b2-0000-7000-8000-0000000000cc")
        val stub = StubMemberPoints()
        val here = stub.standings(communityId, viewer, listOf(alice))[alice]
        val there = stub.standings(other, viewer, listOf(alice))[alice]
        (here == there) shouldBe false
    }

    @Test
    fun `stub points give some but not all members live points`() {
        val many = (1..40).map { UUID.fromString("0190f1b2-0000-7000-8000-%012d".format(it)) }
        val result = StubMemberPoints().standings(communityId, viewer, many)
        val withLive = result.values.count { it.live != null }
        (withLive in 1 until many.size) shouldBe true
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=MemberPointsTest`
Expected: FAIL — `Unresolved reference: ZeroMemberPoints`.

- [ ] **Step 3: Write the port**

```kotlin
package org.unividuell.countdown.core.community

import java.util.UUID

/**
 * Game standings per member. The seam where real points will attach once the first mini-game exists;
 * today the only non-stub implementation returns zeroes.
 *
 * Viewer-scoped on purpose. The origin app revealed a member's points for the round in progress only
 * once the viewer had played that round themselves, and under the anti-cheat bar — the client must
 * never *materialise* what it should not have, not merely never display it — hiding them in the
 * frontend is not enough. So the decision is made here and the value simply is not returned.
 *
 * The interface lives in the consumer module; a future game module implements it. Deliberately
 * provisional: it costs nothing today and gets decided when there is a game, not before.
 */
interface MemberPointsQuery {
    fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints>
}

/** [live] is null both when the viewer may not see it and when the member has not played the round. */
data class MemberPoints(val stable: Int, val live: Int?)
```

- [ ] **Step 4: Write the two implementations**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import java.util.UUID

/** No games exist yet, so nobody has scored. Active whenever the stub is not. */
@Component
@ConditionalOnProperty(name = ["app.stub-points.enabled"], havingValue = "false", matchIfMissing = true)
class ZeroMemberPoints : MemberPointsQuery {
    override fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> =
        userIds.associateWith { MemberPoints(stable = 0, live = null) }
}
```

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.rng.SeededRandom
import java.util.UUID

/**
 * Invented but stable standings, so the ranking and its animation can be judged on localhost and
 * staging — both of which run the seeded Futurama test users anyway, so these numbers make no claim
 * about real players. `@Profile("!production")` is a second belt: even a misconfigured property
 * cannot switch this on in prod.
 *
 * [viewerId] is unused here because there are no rounds to gate on yet; the real implementation will
 * use it to decide whether live points may be returned at all.
 */
@Component
@Profile("!production")
@ConditionalOnProperty(name = ["app.stub-points.enabled"], havingValue = "true")
class StubMemberPoints : MemberPointsQuery {
    override fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints> =
        userIds.associateWith { userId ->
            val rnd = SeededRandom.fromSeed("$communityId:$userId")
            MemberPoints(
                stable = rnd.nextIntBetween(0, 40),
                live = if (rnd.nextBoolean()) rnd.nextIntBetween(1, 6) else null,
            )
        }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=MemberPointsTest`
Expected: PASS, 4 Tests.

- [ ] **Step 6: Wire the property into all three environments**

In `core/src/main/resources/application.yaml`, unter dem bestehenden `app:`-Block hinter `test-auth`:

```yaml
  stub-points:
    # Invented-but-stable game points, so the ranking row can be judged before any game exists.
    # Deliberately a separate flag from app.test-auth: seeded logins and invented points are
    # independently switchable.
    enabled: true
```

In `core/src/main/resources/application-staging.yaml`, unter dem bestehenden `app:`-Block:

```yaml
  stub-points:
    enabled: true
```

In `core/src/main/resources/application-production.yaml`, unter dem bestehenden `app:`-Block:

```yaml
  stub-points:
    enabled: false
```

- [ ] **Step 7: Verify the wiring resolves to exactly one bean**

Run: `cd core && ./mvnw test -Dtest=MemberControllerTest`
Expected: PASS. Der Test lädt den vollen Kontext; zwei aktive `MemberPointsQuery`-Beans oder keine würden hier scheitern. Läuft der Test grün, ist die Verzweigung korrekt.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/MemberPointsQuery.kt core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ZeroMemberPoints.kt core/src/main/kotlin/org/unividuell/countdown/core/community/internal/StubMemberPoints.kt core/src/main/resources/application.yaml core/src/main/resources/application-staging.yaml core/src/main/resources/application-production.yaml core/src/test/kotlin/org/unividuell/countdown/core/community/MemberPointsTest.kt
git commit -m "feat(community): add the seam where game points will attach

MemberPointsQuery is viewer-scoped because the origin app revealed a member's
points for the round in progress only once the viewer had played it themselves.
Under the anti-cheat bar the client must never materialise what it should not
have, so that decision belongs on the server and the value is simply not
returned. live = null therefore covers both 'not visible to you' and 'has not
played' — they render and sort identically, and merging them leaves no branch to
get wrong.

Stub points are on for localhost and staging, which both run the seeded test
users anyway, so invented numbers make no claim about real players. The flag is
separate from app.test-auth so the two are independently switchable, and
@Profile(\"!production\") is a second belt against misconfiguration."
```

---

### Task 4: Der Roster-Endpoint

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/RosterEndpointTest.kt`

**Interfaces:**
- Consumes: `MemberShortName.of`, `AvatarColor.resolve`, `MemberPointsQuery.standings`, `CommunityAccess.requireActiveMember(userId, isSuperAdmin, slug): Community`, `CommunityMemberRepository.findByCommunityId(communityId): List<CommunityMember>`, `UserQuery.findAllById(ids): List<User>`.
- Produces: `GET /api/communities/{slug}/roster` → `List<RosterMemberResponse>`; `RosterMemberResponse(userId, shortName, fullName, bgColorHex, points)`; `RosterPointsResponse(stable, live)` mit `@JsonInclude(NON_NULL)`.

**`findAllById`, nicht `findById` pro Zeile.** `UserQuery` schreibt das ausdrücklich vor. (Der bestehende `/members`-Endpoint verletzt das — das ist hier **nicht** zu reparieren, es ist ein eigener Vorgang.)

Sortierung: `stable + (live ?: 0)` absteigend, dann `createdAt` aufsteigend, dann `userId`. Die dritte Stufe ist nicht Kosmetik: solange in Produktion alle auf 0 stehen, entscheidet sonst die Datenbank-Reihenfolge, und die Reihe würde zwischen zwei Aufrufen springen.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class RosterEndpointTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var memberRepo: CommunityMemberRepository
    @MockkBean lateinit var userQuery: UserQuery
    @MockkBean lateinit var points: MemberPointsQuery

    private val uid = TEST_USER_ID
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")
    private val pending = UUID.fromString("0190f1b2-0000-7000-8000-000000000003")
    private val community = Community(id = UUID.randomUUID(), name = "Team", slug = "team", createdBy = uid)

    private fun member(userId: UUID, status: MemberStatus, joined: String) = CommunityMember(
        communityId = community.id!!, userId = userId, status = status,
        createdAt = Instant.parse(joined),
    )

    private fun admitted() {
        every { access.requireActiveMember(uid, false, "team") } returns community
    }

    @Test
    fun `a non-member gets 404`() {
        every { access.requireActiveMember(uid, false, "team") } throws CommunityAccessDeniedException()
        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `lists only active members, ranked by points`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
            member(pending, MemberStatus.PENDING, "2026-01-03T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 3, live = null),
            bob to MemberPoints(stable = 10, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].shortName") { value("BNDR") }
            jsonPath("$[0].fullName") { value("Bender") }
            jsonPath("$[1].shortName") { value("AMY") }
        }
    }

    @Test
    fun `live points count towards the rank they are shown with`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        // bob leads on stable points, alice overtakes him once the live round counts.
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 8, live = 5),
            bob to MemberPoints(stable = 10, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].shortName") { value("AMY") }
            jsonPath("$[0].points.stable") { value(8) }
            jsonPath("$[0].points.live") { value(5) }
        }
    }

    @Test
    fun `withheld live points are absent from the payload, not merely unrendered`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(User(id = alice, githubId = 1L, githubLogin = "amy"))
        every { points.standings(community.id!!, uid, any()) } returns
            mapOf(alice to MemberPoints(stable = 3, live = null))

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].points.live") { doesNotExist() }
        }
    }

    @Test
    fun `equal points fall back to join order, then to a stable id tiebreak`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(bob, MemberStatus.ACTIVE, "2026-01-02T00:00:00Z"),
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )
        every { points.standings(community.id!!, uid, any()) } returns mapOf(
            alice to MemberPoints(stable = 0, live = null),
            bob to MemberPoints(stable = 0, live = null),
        )

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].shortName") { value("AMY") } // joined first
        }
    }

    @Test
    fun `a member without a profile colour still gets one`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns
            listOf(User(id = alice, githubId = 1L, githubLogin = "amy", bgColorHex = null))
        every { points.standings(community.id!!, uid, any()) } returns
            mapOf(alice to MemberPoints(stable = 0, live = null))

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].bgColorHex") { value(org.hamcrest.Matchers.matchesRegex("#[0-9a-f]{6}")) }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=RosterEndpointTest`
Expected: FAIL — 404/405 auf `/roster`, weil der Endpoint fehlt.

- [ ] **Step 3: Add the DTOs**

In `CommunityDtos.kt`, hinter `MemberResponse`:

```kotlin
@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
data class RosterPointsResponse(val stable: Int, val live: Int?)

data class RosterMemberResponse(
    val userId: UUID,
    val shortName: String,
    val fullName: String,
    val bgColorHex: String,
    val points: RosterPointsResponse,
)
```

`NON_NULL` ist Teil der Zusage: zurückgehaltene Live-Punkte fehlen im JSON, statt als `null` dort zu stehen.

- [ ] **Step 4: Add the service**

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberPoints
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.iam.UserQuery
import java.time.Instant
import java.util.UUID

@Service
class RosterService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
    private val points: MemberPointsQuery,
) {
    fun of(communityId: UUID, viewerId: UUID): List<RosterMemberResponse> {
        val active = members.findByCommunityId(communityId).filter { it.status == MemberStatus.ACTIVE }
        if (active.isEmpty()) return emptyList()

        val ids = active.map { it.userId }
        val byId = users.findAllById(ids).associateBy { it.id }
        val standings = points.standings(communityId, viewerId, ids)

        return active
            .sortedWith(
                compareByDescending<CommunityMember> { rank(standings[it.userId]) }
                    .thenBy { it.createdAt ?: Instant.EPOCH }
                    .thenBy { it.userId },
            )
            .mapNotNull { member ->
                val user = byId[member.userId] ?: return@mapNotNull null
                val p = standings[member.userId] ?: MemberPoints(stable = 0, live = null)
                RosterMemberResponse(
                    userId = member.userId,
                    shortName = MemberShortName.of(user.username),
                    fullName = user.username,
                    bgColorHex = AvatarColor.resolve(user.bgColorHex, member.userId),
                    points = RosterPointsResponse(stable = p.stable, live = p.live),
                )
            }
    }

    /** Ranked by exactly what is displayed: a rank driven by points the viewer cannot see would be
     *  inexplicable to them. Withheld live points are null, so they fall out of the sum by themselves. */
    private fun rank(p: MemberPoints?): Int = (p?.stable ?: 0) + (p?.live ?: 0)
}
```

- [ ] **Step 5: Add the endpoint**

In `MemberController.kt`: `private val roster: RosterService,` in den Konstruktor aufnehmen und diese Methode hinter `members(...)` einfügen:

```kotlin
    @GetMapping("/{slug}/roster")
    fun roster(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): List<RosterMemberResponse> {
        val c = access.requireActiveMember(me.id, me.isSuperAdmin, slug)
        return roster.of(c.id!!, me.id)
    }
```

- [ ] **Step 6: Register the new mock in the existing controller test**

`MemberControllerTest` lädt den vollen Kontext und muss den neuen Kollaborateur kennen. In `MemberControllerTest` ergänzen:

```kotlin
    @MockkBean lateinit var roster: RosterService
```

- [ ] **Step 7: Run the tests**

Run: `cd core && ./mvnw test -Dtest='RosterEndpointTest,MemberControllerTest'`
Expected: PASS, 6 + bestehende Tests.

- [ ] **Step 8: Run the full backend suite**

Run: `cd core && ./mvnw test`
Expected: PASS. Insbesondere prüft der Modulith-Strukturtest, dass `community` nichts Internes von `iam` benutzt.

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberController.kt core/src/test/kotlin/org/unividuell/countdown/core/community/RosterEndpointTest.kt core/src/test/kotlin/org/unividuell/countdown/core/community/MemberControllerTest.kt
git commit -m "feat(community): serve a member-visible roster

GET /{slug}/roster is a second endpoint rather than a relaxation of /members:
the admin list needs PENDING and isAdmin, the ranking row needs short names,
colours and points. Two consumers, two contracts — and isAdmin is deliberately
absent here because the row does not render it, as the origin app did not.

Ranked by exactly what is displayed, stable + (live ?: 0), so a rank driven by
points the viewer cannot see cannot arise. The userId tiebreak is load-bearing,
not cosmetic: with every member on zero in production the database order would
otherwise decide, and the row would jump between two loads."
```

---

### Task 5: Kontrastfarbe im Frontend

**Files:**
- Create: `webapp-vue/src/members/readableTextColor.ts`
- Test: `webapp-vue/src/members/__tests__/readableTextColor.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `readableTextColor(hex: string): string` — liefert `'#111111'` oder `'#ffffff'`.

Die erwarteten Werte sind **nicht erfunden**: sie sind die von Hand gewählten Vordergrundfarben der Spike-Palette. Stimmt die Funktion mit allen sechs überein, reproduziert sie ein Urteil, das ein Mensch getroffen hat.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { readableTextColor } from '../readableTextColor'

const DARK = '#111111'
const LIGHT = '#ffffff'

describe('readableTextColor', () => {
  it('picks the extremes correctly', () => {
    expect(readableTextColor('#000000')).toBe(LIGHT)
    expect(readableTextColor('#ffffff')).toBe(DARK)
  })

  // The expectations are the hand-picked foregrounds of the spike palette: agreeing with all
  // six means the formula reproduces a judgement a human made.
  it.each([
    ['#8e44ad', LIGHT], // purple
    ['#6b8e3a', DARK], //  olive
    ['#1a3fb8', LIGHT], // blue
    ['#f2cf46', DARK], //  yellow
    ['#5fc493', DARK], //  green
    ['#5b95c4', DARK], //  steel blue
  ])('matches the spike palette for %s', (bg, expected) => {
    expect(readableTextColor(bg)).toBe(expected)
  })

  it('accepts the three-digit form', () => {
    expect(readableTextColor('#fff')).toBe(DARK)
    expect(readableTextColor('#000')).toBe(LIGHT)
  })

  it('falls back to light text when the colour cannot be parsed', () => {
    expect(readableTextColor('rebeccapurple')).toBe(LIGHT)
    expect(readableTextColor('')).toBe(LIGHT)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: FAIL — `Failed to resolve import '../readableTextColor'`.

- [ ] **Step 3: Write minimal implementation**

```ts
const DARK = '#111111'
const LIGHT = '#ffffff'

/**
 * The only derivation left in the frontend — a statement about rendering, not about the domain.
 * Deliberately hand-rolled: chroma-js would be a runtime dependency for twelve lines.
 *
 * `** 2.4` is fine here despite the cross-runtime-parity guideline's ban on `pow`: nothing computes
 * this value a second time on the JVM, so there is no stream to keep bit-identical.
 */
export function readableTextColor(hex: string): string {
  const rgb = parse(hex)
  if (!rgb) return LIGHT
  const [r, g, b] = rgb
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  // 0.179 is where contrast against black and against white is equal.
  return luminance > 0.179 ? DARK : LIGHT
}

function parse(hex: string): [number, number, number] | null {
  const body = hex.trim().replace(/^#/, '')
  const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function linear(channel: number): number {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: PASS, 6 Tests (`it.each` zählt als sechs Fälle in einem).

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/members/readableTextColor.ts webapp-vue/src/members/__tests__/readableTextColor.spec.ts
git commit -m "feat(members): derive the avatar text colour from its background

WCAG relative luminance against the 0.179 threshold, hand-rolled rather than
pulling chroma-js in for twelve lines. The test expectations are the spike
palette's hand-picked foregrounds, so agreeing with all six means the formula
reproduces a judgement a human made rather than just being self-consistent."
```

---

### Task 6: Die Physik aus dem Spike holen

**Files:**
- Create: `webapp-vue/src/members/swarm.ts` (aus `claude/member-animation-spike-ed3010`)
- Create: `webapp-vue/src/members/__tests__/swarm.spec.ts` (aus demselben Branch)

**Interfaces:**
- Consumes: nichts.
- Produces: `createSwarm({ targets, stage, tuning, rng? }): Swarm`, `defaultTuning: SwarmTuning`, `scatterStarts(stage, count, rng): Vec[]`, Typen `Swarm`, `SwarmTuning`, `SwarmParticle` (mit `x, y, vx, vy, tx, ty, tilt, wander`), `Vec`.

Dieser Task ändert **nichts** am Inhalt. Getrennt vom nächsten Task, damit die Herkunft im Verlauf sichtbar bleibt und die Änderung danach als Diff lesbar ist.

- [ ] **Step 1: Copy both files from the spike branch**

```bash
git checkout claude/member-animation-spike-ed3010 -- webapp-vue/src/spike/swarm.ts webapp-vue/src/spike/__tests__/swarm.spec.ts
mkdir -p webapp-vue/src/members/__tests__
git mv webapp-vue/src/spike/swarm.ts webapp-vue/src/members/swarm.ts
git mv webapp-vue/src/spike/__tests__/swarm.spec.ts webapp-vue/src/members/__tests__/swarm.spec.ts
rmdir webapp-vue/src/spike/__tests__ webapp-vue/src/spike 2>/dev/null || true
```

- [ ] **Step 2: Drop the spike-only wording from the file header**

In `webapp-vue/src/members/swarm.ts` den ersten Kommentarblock ersetzen. Aus:

```
/**
 * SPIKE — not production code, not wired into the app.
 *
 * A tiny force-based swarm: every member is a particle that drifts in from off-screen,
```

wird:

```
/**
 * A tiny force-based swarm: every member is a particle that drifts in from the edge of the
```

Den Rest des Blocks unverändert lassen.

- [ ] **Step 3: Run the imported tests**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: PASS — die sechs Physik-Tests plus die zwei aus Task 5.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm -C webapp-vue typecheck && pnpm -C webapp-vue lint`
Expected: beides ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/members/swarm.ts webapp-vue/src/members/__tests__/swarm.spec.ts
git commit -m "feat(members): adopt the swarm physics from the spike

Taken verbatim from claude/member-animation-spike-ed3010 (57affce) apart from
the header no longer calling itself a spike. Kept as its own commit so the
provenance stays visible and the changes that follow read as a diff against
something that was measured rather than as fresh code."
```

---

### Task 7: Wände statt Scroll-Sperre

**Files:**
- Modify: `webapp-vue/src/members/swarm.ts`
- Modify: `webapp-vue/src/members/__tests__/swarm.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 6.
- Produces: `SwarmTuning` bekommt `wallRadius: number` (Default `24`); `scatterStarts` liefert Positionen **innerhalb** des Viewports; keine Position verlässt zu irgendeinem Zeitpunkt den Viewport.

**Warum:** ein transformiertes Element vergrößert die *scrollbare* Fläche seiner Vorfahren, auch wenn das Layout unberührt bleibt. Der Spike startete außerhalb des Viewports und brauchte deshalb `overflow: hidden` auf `documentElement`. Bleiben alle Positionen drinnen, entfällt die Ursache — und die Wandstöße machen den Flug lebhafter, nicht ruhiger.

Die Wände müssen **jedes Ziel enthalten**, sonst kämpft die Feder dauerhaft gegen die Begrenzung und der Schwarm kommt nie zur Ruhe.

- [ ] **Step 1: Replace the two start-position tests**

In `webapp-vue/src/members/__tests__/swarm.spec.ts` den ganzen `describe('scatterStarts', …)`-Block durch diesen ersetzen:

```ts
describe('scatterStarts', () => {
  const starts = scatterStarts(stage, 9, mulberry32(42))
  const CIRCLE_RADIUS = 24

  /** How far inside the stage border a point sits; negative would be outside. */
  function insideBy(s: Vec): number {
    return Math.min(s.x, stage.width - s.x, s.y, stage.height - s.y)
  }

  it('keeps every start fully inside the stage', () => {
    for (const s of starts) expect(insideBy(s)).toBeGreaterThanOrEqual(CIRCLE_RADIUS)
  })

  it('hugs the edges — nobody starts out in open space', () => {
    for (const s of starts) expect(insideBy(s)).toBeLessThan(80)
  })

  it('spreads them unevenly — no readable ring pattern', () => {
    const gaps = starts.map((s) =>
      Math.min(...starts.filter((o) => o !== s).map((o) => Math.hypot(o.x - s.x, o.y - s.y))),
    )
    // Evenly spaced starts would make every nearest-neighbour distance the same.
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.3)
  })
})
```

- [ ] **Step 2: Add the promise that replaces the scroll lock**

Im `describe('createSwarm', …)`-Block ergänzen:

```ts
  it('never lets anyone leave the stage — this is what replaces the scroll lock', () => {
    const targets = rowTargets(9)
    const swarm = createSwarm({ targets, stage, tuning: defaultTuning, rng: mulberry32(11) })
    for (let i = 0; i < 400 && !swarm.finished; i++) {
      swarm.step(1 / 60)
      for (const p of swarm.particles) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(stage.width)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(stage.height)
      }
    }
  })

  it('still settles when a target sits outside the wall inset', () => {
    // The walls must widen to contain the targets, or the spring fights the clamp forever.
    const targets = [{ x: 4, y: 4 }, { x: stage.width - 4, y: stage.height - 4 }]
    const swarm = createSwarm({ targets, stage, tuning: defaultTuning, rng: mulberry32(12) })
    let seconds = 0
    while (!swarm.finished && seconds < 20) {
      swarm.step(1 / 60)
      seconds += 1 / 60
    }
    expect(swarm.finished).toBe(true)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: FAIL — `keeps every start fully inside the stage` und `never lets anyone leave the stage`.

- [ ] **Step 4: Add `wallRadius` to the tuning**

In `SwarmTuning` hinter `maxSpeed` ergänzen:

```ts
  /**
   * Distance kept clear of the stage edge, in px — the *visual* circle radius, not the collision
   * one, because what must not overflow is the painted circle.
   */
  wallRadius: number
```

Und in `defaultTuning` hinter `maxSpeed: 1600,`:

```ts
  wallRadius: 24,
```

- [ ] **Step 5: Turn the starts inward**

Die beiden Konstanten über `scatterStarts` ersetzen. Aus:

```ts
const OVERHANG_MIN = -6
const OVERHANG_RANGE = 46
```

wird:

```ts
/**
 * How far inside the edge a start sits, measured from the circle's centre. The floor is a circle
 * radius, so the whole circle is always on screen: a transformed element enlarges its ancestors'
 * scrollable area, and staying inside is what removes the need to lock scrolling at all.
 */
const INSET_MIN = 24
const INSET_RANGE = 46
```

Und im Schleifenkörper von `scatterStarts`:

```ts
    const inset = INSET_MIN + rng() * INSET_RANGE
    out.push({ x: p.x - n.x * inset, y: p.y - n.y * inset })
```

(Die Normale zeigt nach außen, also führt Subtraktion nach innen.) Den Doc-Kommentar von `scatterStarts` anpassen: „Places `count` particles along the **inside** of the stage edges …".

- [ ] **Step 6: Add the walls**

In `createSwarm`, direkt nach `const starts = scatterStarts(...)`:

```ts
  // Widened to contain every target: a target outside the inset would leave the spring fighting
  // the clamp forever, and the swarm would never come to rest.
  const xs = targets.map((t) => t.x)
  const ys = targets.map((t) => t.y)
  const walls = {
    minX: Math.min(tuning.wallRadius, ...xs),
    maxX: Math.max(stage.width - tuning.wallRadius, ...xs),
    minY: Math.min(tuning.wallRadius, ...ys),
    maxY: Math.max(stage.height - tuning.wallRadius, ...ys),
  }
```

Dann diese Funktion neben `resolveCollisions` einfügen:

```ts
  function bounceOffWalls(): void {
    for (const p of particles) {
      if (p.x < walls.minX) {
        p.x = walls.minX
        if (p.vx < 0) p.vx = -p.vx * tuning.restitution
      } else if (p.x > walls.maxX) {
        p.x = walls.maxX
        if (p.vx > 0) p.vx = -p.vx * tuning.restitution
      }
      if (p.y < walls.minY) {
        p.y = walls.minY
        if (p.vy < 0) p.vy = -p.vy * tuning.restitution
      } else if (p.y > walls.maxY) {
        p.y = walls.maxY
        if (p.vy > 0) p.vy = -p.vy * tuning.restitution
      }
    }
  }
```

Und am Ende von `substep`, **nach** `resolveCollisions()` — die Kollisionsauflösung verschiebt Positionen und kann jemanden nach draußen drücken:

```ts
    resolveCollisions()
    bounceOffWalls()
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: PASS, alle Physik-Tests inklusive der zwei neuen.

- [ ] **Step 8: Typecheck**

Run: `pnpm -C webapp-vue typecheck`
Expected: keine Fehler.

- [ ] **Step 9: Commit**

```bash
git add webapp-vue/src/members/swarm.ts webapp-vue/src/members/__tests__/swarm.spec.ts
git commit -m "feat(members): give the stage walls so no scroll lock is needed

A transformed element enlarges its ancestors' scrollable area even though the
layout is untouched, which is why the spike started members off-screen and then
had to set overflow:hidden on documentElement for the duration. Starting inside
the edges and bouncing off the viewport removes the cause instead of masking it,
and the wall hits make the flight livelier rather than tamer. The price is the
cropped-at-the-edges look the spike was built around.

The walls widen to contain every target: a target outside the inset would leave
the spring fighting the clamp forever and the swarm would never settle. There is
a test for exactly that, and one asserting nobody leaves the stage at any point
of the flight — the promise the scroll lock used to make."
```

---

### Task 8: API-Typen, Client und Laden

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Modify: `webapp-vue/src/api/communities.ts`
- Create: `webapp-vue/src/members/useRoster.ts`
- Test: `webapp-vue/src/members/__tests__/useRoster.spec.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path)` aus `@/api/client`.
- Produces:
  - `interface RosterPoints { stable: number; live?: number }`
  - `interface RosterMemberResponse { userId: string; shortName: string; fullName: string; bgColorHex: string; points: RosterPoints }`
  - `getRoster(slug: string): Promise<RosterMemberResponse[]>`
  - `useRoster(slug: string)` → `{ members: Ref<RosterMemberResponse[]>, state: Ref<'loading' | 'ready' | 'failed'>, reload: () => Promise<void> }`

`live` ist **optional, nicht nullable** — das Backend lässt das Feld weg. Unter `exactOptionalPropertyTypes` heißt das: in Testdaten den Schlüssel weglassen, nicht auf `undefined` setzen.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { useRoster } from '../useRoster'

/** useRoster loads on mount, so it needs a host component. */
function host(slug = 'team') {
  const seen: { state?: string; count?: number } = {}
  const Cmp = defineComponent({
    setup() {
      const { members, state } = useRoster(slug)
      return () => {
        seen.state = state.value
        seen.count = members.value.length
        return h('div')
      }
    },
  })
  return { Cmp, seen }
}

const alice = {
  userId: '0190f1b2-0000-7000-8000-000000000001',
  shortName: 'AMY',
  fullName: 'amy',
  bgColorHex: '#8e44ad',
  points: { stable: 3 },
}

describe('useRoster', () => {
  it('publishes the roster once it arrives', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([alice])
    const { Cmp, seen } = host()
    mount(Cmp)
    await flushPromises()
    expect(seen.state).toBe('ready')
    expect(seen.count).toBe(1)
  })

  it('reports failure instead of rendering an empty row', async () => {
    vi.spyOn(api, 'getRoster').mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, seen } = host()
    mount(Cmp)
    await flushPromises()
    expect(seen.state).toBe('failed')
    expect(seen.count).toBe(0)
  })

  it('requests the roster of the given community', async () => {
    const spy = vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const { Cmp } = host('hütte')
    mount(Cmp)
    await flushPromises()
    expect(spy).toHaveBeenCalledWith('hütte')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C webapp-vue vitest run src/members/__tests__/useRoster.spec.ts`
Expected: FAIL — `useRoster` und `getRoster` existieren nicht.

- [ ] **Step 3: Add the API types**

In `webapp-vue/src/api/types.ts`, hinter `MemberResponse`:

```ts
export interface RosterPoints {
  stable: number
  /** Absent when the viewer may not see live points, or when the member has not played the round. */
  live?: number
}
export interface RosterMemberResponse {
  userId: string
  shortName: string
  fullName: string
  bgColorHex: string
  points: RosterPoints
}
```

- [ ] **Step 4: Add the client call**

In `webapp-vue/src/api/communities.ts`: `RosterMemberResponse` in den `import type { … }`-Block aufnehmen und hinter `listMembers` ergänzen:

```ts
export const getRoster = (slug: string) =>
  apiFetch<RosterMemberResponse[]>(`/api/communities/${slug}/roster`)
```

- [ ] **Step 5: Write the composable**

```ts
import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { getRoster } from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'

export type RosterState = 'loading' | 'ready' | 'failed'

export function useRoster(slug: string): {
  members: Ref<RosterMemberResponse[]>
  state: Ref<RosterState>
  reload: () => Promise<void>
} {
  const members = ref<RosterMemberResponse[]>([])
  const state = ref<RosterState>('loading')

  async function reload(): Promise<void> {
    state.value = 'loading'
    try {
      members.value = await getRoster(slug)
      state.value = 'ready'
    } catch (err) {
      // A silent empty row would read as "this community has no members".
      console.error('[roster] failed to load', err)
      state.value = 'failed'
    }
  }

  onMounted(reload)
  return { members, state, reload }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm -C webapp-vue vitest run src/members`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm -C webapp-vue typecheck`
Expected: keine Fehler.

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/src/api/types.ts webapp-vue/src/api/communities.ts webapp-vue/src/members/useRoster.ts webapp-vue/src/members/__tests__/useRoster.spec.ts
git commit -m "feat(members): load the roster

points.live is optional rather than nullable because the backend omits the key
outright when the value is withheld. A failure produces a 'failed' state instead
of an empty list: a silent empty row would read as 'this community has no
members'."
```

---

### Task 9: Die Reihe

**Files:**
- Create: `webapp-vue/src/members/MemberRow.vue`
- Test: `webapp-vue/src/members/__tests__/MemberRow.spec.ts`

**Interfaces:**
- Consumes: `createSwarm`, `defaultTuning` aus `./swarm`; `readableTextColor`; `RosterMemberResponse`.
- Produces: Komponente mit Prop `members: RosterMemberResponse[]`. Rendert `[data-swarm-item]` pro Mitglied, jeweils mit `[data-swarm-circle]`.

Die Reihe liegt im normalen Fluss und trägt nur `transform`; die Ruheposition ist damit Offset 0 und das Layout bewegt sich nie. Transforms werden direkt ins DOM geschrieben, nicht über reaktiven State — 120 Substeps pro Sekunde durch Vues Scheduler wären sinnlose Arbeit.

`overflow` ist der Knackpunkt: `overflow-x: auto` rechnet `overflow-y` ebenfalls auf `auto` und würde die fliegenden Kreise am ~62 px hohen Band abschneiden. Also erst nach dem Landen scrollbar.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RosterMemberResponse } from '@/api/types'
import MemberRow from '../MemberRow.vue'

function member(over: Partial<RosterMemberResponse> = {}): RosterMemberResponse {
  return {
    userId: '0190f1b2-0000-7000-8000-000000000001',
    shortName: 'AMY',
    fullName: 'amy',
    bgColorHex: '#8e44ad',
    points: { stable: 3 },
    ...over,
  }
}

function reduceMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('MemberRow', () => {
  it('renders one circle per member, in the order the server sent', () => {
    reduceMotion(true)
    const w = mount(MemberRow, {
      props: {
        members: [
          member({ userId: 'a', shortName: 'BNDR', fullName: 'Bender', points: { stable: 10 } }),
          member({ userId: 'b', shortName: 'AMY', fullName: 'amy', points: { stable: 3 } }),
        ],
      },
    })
    const items = w.findAll('[data-swarm-item]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('BNDR')
    expect(items[1]?.text()).toContain('AMY')
  })

  it('names each circle for assistive technology', () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member({ fullName: 'Turanga Leela' })] } })
    expect(w.find('[data-swarm-item]').attributes('aria-label')).toContain('Turanga Leela')
  })

  it('shows the live badge only when live points are present', () => {
    reduceMotion(true)
    const without = mount(MemberRow, { props: { members: [member()] } })
    expect(without.find('[data-test="live-points"]').exists()).toBe(false)

    const with_ = mount(MemberRow, {
      props: { members: [member({ points: { stable: 3, live: 5 } })] },
    })
    expect(with_.find('[data-test="live-points"]').text()).toBe('+5')
  })

  it('does not animate when the viewer asked for reduced motion', async () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 20))
    expect(w.find('[data-swarm-item]').attributes('style') ?? '').not.toContain('translate3d')
    expect(w.find('[data-test="row"]').attributes('style') ?? '').toContain('visible')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C webapp-vue vitest run src/members/__tests__/MemberRow.spec.ts`
Expected: FAIL — `Failed to resolve import '../MemberRow.vue'`.

- [ ] **Step 3: Write the component**

```vue
<script setup lang="ts">
/**
 * The ranking row, ported from the origin app's UserStatus, plus a fly-in.
 *
 * The row is laid out normally and only carries a `transform`, so the resting place is by
 * definition offset 0 and the layout never moves. Transforms are written straight to the DOM
 * rather than through reactive state — 120 substeps a second through Vue's scheduler would be
 * pointless work.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createSwarm, defaultTuning, type Swarm } from './swarm'
import { readableTextColor } from './readableTextColor'
import type { RosterMemberResponse } from '@/api/types'

const props = defineProps<{ members: RosterMemberResponse[] }>()

const row = ref<HTMLElement | null>(null)
const settled = ref(false)
let items: HTMLElement[] = []
let swarm: Swarm | null = null
let raf = 0
let lastFrame = 0

const textColors = computed(() => props.members.map((m) => readableTextColor(m.bgColorHex)))

function paint(): void {
  if (!swarm) return
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    const p = swarm.particles[i]
    if (!el || !p) continue
    el.style.transform = `translate3d(${p.x - p.tx}px, ${p.y - p.ty}px, 0) rotate(${p.tilt}deg)`
  }
}

function finish(): void {
  swarm = null
  for (const el of items) el.style.transform = ''
  // Only now may the row clip: `overflow-x: auto` computes `overflow-y` to `auto` as well, which
  // would cut the flying circles off at the ~62px band.
  settled.value = true
}

function tick(now: number): void {
  if (!swarm) return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  swarm.step(dt)
  if (swarm.finished) return finish()
  paint()
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  const host = row.value
  if (!host) return
  items = [...host.querySelectorAll<HTMLElement>('[data-swarm-item]')]
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced && items.length > 0) {
    const targets = items.map((el) => {
      // The circle, not the column: collisions are circle-to-circle, and the points pill below
      // would drag the centre downwards.
      const circle = el.querySelector<HTMLElement>('[data-swarm-circle]') ?? el
      const r = circle.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    swarm = createSwarm({
      targets,
      stage: { width: window.innerWidth, height: window.innerHeight },
      tuning: defaultTuning,
    })
    // Paint the scattered start before revealing, so the row never flashes in place first.
    paint()
    lastFrame = performance.now()
    raf = requestAnimationFrame(tick)
  } else {
    settled.value = true
  }
  host.style.visibility = 'visible'
})

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div
    ref="row"
    data-test="row"
    class="flex w-full"
    :class="settled ? 'no-scrollbar overflow-x-auto' : 'overflow-visible'"
    style="visibility: hidden"
  >
    <div class="flex -space-x-2 p-0.5">
      <div
        v-for="(m, index) in members"
        :key="m.userId"
        data-swarm-item
        class="flex w-12 shrink-0 flex-col -space-y-1.5 will-change-transform"
        :style="{ zIndex: members.length - index }"
        :aria-label="`${m.fullName}, ${m.points.stable} Punkte`"
      >
        <div
          data-swarm-circle
          class="flex size-12 place-content-around rounded-full ring-2 ring-white"
          :style="{ background: m.bgColorHex, color: textColors[index] }"
        >
          <div class="place-self-center rotate-[-40deg] text-sm font-medium">{{ m.shortName }}</div>
        </div>
        <div
          class="h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-900 ring-1 ring-white"
        >
          {{ m.points.stable }}
        </div>
        <span
          v-if="m.points.live"
          data-test="live-points"
          class="z-20 animate-pulse self-end rounded-lg bg-rose-600 px-1 text-xs text-white ring-1 ring-yellow-400"
        >
          +{{ m.points.live }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind v4 has no scrollbar utility; on a phone this strip is swiped, and a visible
   horizontal scrollbar there is a layout bug rather than an affordance. */
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C webapp-vue vitest run src/members/__tests__/MemberRow.spec.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm -C webapp-vue typecheck && pnpm -C webapp-vue lint`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/members/MemberRow.vue webapp-vue/src/members/__tests__/MemberRow.spec.ts
git commit -m "feat(members): render the ranking row with the fly-in

The row is laid out normally and only carries a transform, so the resting place
is by definition offset 0 and the layout never moves. Transforms go straight to
the DOM: 120 substeps a second through Vue's scheduler would be pointless work.

The row only becomes scrollable once the flight is over. overflow-x: auto
computes overflow-y to auto as well, which would cut the flying circles off at
the 62px band — and on a phone this strip is swiped, so its scrollbar is hidden."
```

---

### Task 10: Auf die Community-Startseite

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `useCommunityContext()` (liefert `community: Readonly<Ref<CommunityResponse>>`), `useRoster`, `MemberRow`.
- Produces: nichts für spätere Tasks.

Der Platzhalter ist **in Reihenhöhe**, damit beim Eintreffen der Daten kein Layoutsprung entsteht. 62 px = 48 px Kreis + 16 px Pille − 6 px Überlappung + Innenabstand.

- [ ] **Step 1: Write the failing test**

Bestehende Testhelfer prüfen: `webapp-vue/src/communities/__tests__/routerTestUtils.ts` zeigt, wie der `[slug]`-Shell-Kontext in Tests bereitgestellt wird. Reicht das nicht, den Kontext direkt injizieren wie hier:

```ts
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import * as api from '@/api/communities'
import { communityKey } from '@/communities/context'
import type { CommunityResponse } from '@/api/types'
import Page from '@/pages/c/[slug]/index.vue'

const community: CommunityResponse = {
  id: 'c1',
  name: 'Team',
  slug: 'team',
  startsAt: null,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
}

function mountPage() {
  return mount(Page, {
    global: {
      provide: {
        [communityKey as symbol]: { community: ref(community), refresh: async () => {} },
      },
    },
  })
}

describe('community home', () => {
  it('reserves the row height while loading, so nothing jumps', () => {
    vi.spyOn(api, 'getRoster').mockReturnValue(new Promise(() => {}))
    const w = mountPage()
    expect(w.find('[data-test="roster-placeholder"]').exists()).toBe(true)
  })

  it('renders the row once the roster arrives', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([
      {
        userId: 'u1',
        shortName: 'AMY',
        fullName: 'amy',
        bgColorHex: '#8e44ad',
        points: { stable: 3 },
      },
    ])
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-swarm-item]').exists()).toBe(true)
    expect(w.find('[data-test="roster-placeholder"]').exists()).toBe(false)
  })

  it('says so when the roster cannot be loaded', async () => {
    vi.spyOn(api, 'getRoster').mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="roster-error"]').text()).toContain('konnten nicht')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C webapp-vue vitest run 'src/pages/c/**/index.spec.ts'`
Expected: FAIL — kein `roster-placeholder`, die Seite ist noch ein leeres `<section />`.

- [ ] **Step 3: Write the page**

```vue
<script setup lang="ts">
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import MemberRow from '@/members/MemberRow.vue'

const { community } = useCommunityContext()
const { members, state } = useRoster(community.value.slug)
</script>

<template>
  <section>
    <MemberRow v-if="state === 'ready'" :members="members" />
    <!-- Same height in every state: the row can only fly once its resting places have been
         measured, so a shorter placeholder would make the page jump when the data lands. -->
    <p
      v-else-if="state === 'failed'"
      data-test="roster-error"
      class="flex min-h-[62px] items-center text-sm text-neutral-500"
    >
      Die Mitglieder konnten nicht geladen werden.
    </p>
    <div v-else data-test="roster-placeholder" class="min-h-[62px]" aria-hidden="true" />
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C webapp-vue vitest run 'src/pages/c/**/index.spec.ts'`
Expected: PASS, 3 Tests.

- [ ] **Step 5: Run the whole frontend suite**

Run: `pnpm -C webapp-vue test && pnpm -C webapp-vue typecheck && pnpm -C webapp-vue lint`
Expected: alles grün, keine Regression in den bestehenden 267 Tests.

- [ ] **Step 6: Commit**

```bash
git add 'webapp-vue/src/pages/c/[slug]/index.vue' 'webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts'
git commit -m "feat(members): put the ranking row on the community home

Every state occupies the same height. The row can only fly once its resting
places have been measured, so the data has to arrive first — and a shorter
placeholder would make the page jump at exactly that moment. A failure says so
rather than leaving an empty strip that reads as an empty community."
```

---

### Task 11: Am laufenden Bild verifizieren

**Files:** keine Änderung, es sei denn die Messung fordert eine.

**Interfaces:**
- Consumes: alles Vorherige.
- Produces: nichts.

Der einzige Task ohne Unit-Test — weil er die Zusagen prüft, die kein Unit-Test halten kann: dass es sich gut anfühlt, dass wirklich kein Scrollbalken erscheint, und dass die Gesamtdauer im erwarteten Rahmen liegt. Die Konstanten wurden mit Startpositionen *außerhalb* des Viewports gemessen; jetzt starten sie innen, die Flugwege sind kürzer, also sind die ~2,9 s eine Obergrenze.

- [ ] **Step 1: Start backend and frontend**

Beide über `.claude/launch.json` starten (`backend`, dann `frontend`), nicht über Bash. Docker muss laufen; das Backend zieht Postgres per compose hoch.

- [ ] **Step 2: Log in and reach a community with several members**

Auf `http://localhost:5173` über den Test-Login-Picker als `Bender` anmelden. Existiert noch keine Community mit mehreren Mitgliedern, eine anlegen und die geseedeten Nutzer (`Fry`, `leela`, `prof`, `amy`) über einen Einladungslink beitreten lassen, dann als Admin freigeben. Erwartete Kürzel: `FRY`, `TRNG`, `BNDR`, `PRFR`, `AMY`.

- [ ] **Step 3: Check the payload**

Netzwerk-Tab, Antwort von `/api/communities/<slug>/roster`. Prüfen:
- `bgColorHex` ist bei jedem gesetzt.
- Absteigend nach `points.stable` (plus `live`, wo vorhanden) sortiert.
- Bei mindestens einem Mitglied fehlt `points.live` ganz — nicht `null`, sondern **abwesend**.

- [ ] **Step 4: Measure the total duration**

In der Konsole, nach einem Reload:

```js
const items = [...document.querySelectorAll('[data-swarm-item]')]
const t0 = performance.now()
const id = setInterval(() => {
  const moving = items.some((el) => (el.style.transform ?? '') !== '')
  if (!moving) {
    console.log('settled after', Math.round(performance.now() - t0), 'ms')
    clearInterval(id)
  }
}, 50)
```

Erwartet: ≤ 2900 ms. Deutlich darüber heißt, dass eine der Konstanten nicht wie gemessen wirkt — dann `defaultTuning` in `swarm.ts` nachziehen und erneut messen. Verbindlich ist die Obergrenze, nicht eine bestimmte Zahl.

- [ ] **Step 5: Confirm no scrollbar and no scroll lock**

Während des Flugs:

```js
document.documentElement.scrollHeight <= window.innerHeight &&
  document.documentElement.scrollWidth <= window.innerWidth
```

Erwartet: `true`. Zusätzlich während des Flugs mit dem Rad scrollen — die Seite muss reagieren; das war unter der alten Scroll-Sperre nicht so.

- [ ] **Step 6: Check the phone viewport**

Viewport auf 390×844 stellen. Prüfen: die Reihe ist nach dem Landen horizontal wischbar, **ohne** sichtbaren Scrollbalken; kein Kreis wird oben oder unten abgeschnitten; die Kreise bleiben während des Flugs im Bild.

- [ ] **Step 7: Check reduced motion**

Im Browser „Bewegung reduzieren" aktivieren und neu laden. Die Reihe muss sofort und vollständig stehen, ohne jede Animation.

- [ ] **Step 8: Commit if anything was adjusted**

Nur falls Schritt 4 eine Korrektur erzwang:

```bash
git add webapp-vue/src/members/swarm.ts
git commit -m "fix(members): re-tune the swarm for the inward starts

The constants were measured with members starting outside the viewport; starting
inside the edges shortens the flight paths, so <describe what actually changed
and the measured before/after here>."
```

---

## Self-Review

**Spec-Abdeckung**

| Spec-Anforderung | Task |
|---|---|
| `GET /{slug}/roster`, Zugang aktives Mitglied | 4 |
| Nur ACTIVE, `/members` unangetastet | 4 |
| `RosterMemberResponse` ohne `isAdmin` | 4 |
| Sortierung Punkte → Beitritt → `userId` | 4 |
| `MemberPointsQuery` betrachterabhängig, `live` weggelassen | 3, 4 |
| `ZeroMemberPoints` / `StubMemberPoints`, Staging an, Prod aus | 3 |
| Kürzel-Regel inkl. `":-|"` | 1 |
| Farbe nie null, deterministische Ersatzfarbe | 2 |
| Kontrastfarbe im Frontend, kein chroma-js | 5 |
| `members/`-Modul, `swarm.ts` aus dem Spike | 6 |
| Viewport als Kiste, keine Scroll-Sperre | 7 |
| `overflow` erst nach dem Landen | 9 |
| Mobile-first, wischbar ohne Balken | 9, 11 |
| `prefers-reduced-motion` | 9, 11 |
| Lade-/Fehlerzustand in Reihenhöhe | 8, 10 |
| Gesamtdauer nachmessen | 11 |
| Keine Flyway-Migration | Global Constraints |

Keine Lücke gefunden. **Bewusste Abweichung:** kein eigenes `swarmTuning.ts` (siehe File Structure).

**Platzhalter-Scan:** kein „TBD", kein „TODO", kein „handle edge cases", kein „similar to Task N". Die einzige Stelle mit einer Lücke ist die Commit-Message in Task 11 Schritt 8 — die kann erst gefüllt werden, wenn eine Messung vorliegt, und der Schritt entfällt, wenn keine Korrektur nötig war.

**Typ-Konsistenz geprüft:** `MemberPointsQuery.standings` liefert in Task 3 und verbraucht in Task 4 dieselbe `Map<UUID, MemberPoints>`. `MemberPoints(stable, live)` ist überall gleich benannt. `AvatarColor.resolve(profileHex, userId)` und `MemberShortName.of(username)` werden in Task 4 mit genau diesen Signaturen aufgerufen. `SwarmParticle` trägt `tx`/`ty`, wie Task 9 es in `paint()` benutzt. TS `RosterPoints.live` ist optional in Task 8 und wird in Task 9 mit `v-if="m.points.live"` gelesen — trägt beides, `undefined` und `0`.
