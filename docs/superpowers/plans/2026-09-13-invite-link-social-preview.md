# Kurzer Einladungscode & Link-Vorschau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Einladungslink schrumpft von 43 auf 6 Zeichen, und geteilte Links (`/`, `/c/<slug>`, `/join/<code>`) bekommen in Messengern eine Vorschau mit Community-Name und Countdown.

**Architecture:** Zwei getrennte Stränge. (1) `InviteCodes` erzeugt und normalisiert Crockford-Base32-Codes; `MembershipService` würfelt bei Kollision neu und bekommt mit `peek`/`InviteQuery` zwei Lesewege — einen mit Fehlergrund für die SPA, einen nullbaren für andere Module. (2) Ein neues Modulith-Modul `socialpreview` liefert unter `/api/preview/**` ein reines `<head>`-Dokument; `countdown-web`s Caddy schickt **nur** Crawler-User-Agents dorthin, jeder Browser läuft unverändert in die SPA. Ein Rate-Limit-Filter im `iam`-Modul bremst beide offenen Endpunkte, und zwar anhand einer Client-IP, die Caddy selbst setzt.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest matchers + mockk + MockMvc Kotlin DSL + Testcontainers · Vue 3 + TypeScript strict + Vitest + @vue/test-utils · Caddy 2.

**Spec:** [`docs/superpowers/specs/2026-09-13-invite-link-social-preview-design.md`](../specs/2026-09-13-invite-link-social-preview-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare und Commit-Messages **englisch**. User-facing Text (Frontend *und* die Vorschau-Texte des Backends) **deutsch**, und deutsche Anführungszeichen sind `„…“` — niemals `"`. Spec/Plan bleiben deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — siehe [`.claude/guidelines/kotlin.md`](../../../.claude/guidelines/kotlin.md).
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldThrow`), mockk/`@MockkBean`, MockMvc **Kotlin DSL** (`mockMvc.get(...) { }.andExpect { }`). Nicht Mockito, nicht `kotlin.test`, nicht `MockMvcRequestBuilders`. Frontend: Vitest `vi`, nicht mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung. Commits klein.
- **Modulgrenzen:** `socialpreview → community`, `socialpreview → countdown`. Nie umgekehrt, und `socialpreview` importiert **nichts** aus einem `internal`-Paket. `ModularityTests` muss grün bleiben.
- **Keine redundanten Inline-Kommentare.** Begründungen gehören in die Commit-Message und in die Guidelines, nicht als Grabstein neben die Zeile.
- **Diese Texte sind wörtlich festgelegt** (Spec, „Was die Vorschau sagt"):
  - generisch: Titel `Countdown`, Beschreibung `Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern`
  - Community mit laufendem Countdown: Titel = Name, Beschreibung `T-58: Spiel mit!`
  - Community ohne Termin / nach dem Start: Titel = Name, Beschreibung `Spiel mit!`
  - Einladung: Titel = Name, Beschreibung `Du bist eingeladen — T-58: Spiel mit!`
- Backend-Befehle laufen aus `core/`, Frontend-Befehle aus `webapp-vue/`.

## File Structure

**Backend, neu:**

| Datei | Verantwortung |
|---|---|
| `community/internal/InviteCodes.kt` | Alphabet, Erzeugung, Normalisierung. Pur, kein Spring. |
| `community/InviteQuery.kt` | Exponierte Modul-API: Community hinter einem gültigen Code, sonst `null`. |
| `socialpreview/internal/PreviewPage.kt` | Ein Vorschau-Dokument: Titel, Beschreibung, Pfad → HTML. Pur. |
| `socialpreview/internal/PreviewService.kt` | Auflösung Slug/Code → `PreviewPage`, inkl. Countdown-Teil. |
| `socialpreview/internal/PreviewController.kt` | `/api/preview/**`, Content-Type und Cache-Header. |
| `iam/internal/PublicRateLimitFilter.kt` | Bremse für die offenen Pfade, plus `PublicRateLimitProperties`. |

**Backend, geändert:** `community/internal/MembershipService.kt` (kurze Codes, `peek`, `InviteQuery`), `community/internal/MemberController.kt` (+ GET-Endpunkt), `community/internal/CommunityDtos.kt` (+ DTO), `iam/internal/SecurityConfig.kt` (permitAll + Properties).

**Frontend, geändert:** `src/pages/join/[token].vue`, `src/api/communities.ts`, `src/api/types.ts`, `src/pages/join/__tests__/token.spec.ts`.

**Infrastruktur:** `deploy/Caddyfile`, `.claude/guidelines/deployment-edge.md`, `.claude/guidelines/security-and-auth.md`.

---

### Task 1: `InviteCodes` — Alphabet, Erzeugung, Normalisierung

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/InviteCodes.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/InviteCodesTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: `object InviteCodes` mit `const val LENGTH: Int = 6`, `fun generate(random: SecureRandom): String`, `fun normalize(raw: String): String`.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/community/InviteCodesTest.kt`:

```kotlin
package org.unividuell.countdown.core.community

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.internal.InviteCodes
import java.security.SecureRandom

class InviteCodesTest {

    private val alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    @Test
    fun `generates six characters out of the Crockford alphabet`() {
        val random = SecureRandom()
        repeat(500) {
            val code = InviteCodes.generate(random)
            code.length shouldBe InviteCodes.LENGTH
            code.all { it in alphabet } shouldBe true
        }
    }

    @Test
    fun `normalize upper-cases and repairs the confusable letters`() {
        InviteCodes.normalize("a7k2mp") shouldBe "A7K2MP"
        InviteCodes.normalize("iLo123") shouldBe "110123"
    }

    @Test
    fun `normalize leaves an already normal code alone`() {
        InviteCodes.normalize("A7K2MP") shouldBe "A7K2MP"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=InviteCodesTest`
Expected: FAIL — `Unresolved reference: InviteCodes`.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/community/internal/InviteCodes.kt`:

```kotlin
package org.unividuell.countdown.core.community.internal

import java.security.SecureRandom

/**
 * Invite codes in Crockford Base32: six characters out of 32, so 32^6 = 1.07e9 combinations.
 *
 * The alphabet leaves out I, L, O and U — there is nothing a reader can mistake for 1 or 0, and
 * no code accidentally spells a word. [normalize] undoes the two mistakes a typist still makes:
 * lower case, and writing the omitted letters back in.
 */
object InviteCodes {

    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    const val LENGTH = 6

    fun generate(random: SecureRandom): String =
        (1..LENGTH).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString(separator = "")

    fun normalize(raw: String): String =
        raw.uppercase()
            .map {
                when (it) {
                    'I', 'L' -> '1'
                    'O' -> '0'
                    else -> it
                }
            }
            .joinToString(separator = "")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=InviteCodesTest`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/InviteCodes.kt core/src/test/kotlin/org/unividuell/countdown/core/community/InviteCodesTest.kt
git commit -m "Add Crockford Base32 invite codes"
```

---

### Task 2: `MembershipService` gibt kurze Codes aus und liest sie tolerant

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/community/InviteQuery.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MembershipService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MembershipServiceInviteTest.kt`

**Interfaces:**
- Consumes: `InviteCodes.generate(random)`, `InviteCodes.normalize(raw)`, `InviteCodes.LENGTH` aus Task 1.
- Produces:
  - `interface InviteQuery { fun communityOfValidInvite(code: String): Community? }` im Paket `org.unividuell.countdown.core.community`.
  - `MembershipService.peek(code: String): Community` — wirft `InviteNotFoundException` (404) / `InviteExpiredException` (410).
  - `MembershipService` implementiert `InviteQuery`.

- [ ] **Step 1: Write the failing test**

An `MembershipServiceInviteTest` anhängen (die vier bestehenden Tests bleiben unverändert):

```kotlin
    @Test
    fun `generated codes are six characters long`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        service.generateInvite(cid).token.length shouldBe 6
    }

    @Test
    fun `accept finds the invite from a lower-cased and mistyped code`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        // what a typist produces from a code read aloud: lower case, and O/I for 0/1
        val mistyped = code.lowercase().replace(oldChar = '0', newChar = 'O').replace(oldChar = '1', newChar = 'l')
        service.accept(mistyped, user("joiner").id!!).shouldBeInstanceOf<AcceptResult.JoinedPending>()
    }

    @Test
    fun `a legacy long token still resolves verbatim`() {
        val c = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team")
        val legacy = "NHsgFS5e3wlKFhSdSGSQ4U2aNjjBlECa5bhGsmIsic0"
        communities.save(
            communities.findBySlug("team")!!
                .copy(inviteToken = legacy, inviteTokenExpiresAt = Instant.now().plus(1, ChronoUnit.DAYS)),
        )
        service.accept(legacy, user("joiner").id!!).shouldBeInstanceOf<AcceptResult.JoinedPending>()
        c.id!! shouldBe communities.findByInviteToken(legacy)!!.id
    }

    @Test
    fun `peek returns the community and reports why a code fails`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        service.peek(code).name shouldBe "Team"
        shouldThrow<InviteNotFoundException> { service.peek("ZZZZZZ") }
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        shouldThrow<InviteExpiredException> { service.peek(code) }
    }

    @Test
    fun `communityOfValidInvite is null for an unknown and for an expired code`() {
        val cid = communityService.create(creatorUserId = user("admin").id!!, rawName = "Team").id!!
        val code = service.generateInvite(cid).token
        service.communityOfValidInvite(code)!!.name shouldBe "Team"
        service.communityOfValidInvite("ZZZZZZ") shouldBe null
        communities.save(communities.findBySlug("team")!!.copy(inviteTokenExpiresAt = Instant.now().minusSeconds(1)))
        service.communityOfValidInvite(code) shouldBe null
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=MembershipServiceInviteTest`
Expected: FAIL — `Unresolved reference: peek` / `communityOfValidInvite`.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/community/InviteQuery.kt`:

```kotlin
package org.unividuell.countdown.core.community

/**
 * Read-only invite lookup for other modules. `null` covers both „unknown" and „expired": a
 * consumer outside this module has no business telling the two apart — see the social preview,
 * which must not become an oracle for which codes exist.
 */
interface InviteQuery {
    fun communityOfValidInvite(code: String): Community?
}
```

In `MembershipService.kt`: den Import `java.util.Base64` entfernen, `InviteQuery` implementieren und die drei Lesewege ergänzen.

```kotlin
@Service
open class MembershipService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) : InviteQuery {
    private val random = SecureRandom()
    private val inviteTtl = java.time.Duration.ofDays(7)

    @Transactional
    open fun generateInvite(communityId: UUID): InviteInfo {
        val community = communities.findById(communityId).orElseThrow()
        val token = freshCode()
        val expiresAt = Instant.now().plus(inviteTtl)
        communities.save(community.copy(inviteToken = token, inviteTokenExpiresAt = expiresAt, updatedAt = Instant.now()))
        return InviteInfo(token = token, expiresAt = expiresAt)
    }
```

Darunter, neben `accept`:

```kotlin
    @Transactional
    open fun accept(token: String, userId: UUID): AcceptResult {
        val community = peek(token)
        val communityId = community.id!!
        val existing = members.findByCommunityIdAndUserId(communityId, userId)
        return when (existing?.status) {
            MemberStatus.ACTIVE -> AcceptResult.AlreadyActive(community)
            MemberStatus.PENDING -> AcceptResult.AlreadyPending(community)
            null -> {
                members.save(CommunityMember(communityId = communityId, userId = userId, status = MemberStatus.PENDING))
                AcceptResult.JoinedPending(community)
            }
        }
    }

    /** The lookup that says *why* it failed — the join page shows 404 and 410 differently. */
    @Transactional(readOnly = true)
    open fun peek(code: String): Community {
        val community = findByCode(code) ?: throw InviteNotFoundException()
        if (community.inviteTokenExpiresAt?.isBefore(Instant.now()) != false) throw InviteExpiredException()
        return community
    }

    @Transactional(readOnly = true)
    override fun communityOfValidInvite(code: String): Community? {
        val community = findByCode(code) ?: return null
        return community.takeIf { it.inviteTokenExpiresAt?.isAfter(Instant.now()) == true }
    }

    /**
     * Only codes of the current length get the reading repair; tokens handed out before this
     * change are 43 Base64 characters and must keep matching exactly as they were stored.
     */
    private fun findByCode(code: String): Community? =
        if (code.length == InviteCodes.LENGTH) communities.findByInviteToken(InviteCodes.normalize(code))
        else communities.findByInviteToken(code)

    /** The column is UNIQUE, so a clash must not reach the caller — with 32^6 it is rare. */
    private fun freshCode(): String {
        repeat(CODE_ATTEMPTS) {
            val candidate = InviteCodes.generate(random)
            if (communities.findByInviteToken(candidate) == null) return candidate
        }
        throw IllegalStateException("no free invite code after $CODE_ATTEMPTS attempts")
    }
```

Und am Ende der Klasse, neben `guardLastAdmin`:

```kotlin
    companion object {
        private const val CODE_ATTEMPTS = 10
    }
```

Import ergänzen: `import org.unividuell.countdown.core.community.InviteQuery`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=MembershipServiceInviteTest`
Expected: PASS (9 Tests — vier alte, fünf neue).

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/ core/src/test/kotlin/org/unividuell/countdown/core/community/MembershipServiceInviteTest.kt
git commit -m "Hand out six-character invite codes"
```

---

### Task 3: Ein anonymer Besucher darf den eingeladenen Namen lesen

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityDtos.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt:34-39`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberControllerTest.kt`

**Interfaces:**
- Consumes: `MembershipService.peek(code)` aus Task 2.
- Produces: `GET /api/communities/join/{code}` → `200 {"name": "Team"}`, `404` unbekannt, `410` abgelaufen, ohne Session erreichbar. DTO `InvitePeekResponse(val name: String)`.

- [ ] **Step 1: Write the failing test**

An `MemberControllerTest` anhängen:

```kotlin
    @Test
    fun `an anonymous visitor reads the invited community name and nothing else`() {
        every { membership.peek("A7K2MP") } returns community("team")
        mockMvc.get("/api/communities/join/A7K2MP")
            .andExpect {
                status { isOk() }
                jsonPath("$.name") { value("Team") }
                jsonPath("$.slug") { doesNotExist() }
                jsonPath("$.id") { doesNotExist() }
            }
    }

    @Test
    fun `peek of an expired code returns 410 without a session`() {
        every { membership.peek("A7K2MP") } throws InviteExpiredException()
        mockMvc.get("/api/communities/join/A7K2MP").andExpect { status { isGone() } }
    }

    @Test
    fun `peek of an unknown code returns 404 without a session`() {
        every { membership.peek("ZZZZZZ") } throws InviteNotFoundException()
        mockMvc.get("/api/communities/join/ZZZZZZ").andExpect { status { isNotFound() } }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=MemberControllerTest`
Expected: FAIL — `401`, weil der Pfad noch `authenticated` verlangt.

- [ ] **Step 3: Write minimal implementation**

In `CommunityDtos.kt`, neben `InviteResponse`:

```kotlin
/** What an anonymous visitor may learn from an invite link: who is inviting. Nothing else. */
data class InvitePeekResponse(val name: String)
```

In `MemberController.kt`, direkt über `join`:

```kotlin
    /**
     * The invitation as an anonymous visitor sees it, so the join page can name the community
     * before sending anyone through GitHub. Open by design; the brake lives in SecurityConfig.
     */
    @GetMapping("/join/{code}")
    fun peekInvite(@PathVariable code: String): InvitePeekResponse =
        InvitePeekResponse(name = membership.peek(code).name)
```

In `SecurityConfig.kt`, in `authorizeHttpRequests` **vor** `authorize(anyRequest, authenticated)`:

```kotlin
                // GET only: reading who invites you needs no session, accepting the invite does.
                authorize(HttpMethod.GET, "/api/communities/join/*", permitAll)
```

Import ergänzen: `import org.springframework.http.HttpMethod`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=MemberControllerTest`
Expected: PASS — die drei neuen Tests plus alle bestehenden.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/community/internal/ core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt core/src/test/kotlin/org/unividuell/countdown/core/community/MemberControllerTest.kt
git commit -m "Let an anonymous visitor see who invited them"
```

---

### Task 4: `PreviewPage` — ein Vorschau-Dokument als reine Funktion

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewPage.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewPageTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: `data class PreviewPage(val title: String, val description: String, val path: String)` mit `fun html(baseUrl: String): String` und `companion object { fun generic(): PreviewPage }`.

**Hinweis zur Modulstruktur:** Das Paket `socialpreview` ist damit angelegt. Spring Modulith leitet Module aus den direkten Unterpaketen von `CoreApplication` ab — es braucht **keine** `package-info.java` und keine `@ApplicationModule`-Annotation, so wie `countdown` und `community` auch keine haben.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewPageTest.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage

class PreviewPageTest {

    @Test
    fun `renders the tags a messenger reads`() {
        val html = PreviewPage(title = "Hütte Hütte", description = "T-58: Spiel mit!", path = "/c/huettehuette")
            .html(baseUrl = "https://countdown.unividuell.org")

        html shouldContain "<title>Hütte Hütte</title>"
        html shouldContain """<meta property="og:title" content="Hütte Hütte">"""
        html shouldContain """<meta property="og:description" content="T-58: Spiel mit!">"""
        html shouldContain """<meta property="og:url" content="https://countdown.unividuell.org/c/huettehuette">"""
        html shouldContain """<html lang="de">"""
    }

    @Test
    fun `escapes a name that would otherwise break out of the attribute`() {
        val html = PreviewPage(title = """Team "X" <b>""", description = "Spiel mit!", path = "/c/x")
            .html(baseUrl = "https://example.org")

        html shouldNotContain """content="Team "X""""
        html shouldContain "&quot;"
        html shouldNotContain "<b>"
    }

    @Test
    fun `the generic page speaks for the app and points at the root`() {
        val page = PreviewPage.generic()
        page.title shouldBe "Countdown"
        page.description shouldBe "Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern"
        page.path shouldBe "/"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=PreviewPageTest`
Expected: FAIL — `Unresolved reference: socialpreview`.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewPage.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.web.util.HtmlUtils

/**
 * One link preview, as a document with nothing but a head.
 *
 * No human ever sees this: the edge sends browsers to the SPA and only crawlers here. A crawler
 * reads the first response and stops — it runs no JavaScript — so everything it may learn has to
 * stand in this markup.
 */
data class PreviewPage(val title: String, val description: String, val path: String) {

    fun html(baseUrl: String): String {
        val safeTitle = HtmlUtils.htmlEscape(title)
        val safeDescription = HtmlUtils.htmlEscape(description)
        return """
            <!doctype html>
            <html lang="de">
            <head>
            <meta charset="utf-8">
            <title>$safeTitle</title>
            <meta name="description" content="$safeDescription">
            <meta property="og:title" content="$safeTitle">
            <meta property="og:description" content="$safeDescription">
            <meta property="og:url" content="$baseUrl$path">
            <meta property="og:type" content="website">
            <meta property="og:locale" content="de_DE">
            <meta name="twitter:card" content="summary">
            </head>
            <body></body>
            </html>
        """.trimIndent()
    }

    companion object {
        /**
         * The app talking about itself — and the answer to every case that must not reveal
         * whether a community or an invite exists at all. Both are the same bytes on purpose.
         */
        fun generic() = PreviewPage(
            title = "Countdown",
            description = "Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern",
            path = "/",
        )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=PreviewPageTest`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/ core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/
git commit -m "Render a link preview document"
```

---

### Task 5: `PreviewService` — Slug und Code zu einer Seite auflösen

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewServiceTest.kt`

**Interfaces:**
- Consumes: `PreviewPage` (Task 4), `InviteQuery.communityOfValidInvite(code)` (Task 2), `CommunityQuery.findBySlug(slug)`, `CountdownQuery.currentRound(communityId, now)`, `Round(number, label, start, end)`.
- Produces: `class PreviewService(communities: CommunityQuery, invites: InviteQuery, countdown: CountdownQuery, clock: Clock)` mit `fun forCommunity(slug: String): PreviewPage` und `fun forInvite(code: String): PreviewPage`.

**Warum ein reiner mockk-Test und kein `@SpringBootTest`:** `CommunityQueryService` implementiert `CommunityQuery` **und** `MembershipQuery` in einer Bean. Ein `@MockkBean CommunityQuery` würde die Definition ersetzen und `MembershipQuery` aus dem Kontext entfernen — `CountdownService` bekäme seine Abhängigkeit nicht mehr und der Kontext bräche. Der Service hängt ohnehin nur an Interfaces; er wird direkt konstruiert.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.InviteQuery
import org.unividuell.countdown.core.countdown.CountdownQuery
import org.unividuell.countdown.core.countdown.Round
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage
import org.unividuell.countdown.core.socialpreview.internal.PreviewService
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PreviewServiceTest {

    private val communities = mockk<CommunityQuery>()
    private val invites = mockk<InviteQuery>()
    private val countdown = mockk<CountdownQuery>()
    private val now = Instant.parse("2026-09-13T10:00:00Z")
    private val service = PreviewService(
        communities = communities,
        invites = invites,
        countdown = countdown,
        clock = Clock.fixed(now, ZoneOffset.UTC),
    )

    private val id = UUID.randomUUID()
    private val community = Community(id = id, name = "Hütte Hütte", slug = "huettehuette", createdBy = UUID.randomUUID())

    private fun round(number: Int) = Round(
        number = number,
        label = if (number >= 0) "T-$number" else "T+${-number}",
        start = now,
        end = now,
    )

    @Test
    fun `a community with a running countdown shows its name and round`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(58)

        service.forCommunity("huettehuette") shouldBe PreviewPage(
            title = "Hütte Hütte",
            description = "T-58: Spiel mit!",
            path = "/c/huettehuette",
        )
    }

    @Test
    fun `a community without a date drops the round part`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns null

        service.forCommunity("huettehuette").description shouldBe "Spiel mit!"
    }

    @Test
    fun `a community past its start drops the round part`() {
        every { communities.findBySlug("huettehuette") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(-3)

        service.forCommunity("huettehuette").description shouldBe "Spiel mit!"
    }

    @Test
    fun `an unknown slug is indistinguishable from the start page`() {
        every { communities.findBySlug("nope") } returns null

        service.forCommunity("nope") shouldBe PreviewPage.generic()
    }

    @Test
    fun `a valid invite names the community and says it is an invitation`() {
        every { invites.communityOfValidInvite("A7K2MP") } returns community
        every { countdown.currentRound(communityId = id, now = now) } returns round(58)

        service.forInvite("A7K2MP") shouldBe PreviewPage(
            title = "Hütte Hütte",
            description = "Du bist eingeladen — T-58: Spiel mit!",
            path = "/join/A7K2MP",
        )
    }

    @Test
    fun `an unknown or expired code is indistinguishable from the start page`() {
        every { invites.communityOfValidInvite("ZZZZZZ") } returns null

        service.forInvite("ZZZZZZ") shouldBe PreviewPage.generic()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=PreviewServiceTest`
Expected: FAIL — `Unresolved reference: PreviewService`.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewService.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.InviteQuery
import org.unividuell.countdown.core.countdown.CountdownQuery
import java.time.Clock
import java.util.UUID

/**
 * Resolves a shared path into the preview a messenger gets. Anything that does not resolve —
 * unknown slug, unknown or expired code — answers with the generic page, byte for byte, so the
 * preview cannot be used to find out what exists.
 */
@Service
@Transactional(readOnly = true)
class PreviewService(
    private val communities: CommunityQuery,
    private val invites: InviteQuery,
    private val countdown: CountdownQuery,
    private val clock: Clock,
) {

    fun forCommunity(slug: String): PreviewPage {
        val community = communities.findBySlug(slug) ?: return PreviewPage.generic()
        return PreviewPage(
            title = community.name,
            description = describe(communityId = requireNotNull(community.id), lead = null),
            path = "/c/${community.slug}",
        )
    }

    fun forInvite(code: String): PreviewPage {
        val community = invites.communityOfValidInvite(code) ?: return PreviewPage.generic()
        return PreviewPage(
            title = community.name,
            description = describe(communityId = requireNotNull(community.id), lead = "Du bist eingeladen"),
            path = "/join/$code",
        )
    }

    /** A negative round number is at or past the start: there is nothing left to count down. */
    private fun describe(communityId: UUID, lead: String?): String {
        val round = countdown.currentRound(communityId = communityId, now = clock.instant())
        val tail = if (round != null && round.number >= 0) "${round.label}: Spiel mit!" else "Spiel mit!"
        return if (lead == null) tail else "$lead — $tail"
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=PreviewServiceTest`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewService.kt core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewServiceTest.kt
git commit -m "Resolve a shared path into its preview"
```

---

### Task 6: `/api/preview/**` ausliefern

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewController.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewControllerTest.kt`

**Interfaces:**
- Consumes: `PreviewService.forCommunity(slug)`, `PreviewService.forInvite(code)` (Task 5), `PreviewPage.generic()`, `PreviewPage.html(baseUrl)` (Task 4).
- Produces: `GET /api/preview/` · `/api/preview/c/{slug}` (+ Untertiefen) · `/api/preview/join/{code}` → `200 text/html`, `Cache-Control: max-age=600, public`, ohne Session erreichbar.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage
import org.unividuell.countdown.core.socialpreview.internal.PreviewService

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class PreviewControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var preview: PreviewService

    @Test
    fun `the root answers generically, without a session`() {
        mockMvc.get("/api/preview/").andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith(MediaType.TEXT_HTML) }
            header { string("Cache-Control", "max-age=600, public") }
            content { string(containsString("<title>Countdown</title>")) }
            content { string(containsString("Spiel jeden Tag ein Mini-Game")) }
        }
    }

    @Test
    fun `a community path carries the name and the round`() {
        every { preview.forCommunity("huettehuette") } returns
            PreviewPage(title = "Hütte Hütte", description = "T-58: Spiel mit!", path = "/c/huettehuette")

        mockMvc.get("/api/preview/c/huettehuette").andExpect {
            status { isOk() }
            content { string(containsString("""<meta property="og:title" content="Hütte Hütte">""")) }
            content { string(containsString("T-58: Spiel mit!")) }
            content { string(containsString("""content="http://localhost/c/huettehuette"""")) }
        }
    }

    @Test
    fun `a path below the community resolves to the same community`() {
        every { preview.forCommunity("huettehuette") } returns
            PreviewPage(title = "Hütte Hütte", description = "Spiel mit!", path = "/c/huettehuette")

        mockMvc.get("/api/preview/c/huettehuette/members").andExpect {
            status { isOk() }
            content { string(containsString("Hütte Hütte")) }
        }
    }

    @Test
    fun `an invite path names the inviting community`() {
        every { preview.forInvite("A7K2MP") } returns
            PreviewPage(title = "Hütte Hütte", description = "Du bist eingeladen — T-58: Spiel mit!", path = "/join/A7K2MP")

        mockMvc.get("/api/preview/join/A7K2MP").andExpect {
            status { isOk() }
            content { string(containsString("Du bist eingeladen")) }
        }
    }

    @Test
    fun `the document carries nothing but the preview`() {
        // path "/" on purpose: og:url would otherwise echo the code the crawler just asked for,
        // which is harmless but would make the assertion below measure the wrong thing
        every { preview.forInvite("A7K2MP") } returns
            PreviewPage(title = "Hütte Hütte", description = "Du bist eingeladen — T-58: Spiel mit!", path = "/")

        mockMvc.get("/api/preview/join/A7K2MP").andExpect {
            // payload hygiene: a crawler is an outsider — it gets a name and a round, nothing else
            content { string(not(containsString("A7K2MP"))) }
            content { string(not(containsString("huettehuette"))) }
            content { string(not(containsString("<script"))) }
            content { string(not(containsString("member"))) }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=PreviewControllerTest`
Expected: FAIL — `401`, der Pfad existiert noch nicht.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewController.kt`:

```kotlin
package org.unividuell.countdown.core.socialpreview.internal

import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import java.time.Duration

/**
 * Link previews for crawlers. `countdown-web` rewrites e.g. `/c/huettehuette` to
 * `/api/preview/c/huettehuette` for known crawler user agents only — a browser never arrives
 * here. The SPA path it was rewritten from is therefore rebuilt for `og:url` rather than read
 * off this request.
 */
@RestController
@RequestMapping("/api/preview")
class PreviewController(private val preview: PreviewService) {

    @GetMapping("/c/{slug}", "/c/{slug}/**")
    fun community(@PathVariable slug: String): ResponseEntity<String> = render(preview.forCommunity(slug))

    @GetMapping("/join/{code}")
    fun invite(@PathVariable code: String): ResponseEntity<String> = render(preview.forInvite(code))

    /** The root, and anything else the edge sends here: the app speaks for itself. */
    @GetMapping("", "/", "/**")
    fun generic(): ResponseEntity<String> = render(PreviewPage.generic())

    private fun render(page: PreviewPage): ResponseEntity<String> {
        val baseUrl = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString()
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_HTML)
            // A messenger caches a preview for days; ten minutes is the most we can ask of it.
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
            .body(page.html(baseUrl = baseUrl))
    }
}
```

In `SecurityConfig.kt`, neben der Regel aus Task 3:

```kotlin
                // Crawler-only in production (the edge decides), but open: a crawler has no session.
                authorize(HttpMethod.GET, "/api/preview/**", permitAll)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=PreviewControllerTest`
Expected: PASS (5 Tests).

- [ ] **Step 5: Run the module boundary check**

Run: `cd core && ./mvnw -q test -Dtest=ModularityTests`
Expected: PASS — `socialpreview` greift nur auf `community` und `countdown` zu, und nur auf deren exponierte Pakete.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/socialpreview/internal/PreviewController.kt core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt core/src/test/kotlin/org/unividuell/countdown/core/socialpreview/PreviewControllerTest.kt
git commit -m "Serve link previews to crawlers"
```

---

### Task 7: Die Bremse für die offenen Pfade

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/PublicRateLimitFilter.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/SecurityConfig.kt:23-26` (`@EnableConfigurationProperties`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/iam/PublicRateLimitFilterTest.kt`

**Interfaces:**
- Consumes: den `Clock`-Bean aus `CoreApplication.kt:15`.
- Produces: `PublicRateLimitProperties(permitsPerMinute: Int = 20)` unter dem Präfix `countdown.public-rate-limit`, und einen Filter, der `/api/preview/**` sowie `/api/communities/join/*` über dem Limit mit `429` beantwortet.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/iam/PublicRateLimitFilterTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration

@Import(TestcontainersConfiguration::class)
@SpringBootTest(properties = ["countdown.public-rate-limit.permits-per-minute=2"])
@AutoConfigureMockMvc
class PublicRateLimitFilterTest(@Autowired val mockMvc: MockMvc) {

    // one IP per test case: the counter is process-wide, and sharing it would couple the cases
    private fun preview(ip: String, forwardedFor: String? = null) =
        mockMvc.get("/api/preview/") {
            header("X-Client-IP", ip)
            forwardedFor?.let { header("X-Forwarded-For", it) }
        }

    @Test
    fun `the request over the limit is refused`() {
        repeat(2) { preview(ip = "203.0.113.1").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.1").andExpect { status { isTooManyRequests() } }
    }

    @Test
    fun `a client-set X-Forwarded-For does not reset the counter`() {
        repeat(2) { preview(ip = "203.0.113.2", forwardedFor = "1.2.3.4").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.2", forwardedFor = "5.6.7.8").andExpect { status { isTooManyRequests() } }
    }

    @Test
    fun `another client is unaffected`() {
        repeat(2) { preview(ip = "203.0.113.3").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.4").andExpect { status { isOk() } }
    }

    @Test
    fun `a path outside the open ones is not counted`() {
        repeat(5) {
            mockMvc.get("/api/me") { header("X-Client-IP", "203.0.113.5") }
                .andExpect { status { isUnauthorized() } }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw -q test -Dtest=PublicRateLimitFilterTest`
Expected: FAIL — der dritte Aufruf liefert `200` statt `429`.

- [ ] **Step 3: Write minimal implementation**

`core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/PublicRateLimitFilter.kt`:

```kotlin
package org.unividuell.countdown.core.iam.internal

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.util.AntPathMatcher
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

@ConfigurationProperties(prefix = "countdown.public-rate-limit")
data class PublicRateLimitProperties(val permitsPerMinute: Int = 20)

/**
 * A crude brake on the two endpoints anyone may call without a session.
 *
 * Why it exists: an invite code is six characters and the preview answers with a community name,
 * so without a brake the code space is walkable.
 *
 * Why the address does NOT come from X-Forwarded-For: Caddy *appends* to that header rather than
 * replacing it, and Spring's ForwardedHeaderFilter takes the FIRST entry — a value the client
 * itself can send, which would reset the counter on every request. `countdown-web` therefore sets
 * X-Client-IP from Caddy's own {client_ip}; remoteAddr is the local-development fallback.
 */
@Component
class PublicRateLimitFilter(
    private val properties: PublicRateLimitProperties,
    private val clock: Clock,
) : OncePerRequestFilter() {

    private class Window(val startedAt: Instant) {
        val hits = AtomicInteger()
    }

    private val matcher = AntPathMatcher()
    private val windows = ConcurrentHashMap<String, Window>()

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        GUARDED.none { matcher.match(it, request.requestURI) }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val now = clock.instant()

        // Self-limiting rather than evicting entry by entry: an attacker rotating addresses would
        // otherwise grow this map without bound. Dropping everything costs one forgiven minute.
        if (windows.size > MAX_TRACKED_CLIENTS) windows.clear()

        val window = windows.compute(clientIp(request)) { _, existing ->
            if (existing == null || Duration.between(existing.startedAt, now) >= WINDOW) Window(now) else existing
        }!!

        if (window.hits.incrementAndGet() > properties.permitsPerMinute) {
            response.status = HttpStatus.TOO_MANY_REQUESTS.value()
            return
        }

        filterChain.doFilter(request, response)
    }

    private fun clientIp(request: HttpServletRequest): String =
        request.getHeader("X-Client-IP")?.takeIf { it.isNotBlank() } ?: request.remoteAddr

    companion object {
        private val GUARDED = listOf("/api/preview/**", "/api/communities/join/*")
        private val WINDOW = Duration.ofMinutes(1)
        private const val MAX_TRACKED_CLIENTS = 10_000
    }
}
```

In `SecurityConfig.kt` die Properties registrieren:

```kotlin
@EnableConfigurationProperties(SuperAdminProperties::class, PublicRateLimitProperties::class)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw -q test -Dtest=PublicRateLimitFilterTest`
Expected: PASS (4 Tests).

- [ ] **Step 5: Run the whole backend suite**

Run: `cd core && ./mvnw test`
Expected: PASS — insbesondere `ModularityTests` und die Community-Tests.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/ core/src/test/kotlin/org/unividuell/countdown/core/iam/PublicRateLimitFilterTest.kt
git commit -m "Brake the endpoints that need no session"
```

---

### Task 8: Der Abzweig im Edge

**Files:**
- Modify: `deploy/Caddyfile`

**Interfaces:**
- Consumes: `/api/preview/**` aus Task 6.
- Produces: Crawler-Anfragen auf `/`, `/c/*`, `/join/*` erreichen `core` unter `/api/preview{path}`; alle Backend-Proxies setzen `X-Client-IP`.

**Kein Test-First:** Eine Caddy-Konfiguration hat keinen Unit-Test. Der Nachweis ist `caddy adapt` plus eine Gegenprobe mit zwei User-Agents auf demselben Pfad.

- [ ] **Step 1: Add the preview handle block**

In `deploy/Caddyfile`, **nach** dem `handle @backend`-Block und **vor** `handle /assets/*`:

```caddy
	# Link previews. A crawler runs no JavaScript, so the SPA shell is a blank page to it — these
	# two conditions (crawler user agent AND a shareable path) send ONLY crawlers to core's
	# preview endpoint and leave every browser on the untouched SPA path below. If core is down,
	# the app still loads. `path /` is exact on purpose: `/*` would swallow the whole app.
	@preview {
		path / /c/* /join/*
		header_regexp User-Agent "(?i)(facebookexternalhit|WhatsApp|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|SkypeUriPreview|Applebot|redditbot|Googlebot|bingbot|Signal)"
	}

	handle @preview {
		rewrite * /api/preview{path}
		reverse_proxy core:8080 {
			header_up X-Client-IP {client_ip}
		}
	}
```

Und im bestehenden `handle @backend`-Block den Proxy um denselben Header ergänzen — der offene Namens-Lookup läuft dort entlang:

```caddy
	handle @backend {
		reverse_proxy core:8080 {
			# Caddy APPENDS to X-Forwarded-For, so its first entry may be the client's own
			# invention. {client_ip} is Caddy's own answer, honouring trusted_proxies, and
			# header_up replaces anything the client sent under this name.
			header_up X-Client-IP {client_ip}
		}
	}
```

- [ ] **Step 2: Verify the config compiles and the routes are in order**

Run:

```bash
docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy adapt --config /etc/caddy/Caddyfile
```

Expected: JSON, keine Warnung. Im `routes`-Array steht der `@backend`-Handle vor dem `@preview`-Handle, dieser vor `/assets/*` und dem Catch-all.

- [ ] **Step 3: Prove the fork with two user agents**

Run:

```bash
docker run --rm -d --name caddy-preview-check -p 8099:80 -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine
curl -s -o /dev/null -w 'crawler: %{http_code}\n' -A "WhatsApp/2.0" http://localhost:8099/c/huettehuette
curl -s -o /dev/null -w 'browser: %{http_code}\n' -A "Mozilla/5.0" http://localhost:8099/c/huettehuette
curl -s -o /dev/null -w 'crawler root: %{http_code}\n' -A "WhatsApp/2.0" http://localhost:8099/
docker rm -f caddy-preview-check
```

Expected: `crawler: 502` und `crawler root: 502` — der Abzweig hat gegriffen und versucht `core:8080`, das in diesem Ein-Container-Lauf nicht existiert. `browser: 200` — derselbe Pfad, aber die SPA-Kette (hier die Standardseite des Caddy-Images aus `/srv`). Zwei verschiedene Antworten auf denselben Pfad sind der Beweis.

- [ ] **Step 4: Commit**

```bash
git add deploy/Caddyfile
git commit -m "Divert preview crawlers at the edge"
```

---

### Task 9: Die Einladungsseite empfängt, bevor sie zum Login schickt

**Files:**
- Modify: `webapp-vue/src/pages/join/[token].vue`
- Modify: `webapp-vue/src/api/communities.ts`
- Modify: `webapp-vue/src/api/types.ts`
- Test: `webapp-vue/src/pages/join/__tests__/token.spec.ts`

**Interfaces:**
- Consumes: `GET /api/communities/join/{code}` aus Task 3.
- Produces: `getInviteName(token: string): Promise<InvitePeekResponse>` in `@/api/communities`, `interface InvitePeekResponse { name: string }` in `@/api/types`.

**Verhalten:** Eingeloggt → wie bisher sofort beitreten (nach dem OAuth-Rückweg landet man hier wieder und tritt dann bei). Ausgeloggt → Name plus Knopf; der Knopf merkt sich das Ziel selbst, denn die Route ist jetzt öffentlich und der Guard tut es nicht mehr.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/pages/join/__tests__/token.spec.ts` vollständig ersetzen:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { ApiError } from '@/api/client'

const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => ({ params: { token: 'A7K2MP' }, fullPath: '/join/A7K2MP' }),
}))

const { auth, stash } = vi.hoisted(() => ({
  auth: { status: { value: 'authenticated' as 'authenticated' | 'anonymous' }, loginWithGitHub: vi.fn() },
  stash: vi.fn(),
}))
vi.mock('@/auth/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/auth/postLoginRedirect', () => ({ stashPostLoginRedirect: stash }))

const page = async () => (await import('@/pages/join/[token].vue')).default

describe('join page — signed in', () => {
  beforeEach(() => {
    replace.mockReset()
    auth.status.value = 'authenticated'
  })

  it('shows waiting on JOINED_PENDING', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'JOINED_PENDING', name: 'Team', slug: 'team' })
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/Bestätigung|Team/)
  })

  it('redirects on ALREADY_ACTIVE', async () => {
    vi.spyOn(api, 'joinByToken').mockResolvedValue({ status: 'ALREADY_ACTIVE', name: 'Team', slug: 'team' })
    mount(await page())
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/c/team/')
  })

  it('shows expired on 410', async () => {
    vi.spyOn(api, 'joinByToken').mockRejectedValue(new ApiError(410, 'gone'))
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/abgelaufen/i)
  })
})

describe('join page — signed out', () => {
  beforeEach(() => {
    auth.status.value = 'anonymous'
    auth.loginWithGitHub.mockReset()
    stash.mockReset()
  })

  it('names the inviting community instead of joining', async () => {
    const join = vi.spyOn(api, 'joinByToken')
    vi.spyOn(api, 'getInviteName').mockResolvedValue({ name: 'Hütte Hütte' })
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toContain('Hütte Hütte')
    expect(join).not.toHaveBeenCalled()
  })

  it('remembers the destination before sending the visitor to GitHub', async () => {
    vi.spyOn(api, 'getInviteName').mockResolvedValue({ name: 'Hütte Hütte' })
    const w = mount(await page())
    await flushPromises()
    await w.get('[data-test="join-accept"]').trigger('click')
    expect(stash).toHaveBeenCalledWith('/join/A7K2MP')
    expect(auth.loginWithGitHub).toHaveBeenCalled()
  })

  it('shows the invalid message on 404', async () => {
    vi.spyOn(api, 'getInviteName').mockRejectedValue(new ApiError(404, 'nope'))
    const w = mount(await page())
    await flushPromises()
    expect(w.text()).toMatch(/ungültig/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-vue && pnpm test -- token.spec`
Expected: FAIL — `api.getInviteName is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `webapp-vue/src/api/types.ts` ergänzen:

```ts
export interface InvitePeekResponse {
  name: string
}
```

In `webapp-vue/src/api/communities.ts`, neben `joinByToken` (und `InvitePeekResponse` in den Typ-Import aufnehmen):

```ts
export const getInviteName = (token: string) =>
  apiFetch<InvitePeekResponse>(`/api/communities/join/${token}`)
```

`webapp-vue/src/pages/join/[token].vue` vollständig ersetzen:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getInviteName, joinByToken } from '@/api/communities'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { stashPostLoginRedirect } from '@/auth/postLoginRedirect'
import { communityPath } from '@/communities/routes'

// Public so an invited stranger sees WHO is inviting before GitHub asks them anything.
definePage({ meta: { public: true } })

const route = useRoute('/join/[token]')
const router = useRouter()
const { status, loginWithGitHub } = useAuth()
const state = ref<'loading' | 'invited' | 'pending' | 'error'>('loading')
const name = ref('')
const message = ref('')

function explain(e: unknown): string {
  return e instanceof ApiError && e.status === 410
    ? 'Dieser Einladungslink ist abgelaufen.'
    : 'Dieser Einladungslink ist ungültig.'
}

async function accept(): Promise<void> {
  try {
    const r = await joinByToken(route.params.token)
    if (r.status === 'ALREADY_ACTIVE') {
      await router.replace(communityPath(r.slug))
      return
    }
    state.value = 'pending'
    message.value = `Antrag für „${r.name}“ gestellt — warte auf Bestätigung durch einen Spielleiter.`
  } catch (e) {
    state.value = 'error'
    message.value = explain(e)
  }
}

onMounted(async () => {
  // Signed in, following an invite link IS the acceptance — including the return trip from OAuth.
  if (status.value === 'authenticated') return accept()
  try {
    name.value = (await getInviteName(route.params.token)).name
    state.value = 'invited'
  } catch (e) {
    state.value = 'error'
    message.value = explain(e)
  }
})

function signIn(): void {
  // The route is public now, so the auth guard no longer stashes the destination for us.
  stashPostLoginRedirect(route.fullPath)
  loginWithGitHub()
}
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Einladung wird geprüft…</p>

    <template v-else-if="state === 'invited'">
      <p class="mb-6 text-base">Du bist zu „{{ name }}“ eingeladen.</p>
      <button
        data-test="join-accept"
        class="rounded bg-stone-900 px-4 py-2 text-stone-50 hover:bg-stone-700"
        @click="signIn"
      >
        Beitreten
      </button>
    </template>

    <p v-else-if="state === 'pending'" class="text-sm">{{ message }}</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
  </section>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-vue && pnpm test -- token.spec`
Expected: PASS (6 Tests).

- [ ] **Step 5: Lint and type-check**

Run: `cd webapp-vue && pnpm lint && pnpm exec vue-tsc -b`
Expected: beide sauber.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/pages/join/ webapp-vue/src/api/communities.ts webapp-vue/src/api/types.ts
git commit -m "Name the community before the invite asks for a login"
```

---

### Task 10: Das Wissen zurückspeisen und alles gemeinsam prüfen

**Files:**
- Modify: `.claude/guidelines/deployment-edge.md`
- Modify: `.claude/guidelines/security-and-auth.md`

- [ ] **Step 1: Document the fork in the edge guideline**

In `.claude/guidelines/deployment-edge.md`, nach „Routing inside `countdown-web`", einen Abschnitt **„Crawler fork for link previews"** ergänzen, der drei Dinge festhält:

- Ein Vorschau-Crawler führt **kein JavaScript** aus, deshalb kann die SPA-Shell keine Vorschau tragen; `@preview` ist ein Matcher aus **zwei** Bedingungen (User-Agent-Regex **und** Pfad), und nur er wird umgeschrieben.
- **`path /` ist exakt** — `/*` an dieser Stelle zöge die ganze App über den Vorschau-Endpunkt.
- Der Browser-Pfad wird bewusst **nicht** angefasst: fällt `core` aus, lädt die SPA weiter. Preis dafür ist eine UA-Liste, die veraltet — ein unbekannter Messenger bekommt dann keine Vorschau, mehr passiert nicht.

- [ ] **Step 2: Document the client address in the security guideline**

In `.claude/guidelines/security-and-auth.md` ergänzen:

- Die zwei Pfade, die **ohne Session** erreichbar sind (`GET /api/communities/join/*`, `GET /api/preview/**`), und dass beide unter dem Rate-Limit stehen.
- **Die Falle:** Caddy *hängt* an `X-Forwarded-For` an, Springs `ForwardedHeaderFilter` liest die **erste** Position — für alles, was eine Client-Adresse als *Identität* benutzt (Rate-Limits, Sperren), ist dieser Header damit unbrauchbar. `countdown-web` setzt `X-Client-IP` aus Caddys `{client_ip}`; das ist die Adresse, die ein Filter lesen darf.
- Dass der Einladungscode sechs Zeichen hat und die Bremse Teil seiner Sicherheitsrechnung ist — nicht Beiwerk.

- [ ] **Step 3: Run everything**

Run:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm exec vue-tsc -b
```

Expected: alles grün.

- [ ] **Step 4: Boot the app once**

Run: `cd core && ./mvnw spring-boot:run`

Expected: Der Kontext startet. Grund: `PublicRateLimitProperties` ist neu registriert, und kein `application*.yaml`-Schlüssel steht unter Test — siehe [`configuration.md`](../../../.claude/guidelines/configuration.md). Danach abbrechen.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines/
git commit -m "Record the crawler fork and the client-address trap"
```
