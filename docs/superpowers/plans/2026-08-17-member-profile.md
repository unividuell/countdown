# Profil bearbeiten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Nutzer setzt Anzeigename und Hintergrundfarbe selbst — global und, davon abweichend, pro Spielgemeinschaft.

**Architecture:** Der Override sind zwei nullbare Spalten auf `community.community_members`. Aufgelöst wird **pro Feld** (`Mitgliedschaft ?: global ?: abgeleitet`) an genau einer Stelle: `MemberIdentityResolver` im `community`-Modul, veröffentlicht als Port `MemberIdentityQuery`, den `RosterService`, `RoundResponses` und `LabService` statt `UserQuery` + `Avatar.of` benutzen. Die mittippende Vorschau im Formular ist kein zweiter Algorithmus im Browser, sondern derselbe Resolver, angewandt auf eine ungespeicherte Zeile, erreichbar über zwei `avatar-preview`-Endpunkte.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / Flyway / PostgreSQL 18 · JUnit 5 + kotest matchers + mockk + MockMvc Kotlin DSL + Testcontainers · Vue 3 + TypeScript strict + Vue Router 5 (file-based) + VueUse + Tailwind v4 + Vitest + @vue/test-utils.

**Spec:** [`docs/superpowers/specs/2026-08-17-member-profile-design.md`](../specs/2026-08-17-member-profile-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare und Commit-Messages **englisch**. User-facing Text im Frontend **deutsch**, deutsche Anführungszeichen sind `„…“` — niemals `"`. Spec/Plan bleiben deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — siehe [`.claude/guidelines/kotlin.md`](../../../.claude/guidelines/kotlin.md).
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldThrow`, `shouldBeNull`), mockk/`@MockkBean`, MockMvc **Kotlin DSL** (`mockMvc.post(...) { }.andExpect { }`). Nicht Mockito, nicht `kotlin.test`, nicht `MockMvcRequestBuilders`. Frontend: Vitest `vi`, nicht mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung. Commits klein.
- **Persistenz:** Spring Data JDBC, kein `@Column`, Postgres erzeugt UUIDs (v7). Migrationen liegen modulweise unter `core/src/main/resources/db/migration/<modul>/`.
- **Modulgrenzen:** `game`/`gamelab` dürfen `community`s **öffentliche** API benutzen, nie `community.internal`. `iam` kennt keine Community. `ModularityTests` muss grün bleiben.
- **Maximallänge Anzeigename: 32 Zeichen.** Farbe: `#rrggbb`, klein gespeichert.
- **Keine redundanten Inline-Kommentare.** Begründungen gehören in die Commit-Message und in die Guidelines, nicht als Grabstein neben die Zeile.
- Backend-Befehle laufen aus `core/`, Frontend-Befehle aus `webapp-vue/`.

---

### Task 1: `ProfileFields` — die Feldregeln an einer Stelle

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/ProfileFields.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/ProfileFieldsTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`

**Interfaces:**
- Produces: `org.unividuell.countdown.core.iam.ProfileFields` mit `const val MAX_NAME_LENGTH = 32`, `fun normalizeName(raw: String?): String?`, `fun normalizeColor(raw: String?): String?`. Beide werfen `IllegalArgumentException` (→ 400 über die bestehenden `@RestControllerAdvice` beider Module). Task 9 und 10 benutzen sie.
- Produces: `MeResponse.displayName: String?` — das rohe, selbstgewählte Feld. Task 12 belegt damit das Formular vor.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/ProfileFieldsTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class ProfileFieldsTest {

    @Test
    fun `trims the name`() {
        ProfileFields.normalizeName("  Turanga Leela  ") shouldBe "Turanga Leela"
    }

    @Test
    fun `blank and null are both no name`() {
        ProfileFields.normalizeName(null).shouldBeNull()
        ProfileFields.normalizeName("").shouldBeNull()
        ProfileFields.normalizeName("   ").shouldBeNull()
    }

    @Test
    fun `a name at the limit is kept, one beyond it is refused`() {
        val limit = "x".repeat(ProfileFields.MAX_NAME_LENGTH)
        ProfileFields.normalizeName(limit) shouldBe limit
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeName("x".repeat(33)) }
    }

    @Test
    fun `the limit applies after trimming`() {
        val padded = "  " + "x".repeat(ProfileFields.MAX_NAME_LENGTH) + "  "
        ProfileFields.normalizeName(padded) shouldBe "x".repeat(ProfileFields.MAX_NAME_LENGTH)
    }

    @Test
    fun `stores the colour lowercased`() {
        ProfileFields.normalizeColor("#8E44AD") shouldBe "#8e44ad"
    }

    @Test
    fun `blank and null are both no colour`() {
        ProfileFields.normalizeColor(null).shouldBeNull()
        ProfileFields.normalizeColor("  ").shouldBeNull()
    }

    @Test
    fun `refuses anything that is not a six digit hex colour`() {
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("8e44ad") }
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("#8e44a") }
        shouldThrow<IllegalArgumentException> { ProfileFields.normalizeColor("rebeccapurple") }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=ProfileFieldsTest`
Expected: FAIL — `Unresolved reference: ProfileFields` (Kompilierfehler).

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/ProfileFields.kt`:

```kotlin
package org.unividuell.countdown.core.iam

/**
 * What a user-chosen profile field may contain.
 *
 * Public API of this module because BOTH write paths need the same answer: `PATCH /api/me` here,
 * and the per-community override in `community`. A second copy of the hex pattern is precisely how
 * the two would drift apart.
 */
object ProfileFields {
    const val MAX_NAME_LENGTH = 32

    private val HEX = Regex("^#[0-9a-fA-F]{6}$")

    /** Trimmed; blank is no name at all, which is the same thing as none. */
    fun normalizeName(raw: String?): String? {
        val name = raw?.trim()?.ifEmpty { null } ?: return null
        require(name.length <= MAX_NAME_LENGTH) {
            "displayName must be at most $MAX_NAME_LENGTH characters, got ${name.length}"
        }
        return name
    }

    /** `#rrggbb`, stored lowercased so two spellings of one colour cannot be told apart. */
    fun normalizeColor(raw: String?): String? {
        val color = raw?.trim()?.ifEmpty { null } ?: return null
        require(HEX.matches(color)) {
            "bgColorHex must be a valid hex colour in the form #rrggbb, got: $color"
        }
        return color.lowercase()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=ProfileFieldsTest`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the service using it**

An `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserProfileServiceTest.kt` anhängen (die bestehenden Tests bleiben unverändert):

```kotlin
    @Test
    fun `trims the display name and lowercases the colour`() {
        val saved = repository.save(User(githubId = 210L, githubLogin = "octocat"))

        val updated = service.update(saved.id!!, displayName = "  Leela  ", bgColorHex = "#8E44AD")

        updated.displayName shouldBe "Leela"
        updated.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `a blank display name clears the field`() {
        val saved = repository.save(
            User(githubId = 211L, githubLogin = "octocat", displayName = "old")
        )

        service.update(saved.id!!, displayName = "   ", bgColorHex = null).displayName.shouldBeNull()
    }

    @Test
    fun `a name beyond the limit throws IllegalArgumentException`() {
        val saved = repository.save(User(githubId = 212L, githubLogin = "octocat"))

        shouldThrow<IllegalArgumentException> {
            service.update(saved.id!!, displayName = "x".repeat(33), bgColorHex = null)
        }
    }
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./mvnw test -Dtest=UserProfileServiceTest`
Expected: FAIL — der Name wird ungetrimmt gespeichert (`"  Leela  "`), und der zu lange Name geht durch.

- [ ] **Step 7: Make it pass**

In `UserProfileService.kt` das private `hexColorPattern` und den `normalizedColor`-Block **löschen** und `update` ersetzen durch:

```kotlin
    /**
     * Updates the caller's profile fields [displayName] and [bgColorHex]; `null` clears a field.
     * All other fields (GitHub-sourced and system fields) are preserved unchanged.
     */
    @Transactional
    fun update(userId: UUID, displayName: String?, bgColorHex: String?): User {
        val user = repository.findByIdOrNull(userId)
            ?: throw NoSuchElementException("user $userId not found")

        return repository.save(
            user.copy(
                displayName = ProfileFields.normalizeName(displayName),
                bgColorHex = ProfileFields.normalizeColor(bgColorHex),
                updatedAt = Instant.now(),
            )
        )
    }
```

Import `org.unividuell.countdown.core.iam.ProfileFields` ergänzen.

- [ ] **Step 8: Run test to verify it passes**

Run: `./mvnw test -Dtest=UserProfileServiceTest`
Expected: PASS.

- [ ] **Step 9: Write the failing test for the raw displayName on the wire**

An `UserControllerTest.kt` anhängen:

```kotlin
    @Test
    fun `GET me carries the raw chosen name next to the effective one`() {
        every { profileService.current(uid) } returns user(displayName = "Mr. Custom")

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = "Mr. Custom")))
        }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value("Mr. Custom") }
            jsonPath("$.username") { value("Mr. Custom") }
        }
    }

    @Test
    fun `GET me reports no chosen name when there is none`() {
        every { profileService.current(uid) } returns user(displayName = null)

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = null)))
        }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value(null) }
            jsonPath("$.username") { value("The Octocat") }
        }
    }
```

> `value(null)` und nicht `doesNotExist()`: `MeResponse` trägt keine `@JsonInclude`-Annotation, das Feld steht also als `"displayName": null` auf der Wire. Keine `@JsonInclude` einführen — das Frontend unterscheidet „kein Name gewählt“ von „Feld fehlt“ nicht, und ein weggelassenes Feld wäre für einen `string | null`-Typ die schlechtere Wire.

- [ ] **Step 10: Run test to verify it fails**

Run: `./mvnw test -Dtest=UserControllerTest`
Expected: FAIL — `$.displayName` existiert nicht.

- [ ] **Step 11: Make it pass**

In `UserController.kt` `MeResponse` und den Mapper ergänzen:

```kotlin
data class MeResponse(
    val id: UUID,
    val username: String,
    /** The raw chosen name; null means none was chosen. `username` is what to show. */
    val displayName: String?,
    val githubLogin: String,
    // … unverändert
)

private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, displayName = displayName,
    githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, avatar = Avatar.of(this),
    isSuperAdmin = isSuperAdmin, mayCreateCommunities = mayCreateCommunities,
    createdAt = createdAt,
)
```

- [ ] **Step 12: Run the module's tests**

Run: `./mvnw test -Dtest='ProfileFieldsTest,UserProfileServiceTest,UserControllerTest'`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam core/src/test/kotlin/org/unividuell/countdown/core/iam
git commit -m "feat(iam): one place that says what a profile field may contain

ProfileFields is public API because the per-community override in the
community module needs the same answer as PATCH /api/me. A second copy
of the hex pattern is how the two would drift.

Trimming and a 32 character ceiling are new; the global path had
neither, and a name that bursts a row is the same bug on both levels.
MeResponse now carries the raw chosen name too — a form cannot tell an
empty field from an inherited GitHub name without it."
```

---

### Task 2: `Avatar.of` mit Override-Werten

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarTest.kt`

**Interfaces:**
- Consumes: `User`, `MemberShortName`, `AvatarColor` (bestehend).
- Produces: `Avatar.of(user: User, nameOverride: String?, bgColorHexOverride: String?): Avatar`. Leere/blanke Overrides zählen als „nicht gesetzt“. `Avatar.of(user)` bleibt und delegiert. Task 4 baut darauf auf.

- [ ] **Step 1: Write the failing test**

An `core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarTest.kt` anhängen:

```kotlin
    @Test
    fun `an override name wins over the user's own`() {
        val avatar = Avatar.of(
            user = user(displayName = "Turanga Leela"),
            nameOverride = "Zwerg",
            bgColorHexOverride = null,
        )
        avatar.shortName shouldBe "ZWRG"
    }

    @Test
    fun `an override colour wins over the user's own`() {
        val avatar = Avatar.of(
            user = user(bgColorHex = "#111111"),
            nameOverride = null,
            bgColorHexOverride = "#8e44ad",
        )
        avatar.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `a missing override falls through to the user, then to the derived colour`() {
        val plain = Avatar.of(user())
        val overridden = Avatar.of(user(), nameOverride = null, bgColorHexOverride = null)

        overridden shouldBe plain
    }

    @Test
    fun `a blank override counts as none`() {
        val avatar = Avatar.of(
            user = user(displayName = "Turanga Leela", bgColorHex = "#111111"),
            nameOverride = "   ",
            bgColorHexOverride = "",
        )
        avatar.shortName shouldBe "TRNG"
        avatar.bgColorHex shouldBe "#111111"
    }
```

> Die Farbe wird hier bereits klein übergeben und klein erwartet: `Avatar` normalisiert nicht und soll es nicht — die Schreibweise ist beim Schreiben durch `ProfileFields.normalizeColor` gelaufen (Task 1), und eine zweite Normalisierung hier wäre genau die Doppelung, die `ProfileFields` verhindern soll.

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=AvatarTest`
Expected: FAIL — `Avatar.of` nimmt nur einen Parameter.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt` — die `companion object`-Fabriken ersetzen:

```kotlin
    companion object {
        fun of(user: User): Avatar =
            of(user = user, nameOverride = null, bgColorHexOverride = null)

        /**
         * The same avatar, drawn for a scope that may override either half. `null` and blank both
         * mean "this scope says nothing" — a stored empty string must not blank out a name.
         *
         * This module still knows nothing about what a scope is; it is handed two values that win
         * if they are there.
         */
        fun of(user: User, nameOverride: String?, bgColorHexOverride: String?): Avatar = Avatar(
            shortName = MemberShortName.of(
                nameOverride?.takeIf { it.isNotBlank() } ?: user.username,
            ),
            bgColorHex = AvatarColor.resolve(
                bgColorHexOverride?.takeIf { it.isNotBlank() } ?: user.bgColorHex,
                requireNotNull(user.id) { "an unsaved user has no id to derive a colour from" },
            ),
        )
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=AvatarTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarTest.kt
git commit -m "feat(iam): let a scope override either half of an avatar

Avatar stays the only place that turns a name into four characters and
nothing into a colour, and it still knows nothing about communities: it
takes two values that win when present. Blank counts as absent, so a
stored empty string cannot blank out a name."
```

---

### Task 3: Die zwei Spalten auf `community_members`

**Files:**
- Create: `core/src/main/resources/db/migration/community/V5__add_member_profile_columns.sql`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityMember.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityMemberRepositoryTest.kt`

**Interfaces:**
- Produces: `CommunityMember.displayName: String?` und `CommunityMember.bgColorHex: String?`, beide mit Default `null`. Task 4, 5 und 9 lesen und schreiben sie.

- [ ] **Step 1: Write the failing test**

An `CommunityMemberRepositoryTest.kt` anhängen:

```kotlin
    @Test
    fun `carries the per-community name and colour, both optional`() {
        val uid = users.save(User(githubId = System.nanoTime(), githubLogin = "u-profile")).id!!
        val cid = communities.save(Community(name = "Team", slug = "team-profile", createdBy = uid)).id!!
        members.save(
            CommunityMember(
                communityId = cid, userId = uid, status = MemberStatus.ACTIVE,
                displayName = "Zwerg", bgColorHex = "#8e44ad",
            )
        )

        val row = members.findByCommunityIdAndUserId(cid, uid)!!
        row.displayName shouldBe "Zwerg"
        row.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `a membership without an override stores nothing in either column`() {
        val uid = users.save(User(githubId = System.nanoTime(), githubLogin = "u-plain")).id!!
        val cid = communities.save(Community(name = "Team", slug = "team-plain", createdBy = uid)).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE))

        val row = members.findByCommunityIdAndUserId(cid, uid)!!
        row.displayName.shouldBeNull()
        row.bgColorHex.shouldBeNull()
    }
```

Import `io.kotest.matchers.nulls.shouldBeNull` ergänzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=CommunityMemberRepositoryTest`
Expected: FAIL — `CommunityMember` kennt `displayName` nicht (Kompilierfehler).

- [ ] **Step 3: Write the migration**

`core/src/main/resources/db/migration/community/V5__add_member_profile_columns.sql`:

```sql
ALTER TABLE community.community_members
    ADD COLUMN display_name TEXT NULL,
    ADD COLUMN bg_color_hex TEXT NULL;
```

- [ ] **Step 4: Extend the entity**

`core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityMember.kt`:

```kotlin
@Table(schema = "community", name = "community_members")
data class CommunityMember(
    @Id
    val id: UUID? = null,
    val communityId: UUID,
    val userId: UUID,
    val status: MemberStatus,
    val isAdmin: Boolean = false,
    /** How this member appears in THIS community; null means the global profile applies. */
    val displayName: String? = null,
    val bgColorHex: String? = null,
    @CreatedDate
    val createdAt: Instant? = null,
    @LastModifiedDate
    val updatedAt: Instant? = null,
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./mvnw test -Dtest=CommunityMemberRepositoryTest`
Expected: PASS (Flyway spielt V5 gegen den Testcontainer ein).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/resources/db/migration/community core/src/main/kotlin/org/unividuell/countdown/core/community/CommunityMember.kt core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityMemberRepositoryTest.kt
git commit -m "feat(community): a member may look different in each community

Two nullable columns on the membership rather than a table of their
own: the override IS a property of the membership, and leaving the
community drops it with the row — no foreign key, no cascade, no rule
to keep.

Nullable per field although the form will write both together. The
schema should not encode what today's UI happens to be able to do."
```

---

### Task 4: `MemberIdentityResolver` und der Port

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/MemberIdentity.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/MemberIdentityQuery.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberIdentityResolver.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberIdentityService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberIdentityResolverTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberIdentityServiceTest.kt`

**Interfaces:**
- Consumes: `Avatar.of(user, nameOverride, bgColorHexOverride)` (Task 2), `CommunityMember.displayName/.bgColorHex` (Task 3), `UserQuery.findAllById` (bestehend), `CommunityMemberRepository.findByCommunityId` (bestehend).
- Produces:
  - `org.unividuell.countdown.core.community.MemberIdentity(username: String, avatar: Avatar)`
  - `org.unividuell.countdown.core.community.MemberIdentityQuery` mit `of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity>` und `of(communityId: UUID, userId: UUID): MemberIdentity?`
  - `org.unividuell.countdown.core.community.internal.MemberIdentityResolver.resolve(user: User, displayName: String?, bgColorHex: String?): MemberIdentity`
  - Task 5–10 benutzen alle drei.

- [ ] **Step 1: Write the failing test for the resolver**

`core/src/test/kotlin/org/unividuell/countdown/core/community/MemberIdentityResolverTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.MemberIdentityResolver
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User
import java.util.UUID

class MemberIdentityResolverTest {
    private val id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")

    private fun user(displayName: String? = null, bgColorHex: String? = null) = User(
        id = id, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        displayName = displayName, bgColorHex = bgColorHex,
    )

    @Test
    fun `the membership's name wins`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = "Zwerg",
            bgColorHex = null,
        )
        identity.username shouldBe "Zwerg"
        identity.avatar.shortName shouldBe "ZWRG"
    }

    @Test
    fun `without a membership name the global one applies`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = null,
            bgColorHex = null,
        )
        identity.username shouldBe "Turanga Leela"
    }

    @Test
    fun `without any chosen name the github name applies`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(), displayName = null, bgColorHex = null,
        )
        identity.username shouldBe "The Octocat"
    }

    @Test
    fun `the fields fall back independently — an overridden name keeps the global colour`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(bgColorHex = "#111111"),
            displayName = "Zwerg",
            bgColorHex = null,
        )
        identity.username shouldBe "Zwerg"
        identity.avatar.bgColorHex shouldBe "#111111"
    }

    @Test
    fun `an overridden colour keeps the global name`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela"),
            displayName = null,
            bgColorHex = "#8e44ad",
        )
        identity.username shouldBe "Turanga Leela"
        identity.avatar.bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `with nothing set anywhere the identity is the plain global one`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(), displayName = null, bgColorHex = null,
        )
        identity.avatar shouldBe Avatar.of(user())
    }

    @Test
    fun `blank membership values count as unset`() {
        val identity = MemberIdentityResolver.resolve(
            user = user(displayName = "Turanga Leela", bgColorHex = "#111111"),
            displayName = "   ",
            bgColorHex = "",
        )
        identity.username shouldBe "Turanga Leela"
        identity.avatar.bgColorHex shouldBe "#111111"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=MemberIdentityResolverTest`
Expected: FAIL — `MemberIdentity` und `MemberIdentityResolver` gibt es nicht.

- [ ] **Step 3: Write the type and the resolver**

`core/src/main/kotlin/org/unividuell/countdown/core/community/MemberIdentity.kt`:

```kotlin
package org.unividuell.countdown.core.community

import org.unividuell.countdown.core.iam.Avatar

/**
 * How a member appears inside ONE community: the name that wins there, drawn the way it wins there.
 *
 * Public, because the roster is not the only place that draws people — the round payload and the
 * game lab do too, and all three must not be able to disagree.
 */
data class MemberIdentity(val username: String, val avatar: Avatar)
```

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberIdentityResolver.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User

/**
 * The one rule for "who looks like what, here", applied per field: the membership's value if it has
 * one, else the user's global one, else what iam derives.
 *
 * Takes the two values rather than a membership row on purpose. The preview endpoint feeds it the
 * candidate values from an unsaved form, which is what makes a preview provably the same answer a
 * save would give — not merely a similar one.
 */
object MemberIdentityResolver {
    fun resolve(user: User, displayName: String?, bgColorHex: String?): MemberIdentity =
        MemberIdentity(
            username = displayName?.takeIf { it.isNotBlank() } ?: user.username,
            avatar = Avatar.of(
                user = user,
                nameOverride = displayName,
                bgColorHexOverride = bgColorHex,
            ),
        )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=MemberIdentityResolverTest`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the port**

`core/src/test/kotlin/org/unividuell/countdown/core/community/MemberIdentityServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.maps.shouldHaveSize
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.MemberIdentityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

class MemberIdentityServiceTest {
    private val cid = UUID.fromString("0190f1b2-0000-7000-8000-0000000000c1")
    private val alice = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")
    private val bob = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")

    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val service = MemberIdentityService(members = members, users = users)

    private fun member(userId: UUID, displayName: String? = null, bgColorHex: String? = null) =
        CommunityMember(
            communityId = cid, userId = userId, status = MemberStatus.ACTIVE,
            displayName = displayName, bgColorHex = bgColorHex,
        )

    @Test
    fun `resolves each member against their own membership row`() {
        every { members.findByCommunityId(cid) } returns listOf(
            member(alice, displayName = "Zwerg"),
            member(bob),
        )
        every { users.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
            User(id = bob, githubId = 2L, githubLogin = "Bender"),
        )

        val identities = service.of(communityId = cid, userIds = listOf(alice, bob))

        identities shouldHaveSize 2
        identities[alice]!!.username shouldBe "Zwerg"
        identities[bob]!!.username shouldBe "Bender"
    }

    @Test
    fun `a user without a membership row here falls back to their global identity`() {
        every { members.findByCommunityId(cid) } returns emptyList()
        every { users.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
        )

        service.of(communityId = cid, userIds = listOf(alice))[alice]!!.username shouldBe "Amy Wong"
    }

    @Test
    fun `the single lookup answers null for a user with no user row`() {
        every { members.findByCommunityId(cid) } returns listOf(member(alice))
        every { users.findAllById(any()) } returns emptyList()

        service.of(communityId = cid, userId = alice).shouldBeNull()
    }

    @Test
    fun `an empty request asks the database nothing`() {
        service.of(communityId = cid, userIds = emptyList()) shouldHaveSize 0
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./mvnw test -Dtest=MemberIdentityServiceTest`
Expected: FAIL — `MemberIdentityService` gibt es nicht.

- [ ] **Step 7: Write the port and its implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/community/MemberIdentityQuery.kt`:

```kotlin
package org.unividuell.countdown.core.community

import java.util.UUID

/**
 * How members of a community appear there, for consumption by other modules.
 *
 * Replaces the combination of `UserQuery` + `Avatar.of` at every call site that draws a person
 * inside a community — the roster, the round payload, the game lab. Those three must not be able
 * to disagree about what the same person looks like.
 */
interface MemberIdentityQuery {
    /** Batch lookup. Callers rendering many rows must use this instead of one call per row. */
    fun of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity>

    /** `null` when there is no user row for [userId]. */
    fun of(communityId: UUID, userId: UUID): MemberIdentity?
}
```

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberIdentityService.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

@Service
class MemberIdentityService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
) : MemberIdentityQuery {

    override fun of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity> {
        val ids = userIds.distinct()
        if (ids.isEmpty()) return emptyMap()
        val rows = members.findByCommunityId(communityId).associateBy { it.userId }
        return users.findAllById(ids).mapNotNull { user ->
            val id = user.id ?: return@mapNotNull null
            val row = rows[id]
            id to MemberIdentityResolver.resolve(
                user = user,
                displayName = row?.displayName,
                bgColorHex = row?.bgColorHex,
            )
        }.toMap()
    }

    override fun of(communityId: UUID, userId: UUID): MemberIdentity? =
        of(communityId = communityId, userIds = listOf(userId))[userId]
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `./mvnw test -Dtest='MemberIdentityResolverTest,MemberIdentityServiceTest'`
Expected: PASS.

- [ ] **Step 9: Verify the module structure still holds**

Run: `./mvnw test -Dtest=ModularityTests`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community core/src/test/kotlin/org/unividuell/countdown/core/community
git commit -m "feat(community): one port answers who looks like what, here

MemberIdentityResolver takes the two override values rather than a
membership row, so the preview endpoint can feed it an unsaved form and
get provably the same answer a save would produce.

MemberIdentityQuery is public because the roster is not the only place
that draws people — the round payload and the game lab do too, and the
three must not be able to disagree."
```

---

### Task 5: `RosterService` auf den Resolver

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/RosterEndpointTest.kt`

**Interfaces:**
- Consumes: `MemberIdentityResolver.resolve` (Task 4). **Nicht** den Port: `RosterService` hat die Mitgliedszeilen bereits geladen, ein Port-Aufruf würde sie ein zweites Mal lesen.
- Produces: unveränderte Wire (`RosterMemberResponse`), aber mit aufgelöster Identität.

- [ ] **Step 1: Write the failing test**

An `RosterEndpointTest.kt` anhängen:

```kotlin
    @Test
    fun `a member's per-community name and colour win in the roster`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z")
                .copy(displayName = "Zwerg", bgColorHex = "#8e44ad"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
        )
        every { points.standings(community.id!!, uid, any()) } returns emptyMap()

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].fullName") { value("Zwerg") }
            jsonPath("$[0].shortName") { value("ZWRG") }
            jsonPath("$[0].bgColorHex") { value("#8e44ad") }
        }
    }

    @Test
    fun `without an override the roster shows the global identity`() {
        admitted()
        every { memberRepo.findByCommunityId(community.id!!) } returns listOf(
            member(alice, MemberStatus.ACTIVE, "2026-01-01T00:00:00Z"),
        )
        every { userQuery.findAllById(any()) } returns listOf(
            User(id = alice, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong"),
        )
        every { points.standings(community.id!!, uid, any()) } returns emptyMap()

        mockMvc.get("/api/communities/team/roster") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$[0].fullName") { value("Amy Wong") }
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=RosterEndpointTest`
Expected: FAIL — `fullName` ist `"Amy Wong"` statt `"Zwerg"`.

- [ ] **Step 3: Make it pass**

In `RosterService.kt` den Mapping-Block ersetzen; `import org.unividuell.countdown.core.iam.Avatar` entfällt:

```kotlin
            .mapNotNull { member ->
                val user = byId[member.userId] ?: return@mapNotNull null
                val p = standings[member.userId] ?: MemberPoints(stable = 0, live = null)
                val identity = MemberIdentityResolver.resolve(
                    user = user,
                    displayName = member.displayName,
                    bgColorHex = member.bgColorHex,
                )
                RosterMemberResponse(
                    userId = member.userId,
                    shortName = identity.avatar.shortName,
                    fullName = identity.username,
                    bgColorHex = identity.avatar.bgColorHex,
                    points = RosterPointsResponse(
                        stable = p.stable,
                        live = p.live?.let {
                            LivePointsResponse(points = it.points, provisional = it.provisional)
                        },
                    ),
                )
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=RosterEndpointTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt core/src/test/kotlin/org/unividuell/countdown/core/community/RosterEndpointTest.kt
git commit -m "feat(community): the roster draws the per-community identity

Uses the resolver directly rather than the port: the service already
holds the membership rows, and going through the port would read the
same table a second time for the same answer."
```

---

### Task 6: `RoundResponses` auf den Port

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt`
- Betroffen (Kompilierfehler beheben, keine neue Logik): `core/src/test/kotlin/org/unividuell/countdown/core/game/AnnouncementServiceTest.kt`, `AnnouncementServiceNoGameTypeTest.kt`, `PlayServiceTest.kt`, `PlayServiceStrictRevealTest.kt`

**Interfaces:**
- Consumes: `MemberIdentityQuery` (Task 4).
- Produces: `CurrentRound.communityId: UUID` auf beiden Varianten. `RoundResponses.of(current, viewerId)` behält seine Signatur — die Community reist mit dem Zustand statt als zusätzlicher Parameter, so bleiben die Aufrufe in `PlayService` unangetastet.

- [ ] **Step 1: Write the failing test**

An `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundControllerTest.kt` anhängen. Die vorhandene Testklasse zeigt, wie eine angekündigte Runde aufgesetzt wird — dieselben `@MockkBean`-Stubs wiederverwenden und ergänzen:

```kotlin
    @Test
    fun `the round payload names a player the way their community does`() {
        // Arrange exactly like the existing "reveals my own guess" test in this class, plus:
        every {
            identities.of(communityId = any(), userIds = any<Collection<UUID>>())
        } returns mapOf(
            TEST_USER_ID to MemberIdentity(
                username = "Zwerg",
                avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
            ),
        )

        mockMvc.get("/api/communities/team/rounds/current") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.me.username") { value("Zwerg") }
            jsonPath("$.me.avatar.shortName") { value("ZWRG") }
            jsonPath("$.me.avatar.bgColorHex") { value("#8e44ad") }
        }
    }
```

Dazu in der Testklasse `@MockkBean lateinit var identities: MemberIdentityQuery` ergänzen und `userQuery` dort entfernen, wo es nur noch `RoundResponses` bediente.

> Der Rest des Arrangements (Community, Edition, `RoundGame`, `RoundPlay`) steht bereits in `RoundControllerTest`. Nicht neu erfinden — den vorhandenen Aufbau der Nachbartests kopieren und nur um den `identities`-Stub erweitern.

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=RoundControllerTest`
Expected: FAIL — `MemberIdentityQuery` ist kein Bean von `RoundResponses`, der Name kommt weiter aus `UserQuery`.

- [ ] **Step 3: Carry the community on the round state**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CurrentRound.kt`:

```kotlin
sealed interface CurrentRound {
    /** Whose round this is. Every consumer that draws a person needs it, and it is known before
     *  the round is: the gate resolves the community first. */
    val communityId: UUID

    /** [round] is `null` when there is no grid at all — no active run, or no target date. */
    data class NoGame(
        override val communityId: UUID,
        val round: Round?,
        val reason: NoGameReason,
    ) : CurrentRound

    data class Announced(
        override val communityId: UUID,
        val round: Round,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
    ) : CurrentRound
}
```

Import `java.util.UUID` ergänzen.

- [ ] **Step 4: Thread it through AnnouncementService**

In `AnnouncementService.kt` jede `CurrentRound.NoGame(...)`- und `CurrentRound.Announced(...)`-Konstruktion um `communityId = communityId` ergänzen. `resolve` hat die Variable bereits. `announcedOrNoGame` bekommt sie als Parameter:

```kotlin
    private fun announcedOrNoGame(
        communityId: UUID,
        round: Round,
        roundGame: RoundGame,
    ): CurrentRound {
        val handle = catalog.handle(roundGame.gameType)
        if (handle == null) {
            logger.warn {
                "round ${round.number} announced as '${roundGame.gameType}', which this build has no game for"
            }
            return CurrentRound.NoGame(
                communityId = communityId, round = round, reason = NoGameReason.NO_GAME_TYPE,
            )
        }
        return CurrentRound.Announced(
            communityId = communityId,
            round = round,
            roundGame = roundGame,
            handle = handle,
        )
    }
```

und am Aufrufpunkt `announcedOrNoGame(communityId = communityId, round = round, roundGame = …)`.

- [ ] **Step 5: Swap the dependency in RoundResponses**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt`:

```kotlin
@Component
class RoundResponses(
    private val plays: RoundPlayRepository,
    private val identities: MemberIdentityQuery,
) {
```

`announced` — `byUser` wird zu `byId`, und die beiden DTO-Fabriken nehmen eine `MemberIdentity`:

```kotlin
        val byId = identities.of(
            communityId = current.communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId },
        )
```

```kotlin
    private fun mineDtoOf(play: RoundPlay, identity: MemberIdentity?): MyPlayDto? = identity?.let {
        MyPlayDto(
            userId = play.userId,
            username = it.username,
            avatar = it.avatar,
            revealedAt = play.revealedAt,
            guessedAt = play.guessedAt,
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }

    private fun otherDtoOf(play: RoundPlay, identity: MemberIdentity?): OtherPlayDto? = identity?.let {
        OtherPlayDto(
            userId = play.userId,
            username = it.username,
            avatar = it.avatar,
            guess = play.guess,
            outcome = play.outcome,
            points = play.points,
        )
    }
```

Aufrufe: `mineDtoOf(play = it, identity = byId[it.userId])`, `otherDtoOf(play = it, identity = byId[it.userId])`. Die Importe `org.unividuell.countdown.core.iam.Avatar`, `...iam.User` und `...iam.UserQuery` entfallen; `org.unividuell.countdown.core.community.MemberIdentity` und `...community.MemberIdentityQuery` kommen dazu.

- [ ] **Step 6: Repair the other game tests**

Run: `./mvnw test -Dtest='AnnouncementServiceTest,AnnouncementServiceNoGameTypeTest,PlayServiceTest,PlayServiceStrictRevealTest'`
Expected: zunächst Kompilierfehler an jeder `CurrentRound.NoGame(...)`/`Announced(...)`-Konstruktion im Testbaum. Überall `communityId = <die im Test verwendete Community-UUID>` ergänzen. Wo ein Test `UserQuery` nur für `RoundResponses` stubte, stattdessen `MemberIdentityQuery` stuben.

- [ ] **Step 7: Run the game module's tests**

Run: `./mvnw test -Dtest='org.unividuell.countdown.core.game.*'`
Expected: PASS.

- [ ] **Step 8: Verify the module structure still holds**

Run: `./mvnw test -Dtest=ModularityTests`
Expected: PASS — `game` benutzt weiterhin nur die öffentliche API von `community`.

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "feat(game): a round names players the way their community does

The community rides along on CurrentRound rather than being passed to
RoundResponses.of as an extra argument: the gate resolves it before the
round exists, and carrying it on the state leaves PlayService's two
call sites untouched."
```

---

### Task 7: `LabService` auf den Port

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`

**Interfaces:**
- Consumes: `MemberIdentityQuery` (Task 4).
- Produces: unverändertes `LabEntryDto`, aber community-aufgelöst.

- [ ] **Step 1: Write the failing test**

An `LabServiceTest.kt` anhängen (die vorhandene Aufbauhilfe der Klasse benutzen, nur den Identitäts-Stub ersetzen):

```kotlin
    @Test
    fun `a lab entry is labelled the way the community labels that member`() {
        every {
            identities.of(communityId = any(), userIds = any<Collection<UUID>>())
        } returns mapOf(
            TEST_USER_ID to MemberIdentity(
                username = "Zwerg",
                avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
            ),
        )

        // … play one round exactly as the neighbouring tests do …

        val entry = response.entries.single()
        entry.username shouldBe "Zwerg"
        entry.avatar.shortName shouldBe "ZWRG"
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=LabServiceTest`
Expected: FAIL — `identities` ist kein Feld von `LabService`.

- [ ] **Step 3: Make it pass**

In `LabService.kt`:
- Konstruktorfeld `private val users: UserQuery` ersetzen durch `private val identities: MemberIdentityQuery`.
- `respond` bekommt die Community:

```kotlin
    private fun respond(
        communityId: UUID,
        handle: GameTypeHandle<*>,
        snapshot: LabRoundSnapshot,
        me: UUID,
    ): LabRoundResponse {
        val mine = snapshot.entries.firstOrNull { it.userId == me }
        val visible = if (mine == null) emptyList() else snapshot.entries.filter { it.userId != me }
        val byId = identities.of(
            communityId = communityId,
            userIds = (visible + listOfNotNull(mine)).map { it.userId },
        )
        // A tester whose user row vanished mid-session drops out of the list rather than taking the
        // whole page down with them.
        fun dtoOf(entry: LabEntry) = byId[entry.userId]?.let { identity ->
            LabEntryDto(
                userId = entry.userId,
                username = identity.username,
                avatar = identity.avatar,
                guess = entry.guess,
                outcome = entry.outcome,
                points = entry.points,
                at = entry.at,
            )
        }
```

- An allen vier `respond(...)`-Aufrufen (Zeilen ~56, ~88, ~105, ~124) `communityId = communityId` als erstes Argument ergänzen; die Variable steht dort bereits aus `resolve(...)`.
- Import `org.unividuell.countdown.core.iam.Avatar` und `...iam.UserQuery` entfernen, `org.unividuell.countdown.core.community.MemberIdentityQuery` ergänzen.

- [ ] **Step 4: Run the gamelab tests**

Run: `./mvnw test -Dtest='org.unividuell.countdown.core.gamelab.*'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab
git commit -m "feat(gamelab): the lab labels testers the way their community does

The lab adapts to the app, not the other way round: it goes through the
same identity port as the roster and the round payload."
```

---

### Task 8: `viewerIdentity` auf `CommunityResponse`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/CommunityControllerTest.kt`

**Interfaces:**
- Consumes: `MemberIdentityQuery` (Task 4).
- Produces: `CommunityResponse.viewerIdentity: MemberIdentity?` — `null`, wenn der Betrachter hier keine Mitgliedszeile hat (Super-Admin von außen). Task 15 zeichnet den Header-Avatar daraus.

- [ ] **Step 1: Write the failing test**

An `CommunityControllerTest.kt` anhängen (Aufbau der bestehenden `GET /{slug}`-Tests wiederverwenden):

```kotlin
    @Test
    fun `GET community carries how the viewer appears here`() {
        // … the existing arrangement of a community the viewer is an active member of …
        every {
            identities.of(communityId = any(), userId = TEST_USER_ID)
        } returns MemberIdentity(
            username = "Zwerg",
            avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
        )

        mockMvc.get("/api/communities/team") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIdentity.username") { value("Zwerg") }
            jsonPath("$.viewerIdentity.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `a super-admin who is not a member has no identity here`() {
        // … same arrangement, but the viewer is a super-admin without a membership row …
        every { identities.of(communityId = any(), userId = TEST_USER_ID) } returns null

        mockMvc.get("/api/communities/team") { with(principalFor(superAdmin = true)) }.andExpect {
            status { isOk() }
            jsonPath("$.viewerIdentity") { value(null) }
        }
    }
```

`@MockkBean lateinit var identities: MemberIdentityQuery` in der Testklasse ergänzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=CommunityControllerTest`
Expected: FAIL — `$.viewerIdentity` existiert nicht.

- [ ] **Step 3: Make it pass**

`CommunityDtos.kt` — Feld und Mapper:

```kotlin
data class CommunityResponse(
    val id: UUID, val name: String, val slug: String,
    val startsAt: Instant?, val startsAtTimezone: String, val phaseTwoStartRound: Int?,
    val editionLabel: String, val gamesFromRound: Int?, val gamesUntilRound: Int,
    val editionFrozen: Boolean,
    val viewerIsAdmin: Boolean, val pendingCount: Int,
    /** How the viewer appears here; null when they have no membership row in this community. */
    val viewerIdentity: MemberIdentity?,
)

fun Community.toResponse(
    edition: CommunityEdition,
    editionFrozen: Boolean,
    viewerIsAdmin: Boolean,
    pendingCount: Int,
    viewerIdentity: MemberIdentity?,
) = CommunityResponse(
    // … unverändert …
    viewerIsAdmin = viewerIsAdmin, pendingCount = pendingCount, viewerIdentity = viewerIdentity,
)
```

Import `org.unividuell.countdown.core.community.MemberIdentity` ergänzen.

`CommunityController.kt` — `private val identities: MemberIdentityQuery` in den Konstruktor, und an allen **vier** `toResponse(...)`-Aufrufen ergänzen:

```kotlin
                    viewerIdentity = identities.of(communityId = requireNotNull(community.id), userId = me.id),
```

(im `create`-Fall; in `get`, `update` und `startEdition` entsprechend mit der dort schon vorhandenen `id`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest='CommunityControllerTest,EditionFreezeTest'`
Expected: PASS. Andere Tests, die `toResponse` direkt aufrufen, ebenfalls um das neue Argument ergänzen.

- [ ] **Step 5: Run the whole backend suite**

Run: `./mvnw test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community core/src/test/kotlin/org/unividuell/countdown/core/community
git commit -m "feat(community): the community payload says how the viewer appears here

Guard-owned navigation data, next to viewerIsAdmin and pendingCount, so
the header can draw what the roster draws. Nullable and not a fallback:
a super-admin looking at a community they do not belong to has no
identity there, and the browser can say so itself."
```

---

### Task 9: Die drei Profil-Endpunkte

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberProfileService.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberProfileController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfileControllerTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfileServiceTest.kt`

**Interfaces:**
- Consumes: `CommunityAccess.requireActiveMember` (bestehend), `ProfileFields` (Task 1), `MemberIdentityResolver` (Task 4), `CommunityMemberRepository.findByCommunityIdAndUserId` (bestehend).
- Produces:
  - `GET /api/communities/{slug}/me/profile` → `MemberProfileResponse(displayName: String?, bgColorHex: String?, identity: MemberIdentity)`
  - `PUT /api/communities/{slug}/me/profile` mit `UpdateMemberProfileRequest(displayName: String?, bgColorHex: String?)` → `MemberProfileResponse`
  - `DELETE /api/communities/{slug}/me/profile` → 204
  - Task 13 ruft alle drei auf.

- [ ] **Step 1: Write the failing service test**

`core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfileServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.CommunityAccessDeniedException
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

class MemberProfileServiceTest {
    private val cid = UUID.fromString("0190f1b2-0000-7000-8000-0000000000c1")
    private val uid = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")

    private val members = mockk<CommunityMemberRepository>()
    private val users = mockk<UserQuery>()
    private val service = MemberProfileService(members = members, users = users)

    private val user = User(id = uid, githubId = 1L, githubLogin = "amy", displayName = "Amy Wong")
    private val row = CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE)

    @Test
    fun `writing stores both columns normalized and answers with the resulting identity`() {
        every { members.findByCommunityIdAndUserId(cid, uid) } returns row
        every { users.findById(uid) } returns user
        val saved = slot<CommunityMember>()
        every { members.save(capture(saved)) } answers { saved.captured }

        val result = service.put(
            communityId = cid, userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )

        saved.captured.displayName shouldBe "Zwerg"
        saved.captured.bgColorHex shouldBe "#8e44ad"
        result.identity.username shouldBe "Zwerg"
        result.displayName shouldBe "Zwerg"
    }

    @Test
    fun `clearing nulls both columns`() {
        every { members.findByCommunityIdAndUserId(cid, uid) } returns
            row.copy(displayName = "Zwerg", bgColorHex = "#8e44ad")
        every { users.findById(uid) } returns user
        val saved = slot<CommunityMember>()
        every { members.save(capture(saved)) } answers { saved.captured }

        val result = service.clear(communityId = cid, userId = uid)

        saved.captured.displayName.shouldBeNull()
        saved.captured.bgColorHex.shouldBeNull()
        result.identity.username shouldBe "Amy Wong"
    }

    @Test
    fun `a caller without a membership row here is refused rather than silently ignored`() {
        every { members.findByCommunityIdAndUserId(cid, uid) } returns null

        shouldThrow<CommunityAccessDeniedException> {
            service.put(communityId = cid, userId = uid, displayName = "Zwerg", bgColorHex = null)
        }
    }

    @Test
    fun `a name beyond the limit is refused`() {
        every { members.findByCommunityIdAndUserId(cid, uid) } returns row

        shouldThrow<IllegalArgumentException> {
            service.put(
                communityId = cid, userId = uid, displayName = "x".repeat(33), bgColorHex = null,
            )
        }
    }

    @Test
    fun `the preview resolves candidate values without touching the database`() {
        every { users.findById(uid) } returns user

        val identity = service.preview(
            userId = uid, displayName = "Zwerg", bgColorHex = "#8E44AD",
        )

        identity.username shouldBe "Zwerg"
        identity.avatar.bgColorHex shouldBe "#8e44ad"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./mvnw test -Dtest=MemberProfileServiceTest`
Expected: FAIL — `MemberProfileService` gibt es nicht.

- [ ] **Step 3: Write the service**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberProfileService.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.iam.ProfileFields
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/**
 * The caller's own appearance inside one community.
 *
 * Every path targets the caller's OWN membership row and refuses when there is none. A super-admin
 * passes the access gate without belonging, and an UPDATE that matches no row would otherwise
 * answer 200 while changing nothing.
 */
@Service
class MemberProfileService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
) {

    @Transactional(readOnly = true)
    fun get(communityId: UUID, userId: UUID): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        return response(displayName = row.displayName, bgColorHex = row.bgColorHex, userId = userId)
    }

    @Transactional
    fun put(
        communityId: UUID,
        userId: UUID,
        displayName: String?,
        bgColorHex: String?,
    ): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        val name = ProfileFields.normalizeName(displayName)
        val color = ProfileFields.normalizeColor(bgColorHex)
        members.save(row.copy(displayName = name, bgColorHex = color))
        return response(displayName = name, bgColorHex = color, userId = userId)
    }

    @Transactional
    fun clear(communityId: UUID, userId: UUID): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        members.save(row.copy(displayName = null, bgColorHex = null))
        return response(displayName = null, bgColorHex = null, userId = userId)
    }

    /** The production resolver run against an unsaved row — nothing is read but the user. */
    @Transactional(readOnly = true)
    fun preview(userId: UUID, displayName: String?, bgColorHex: String?): MemberIdentity =
        MemberIdentityResolver.resolve(
            user = users.findById(userId) ?: throw CommunityAccessDeniedException(),
            displayName = ProfileFields.normalizeName(displayName),
            bgColorHex = ProfileFields.normalizeColor(bgColorHex),
        )

    private fun requireRow(communityId: UUID, userId: UUID) =
        members.findByCommunityIdAndUserId(communityId, userId)
            ?: throw CommunityAccessDeniedException()

    private fun response(displayName: String?, bgColorHex: String?, userId: UUID) =
        MemberProfileResponse(
            displayName = displayName,
            bgColorHex = bgColorHex,
            identity = MemberIdentityResolver.resolve(
                user = users.findById(userId) ?: throw CommunityAccessDeniedException(),
                displayName = displayName,
                bgColorHex = bgColorHex,
            ),
        )
}
```

`CommunityDtos.kt` um die beiden Wire-Typen ergänzen:

```kotlin
data class MemberProfileResponse(
    /** The raw override; null on either field means the global profile applies to it. */
    val displayName: String?,
    val bgColorHex: String?,
    /** What that resolves to — what the roster draws for this member today. */
    val identity: MemberIdentity,
)
data class UpdateMemberProfileRequest(val displayName: String?, val bgColorHex: String?)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./mvnw test -Dtest=MemberProfileServiceTest`
Expected: PASS.

- [ ] **Step 5: Write the failing controller test**

`core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfileControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.just
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityAccess
import org.unividuell.countdown.core.community.internal.CommunityAccessDeniedException
import org.unividuell.countdown.core.community.internal.MemberProfileResponse
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.principalFor
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class MemberProfileControllerTest(@Autowired val mockMvc: MockMvc) {
    @MockkBean lateinit var access: CommunityAccess
    @MockkBean lateinit var service: MemberProfileService

    private val uid = TEST_USER_ID
    private val community = Community(
        id = UUID.randomUUID(), name = "Team", slug = "team", createdBy = uid,
    )
    private val identity = MemberIdentity(
        username = "Zwerg", avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
    )

    private fun admitted() {
        every { access.requireActiveMember(uid, false, "team") } returns community
    }

    @Test
    fun `GET profile without auth returns 401`() {
        mockMvc.get("/api/communities/team/me/profile")
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `a non-member gets 404`() {
        every {
            access.requireActiveMember(uid, false, "team")
        } throws CommunityAccessDeniedException()

        mockMvc.get("/api/communities/team/me/profile") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `GET profile answers the raw override and the resulting identity`() {
        admitted()
        every { service.get(communityId = community.id!!, userId = uid) } returns
            MemberProfileResponse(displayName = "Zwerg", bgColorHex = "#8e44ad", identity = identity)

        mockMvc.get("/api/communities/team/me/profile") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.displayName") { value("Zwerg") }
            jsonPath("$.bgColorHex") { value("#8e44ad") }
            jsonPath("$.identity.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `PUT writes the desired state`() {
        admitted()
        every {
            service.put(
                communityId = community.id!!, userId = uid,
                displayName = "Zwerg", bgColorHex = "#8e44ad",
            )
        } returns MemberProfileResponse(
            displayName = "Zwerg", bgColorHex = "#8e44ad", identity = identity,
        )

        mockMvc.put("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":"#8e44ad"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.identity.username") { value("Zwerg") }
        }
    }

    @Test
    fun `a malformed colour is a 400`() {
        admitted()
        every {
            service.put(communityId = any(), userId = any(), displayName = any(), bgColorHex = any())
        } throws IllegalArgumentException("bgColorHex must be a valid hex colour")

        mockMvc.put("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":null,"bgColorHex":"rebeccapurple"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `DELETE clears the override`() {
        admitted()
        every { service.clear(communityId = community.id!!, userId = uid) } returns
            MemberProfileResponse(displayName = null, bgColorHex = null, identity = identity)

        mockMvc.delete("/api/communities/team/me/profile") {
            with(principalFor()); with(csrf())
        }.andExpect { status { isNoContent() } }

        verify { service.clear(communityId = community.id!!, userId = uid) }
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./mvnw test -Dtest=MemberProfileControllerTest`
Expected: FAIL — 404 auf allen drei Pfaden, es gibt keinen Controller.

- [ ] **Step 7: Write the controller**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberProfileController.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.unividuell.countdown.core.iam.AuthenticatedUser

/** The caller's own appearance inside one community. Never anybody else's. */
@RestController
@RequestMapping("/api/communities/{slug}/me")
class MemberProfileController(
    private val access: CommunityAccess,
    private val profiles: MemberProfileService,
) {

    @GetMapping("/profile")
    fun get(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): MemberProfileResponse {
        val c = admit(me = me, slug = slug)
        return profiles.get(communityId = requireNotNull(c.id), userId = me.id)
    }

    @PutMapping("/profile")
    fun put(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: UpdateMemberProfileRequest,
    ): MemberProfileResponse {
        val c = admit(me = me, slug = slug)
        return profiles.put(
            communityId = requireNotNull(c.id),
            userId = me.id,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        )
    }

    @DeleteMapping("/profile")
    fun delete(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
    ): ResponseEntity<Void> {
        val c = admit(me = me, slug = slug)
        profiles.clear(communityId = requireNotNull(c.id), userId = me.id)
        return ResponseEntity.noContent().build()
    }

    private fun admit(me: AuthenticatedUser, slug: String) =
        access.requireActiveMember(userId = me.id, isSuperAdmin = me.isSuperAdmin, slug = slug)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `./mvnw test -Dtest='MemberProfileServiceTest,MemberProfileControllerTest'`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community core/src/test/kotlin/org/unividuell/countdown/core/community
git commit -m "feat(community): read, write and clear one's own appearance here

PUT carries the same desired-state semantics as PATCH /api/me — the
body is the whole wish, null clears a field — and DELETE is the switch
being turned off.

Every path targets the caller's own membership row and 404s when there
is none: a super-admin passes the access gate without belonging, and an
update matching no row would otherwise report success."
```

---

### Task 10: Die zwei Vorschau-Endpunkte

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberProfileController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserProfileService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfileControllerTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfilePreviewParityTest.kt`

**Interfaces:**
- Produces:
  - `POST /api/me/avatar-preview` mit `UpdateProfileRequest` → `AvatarPreviewResponse(username: String, avatar: Avatar)`
  - `POST /api/communities/{slug}/me/avatar-preview` mit `UpdateMemberProfileRequest` → `MemberIdentity` (gleiche JSON-Form: `{username, avatar}`)
  - Task 11 ruft beide auf.

- [ ] **Step 1: Write the failing tests**

An `MemberProfileControllerTest.kt` anhängen:

```kotlin
    @Test
    fun `POST avatar-preview answers the identity without writing`() {
        admitted()
        every {
            profiles.preview(userId = uid, displayName = "Zwerg", bgColorHex = "#8e44ad")
        } returns identity

        mockMvc.post("/api/communities/team/me/avatar-preview") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":"#8e44ad"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.username") { value("Zwerg") }
            jsonPath("$.avatar.shortName") { value("ZWRG") }
        }

        verify(exactly = 0) {
            profiles.put(
                communityId = any(), userId = any(), displayName = any(), bgColorHex = any(),
            )
        }
    }

    @Test
    fun `a preview for a non-member is a 404`() {
        every {
            access.requireActiveMember(uid, false, "team")
        } throws CommunityAccessDeniedException()

        mockMvc.post("/api/communities/team/me/avatar-preview") {
            with(principalFor()); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":null}"""
        }.andExpect { status { isNotFound() } }
    }
```

Import `org.springframework.test.web.servlet.post` ergänzen; `profiles` ist der `@MockkBean` aus Task 9 (dort `service` genannt — hier konsistent umbenennen).

An `UserControllerTest.kt` anhängen:

```kotlin
    @Test
    fun `POST avatar-preview answers what saving would produce`() {
        every {
            profileService.preview(uid, "Zwerg", "#8e44ad")
        } returns AvatarPreviewResponse(
            username = "Zwerg", avatar = Avatar(shortName = "ZWRG", bgColorHex = "#8e44ad"),
        )

        mockMvc.post("/api/me/avatar-preview") {
            with(principalFor(user())); with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":"#8e44ad"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.username") { value("Zwerg") }
            jsonPath("$.avatar.shortName") { value("ZWRG") }
        }
    }

    @Test
    fun `a preview without auth returns 401`() {
        mockMvc.post("/api/me/avatar-preview") {
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"displayName":"Zwerg","bgColorHex":null}"""
        }.andExpect { status { isUnauthorized() } }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./mvnw test -Dtest='MemberProfileControllerTest,UserControllerTest'`
Expected: FAIL — beide Pfade antworten 404/405.

- [ ] **Step 3: Add the community preview endpoint**

An `MemberProfileController.kt`:

```kotlin
    /**
     * What the avatar would look like if these values were saved. No logic of its own: it runs the
     * production resolver against an unsaved row, which is what makes the preview the same answer
     * a save gives rather than a similar one.
     */
    @PostMapping("/avatar-preview")
    fun preview(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestBody body: UpdateMemberProfileRequest,
    ): MemberIdentity {
        admit(me = me, slug = slug)
        return profiles.preview(
            userId = me.id,
            displayName = body.displayName,
            bgColorHex = body.bgColorHex,
        )
    }
```

Importe `org.springframework.web.bind.annotation.PostMapping` und `org.unividuell.countdown.core.community.MemberIdentity` ergänzen.

- [ ] **Step 4: Add the global preview endpoint**

An `UserProfileService.kt`:

```kotlin
    /**
     * What `PATCH` would produce, without producing it. The candidate values replace the user's own
     * before the very same resolution runs — a preview computed by any other route could disagree
     * with what a save then does.
     */
    @Transactional(readOnly = true)
    fun preview(userId: UUID, displayName: String?, bgColorHex: String?): AvatarPreviewResponse {
        val user = repository.findByIdOrNull(userId)
            ?: throw StaleSessionException("user $userId from the session no longer exists")
        val candidate = user.copy(
            displayName = ProfileFields.normalizeName(displayName),
            bgColorHex = ProfileFields.normalizeColor(bgColorHex),
        )
        return AvatarPreviewResponse(username = candidate.username, avatar = Avatar.of(candidate))
    }
```

An `UserController.kt`:

```kotlin
/** The identity a set of candidate values would produce. Same shape as the community twin. */
data class AvatarPreviewResponse(val username: String, val avatar: Avatar)
```

```kotlin
    @PostMapping("/avatar-preview")
    fun avatarPreview(
        @AuthenticationPrincipal principal: CountdownOAuth2User,
        @RequestBody body: UpdateProfileRequest,
    ): AvatarPreviewResponse =
        profileService.preview(principal.user.id!!, body.displayName, body.bgColorHex)
```

Import `org.springframework.web.bind.annotation.PostMapping` ergänzen.

- [ ] **Step 5: Run tests to verify they pass**

Run: `./mvnw test -Dtest='MemberProfileControllerTest,UserControllerTest'`
Expected: PASS.

- [ ] **Step 6: Write the parity test — the whole point of the design**

`core/src/test/kotlin/org/unividuell/countdown/core/community/MemberProfilePreviewParityTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.MemberProfileService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class MemberProfilePreviewParityTest(
    @Autowired val profiles: MemberProfileService,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val communities: CommunityRepository,
    @Autowired val users: UserRepository,
) {

    @Test
    fun `the preview is exactly what saving the same values produces`() {
        val uid = users.save(
            User(githubId = System.nanoTime(), githubLogin = "amy", displayName = "Amy Wong")
        ).id!!
        val cid = communities.save(
            Community(name = "Team", slug = "team-parity", createdBy = uid)
        ).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE))

        val previewed = profiles.preview(
            userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )
        val saved = profiles.put(
            communityId = cid, userId = uid, displayName = "  Zwerg  ", bgColorHex = "#8E44AD",
        )

        previewed shouldBe saved.identity
    }

    @Test
    fun `a preview leaves the membership row untouched`() {
        val uid = users.save(
            User(githubId = System.nanoTime(), githubLogin = "bender")
        ).id!!
        val cid = communities.save(
            Community(name = "Team", slug = "team-untouched", createdBy = uid)
        ).id!!
        members.save(CommunityMember(communityId = cid, userId = uid, status = MemberStatus.ACTIVE))

        profiles.preview(userId = uid, displayName = "Zwerg", bgColorHex = "#8e44ad")

        val row = members.findByCommunityIdAndUserId(cid, uid)!!
        row.displayName shouldBe null
        row.bgColorHex shouldBe null
    }
}
```

- [ ] **Step 7: Run the parity test**

Run: `./mvnw test -Dtest=MemberProfilePreviewParityTest`
Expected: PASS.

- [ ] **Step 8: Run the whole backend suite**

Run: `./mvnw test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core core/src/test/kotlin/org/unividuell/countdown/core
git commit -m "feat: preview the avatar a name would produce, without saving

The four characters an avatar shows are not guessable from a name, so
the form has to show them while the user types — and the rule that
produces them must stay a single implementation in a single runtime.
So the browser asks instead: POST avatar-preview, global and per
community.

Neither endpoint carries logic. They run the production resolver
against an unsaved row, and a parity test pins preview == save."
```

---

### Task 11: Frontend — Typen, API-Modul, Entwurfs-Composable

**Files:**
- Modify: `webapp-vue/src/api/types.ts`
- Create: `webapp-vue/src/api/profile.ts`
- Create: `webapp-vue/src/profile/useProfileDraft.ts`
- Test: `webapp-vue/src/profile/__tests__/useProfileDraft.spec.ts`

**Interfaces:**
- Consumes: die Endpunkte aus Task 9 und 10.
- Produces:
  - `IdentityView { username: string; avatar: AvatarView }`
  - `MemberProfileResponse { displayName: string | null; bgColorHex: string | null; identity: IdentityView }`
  - `MeResponse.displayName: string | null`, `CommunityResponse.viewerIdentity: IdentityView | null`
  - `src/api/profile.ts`: `updateProfile`, `previewAvatar`, `getMemberProfile`, `putMemberProfile`, `deleteMemberProfile`, `previewMemberAvatar`
  - `useProfileDraft(fetchPreview)` → `{ name, colorInput, colorSet, body, preview, seed }` und `PREVIEW_DEBOUNCE_MS`
  - Task 12 und 13 bauen darauf auf.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/profile/__tests__/useProfileDraft.spec.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { PREVIEW_DEBOUNCE_MS, useProfileDraft } from '@/profile/useProfileDraft'
import type { IdentityView } from '@/api/types'

const identity = (username: string, shortName: string, bgColorHex = '#8e44ad'): IdentityView => ({
  username,
  avatar: { shortName, bgColorHex },
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProfileDraft', () => {
  it('seeds the fields from the stored values and the preview from the drawn one', () => {
    const draft = useProfileDraft(vi.fn())
    draft.seed('Zwerg', '#8e44ad', identity('Zwerg', 'ZWRG'))

    expect(draft.name.value).toBe('Zwerg')
    expect(draft.colorSet.value).toBe(true)
    expect(draft.colorInput.value).toBe('#8e44ad')
    expect(draft.preview.value).toEqual(identity('Zwerg', 'ZWRG'))
  })

  it('without a stored colour it seeds the picker from the drawn one but stays unset', () => {
    const draft = useProfileDraft(vi.fn())
    draft.seed(null, null, identity('Amy Wong', 'AMYW', '#123456'))

    expect(draft.colorSet.value).toBe(false)
    expect(draft.colorInput.value).toBe('#123456')
    expect(draft.body.value).toEqual({ displayName: null, bgColorHex: null })
  })

  it('asks the server once, after the debounce, and takes the answer', async () => {
    vi.useFakeTimers()
    const fetchPreview = vi.fn().mockResolvedValue(identity('Zwerg', 'ZWRG'))
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Zw'
    await nextTick()
    draft.name.value = 'Zwerg'
    await nextTick()
    expect(fetchPreview).not.toHaveBeenCalled()

    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(fetchPreview).toHaveBeenCalledTimes(1)
    expect(fetchPreview).toHaveBeenCalledWith({ displayName: 'Zwerg', bgColorHex: null })
    expect(draft.preview.value).toEqual(identity('Zwerg', 'ZWRG'))
  })

  it('drops an answer that arrives after a newer one', async () => {
    vi.useFakeTimers()
    let resolveFirst: (v: IdentityView) => void = () => {}
    const fetchPreview = vi
      .fn()
      .mockImplementationOnce(() => new Promise<IdentityView>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(identity('Klemens', 'KLMN'))
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Kle'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    draft.name.value = 'Klemens'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    // The stale first request answers last; it must not win.
    resolveFirst(identity('Kle', 'KL'))
    await vi.runOnlyPendingTimersAsync()

    expect(draft.preview.value).toEqual(identity('Klemens', 'KLMN'))
  })

  it('keeps the last good avatar when a preview fails', async () => {
    vi.useFakeTimers()
    const fetchPreview = vi.fn().mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = useProfileDraft(fetchPreview)
    draft.seed(null, null, identity('Amy Wong', 'AMYW'))

    draft.name.value = 'Zwerg'
    await nextTick()
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(draft.preview.value).toEqual(identity('Amy Wong', 'AMYW'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/profile/__tests__/useProfileDraft.spec.ts`
Expected: FAIL — das Modul gibt es nicht.

- [ ] **Step 3: Extend the types**

`webapp-vue/src/api/types.ts`:

```ts
/** A person and how they are drawn — the server's answer, never recomputed here. */
export interface IdentityView {
  username: string
  avatar: AvatarView
}

export interface MemberProfileResponse {
  /** The raw override; null on either field means the global profile applies to it. */
  displayName: string | null
  bgColorHex: string | null
  identity: IdentityView
}
```

In `MeResponse` ergänzen:

```ts
  /** The raw chosen name; null means none was chosen. `username` is what to show. */
  displayName: string | null
```

In `CommunityResponse` ergänzen:

```ts
  /** How the viewer appears here; null when they have no membership row in this community. */
  viewerIdentity: IdentityView | null
```

- [ ] **Step 4: Write the API module**

`webapp-vue/src/api/profile.ts`:

```ts
import { apiFetch } from '@/api/client'
import type {
  IdentityView,
  MeResponse,
  MemberProfileResponse,
  UpdateProfileRequest,
} from '@/api/types'

export const updateProfile = (body: UpdateProfileRequest) =>
  apiFetch<MeResponse>('/api/me', { method: 'PATCH', body: JSON.stringify(body) })

export const previewAvatar = (body: UpdateProfileRequest) =>
  apiFetch<IdentityView>('/api/me/avatar-preview', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const getMemberProfile = (slug: string) =>
  apiFetch<MemberProfileResponse>(`/api/communities/${slug}/me/profile`)

export const putMemberProfile = (slug: string, body: UpdateProfileRequest) =>
  apiFetch<MemberProfileResponse>(`/api/communities/${slug}/me/profile`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteMemberProfile = (slug: string) =>
  apiFetch<void>(`/api/communities/${slug}/me/profile`, { method: 'DELETE' })

export const previewMemberAvatar = (slug: string, body: UpdateProfileRequest) =>
  apiFetch<IdentityView>(`/api/communities/${slug}/me/avatar-preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
```

- [ ] **Step 5: Write the composable**

`webapp-vue/src/profile/useProfileDraft.ts`:

```ts
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { IdentityView, UpdateProfileRequest } from '@/api/types'

/** How long a field may rest before the server is asked what it would draw. */
export const PREVIEW_DEBOUNCE_MS = 300

/** Only used until the first seed lands, and never sent: `colorSet` decides what is sent. */
const PLACEHOLDER_COLOR = '#888888'

export interface ProfileDraft {
  name: Ref<string>
  colorInput: Ref<string>
  colorSet: Ref<boolean>
  body: ComputedRef<UpdateProfileRequest>
  preview: Ref<IdentityView | null>
  seed: (displayName: string | null, bgColorHex: string | null, identity: IdentityView) => void
}

/**
 * One editable profile: the two fields, what they mean on the wire, and the avatar they would
 * produce.
 *
 * The avatar is NOT computed here. The four characters come from a rule that lives once, in
 * Kotlin, so the draft asks the server for them — debounced, because it asks while the user types.
 */
export function useProfileDraft(
  fetchPreview: (body: UpdateProfileRequest) => Promise<IdentityView>,
): ProfileDraft {
  const name = ref('')
  const colorInput = ref(PLACEHOLDER_COLOR)
  const colorSet = ref(false)
  const preview = ref<IdentityView | null>(null)

  const body = computed<UpdateProfileRequest>(() => ({
    displayName: name.value.trim() || null,
    bgColorHex: colorSet.value ? colorInput.value : null,
  }))

  function seed(
    displayName: string | null,
    bgColorHex: string | null,
    identity: IdentityView,
  ): void {
    name.value = displayName ?? ''
    colorSet.value = bgColorHex !== null
    // The picker needs a colour even when none is chosen: it opens on what is drawn today.
    colorInput.value = bgColorHex ?? identity.avatar.bgColorHex
    preview.value = identity
  }

  // Only the newest answer may win. A slow reply to "Kle" must not overwrite the quick reply to
  // "Klemens" — the same sequence guard the community route data uses for its own loads.
  let seq = 0
  watchDebounced(
    body,
    async () => {
      const mine = ++seq
      try {
        const next = await fetchPreview(body.value)
        if (mine === seq) preview.value = next
      } catch (e) {
        // A preview is not worth an error message; the last good avatar stays on screen.
        console.error('avatar preview failed', e)
      }
    },
    { debounce: PREVIEW_DEBOUNCE_MS },
  )

  return { name, colorInput, colorSet, body, preview, seed }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/profile/__tests__/useProfileDraft.spec.ts`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `pnpm lint && pnpm vue-tsc -b`
Expected: PASS. Wo `MeResponse`- oder `CommunityResponse`-Literale in bestehenden Tests unvollständig werden, die zwei neuen Felder ergänzen (`displayName: null`, `viewerIdentity: null`).

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/src/api webapp-vue/src/profile
git commit -m "feat(webapp): the editable profile draft, previewed by the server

useProfileDraft owns the two fields and the avatar they would produce —
but does not compute that avatar. The rule that turns a name into four
characters lives once, in Kotlin, so the draft asks and debounces, and
only the newest answer may win."
```

---

### Task 12: `GlobalProfileBlock`

**Files:**
- Create: `webapp-vue/src/profile/GlobalProfileBlock.vue`
- Test: `webapp-vue/src/profile/__tests__/GlobalProfileBlock.spec.ts`

**Interfaces:**
- Consumes: `useProfileDraft` (Task 11), `updateProfile`/`previewAvatar` (Task 11), `useAuth` (bestehend, `user` + `bootstrap`), `ActionButton`, `Avatar` (bestehend).
- Produces: das Bauteil, das Task 14 auf beiden Seiten einsetzt. Test-Haken: `data-test="global-name"`, `global-color"`, `global-auto"`, `global-save"`, `global-error"`, `global-preview"`.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/profile/__tests__/GlobalProfileBlock.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import * as api from '@/api/profile'
import { PREVIEW_DEBOUNCE_MS } from '@/profile/useProfileDraft'
import type { MeResponse } from '@/api/types'

enableAutoUnmount(afterEach)

const me: MeResponse = {
  id: 'u1',
  username: 'The Octocat',
  displayName: null,
  githubLogin: 'octocat',
  githubName: 'The Octocat',
  email: null,
  bgColorHex: null,
  avatar: { shortName: 'THCT', bgColorHex: '#123456' },
  isSuperAdmin: false,
  mayCreateCommunities: false,
  createdAt: null,
}

const bootstrap = vi.fn().mockResolvedValue(undefined)
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ user: ref(me), bootstrap }),
}))
vi.mock('@/api/profile', () => ({
  updateProfile: vi.fn(),
  previewAvatar: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(api.updateProfile).mockResolvedValue({ ...me, displayName: 'Leela', username: 'Leela' })
  vi.mocked(api.previewAvatar).mockResolvedValue({
    username: 'Leela',
    avatar: { shortName: 'LL', bgColorHex: '#123456' },
  })
})

describe('GlobalProfileBlock', () => {
  it('shows the github name as the placeholder of an empty name field', () => {
    const w = mount(GlobalProfileBlock)
    const input = w.get('[data-test="global-name"]').element as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('The Octocat')
  })

  it('caps the name field at the length the server accepts', () => {
    const w = mount(GlobalProfileBlock)
    expect(w.get('[data-test="global-name"]').attributes('maxlength')).toBe('32')
  })

  it('draws the avatar the server last answered with', () => {
    const w = mount(GlobalProfileBlock)
    expect(w.get('[data-test="global-preview"]').text()).toBe('THCT')
  })

  it('sends null for a colour left on automatic', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-name"]').setValue('Leela')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'Leela', bgColorHex: null })
  })

  it('sends the picked colour once it has been picked', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-color"]').setValue('#8e44ad')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: null, bgColorHex: '#8e44ad' })
  })

  it('the automatic button drops back to the derived colour', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-color"]').setValue('#8e44ad')
    await w.get('[data-test="global-auto"]').trigger('click')
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: null, bgColorHex: null })
  })

  it('refreshes the session after saving, so the header agrees', async () => {
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(bootstrap).toHaveBeenCalled()
  })

  it('shows a message when saving fails', async () => {
    vi.mocked(api.updateProfile).mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-save"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-test="global-error"]').text()).toContain('fehlgeschlagen')
  })

  it('previews while typing, after the debounce', async () => {
    vi.useFakeTimers()
    const w = mount(GlobalProfileBlock)
    await w.get('[data-test="global-name"]').setValue('Leela')
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    await vi.runOnlyPendingTimersAsync()

    expect(api.previewAvatar).toHaveBeenCalledWith({ displayName: 'Leela', bgColorHex: null })
    expect(w.get('[data-test="global-preview"]').text()).toBe('LL')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/profile/__tests__/GlobalProfileBlock.spec.ts`
Expected: FAIL — die Komponente gibt es nicht.

- [ ] **Step 3: Write the component**

`webapp-vue/src/profile/GlobalProfileBlock.vue`:

```vue
<script setup lang="ts">
/**
 * The profile that applies wherever no community says otherwise.
 *
 * The avatar beside the fields is the server's answer, not a local guess — see useProfileDraft.
 */
import { onMounted } from 'vue'
import Avatar from '@/ui/Avatar.vue'
import ActionButton from '@/ui/ActionButton.vue'
import { useAuth } from '@/auth/useAuth'
import { useAction } from '@/ui/useAction'
import { previewAvatar, updateProfile } from '@/api/profile'
import { useProfileDraft } from '@/profile/useProfileDraft'

const NAME_MAX = 32

const { user, bootstrap } = useAuth()
const draft = useProfileDraft(previewAvatar)
const { busy, error, run } = useAction(() => 'Speichern fehlgeschlagen.')

onMounted(() => {
  const me = user.value
  if (!me) return
  draft.seed(me.displayName, me.bgColorHex, { username: me.username, avatar: me.avatar })
})

function save(): Promise<void> {
  return run(async () => {
    const saved = await updateProfile(draft.body.value)
    draft.seed(saved.displayName, saved.bgColorHex, {
      username: saved.username,
      avatar: saved.avatar,
    })
    await bootstrap()
  })
}
</script>

<template>
  <section class="rounded border border-neutral-200 p-4">
    <h2 class="mb-1 text-lg font-semibold">Überall</h2>
    <p class="mb-4 text-sm text-neutral-600">
      So erscheinst du in jeder Spielgemeinschaft, die nichts anderes sagt.
    </p>

    <div class="flex items-center gap-3">
      <Avatar
        v-if="draft.preview.value"
        data-test="global-preview"
        v-bind="draft.preview.value.avatar"
      />
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <input
          v-model="draft.name.value"
          data-test="global-name"
          type="text"
          :maxlength="NAME_MAX"
          :placeholder="user?.githubName ?? user?.githubLogin ?? ''"
          class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5"
        />
        <input
          v-model="draft.colorInput.value"
          data-test="global-color"
          type="color"
          aria-label="Hintergrundfarbe"
          class="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-300"
          @input="draft.colorSet.value = true"
        />
      </div>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <ActionButton data-test="global-save" :busy="busy" @click="save">Speichern</ActionButton>
      <button
        v-if="draft.colorSet.value"
        data-test="global-auto"
        type="button"
        class="cursor-pointer text-sm text-neutral-600 underline"
        @click="draft.colorSet.value = false"
      >
        Farbe automatisch
      </button>
    </div>
    <p v-if="error" data-test="global-error" class="mt-2 text-sm text-red-600">{{ error }}</p>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/profile/__tests__/GlobalProfileBlock.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/profile
git commit -m "feat(webapp): edit the profile that applies everywhere

Name and colour sit in one row, the avatar beside them, the way the
origin app had it. The colour is a third state, not two: automatic
until picked, and a button to go back — a native colour input has no
empty value of its own."
```

---

### Task 13: `CommunityProfileBlock`

**Files:**
- Create: `webapp-vue/src/profile/CommunityProfileBlock.vue`
- Test: `webapp-vue/src/profile/__tests__/CommunityProfileBlock.spec.ts`

**Interfaces:**
- Consumes: `useProfileDraft` (Task 11), `getMemberProfile`/`putMemberProfile`/`deleteMemberProfile`/`previewMemberAvatar` (Task 11), `ActionButton`, `Avatar`.
- Props: `{ slug: string; communityName: string }`.
- Emits: `saved` — Task 14 hängt daran das `refresh()` des Community-Kontexts.
- Test-Haken: `data-test="override-switch"`, `override-name"`, `override-color"`, `override-save"`, `override-error"`, `override-preview"`, `override-inherited"`.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/profile/__tests__/CommunityProfileBlock.spec.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import * as api from '@/api/profile'

enableAutoUnmount(afterEach)

vi.mock('@/api/profile', () => ({
  getMemberProfile: vi.fn(),
  putMemberProfile: vi.fn(),
  deleteMemberProfile: vi.fn(),
  previewMemberAvatar: vi.fn(),
}))

const inherited = {
  displayName: null,
  bgColorHex: null,
  identity: { username: 'Amy Wong', avatar: { shortName: 'AMYW', bgColorHex: '#123456' } },
}
const overridden = {
  displayName: 'Zwerg',
  bgColorHex: '#8e44ad',
  identity: { username: 'Zwerg', avatar: { shortName: 'ZWRG', bgColorHex: '#8e44ad' } },
}

const render = () => mount(CommunityProfileBlock, { props: { slug: 'team', communityName: 'Team' } })

beforeEach(() => {
  vi.mocked(api.getMemberProfile).mockResolvedValue({ ...inherited })
  vi.mocked(api.putMemberProfile).mockResolvedValue({ ...overridden })
  vi.mocked(api.deleteMemberProfile).mockResolvedValue(undefined)
  vi.mocked(api.previewMemberAvatar).mockResolvedValue({ ...overridden.identity })
})

describe('CommunityProfileBlock', () => {
  it('starts switched off when nothing is overridden, and shows what applies instead', async () => {
    const w = render()
    await flushPromises()

    expect((w.get('[data-test="override-switch"]').element as HTMLInputElement).checked).toBe(false)
    expect(w.find('[data-test="override-name"]').exists()).toBe(false)
    expect(w.get('[data-test="override-inherited"]').text()).toContain('Amy Wong')
  })

  it('starts switched on and prefilled when an override is stored', async () => {
    vi.mocked(api.getMemberProfile).mockResolvedValue({ ...overridden })
    const w = render()
    await flushPromises()

    expect((w.get('[data-test="override-switch"]').element as HTMLInputElement).checked).toBe(true)
    expect((w.get('[data-test="override-name"]').element as HTMLInputElement).value).toBe('Zwerg')
  })

  it('switching on prefills with what applies today rather than emptying the field', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)

    expect((w.get('[data-test="override-name"]').element as HTMLInputElement).value).toBe('Amy Wong')
    expect((w.get('[data-test="override-color"]').element as HTMLInputElement).value).toBe('#123456')
  })

  it('the switch alone writes nothing', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)

    expect(api.putMemberProfile).not.toHaveBeenCalled()
    expect(api.deleteMemberProfile).not.toHaveBeenCalled()
  })

  it('saving while switched on writes the override', async () => {
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)
    await w.get('[data-test="override-name"]').setValue('Zwerg')
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(api.putMemberProfile).toHaveBeenCalledWith('team', {
      displayName: 'Zwerg',
      bgColorHex: '#123456',
    })
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('saving while switched off clears the override', async () => {
    vi.mocked(api.getMemberProfile).mockResolvedValue({ ...overridden })
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(false)
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(api.deleteMemberProfile).toHaveBeenCalledWith('team')
    expect(api.putMemberProfile).not.toHaveBeenCalled()
  })

  it('shows a message when saving fails', async () => {
    vi.mocked(api.putMemberProfile).mockRejectedValue(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = render()
    await flushPromises()
    await w.get('[data-test="override-switch"]').setValue(true)
    await w.get('[data-test="override-save"]').trigger('click')
    await flushPromises()

    expect(w.get('[data-test="override-error"]').text()).toContain('fehlgeschlagen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/profile/__tests__/CommunityProfileBlock.spec.ts`
Expected: FAIL — die Komponente gibt es nicht.

- [ ] **Step 3: Write the component**

`webapp-vue/src/profile/CommunityProfileBlock.vue`:

```vue
<script setup lang="ts">
/**
 * How the viewer appears in ONE community — all of it or none of it.
 *
 * The switch decides what saving does, and nothing else: it is not itself a write, because it
 * would then be the only control on the page that bypasses the save button.
 */
import { onMounted, ref, watch } from 'vue'
import Avatar from '@/ui/Avatar.vue'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import {
  deleteMemberProfile,
  getMemberProfile,
  previewMemberAvatar,
  putMemberProfile,
} from '@/api/profile'
import { useProfileDraft } from '@/profile/useProfileDraft'
import type { IdentityView } from '@/api/types'

const NAME_MAX = 32

const props = defineProps<{ slug: string; communityName: string }>()
const emit = defineEmits<{ saved: [] }>()

const draft = useProfileDraft((body) => previewMemberAvatar(props.slug, body))
const { busy, error, run } = useAction(() => 'Speichern fehlgeschlagen.')
const enabled = ref(false)
/** What applies without an override — the sentence shown while the switch is off. */
const inherited = ref<IdentityView | null>(null)

async function load(): Promise<void> {
  const profile = await getMemberProfile(props.slug)
  enabled.value = profile.displayName !== null || profile.bgColorHex !== null
  draft.seed(profile.displayName, profile.bgColorHex, profile.identity)
  if (!enabled.value) inherited.value = profile.identity
}

onMounted(() => {
  load().catch((e) => console.error('could not load the community profile', e))
})

// Switching on adopts the colour that applies today, so the avatar does not change the moment
// somebody opens the block. Without this the picker would show that colour while the body still
// said "no colour chosen", and saving would quietly drop it.
watch(enabled, (on) => {
  if (on) draft.colorSet.value = true
})

function save(): Promise<void> {
  return run(async () => {
    if (enabled.value) {
      const saved = await putMemberProfile(props.slug, draft.body.value)
      draft.seed(saved.displayName, saved.bgColorHex, saved.identity)
    } else {
      await deleteMemberProfile(props.slug)
      await load()
    }
    emit('saved')
  })
}
</script>

<template>
  <section class="rounded border border-neutral-200 p-4">
    <h2 class="mb-1 text-lg font-semibold">Bei {{ props.communityName }}</h2>

    <label class="mb-3 flex items-center gap-2 text-sm">
      <input
        v-model="enabled"
        data-test="override-switch"
        type="checkbox"
        class="size-4 cursor-pointer"
      />
      Eigener Auftritt hier
    </label>

    <p v-if="!enabled" data-test="override-inherited" class="flex items-center gap-3 text-sm">
      <Avatar v-if="inherited" v-bind="inherited.avatar" size="sm" />
      <span class="text-neutral-600"
        >Hier gilt dein globales Profil: „{{ inherited?.username }}“.</span
      >
    </p>

    <div v-else class="flex items-center gap-3">
      <Avatar
        v-if="draft.preview.value"
        data-test="override-preview"
        v-bind="draft.preview.value.avatar"
      />
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <input
          v-model="draft.name.value"
          data-test="override-name"
          type="text"
          :maxlength="NAME_MAX"
          class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5"
        />
        <input
          v-model="draft.colorInput.value"
          data-test="override-color"
          type="color"
          aria-label="Hintergrundfarbe"
          class="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-300"
          @input="draft.colorSet.value = true"
        />
      </div>
    </div>

    <div class="mt-3">
      <ActionButton data-test="override-save" :busy="busy" @click="save">Speichern</ActionButton>
    </div>
    <p v-if="error" data-test="override-error" class="mt-2 text-sm text-red-600">{{ error }}</p>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/profile/__tests__/CommunityProfileBlock.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/profile
git commit -m "feat(webapp): edit how one appears in a single community

One switch for the block, not one per field: the schema keeps both
columns nullable, so a per-field switch is a later edit to this file
and nothing else.

The switch is not a write. Turning it on prefills with what applies
today — switching on must not silently change how one looks — and the
save button remains the only control that reaches the server."
```

---

### Task 14: Die zwei Seiten, die Route und der Einstieg im Drawer

**Files:**
- Create: `webapp-vue/src/pages/profile.vue`
- Create: `webapp-vue/src/pages/c/[slug]/profile.vue`
- Modify: `webapp-vue/src/communities/routes.ts`
- Modify: `webapp-vue/src/nav/NavDrawer.vue`
- Test: `webapp-vue/src/pages/__tests__/profile.spec.ts`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/profile.spec.ts`
- Test: `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts`

**Interfaces:**
- Consumes: `GlobalProfileBlock` (Task 12), `CommunityProfileBlock` (Task 13), `useCommunityContext` (bestehend), `communityPath` (bestehend).
- Produces: Routen `/profile` und `/c/:slug/profile`; `CommunitySubPage` um `'profile'` erweitert.

- [ ] **Step 1: Write the failing tests**

`webapp-vue/src/pages/__tests__/profile.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: { template: '<div data-test="global-block" />' },
}))

describe('/profile', () => {
  it('shows the global block and nothing community-bound', async () => {
    const Page = (await import('@/pages/profile.vue')).default
    const w = mount(Page)
    expect(w.find('[data-test="global-block"]').exists()).toBe(true)
    expect(w.find('[data-test="community-block"]').exists()).toBe(false)
  })
})
```

`webapp-vue/src/pages/c/[slug]/__tests__/profile.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const refresh = vi.fn().mockResolvedValue(undefined)
vi.mock('@/communities/context', () => ({
  useCommunityContext: () => ({
    community: { value: { slug: 'team', name: 'Team' } },
    refresh,
  }),
}))
vi.mock('@/profile/GlobalProfileBlock.vue', () => ({
  default: { template: '<div data-test="global-block" />' },
}))
vi.mock('@/profile/CommunityProfileBlock.vue', () => ({
  default: {
    template: '<button data-test="community-block" @click="$emit(\'saved\')" />',
    props: ['slug', 'communityName'],
    emits: ['saved'],
  },
}))

describe('/c/:slug/profile', () => {
  it('shows the community block above the global one', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    const html = w.html()
    expect(html.indexOf('community-block')).toBeLessThan(html.indexOf('global-block'))
  })

  it('refreshes the community once the override was saved, so the header follows', async () => {
    const Page = (await import('@/pages/c/[slug]/profile.vue')).default
    const w = mount(Page)
    await w.get('[data-test="community-block"]').trigger('click')
    expect(refresh).toHaveBeenCalled()
  })
})
```

An `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts` anhängen:

```ts
  it('offers the profile, pointing at the community one while inside a community', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
      viewerIdentity: null,
    }
    const w = render()
    await flushPromises()

    expect(w.get('[data-test="edit-profile"]').attributes('href')).toBe(
      communityPath('team', 'profile'),
    )
  })

  it('points at the global profile outside a community', async () => {
    activeCommunity.value = null
    const w = render()
    await flushPromises()

    expect(w.get('[data-test="edit-profile"]').attributes('href')).toBe('/profile')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pages/__tests__/profile.spec.ts src/pages/c/\[slug\]/__tests__/profile.spec.ts src/nav/__tests__/NavDrawer.spec.ts`
Expected: FAIL — beide Seiten fehlen, und der Drawer hat keinen `edit-profile`-Haken.

- [ ] **Step 3: Write the pages**

`webapp-vue/src/pages/profile.vue`:

```vue
<script setup lang="ts">
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
</script>

<template>
  <section class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="text-xl font-semibold">Profil</h1>
    <GlobalProfileBlock />
  </section>
</template>
```

`webapp-vue/src/pages/c/[slug]/profile.vue`:

```vue
<script setup lang="ts">
/**
 * The community-bound half sits on top: inside a community, that is the identity that applies here
 * and now. Refreshing after a save is what lets the header follow — the shell owns that data.
 */
import CommunityProfileBlock from '@/profile/CommunityProfileBlock.vue'
import GlobalProfileBlock from '@/profile/GlobalProfileBlock.vue'
import { useCommunityContext } from '@/communities/context'

const { community, refresh } = useCommunityContext()

function onSaved(): void {
  refresh().catch((e) => console.error('could not refresh the community', e))
}
</script>

<template>
  <section class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="text-xl font-semibold">Profil</h1>
    <CommunityProfileBlock
      :slug="community.slug"
      :community-name="community.name"
      @saved="onSaved"
    />
    <GlobalProfileBlock />
  </section>
</template>
```

- [ ] **Step 4: Extend the route scheme**

`webapp-vue/src/communities/routes.ts`:

```ts
export type CommunitySubPage = 'members' | 'requests' | 'settings' | 'profile'
```

- [ ] **Step 5: Add the drawer entry**

In `NavDrawer.vue` im `<script setup>`:

```ts
const profilePath = computed(() =>
  activeCommunity.value ? communityPath(activeCommunity.value.slug, 'profile') : '/profile',
)
```

und im `nav-foot`, direkt nach dem `<div class="border-t border-neutral-200" />` und **vor** dem Super-Admin-Eintrag:

```html
        <RouterLink :to="profilePath" data-test="edit-profile" :class="LINK">
          Profil bearbeiten
        </RouterLink>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/pages src/nav`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/pages webapp-vue/src/communities/routes.ts webapp-vue/src/nav
git commit -m "feat(webapp): a way into one's own profile, from the drawer's foot

Two routes rather than one context-sensitive page: the URL itself says
which community is meant, which survives a reload and can be sent to
somebody. Inside a community the community block sits on top, because
that is the identity that applies here and now."
```

---

### Task 15: Der Header-Avatar folgt der Community

**Files:**
- Modify: `webapp-vue/src/communities/context.ts`
- Modify: `webapp-vue/src/communities/routeData.ts`
- Modify: `webapp-vue/src/nav/NavDrawer.vue`
- Test: `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts`
- Test: `webapp-vue/src/communities/__tests__/routeData.spec.ts`

**Interfaces:**
- Consumes: `CommunityResponse.viewerIdentity` (Task 8, Typ aus Task 11).
- Produces: `ActiveCommunity.viewerIdentity: IdentityView | null`.

- [ ] **Step 1: Write the failing test**

An `NavDrawer.spec.ts` anhängen:

```ts
  it('draws the community identity in the header while inside a community', async () => {
    activeCommunity.value = {
      slug: 'team',
      name: 'Team',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
      viewerIdentity: {
        username: 'Zwerg',
        avatar: { shortName: 'ZWRG', bgColorHex: '#8e44ad' },
      },
    }
    const w = render()
    await flushPromises()

    expect(w.get('[data-test="nav-toggle"]').text()).toBe('ZWRG')
  })

  it('falls back to the global avatar where there is no community identity', async () => {
    activeCommunity.value = null
    const w = render()
    await flushPromises()

    expect(w.get('[data-test="nav-toggle"]').text()).toBe('OCTO')
  })
```

An `routeData.spec.ts` anhängen:

```ts
  it('publishes the viewer identity into the header state', () => {
    publishCommunity({
      ...communityFixture,
      viewerIdentity: { username: 'Zwerg', avatar: { shortName: 'ZWRG', bgColorHex: '#8e44ad' } },
    })

    expect(activeCommunity.value?.viewerIdentity?.avatar.shortName).toBe('ZWRG')
  })
```

(`communityFixture` ist das in dieser Spec bereits vorhandene `CommunityResponse`-Literal; es bekommt in Task 11 bereits `viewerIdentity: null`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/nav src/communities/__tests__/routeData.spec.ts`
Expected: FAIL — `viewerIdentity` ist kein Feld von `ActiveCommunity`.

- [ ] **Step 3: Carry it in the header state**

`webapp-vue/src/communities/context.ts` — `ActiveCommunity` ergänzen:

```ts
  /** How the viewer appears HERE; null when there is no community-bound identity. */
  viewerIdentity: IdentityView | null
```

Import `IdentityView` aus `@/api/types` ergänzen.

`webapp-vue/src/communities/routeData.ts` — in `publishCommunity`:

```ts
    viewerIdentity: c.viewerIdentity,
```

- [ ] **Step 4: Draw it**

In `NavDrawer.vue` im `<script setup>`:

```ts
// What the header shows is what the others see right now: inside a community that is the
// community-bound identity, everywhere else the global one.
const toggleAvatar = computed(() => activeCommunity.value?.viewerIdentity?.avatar ?? props.user.avatar)
```

und im Template `<Avatar v-bind="user.avatar" size="sm" />` ersetzen durch:

```html
      <Avatar v-bind="toggleAvatar" size="sm" />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Type-check and lint the whole frontend**

Run: `pnpm lint && pnpm vue-tsc -b`
Expected: PASS.

- [ ] **Step 7: Run the whole backend suite once more**

Run: `cd ../core && ./mvnw test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/src
git commit -m "feat(webapp): the header avatar shows what the others see

Inside a community that is the community-bound identity, everywhere
else the global one. Otherwise the roster and the top right corner
would disagree about the same person, and the profile form would be the
only place an override was ever visible."
```

---

## Self-Review

**Spec-Abdeckung**

| Spec-Abschnitt | Task |
|---|---|
| Einstieg: Drawer-Fußzeile „Profil bearbeiten“ | 14 |
| Zwei Routen `/profile` und `/c/‹slug›/profile` | 14 |
| Migration + zwei nullbare Spalten | 3 |
| Auflösung pro Feld | 2, 4 |
| `Avatar.of` mit Override, `iam` ohne Community-Wissen | 2 |
| `MemberIdentity` / `MemberIdentityQuery` / `MemberIdentityResolver` | 4 |
| `RosterService`, `RoundResponses`, `LabService` umgestellt | 5, 6, 7 |
| `MeResponse.displayName` | 1 |
| `GET`/`PUT`/`DELETE` `…/me/profile`, 404 für Fremde und für Super-Admins ohne Zeile | 9 |
| `CommunityResponse.viewerIdentity`, nullbar | 8 |
| `ProfileFields`, Trimmen, 32 Zeichen, `#rrggbb` klein | 1 |
| Vorschau-Endpunkte, kein eigener Algorithmus, Parität als Test | 10 |
| Blöcke, Feldpaar in einer Zeile, „Automatisch“, Schalter schreibt nicht | 12, 13 |
| Entprellung 300 ms, laufende Nummer, stiller Fehlschlag | 11 |
| `ActionButton` + eigener Fehlerbereich, kein grüner Zustand | 12, 13 |
| Header-Avatar folgt der Community | 15 |
| Admin- und Super-Admin-Listen unverändert global | — (bewußt keine Änderung; Task 6/7 fassen `MemberController.members` nicht an) |

**Typkonsistenz**

`MemberIdentity(username, avatar)` heißt in Kotlin und auf der Wire gleich; im Frontend heißt derselbe Typ `IdentityView` (Task 11), weil `MemberProfileResponse` daneben steht und ein zweites `MemberIdentity` im TS-Namensraum nur verwirrt. `AvatarPreviewResponse` (iam) und `MemberIdentity` (community) serialisieren beide zu `{username, avatar}` — das Frontend hat dafür genau einen Typ.

**Reihenfolge-Fallen**

Task 8 ändert `toResponse` und bricht damit Aufrufer in mehreren Backend-Tests; Schritt 4 dort deckt das ab. Task 11 ergänzt zwei Pflichtfelder an `MeResponse` und `CommunityResponse` und bricht damit Frontend-Fixtures; Schritt 7 dort deckt das ab.

---

## Execution Handoff

Der Plan liegt in `docs/superpowers/plans/2026-08-17-member-profile.md`.
