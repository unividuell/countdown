# Header-Avatar — ein Avatar für den ganzen Anwender

**Status:** beschlossenes Design (2026-08-06).

**Baut auf:** der [Rangliste-Reihe](2026-08-03-community-members-design.md) (`useRoster`,
`RosterMemberResponse`, `MemberShortName`, `AvatarColor`).

**Berührt:** `core` (Modul `iam`, Modul `community`) und `webapp-vue`.

## Zweck

Oben rechts im Header sitzt heute ein statisches Lucide-Icon (`circle-user`,
`MemberMenu.vue:28`). In der Rangliste wird derselbe Mensch dagegen als farbiger Kreis mit
Initialen dargestellt (`MemberRow.vue:173-179`). Zwei Darstellungen für eine Person.

Es soll **nur eine Form des Avatars** auf der UI geben: der Kreis mit Initialen, wie im
Community-Roster. Der Header zeigt künftig denselben Avatar wie die Rangliste.

## Entscheidungen (im Brainstorming festgelegt)

- **Die Wahrheit liegt im Backend.** Initialen und Farbe eines Users werden serverseitig
  bestimmt, nicht im Client nachgebaut. Der Frontend-Nachbau des Initialen-Algorithmus und des
  Farb-Hashings wäre eine zweite Implementierung derselben Regel — genau das, was
  [cross-runtime-parity](../../../.claude/guidelines/cross-runtime-parity.md) vermeiden will.
- **Die Avatar-Regeln gehören zu `iam`, nicht zu `community`.** `MemberShortName` und
  `AvatarColor` operieren ausschließlich auf `User`-Feldern (`username`, `bgColorHex`, `id`).
  Dass sie heute in `community.internal` liegen, ist ein Artefakt ihrer ersten Verwendung.
- **`MeResponse.bgColorHex` bleibt roh.** Das Feld ist die Rückseite von `UpdateProfileRequest`:
  `null` heißt „der Anwender hat keine Farbe gewählt". Diese Information darf die Antwort nicht
  verlieren. Die aufgelöste Farbe kommt daneben, nicht darüber.
- **Eine gemeinsame Komponente, kein kopiertes Markup.** `Avatar.vue` in `webapp-vue/src/ui/`,
  benutzt von Rangliste und Header.
- **Die Farbfrage im Header wird gesehen, nicht geraten.** Voll bunt, gedämpft oder
  Schwarz-Weiß entscheidet sich am laufenden Dev-Server im Vergleich.

## Backend

### `Avatar` als öffentlicher Begriff in `iam`

Neu: `core/src/main/kotlin/org/unividuell/countdown/core/iam/Avatar.kt`

```kotlin
data class Avatar(val shortName: String, val bgColorHex: String) {
    companion object {
        fun of(user: User): Avatar = Avatar(
            shortName = MemberShortName.of(user.username),
            bgColorHex = AvatarColor.resolve(user.bgColorHex, requireNotNull(user.id)),
        )
    }
}
```

`MemberShortName.kt` und `AvatarColor.kt` ziehen unverändert von
`community/internal/` nach `iam/internal/` um; ihre Logik bleibt Zeile für Zeile dieselbe.
Öffentlich ist ab jetzt nur noch `Avatar` — die beiden Helfer sind Interna von `iam`.

`Avatar.of(user)` ist damit die **einzige** Stelle, an der beantwortet wird, wie ein Anwender
aussieht. Wer den Avatar braucht, ruft sie; niemand kombiniert die zwei Regeln selbst.

### `RosterService`

`RosterService.kt:37-39` ersetzt die zwei Einzelaufrufe durch `Avatar.of(user)`:

```kotlin
val avatar = Avatar.of(user)
RosterMemberResponse(
    userId = member.userId,
    shortName = avatar.shortName,
    fullName = user.username,
    bgColorHex = avatar.bgColorHex,
    ...
)
```

`RosterMemberResponse` bleibt flach und unverändert — kein Frontend-Change an der Rangliste,
keine geänderten Roster-Tests. Das ist der Regressionsschutz: die Rangliste muss nach dem Umzug
exakt dasselbe rendern wie vorher.

Die Modulith-Richtung stimmt schon: `community` hängt bereits über `UserQuery` an `iam`. Es
kommt keine neue Abhängigkeit dazu, nur eine weitere Nutzung der bestehenden.

### `/api/me`

`MeResponse` bekommt ein Feld `avatar: Avatar`:

```kotlin
data class MeResponse(
    val id: UUID,
    val username: String,
    ...
    val bgColorHex: String?,   // unverändert: die *gewählte* Farbe, null = keine gewählt
    val avatar: Avatar,        // neu: aufgelöst, immer gesetzt
    ...
)
```

`toMeResponse()` füllt es mit `Avatar.of(this)`. Beide Endpunkte — `GET` und `PATCH` — liefern
es, ohne Sonderfall.

Warum daneben statt darüber: Ein Profilformular, das `bgColorHex` in einen Farbwähler
vorbelegt, würde bei einer aufgelösten Farbe eine Wahl anzeigen, die der Anwender nie getroffen
hat. `avatar.bgColorHex` beantwortet „womit male ich den Kreis", `bgColorHex` beantwortet „was
hat der Anwender eingestellt". Zwei Fragen, zwei Felder.

## Frontend

### `webapp-vue/src/ui/Avatar.vue`

Das Markup aus `MemberRow.vue:173-179` wird zur Komponente:

```vue
<script setup lang="ts">
withDefaults(defineProps<{
  shortName: string
  bgColorHex: string
  size?: 'sm' | 'lg'
  variant?: 'color' | 'muted' | 'grayscale'
}>(), { size: 'lg', variant: 'color' })
</script>
```

- **`size`** — `lg` = `size-12` (Rangliste, unverändert), `sm` = `size-8` (Header).
  Die Schriftgröße skaliert mit.
- **`variant`** — `color` (unverändert), `muted` (`saturate-50`), `grayscale` (`grayscale`),
  als CSS-Filter auf dem Kreis. Reine Entscheidungshilfe, siehe unten.
- Der Kreis ist das Wurzelelement, damit Vues Attribut-Durchreichung greift: Aufrufer hängen
  `data-swarm-circle`, `ring-2 ring-white` oder `z-index` von außen an. Alles
  Rangliste-Spezifische (Schwarm-Animation, Ring zum Überlappen) bleibt beim Aufrufer.
- Die Neigung der Initialen (`rotate-[-40deg]`) ist Teil des Looks und zieht mit in die
  Komponente.

`readableTextColor.ts` zieht von `src/members/` nach `src/ui/` — die Kontrastfarbe ist jetzt
eine Aussage der Avatar-Darstellung, nicht der Rangliste. Die Funktion selbst bleibt unverändert;
die Komponente berechnet sie pro Avatar statt die Rangliste für alle auf einmal
(`MemberRow.vue:49` entfällt).

### `MemberRow.vue`

Ersetzt den Inline-Kreis durch:

```vue
<Avatar
  :short-name="m.shortName"
  :bg-color-hex="m.bgColorHex"
  data-swarm-circle
  class="ring-2 ring-white"
/>
```

Der `textColors`-Computed und der `readableTextColor`-Import entfallen. Sonst ändert sich in
der Datei nichts — Schwarm, Punkte-Pille und Live-Badge bleiben, wo sie sind.

### `MemberMenu.vue`

Der Trigger wird zum Avatar:

```vue
<template #trigger>
  <Avatar v-if="user" v-bind="user.avatar" size="sm" />
  <IconMember v-else class="size-5" />
</template>
```

Das Lucide-Icon bleibt als Rückfall stehen: `MemberMenu` wird zwar nur bei
`status === 'authenticated'` gerendert (`App.vue:44`), aber ein Trigger-Button ohne Inhalt wäre
ein kaputter Button, und `user` ist im Typ nullable.

Der Header ist dunkel (`hover:bg-stone-800`) — der farbige Kreis steht dort auf dunklem Grund,
anders als in der Rangliste auf hellem. Das ist der Grund, warum die Farbfrage offen bleibt.

### Typen

`MeResponse` in `webapp-vue/src/api/types.ts` bekommt `avatar: { shortName: string;
bgColorHex: string }`. Alle Test-Fixtures, die ein `MeResponse` bauen — u.a. `useAuth.spec.ts`,
`guard.spec.ts`, `CommunityMenu.spec.ts`, `useCommunityCreationGuard.spec.ts`,
`communities/index.spec.ts`, `communities/new.spec.ts` — bekommen das Feld. Der Typecheck
(`vue-tsc`) zeigt die vollständige Liste.

## Die Farbentscheidung

`variant` existiert, um eine Entscheidung zu ermöglichen, nicht um Konfigurierbarkeit zu
stiften. Ablauf:

1. Umsetzung mit `variant="color"` im Header.
2. Dev-Server starten, Header in allen drei Varianten zeigen.
3. Entscheidung.
4. **Die nicht gewählten Varianten fliegen raus.** Bleibt es bei `color`, verschwindet der
   `variant`-Prop ganz.

Kein toter Wahlschalter im Code, nachdem die Wahl getroffen ist.

## Tests

**Backend**

- `AvatarTest` (neu, in `iam`): `Avatar.of(user)` setzt Initialen aus `username` und nimmt die
  gewählte Farbe, wenn gesetzt; sonst die aus der User-ID abgeleitete.
- `MemberShortNameTest` und `AvatarColorTest` ziehen mit nach `iam` um, inhaltlich unverändert.
  Sie sind der Beweis, dass der Umzug nichts an der Regel ändert.
- `UserControllerTest`: `GET /api/me` eines Users **ohne** gewählte Farbe liefert
  `avatar.bgColorHex` als Hex-Wert und `bgColorHex` weiterhin als `null`; `avatar.shortName` ist
  gesetzt.
- Roster-Tests bleiben unverändert und müssen grün bleiben.
- Der bestehende Modulith-Verifikationstest deckt ab, dass `community` nicht in `iam.internal`
  greift.

**Frontend**

- `ui/__tests__/Avatar.spec.ts` (neu): rendert `shortName`; setzt `background` auf
  `bgColorHex`; wählt dunkle Schrift auf hellem und helle auf dunklem Grund; `size="sm"` und
  die `variant`-Klassen schlagen durch; durchgereichte Klassen landen am Kreis.
- `MemberRow.spec.ts` bleibt unverändert — grün heißt, die Rangliste sieht aus wie vorher.
- `MemberMenu.spec.ts`: der Trigger zeigt den Avatar mit den Initialen des angemeldeten
  Anwenders statt des Icons.

## Was nicht dazugehört

- Kein Profilformular, kein Farbwähler — `UpdateProfileRequest` existiert, aber eine UI dafür
  ist nicht Teil dieser Arbeit.
- Kein Foto-Avatar. Es gibt kein Bild-Feld in der API, und der GitHub-Avatar wird nicht
  eingeführt.
- Keine Umbenennung von `RosterMemberResponse` auf ein verschachteltes `avatar`-Objekt. Die
  Rangliste funktioniert flach; sie umzubauen brächte nur Symmetrie, keine Wirkung.
