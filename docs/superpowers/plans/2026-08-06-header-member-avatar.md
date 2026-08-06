# Header-Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Header oben rechts zeigt denselben Avatar (farbiger Kreis mit Initialen) wie die Community-Rangliste, statt eines statischen Icons.

**Architecture:** Die Regel „wie sieht ein Anwender aus" zieht vom Modul `community` ins Modul `iam` und bekommt dort ein öffentliches `Avatar.of(user)`. `/api/me` liefert das Ergebnis mit. Im Frontend wird das Kreis-Markup aus `MemberRow.vue` zur gemeinsamen Komponente `ui/Avatar.vue`, die Rangliste und Header-Menü benutzen. Das Menü bekommt den angemeldeten Anwender als Pflicht-Prop; während `/api/me` lädt, hält ein leerer Platzhalter die Header-Geometrie.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 (Backend, `core/`), Vue 3 + TypeScript strict + Tailwind v4 + Vitest (Frontend, `webapp-vue/`).

**Spec:** [`docs/superpowers/specs/2026-08-06-header-member-avatar-design.md`](../specs/2026-08-06-header-member-avatar-design.md)

## Global Constraints

- **Testing:** kotest-Matcher (`shouldBe`), JUnit 5 `@Test`, MockMvc Kotlin DSL im Backend — kein Mockito, kein `kotlin.test`. Im Frontend Vitest mit `vi` — kein mockk. TDD: erst der scheiternde Test, dann die Implementierung.
- **Modulith:** Klassen in einem `…internal`-Paket sind modulintern. Cross-Modul-Zugriff nur auf exportierte (nicht-`internal`) Pakete. `ModularityTests` erzwingt das.
- **Kommentare:** Keine Grabstein-Kommentare („früher war hier X"). Begründungen gehören in die Commit-Message; im Code steht nur, was ein Leser zum Verstehen braucht.
- **Commits:** Nach jeder Task committen. Branch ist `claude/header-community-avatar-aafa18` (bereits ausgecheckt, git flow: PR später gegen `develop`).
- **Frontend-Prüfbefehle:** `pnpm test` (Vitest), `pnpm typecheck` (vue-tsc), `pnpm lint`. Immer aus `webapp-vue/`.
- **Backend-Prüfbefehl:** `./mvnw test` aus `core/` (braucht Docker für Testcontainers). Einzelne Klasse: `./mvnw test -Dtest=KlassenName`.

---

### Task 1: `Avatar.of(user)` als öffentlicher Begriff in `iam`

Die Initialen- und Farbregeln liegen heute in `community/internal/`, obwohl sie ausschließlich auf `User`-Feldern arbeiten. Sie ziehen nach `iam` um und bekommen dort eine gemeinsame Fassade. Die Rangliste ruft künftig diese Fassade; ihr sichtbares Verhalten ändert sich nicht.

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt`
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarTest.kt`
- Move: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/MemberShortName.kt` → `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/MemberShortName.kt`
- Move: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/AvatarColor.kt` → `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/AvatarColor.kt`
- Move: `core/src/test/kotlin/org/unividuell/countdown/core/community/MemberShortNameTest.kt` → `core/src/test/kotlin/org/unividuell/countdown/core/iam/MemberShortNameTest.kt`
- Move: `core/src/test/kotlin/org/unividuell/countdown/core/community/AvatarColorTest.kt` → `core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarColorTest.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt:35-41`

**Interfaces:**
- Consumes: `User` (`iam/User.kt`) mit `id: UUID?`, `username: String` (berechnet), `bgColorHex: String?`; `SeededRandom` (`core/rng/`).
- Produces: `org.unividuell.countdown.core.iam.Avatar(shortName: String, bgColorHex: String)` mit `Avatar.of(user: User): Avatar`. Task 2 und die Rangliste benutzen ausschließlich das.

- [ ] **Step 1: Den scheiternden Test für die Fassade schreiben**

Neue Datei `core/src/test/kotlin/org/unividuell/countdown/core/iam/AvatarTest.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldMatch
import org.junit.jupiter.api.Test
import java.util.UUID

class AvatarTest {
    private val hex = Regex("^#[0-9a-f]{6}$")

    private fun user(
        displayName: String? = null,
        bgColorHex: String? = null,
        id: UUID = UUID.fromString("0190f1b2-0000-7000-8000-000000000001"),
    ) = User(
        id = id, githubId = 1L, githubLogin = "octocat", githubName = "The Octocat",
        displayName = displayName, bgColorHex = bgColorHex,
    )

    @Test
    fun `labels the avatar with the shortened display name`() {
        Avatar.of(user(displayName = "Turanga Leela")).shortName shouldBe "TRNG"
    }

    @Test
    fun `takes the colour the user chose`() {
        Avatar.of(user(bgColorHex = "#8e44ad")).bgColorHex shouldBe "#8e44ad"
    }

    @Test
    fun `falls back to a colour derived from the user id`() {
        val avatar = Avatar.of(user(bgColorHex = null))
        avatar.bgColorHex shouldMatch hex
        avatar.bgColorHex shouldBe Avatar.of(user(bgColorHex = null)).bgColorHex
    }

    @Test
    fun `gives two users different derived colours`() {
        val a = Avatar.of(user(id = UUID.fromString("0190f1b2-0000-7000-8000-000000000001")))
        val b = Avatar.of(user(id = UUID.fromString("0190f1b2-0000-7000-8000-000000000002")))
        (a.bgColorHex == b.bgColorHex) shouldBe false
    }
}
```

Hinweis zu `"TRNG"`: `MemberShortName.of` macht aus `"Turanga Leela"` → uppercase `"TURANGA LEELA"` (13 Zeichen, > 4) → Vokale und Nicht-Alphanumerisches raus → `"TRNGLL"` (6, immer noch > 4) → Wiederholungen kollabieren → `"TRNGL"` → auf 4 gekürzt → `"TRNG"`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd core && ./mvnw test -Dtest=AvatarTest
```

Erwartet: Kompilierfehler — `Unresolved reference: Avatar`.

- [ ] **Step 3: Die zwei Helfer nach `iam/internal/` verschieben**

```bash
cd core/src/main/kotlin/org/unividuell/countdown/core && git mv community/internal/MemberShortName.kt community/internal/AvatarColor.kt iam/internal/
```

In beiden Dateien die Paketzeile ändern:

```kotlin
package org.unividuell.countdown.core.iam.internal
```

Sonst nichts. Der Inhalt beider Objekte (`MemberShortName.of`, `AvatarColor.resolve` samt `derive`/`hslToHex`) bleibt Zeile für Zeile unverändert — auch die KDoc-Kommentare.

- [ ] **Step 4: Die Fassade anlegen**

Neue Datei `core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt`:

```kotlin
package org.unividuell.countdown.core.iam

import org.unividuell.countdown.core.iam.internal.AvatarColor
import org.unividuell.countdown.core.iam.internal.MemberShortName

/**
 * How a user is drawn, wherever they appear: a four-character label on a colour.
 *
 * The one place that answers the question — the roster and the header must not be able to
 * disagree about what the same person looks like.
 */
data class Avatar(val shortName: String, val bgColorHex: String) {
    companion object {
        fun of(user: User): Avatar = Avatar(
            shortName = MemberShortName.of(user.username),
            bgColorHex = AvatarColor.resolve(user.bgColorHex, requireNotNull(user.id) {
                "an unsaved user has no id to derive a colour from"
            }),
        )
    }
}
```

- [ ] **Step 5: Die verschobenen Tests nachziehen**

```bash
cd core/src/test/kotlin/org/unividuell/countdown/core && git mv community/MemberShortNameTest.kt community/AvatarColorTest.kt iam/
```

In beiden Testdateien:
- Paketzeile → `package org.unividuell.countdown.core.iam`
- Import → `import org.unividuell.countdown.core.iam.internal.MemberShortName` bzw. `import org.unividuell.countdown.core.iam.internal.AvatarColor`

Die Testmethoden selbst bleiben unverändert — sie sind der Beweis, dass der Umzug an der Regel nichts geändert hat.

- [ ] **Step 6: Tests laufen lassen, grün bestätigen**

```bash
cd core && ./mvnw test -Dtest='AvatarTest,MemberShortNameTest,AvatarColorTest'
```

Erwartet: alle grün.

- [ ] **Step 7: `RosterService` auf die Fassade umstellen**

In `core/src/main/kotlin/org/unividuell/countdown/core/community/internal/RosterService.kt` den `mapNotNull`-Block (Zeilen 32-42) ersetzen:

```kotlin
            .mapNotNull { member ->
                val user = byId[member.userId] ?: return@mapNotNull null
                val p = standings[member.userId] ?: MemberPoints(stable = 0, live = null)
                val avatar = Avatar.of(user)
                RosterMemberResponse(
                    userId = member.userId,
                    shortName = avatar.shortName,
                    fullName = user.username,
                    bgColorHex = avatar.bgColorHex,
                    points = RosterPointsResponse(stable = p.stable, live = p.live),
                )
            }
```

Import ergänzen: `import org.unividuell.countdown.core.iam.Avatar`. Die alten Aufrufe `MemberShortName.of(...)` und `AvatarColor.resolve(...)` verschwinden damit aus der Datei; es bleiben keine Importe auf die verschobenen Klassen zurück.

- [ ] **Step 8: Vollen Backend-Lauf machen**

```bash
cd core && ./mvnw test
```

Erwartet: alle grün — insbesondere `ModularityTests` (`community` greift nur auf das exportierte `iam`-Paket zu, nicht auf `iam.internal`) und `RosterEndpointTest` (die Rangliste liefert unverändert dieselben Felder).

- [ ] **Step 9: Commit**

```bash
git add -A core/src
git commit -m "refactor(iam): give a user one answer to what they look like

MemberShortName and AvatarColor only ever read User fields; living in
community.internal was an accident of their first caller. They move to iam
behind Avatar.of(user), so the roster and — next — /api/me cannot disagree
about the same person.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `/api/me` liefert den Avatar mit

Der Header braucht Initialen und aufgelöste Farbe des angemeldeten Anwenders. Beides kommt als eigenes Feld dazu — das rohe `bgColorHex` bleibt unangetastet, weil es die Rückseite von `PATCH /api/me` ist und `null` dort „keine Farbe gewählt" bedeutet.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt:13-35`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt`

**Interfaces:**
- Consumes: `Avatar.of(user)` aus Task 1.
- Produces: JSON-Feld `avatar: { shortName: String, bgColorHex: String }` auf `GET`/`PATCH /api/me`. Task 5 spiegelt es im TS-Typ.

- [ ] **Step 1: Die scheiternden Tests schreiben**

In `core/src/test/kotlin/org/unividuell/countdown/core/iam/UserControllerTest.kt` zwei Tests ergänzen (z. B. nach `GET me returns the current user with computed username`):

```kotlin
    @Test
    fun `GET me carries the avatar the roster would draw`() {
        every { profileService.current(uid) } returns user(displayName = "Turanga Leela")

        mockMvc.get("/api/me") {
            with(principalFor(user(displayName = "Turanga Leela")))
        }.andExpect {
            status { isOk() }
            jsonPath("$.avatar.shortName") { value("TRNG") }
            jsonPath("$.avatar.bgColorHex") { value(Avatar.of(user(displayName = "Turanga Leela")).bgColorHex) }
        }
    }

    @Test
    fun `GET me resolves the avatar colour but leaves the chosen one unset`() {
        // The two fields answer different questions: what to paint with, and what the user picked.
        // A profile form prefilling from bgColorHex must not see a choice that was never made.
        every { profileService.current(uid) } returns user()

        mockMvc.get("/api/me") { with(principalFor(user())) }.andExpect {
            status { isOk() }
            jsonPath("$.bgColorHex") { doesNotExist() }
            jsonPath("$.avatar.bgColorHex") { value(org.hamcrest.Matchers.matchesPattern("^#[0-9a-f]{6}$")) }
        }
    }
```

Kein neuer Import nötig: die Testklasse liegt bereits im Paket `org.unividuell.countdown.core.iam`, wo `Avatar` wohnt.

Hinweis zu `doesNotExist()`: Ob ein `null`-Feld in der Antwort auftaucht, hängt an der Jackson-Konfiguration. Scheitert der Test in Step 2 an genau dieser Zeile (statt am fehlenden `avatar`), auf `value(null)` umstellen.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

```bash
cd core && ./mvnw test -Dtest=UserControllerTest
```

Erwartet: beide neuen Tests scheitern mit „No value at JSON path `$.avatar.shortName`". Falls der zweite Test stattdessen an `doesNotExist()` scheitert, weil `bgColorHex: null` doch serialisiert wird: auf `value(null)` umstellen und weiter.

- [ ] **Step 3: Das Feld ergänzen**

In `core/src/main/kotlin/org/unividuell/countdown/core/iam/internal/UserController.kt`:

```kotlin
import org.unividuell.countdown.core.iam.Avatar

data class MeResponse(
    val id: UUID,
    val username: String,
    val githubLogin: String,
    val githubName: String?,
    val email: String?,
    /** The colour the user picked; null means they picked none. Not what to paint with. */
    val bgColorHex: String?,
    /** What to paint with — the same avatar the roster draws for this user. */
    val avatar: Avatar,
    val isSuperAdmin: Boolean,
    val mayCreateCommunities: Boolean,
    val createdAt: Instant?,
)

private fun User.toMeResponse() = MeResponse(
    id = id!!, username = username, githubLogin = githubLogin, githubName = githubName,
    email = email, bgColorHex = bgColorHex, avatar = Avatar.of(this),
    isSuperAdmin = isSuperAdmin, mayCreateCommunities = mayCreateCommunities,
    createdAt = createdAt,
)
```

`PATCH` braucht keine eigene Änderung — es geht durch dasselbe `toMeResponse()`.

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd core && ./mvnw test -Dtest=UserControllerTest
```

Erwartet: alle grün, auch die bestehenden Tests der Klasse.

- [ ] **Step 5: Commit**

```bash
git add -A core/src
git commit -m "feat(iam): /api/me carries the avatar the roster would draw

Alongside bgColorHex, not on top of it: the raw field is the read side of
PATCH /api/me, where null means the user picked no colour. Overwriting it
with a resolved one would show a future profile form a choice nobody made.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `ui/Avatar.vue` — die eine Avatar-Darstellung

Das Kreis-Markup existiert heute nur inline in `MemberRow.vue`. Es wird zur Komponente, bevor irgendwer sie benutzt.

**Files:**
- Create: `webapp-vue/src/ui/Avatar.vue`
- Create: `webapp-vue/src/ui/__tests__/Avatar.spec.ts`
- Move: `webapp-vue/src/members/readableTextColor.ts` → `webapp-vue/src/ui/readableTextColor.ts`
- Move: `webapp-vue/src/members/__tests__/readableTextColor.spec.ts` → `webapp-vue/src/ui/__tests__/readableTextColor.spec.ts`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: Default-Export `Avatar.vue` mit Props `shortName: string`, `bgColorHex: string`, `size?: 'sm' | 'lg'` (Default `'lg'`), `variant?: 'color' | 'muted' | 'grayscale'` (Default `'color'`). Wurzelelement ist der Kreis, Attribute fallen durch. Tasks 4 und 6 benutzen es.

- [ ] **Step 1: `readableTextColor` nach `ui/` verschieben**

```bash
cd webapp-vue/src && git mv members/readableTextColor.ts ui/readableTextColor.ts && git mv members/__tests__/readableTextColor.spec.ts ui/__tests__/readableTextColor.spec.ts
```

Der Import in der Spec (`from '../readableTextColor'`) stimmt danach weiterhin, und der Inhalt beider Dateien bleibt unverändert.

`MemberRow.vue` importiert die Funktion noch vom alten Pfad — sofort mitziehen, sonst ist die App bis Task 4 kaputt. In `webapp-vue/src/members/MemberRow.vue:16`:

```ts
import { readableTextColor } from '@/ui/readableTextColor'
```

- [ ] **Step 2: Zwischenprüfung — nichts kaputt gemacht**

```bash
cd webapp-vue && pnpm typecheck && pnpm test
```

Erwartet: grün. Der Umzug war reine Verschiebung.

- [ ] **Step 3: Den scheiternden Test für die Komponente schreiben**

Neue Datei `webapp-vue/src/ui/__tests__/Avatar.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Avatar from '../Avatar.vue'

describe('Avatar', () => {
  // The DOM may hand back an inline colour either as written or normalised to rgb(); assert the
  // colour, not the serialisation.
  const asWritten = (hex: string, rgb: string) => new RegExp(`${hex}|${rgb}`)
  const PURPLE = asWritten('#8e44ad', 'rgb\\(142, 68, 173\\)')

  it('shows the short name on the chosen colour', () => {
    const w = mount(Avatar, { props: { shortName: 'AMY', bgColorHex: '#8e44ad' } })
    expect(w.text()).toBe('AMY')
    expect(w.attributes('style')).toMatch(PURPLE)
  })

  it('picks light text on a dark circle and dark text on a light one', () => {
    const dark = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#111111' } })
    expect(dark.attributes('style')).toMatch(asWritten('#ffffff', 'rgb\\(255, 255, 255\\)'))
    const light = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#eeeeee' } })
    expect(light.attributes('style')).toMatch(asWritten('#111111', 'rgb\\(17, 17, 17\\)'))
  })

  it('carries the outline that belongs to the avatar, not to its surroundings', () => {
    const w = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad' } })
    expect(w.classes()).toContain('ring-2')
    expect(w.classes()).toContain('ring-white')
  })

  it('defaults to the roster size and shrinks on request', () => {
    const lg = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad' } })
    expect(lg.classes()).toContain('size-12')
    const sm = mount(Avatar, { props: { shortName: 'A', bgColorHex: '#8e44ad', size: 'sm' } })
    expect(sm.classes()).toContain('size-8')
    expect(sm.classes()).not.toContain('size-12')
  })

  it('can be drained of colour without changing the colour it was given', () => {
    const w = mount(Avatar, {
      props: { shortName: 'A', bgColorHex: '#8e44ad', variant: 'grayscale' },
    })
    expect(w.classes()).toContain('grayscale')
    expect(w.attributes('style')).toMatch(PURPLE)
  })

  it('lets the caller attach its own attributes to the circle', () => {
    // MemberRow measures the circle by this attribute during the fly-in; it has to land on the
    // element that *is* the circle, not on a wrapper.
    const w = mount(Avatar, {
      props: { shortName: 'A', bgColorHex: '#8e44ad' },
      attrs: { 'data-swarm-circle': '' },
    })
    expect(w.attributes('data-swarm-circle')).toBeDefined()
    expect(w.classes()).toContain('rounded-full')
  })
})
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd webapp-vue && pnpm vitest run src/ui/__tests__/Avatar.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "../Avatar.vue"`.

- [ ] **Step 5: Die Komponente schreiben**

Neue Datei `webapp-vue/src/ui/Avatar.vue`:

```vue
<script setup lang="ts">
/**
 * How a member is drawn, everywhere: their four-character label on their colour.
 *
 * The circle is the root element, so a caller can attach its own attributes to the circle
 * itself — MemberRow measures it during the fly-in and needs the marker on the real geometry.
 */
import { computed } from 'vue'
import { readableTextColor } from './readableTextColor'

const props = withDefaults(
  defineProps<{
    shortName: string
    bgColorHex: string
    size?: 'sm' | 'lg'
    variant?: 'color' | 'muted' | 'grayscale'
  }>(),
  { size: 'lg', variant: 'color' },
)

const textColor = computed(() => readableTextColor(props.bgColorHex))
const sizing = computed(() => (props.size === 'sm' ? 'size-8 text-xs' : 'size-12 text-sm'))
const filter = computed(
  () => ({ color: '', muted: 'saturate-50', grayscale: 'grayscale' })[props.variant],
)
</script>

<template>
  <div
    class="flex place-content-around rounded-full ring-2 ring-white"
    :class="[sizing, filter]"
    :style="{ background: bgColorHex, color: textColor }"
  >
    <div class="place-self-center rotate-[-40deg] font-medium">{{ shortName }}</div>
  </div>
</template>
```

- [ ] **Step 6: Tests laufen lassen, grün bestätigen**

```bash
cd webapp-vue && pnpm vitest run src/ui/__tests__/Avatar.spec.ts && pnpm typecheck && pnpm lint
```

Erwartet: alle grün.

- [ ] **Step 7: Commit**

```bash
git add -A webapp-vue/src
git commit -m "feat(webapp): one component for how a member is drawn

The circle-with-initials existed only inline in MemberRow. It becomes a
component before it gains a second caller, and readableTextColor moves with
it: the contrast colour is a statement about drawing an avatar, not about
the roster.

The white outline moves inside. It is part of what a member looks like, not
part of the roster's overlap trick.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Die Rangliste benutzt die Komponente

Reiner Austausch ohne sichtbare Änderung. `MemberRow.spec.ts` bleibt Zeile für Zeile unverändert und ist damit der Beweis.

**Files:**
- Modify: `webapp-vue/src/members/MemberRow.vue` (Import Zeile 16, `textColors` Zeile 49, Markup Zeilen 173-179)

**Interfaces:**
- Consumes: `Avatar.vue` aus Task 3.
- Produces: nichts Neues.

- [ ] **Step 1: Ausgangslage sichern — die Rangliste ist jetzt grün**

```bash
cd webapp-vue && pnpm vitest run src/members/__tests__/MemberRow.spec.ts
```

Erwartet: grün. Diese Datei wird in dieser Task **nicht** angefasst; sie muss am Ende genauso grün sein.

- [ ] **Step 2: Import tauschen**

In `webapp-vue/src/members/MemberRow.vue` Zeile 16 ersetzen:

```ts
import Avatar from '@/ui/Avatar.vue'
```

(Der `readableTextColor`-Import verschwindet ersatzlos.)

- [ ] **Step 3: Den `textColors`-Computed entfernen**

Zeile 49 ersatzlos streichen:

```ts
const textColors = computed(() => props.members.map((m) => readableTextColor(m.bgColorHex)))
```

`computed` bleibt importiert, falls es die Datei sonst noch benutzt — sonst auch aus dem `vue`-Import entfernen (`pnpm lint` meldet es).

- [ ] **Step 4: Das Markup tauschen**

Den Block in Zeilen 173-179 ersetzen:

```vue
        <Avatar :short-name="m.shortName" :bg-color-hex="m.bgColorHex" data-swarm-circle />
```

Das `v-for` darüber verliert damit seine Nutzung von `index` für die Textfarbe. `index` wird weiter für `zIndex` gebraucht (Zeile 169) — also bleibt `v-for="(m, index) in members"` stehen.

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün, insbesondere `MemberRow.spec.ts` unverändert — inklusive des Tests „feeds the swarm the layout viewport and a margin that clears the tilted column", der `data-swarm-circle` am Kreis misst.

- [ ] **Step 6: Commit**

```bash
git add -A webapp-vue/src
git commit -m "refactor(webapp): draw the roster with the shared avatar

MemberRow.spec.ts is untouched and still green, which is the point: the
roster looks exactly as it did, including the fly-in that measures the
circle through data-swarm-circle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `MeResponse.avatar` im Frontend-Typ

Rein mechanisch: das neue Backend-Feld im TS-Typ nachziehen und die Test-Fixtures füttern. Kein Verhalten ändert sich.

**Files:**
- Modify: `webapp-vue/src/api/types.ts:1-12`
- Modify: `webapp-vue/src/auth/__tests__/useAuth.spec.ts`
- Modify: `webapp-vue/src/auth/__tests__/guard.spec.ts`
- Modify: `webapp-vue/src/communities/__tests__/CommunityMenu.spec.ts`
- Modify: `webapp-vue/src/communities/__tests__/useCommunityCreationGuard.spec.ts`
- Modify: `webapp-vue/src/pages/communities/__tests__/index.spec.ts`
- Modify: `webapp-vue/src/pages/communities/__tests__/new.spec.ts`

**Interfaces:**
- Consumes: das JSON-Feld aus Task 2.
- Produces: `MeResponse['avatar']` vom Typ `AvatarView` — Task 6 gibt es an `Avatar.vue` weiter.

- [ ] **Step 1: Den Typ ergänzen**

In `webapp-vue/src/api/types.ts` vor `MeResponse`:

```ts
/** How this user is drawn — resolved by the server, identical to what the roster shows. */
export interface AvatarView {
  shortName: string
  bgColorHex: string
}

export interface MeResponse {
  id: string
  username: string
  githubLogin: string
  githubName: string | null
  email: string | null
  /** The colour the user picked; null means they picked none. Not what to paint with. */
  bgColorHex: string | null
  avatar: AvatarView
  isSuperAdmin: boolean
  /** Effective permission: the stored clearance, or super-admin. */
  mayCreateCommunities: boolean
  createdAt: string | null
}
```

- [ ] **Step 2: Den Typecheck die betroffenen Fixtures aufzählen lassen**

```bash
cd webapp-vue && pnpm typecheck
```

Erwartet: Fehler „Property 'avatar' is missing" in genau diesen sechs Dateien:
`src/auth/__tests__/useAuth.spec.ts`, `src/auth/__tests__/guard.spec.ts`,
`src/communities/__tests__/CommunityMenu.spec.ts`,
`src/communities/__tests__/useCommunityCreationGuard.spec.ts`,
`src/pages/communities/__tests__/index.spec.ts`, `src/pages/communities/__tests__/new.spec.ts`.

Meldet der Lauf weitere Dateien, gilt die Ausgabe — nicht diese Liste.

- [ ] **Step 3: In jeder gemeldeten Fixture das Feld ergänzen**

Jeweils direkt nach der `bgColorHex: null,`-Zeile einfügen (Einrückung der umgebenden Zeilen übernehmen):

```ts
  avatar: { shortName: 'OCTO', bgColorHex: '#8e44ad' },
```

In den Fixtures mit `username: 'Alice'` stattdessen:

```ts
    avatar: { shortName: 'ALIC', bgColorHex: '#8e44ad' },
```

- [ ] **Step 4: Grün bestätigen**

```bash
cd webapp-vue && pnpm typecheck && pnpm test && pnpm lint
```

Erwartet: alles grün.

- [ ] **Step 5: Commit**

```bash
git add -A webapp-vue/src
git commit -m "feat(webapp): mirror the server's avatar on MeResponse

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Der Header zeigt den Avatar

Das Konto-Menü ergibt ohne Konto keinen Sinn. Statt im Trigger zwischen Avatar und Ersatz-Icon zu verzweigen — was beim Laden sichtbar flackert — wird der Anwender zur Prop-Vorbedingung, und ein leerer Platzhalter hält währenddessen die Geometrie.

**Files:**
- Modify: `webapp-vue/src/auth/MemberMenu.vue`
- Modify: `webapp-vue/src/App.vue:13` und `:42-45`
- Modify: `webapp-vue/src/auth/__tests__/MemberMenu.spec.ts`
- Modify: `webapp-vue/src/__tests__/app-header.spec.ts`

**Interfaces:**
- Consumes: `Avatar.vue` (Task 3), `MeResponse['avatar']` (Task 5).
- Produces: `MemberMenu` mit Pflicht-Prop `user: MeResponse`.

- [ ] **Step 1: Die scheiternden Tests schreiben**

In `webapp-vue/src/auth/__tests__/MemberMenu.spec.ts` den Mock und den Mount-Helfer umstellen — `useAuth` liefert nur noch `logout`, der Anwender kommt als Prop:

```ts
import type { MeResponse } from '@/api/types'

function mockAuth(logout: () => Promise<void>) {
  vi.mocked(useAuth).mockReturnValue({
    user: ref(null) as never,
    status: ref('authenticated') as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout,
    markAnonymous: vi.fn(),
  })
}

function viewer(over: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 'u1',
    username: 'clemens',
    githubLogin: 'clemens',
    githubName: null,
    email: null,
    bgColorHex: null,
    avatar: { shortName: 'CLMN', bgColorHex: '#8e44ad' },
    isSuperAdmin: false,
    mayCreateCommunities: false,
    createdAt: null,
    ...over,
  }
}

async function open(user: MeResponse = viewer()) {
  const Cmp = (await import('@/auth/MemberMenu.vue')).default
  const w = mount(Cmp, { props: { user } })
  await w.find('button').trigger('click')
  return w
}
```

Die bestehenden Testfälle entsprechend anpassen:
- `mockAuth(vi.fn().mockResolvedValue(undefined))` bleibt (nur noch ein Argument).
- Der Super-Admin-Fall montiert `await open(viewer({ isSuperAdmin: true }))` statt `mockAuth(..., true)`.

Und einen neuen Testfall ergänzen:

```ts
  it('wears the viewer as the avatar the roster would draw', async () => {
    mockAuth(vi.fn().mockResolvedValue(undefined))
    const Cmp = (await import('@/auth/MemberMenu.vue')).default
    const w = mount(Cmp, { props: { user: viewer() } })
    const trigger = w.find('button')
    expect(trigger.text()).toBe('CLMN')
    expect(trigger.find('.rounded-full').attributes('style')).toMatch(
      /#8e44ad|rgb\(142, 68, 173\)/,
    )
  })
```

In `webapp-vue/src/__tests__/app-header.spec.ts` den Stub um die Prop erweitern und den Anwender mockbar machen:

```ts
import type { MeResponse } from '@/api/types'

const viewer: MeResponse = {
  id: 'u1',
  username: 'octo',
  githubLogin: 'octo',
  githubName: null,
  email: null,
  bgColorHex: null,
  avatar: { shortName: 'OCTO', bgColorHex: '#8e44ad' },
  isSuperAdmin: false,
  mayCreateCommunities: false,
  createdAt: null,
}

function mockStatus(status: 'unknown' | 'authenticated' | 'anonymous') {
  vi.mocked(useAuth).mockReturnValue({
    user: ref(status === 'authenticated' ? viewer : null) as never,
    status: ref(status) as never,
    bootstrap: vi.fn(),
    loginWithGitHub: vi.fn(),
    logout: vi.fn(),
    markAnonymous: vi.fn(),
  })
}
```

Im `stubs`-Objekt: `MemberMenu: { template: '<div data-test="member-menu" />', props: ['user'] },`

Und einen neuen Testfall ergänzen (der bestehende „shows the member menu only for an authenticated viewer" bleibt unverändert und funktioniert durch den angepassten `mockStatus` weiter):

```ts
  it('holds the avatar’s place while the session is still unknown', () => {
    // Without this the header content to its left slides sideways the moment /api/me lands.
    mockStatus('unknown')
    const loading = mount(App, { global: { stubs } })
    expect(loading.find('[data-test=member-menu-placeholder]').exists()).toBe(true)
    expect(loading.find('[data-test=member-menu]').exists()).toBe(false)

    mockStatus('anonymous')
    const anon = mount(App, { global: { stubs } })
    expect(anon.find('[data-test=member-menu-placeholder]').exists()).toBe(false)

    mockStatus('authenticated')
    const signedIn = mount(App, { global: { stubs } })
    expect(signedIn.find('[data-test=member-menu-placeholder]').exists()).toBe(false)
    expect(signedIn.find('[data-test=member-menu]').exists()).toBe(true)
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

```bash
cd webapp-vue && pnpm vitest run src/auth/__tests__/MemberMenu.spec.ts src/__tests__/app-header.spec.ts
```

Erwartet: FAIL — der Trigger zeigt noch das Icon statt `CLMN`, und der Platzhalter existiert nicht.

- [ ] **Step 3: `MemberMenu.vue` umstellen**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Avatar from '@/ui/Avatar.vue'
import HeaderMenu from '@/ui/HeaderMenu.vue'
import { useAuth } from '@/auth/useAuth'
import type { MeResponse } from '@/api/types'

const props = defineProps<{ user: MeResponse }>()

const router = useRouter()
const { logout } = useAuth()
const failed = ref(false)
</script>
```

`handleLogout` bleibt unverändert. Im Template:

```vue
    <template #trigger><Avatar v-bind="props.user.avatar" size="sm" /></template>

    <div data-test="current-user" class="px-3 pt-1 pb-0.5 text-xs text-neutral-500">
      {{ props.user.username }}
    </div>
    <RouterLink
      v-if="props.user.isSuperAdmin"
```

Der Import `IconMember from '~icons/lucide/circle-user'` entfällt ersatzlos, ebenso der Kommentar „Only rendered for the role…" bleibt erhalten (er erklärt weiterhin das `v-if`).

- [ ] **Step 4: `App.vue` umstellen**

Zeile 13:

```ts
const { user, status } = useAuth()
```

Zeilen 42-45:

```vue
        <div class="flex items-center gap-3">
          <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
          <MemberMenu v-if="user" :user="user" />
          <!-- Holds the place while /api/me is in flight, so the header content to its left
               cannot slide when the avatar arrives. Size = the trigger's (size-8 plus its p-1). -->
          <div v-else-if="status === 'unknown'" data-test="member-menu-placeholder" class="size-10" />
        </div>
```

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün.

Sollte `pnpm typecheck` an `:user="user"` scheitern (`DeepReadonly<MeResponse>` nicht auf `MeResponse` zuweisbar), den Prop-Typ in `MemberMenu.vue` auf `defineProps<{ user: Readonly<MeResponse> }>()` ziehen und erneut prüfen — nicht `as never` oder einen Cast einbauen.

- [ ] **Step 6: Commit**

```bash
git add -A webapp-vue/src
git commit -m "feat(webapp): the header wears the viewer, not an icon

One rendering of a person across the app. The account menu makes no sense
without an account, so the viewer becomes a required prop guarded once in
App.vue rather than a branch inside the trigger that would visibly flicker
while /api/me lands.

status stays alongside user because user === null means two things: not yet
known, and nobody signed in. Only the first reserves space.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Die Farbfrage entscheiden und den Wahlschalter entfernen

Der `variant`-Prop existiert, um eine Entscheidung zu ermöglichen, nicht um Konfigurierbarkeit zu stiften. Diese Task holt die Entscheidung ein und räumt auf.

**Files:**
- Modify: `webapp-vue/src/ui/Avatar.vue` (je nach Entscheidung)
- Modify: `webapp-vue/src/ui/__tests__/Avatar.spec.ts` (je nach Entscheidung)
- Modify: `webapp-vue/src/auth/MemberMenu.vue` (nur falls eine andere Variante als `color` gewinnt)

**Interfaces:**
- Consumes: alles aus Tasks 3 und 6.
- Produces: die endgültige Header-Darstellung.

- [ ] **Step 1: Dev-Server starten**

`.claude/launch.json` prüfen; existiert kein Eintrag für `webapp-vue`, einen anlegen:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "webapp", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "port": 5173 }
  ]
}
```

Dann über das Preview-Tool starten (`preview_start` mit `{name: "webapp"}`) — **nicht** über Bash. Das Backend muss dafür laufen (`cd core && ./mvnw spring-boot:run`), sonst liefert `/api/me` nichts und der Header bleibt beim Platzhalter.

- [ ] **Step 2: Die drei Varianten zeigen**

Nacheinander in `MemberMenu.vue` `variant="color"`, `variant="muted"`, `variant="grayscale"` am `Avatar` setzen und je einen Screenshot des Headers machen. Mitbeurteilt wird die weiße Outline auf dem dunklen Header (`bg-stone-900`) — sie ist für hellen Grund entworfen.

Die Screenshots dem Menschen zeigen und die Entscheidung einholen. **Hier wird gewartet, nicht geraten.**

- [ ] **Step 3: Die nicht gewählten Varianten entfernen**

- Bleibt es bei `color`: den `variant`-Prop, den `filter`-Computed und die `filter`-Klasse aus `Avatar.vue` streichen; den Testfall „can be drained of colour…" aus `Avatar.spec.ts` streichen.
- Gewinnt `muted` oder `grayscale`: den Prop ebenfalls streichen und die gewählte Filterklasse **fest** in `Avatar.vue` verdrahten — aber nur für den Header, nicht für die Rangliste. Dafür ist dann ein Prop nötig, der die Absicht benennt statt der Technik (z. B. `subdued?: boolean`), samt eigenem Testfall.
- Gewinnt die Outline auf dunklem Grund nicht: die Ring-Farbe in `Avatar.vue` entsprechend anpassen und den Outline-Testfall auf den neuen Wert ziehen.

- [ ] **Step 4: Grün bestätigen**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: alles grün, keine ungenutzten Props oder toten Klassen mehr.

- [ ] **Step 5: Commit**

```bash
git add -A webapp-vue/src
git commit -m "refactor(webapp): settle the header avatar's look

The variant prop was a way to decide, not a feature. The decision is made,
so the switch goes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Vollen Lauf über beide Seiten machen**

```bash
cd core && ./mvnw test
```

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

Erwartet: alles grün. Erst danach ist die Arbeit fertig.
