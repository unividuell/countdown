# Community-Erstellung nur nach Freischaltung

**Status:** beschlossenes Design (2026-08-04).

**Baut auf:** dem [`iam`-Modul mit GitHub-Login und Super-Admin-Rolle](2026-06-12-user-management-github-login-design.md),
der [Super-Admin-Community-Übersicht](2026-08-01-super-admin-community-overview-design.md) und der
[Community-Route-Namespace](2026-08-02-community-route-namespace-design.md).

## Ziel

Nicht jeder angemeldete User darf eigene Spielgemeinschaften anlegen. Ein Super-Admin schaltet
einzelne Nutzer dafür frei. Die Freischaltung passiert in einem neuen Bereich unter `/super-admin`,
der dabei vom Button-Sammelplatz zu einer Nav-Liste mit Unterseiten wird.

## Scope

**Drin:** ein Freischalt-Flag pro User; Durchsetzung im Backend; Verstecken aller UI-Einstiegspunkte
zum Erstellen; der Super-Admin-Bereich „Nutzer" als Liste plus Detailansicht mit der Aktion; der
Umbau von `/super-admin` zur Nav-Liste; eine gemeinsame Button-Komponente mit In-flight-Zustand,
eingesetzt an den Buttons dieser Story.

**Explizit draußen:**

- **Kein Antrags-Workflow.** Der User kann keine Freischaltung anfordern und erfährt auch nicht,
  dass es sie gibt — der Einstieg ist einfach nicht da. Absprache mit dem Super-Admin passiert
  außerhalb der App.
- **Kein Grandfathering.** Auch wer heute schon Communities besitzt, startet ohne Flag.
- **Keine Suche/Filter in der Nutzer-Liste.** Der Nutzerkreis ist klein; nachrüstbar, wenn die
  Liste wirklich lang wird.
- **Kein Löschen oder Bearbeiten fremder Profile.** Der neue Bereich kann genau eine Sache
  schalten.
- **Kein flächiges Nachziehen des In-flight-Zustands.** Die übrigen mutierenden Buttons der App
  bekommen einen eigenen Branch (siehe „Folgeaufgabe").

## Bestandsaufnahme

- `POST /api/communities` ([`CommunityController.create`](../../../core/src/main/kotlin/org/unividuell/countdown/core/community/internal/CommunityController.kt))
  prüft heute nichts außer `authenticated`.
- `/api/super-admin/**` ist zentral in `SecurityConfig` per `hasRole("SUPER_ADMIN")` gegated; die
  beiden bestehenden Super-Admin-Controller verzichten deshalb bewusst auf eigene Checks.
- `pages/super-admin/index.vue` mischt die Super-Admins-Tabelle mit einem Button zu
  `/super-admin/communities`.
- Es gibt **keine** In-flight-Behandlung für Buttons in der App. `run()` in `requests.vue` und
  `members.vue` ist zweimal fast dieselbe Funktion.
- Der Session-Prinzipal wird nach `PATCH /api/me` nie erneuert: `GET /api/me` liefert nach einem
  Reload den alten `User` aus der Session. Ein vorhandener Fehler, der auf demselben Pfad liegt wie
  dieses Feature.

## Mechanismus: Berechtigung live lesen, nie aus der Session

Das Flag liegt als Spalte auf `iam.users`, wird aber **nie** über `AuthenticatedUser` gelesen. Der
Prinzipal wird JDK-serialisiert in die Spring-Session-JDBC-Tabelle geschrieben; eine nach dem Login
erteilte Freischaltung wäre dort nicht sichtbar und würde erst beim nächsten Anmelden wirken. Für
`is_super_admin` ist diese Drift dokumentiert und gewollt (die Rolle wird bei jedem Login aus der
Allowlist neu abgeleitet) — hier wäre sie schlicht kaputte UX.

Deshalb bleibt `AuthenticatedUser` unverändert: es soll gar keine Session-Kopie des Flags geben, die
man versehentlich als Berechtigungsquelle heranziehen kann.

Kosten: ein `SELECT … WHERE id = ?` über den Primary Key bei `GET /api/me` (einmal pro
SPA-Bootstrap, nicht pro Navigation) und bei `POST /api/communities`. Gegen die Session-Abfrage, die
Spring Session ohnehin bei jedem Request fährt, ist das Rauschen.

## Datenmodell

`core/src/main/resources/db/migration/iam/V2__add_community_creation_allowed.sql`:

```sql
ALTER TABLE iam.users
    ADD COLUMN community_creation_allowed BOOLEAN NOT NULL DEFAULT FALSE;
```

Kein Backfill — der Start ist bewusst bei null. `DEFAULT FALSE` deckt Bestandszeilen und Neuzugänge
gleichermaßen ab.

**Zwei Namen, zwei Fakten.** Die gespeicherte Erlaubnis und die effektive Berechtigung sind nicht
dasselbe, weil `is_super_admin` nur in die zweite einfließt. Sie heißen deshalb verschieden:

```kotlin
val communityCreationAllowed: Boolean = false          // die Spalte, roh

/** Effective permission: the stored clearance, or super-admin. The only place this rule lives. */
val mayCreateCommunities: Boolean get() = isSuperAdmin || communityCreationAllowed
```

Die berechnete Property wird von Spring Data JDBC nicht persistiert — `User.username` ist der
Präzedenzfall. Die Super-Admin-DTOs tragen die **rohe** `communityCreationAllowed` (der Schalter
muss den gespeicherten Wert zeigen), `MeResponse` die **effektive** `mayCreateCommunities`.

`UserProvisioningService.provision` darf das Feld **nicht** anfassen, sonst setzt jeder Login die
Freischaltung zurück — genau die Mechanik, in die `is_super_admin` absichtlich hineinläuft.

*(Fußnote: `User` ist `Serializable` und liegt in der Session. `serialVersionUID` ist auf `1L`
fixiert, bestehende Sessions deserialisieren das neue Feld als `false`. Für die Berechtigung
irrelevant, weil sie nicht aus der Session gelesen wird — und die App ist noch nicht produktiv.)*

## Backend

### `iam` — Policy und Verwaltung

`UserQuery` bekommt eine Methode, die die *effektive* Berechtigung beantwortet:

```kotlin
/**
 * Effective permission to create communities: the per-user flag, or super-admin.
 * Read live and never from AuthenticatedUser — the principal is JDK-serialized into the
 * session, so a clearance granted after sign-in would not be visible there.
 */
fun mayCreateCommunities(id: UUID): Boolean
```

Unbekannte id → `false`. Implementierung in `UserQueryService`, die auf `User.mayCreateCommunities`
zurückgreift statt die Regel zu wiederholen.

`MeResponse` bekommt `mayCreateCommunities` (effektiv, also `true` für Super-Admins).
`UserController.me` liest die Zeile frisch statt `principal.user` zurückzugeben — womit auch der
oben notierte Profil-Bug verschwindet. Fehlt die Zeile, hat die Session ihren User überlebt: neue
`StaleSessionException` → `401` im `IamExceptionHandler`. Damit greift die bestehende SPA-Mechanik
(`setUnauthorizedHandler` → `markAnonymous` → `/login`) von selbst.

Der Lesepfad ist `UserProfileService.current(userId): User`, nicht `UserQuery`. Grund ist die
Testbarkeit: `UserControllerTest` authentifiziert per `principalFor(user(...))` mit `TEST_USER_ID`,
für den keine DB-Zeile existiert — ein Live-Read über einen echten Bean würde alle bestehenden
`/api/me`-Tests auf `401` schicken, und eine Zeile mit fixer id lässt sich nicht ohne Umweg
einfügen (Spring Data JDBC fährt bei nicht-null `@Id` ein UPDATE). `UserProfileService` liegt in
dem Test bereits als `@MockkBean` und ist auch inhaltlich der richtige Ort: `GET /api/me` und
`PATCH /api/me` lesen und schreiben dasselbe eigene Profil.

**Umbenennung:** der heutige `SuperAdminUserController` bedient `/api/super-admin/super-admins` und
wird zu `SuperAdminRosterController` (passend zu seinem `SuperAdminRosterService`). Der Name
`SuperAdminUserController` gilt dann der neuen Nutzerverwaltung.

| Endpoint | Antwort |
|---|---|
| `GET /api/super-admin/users` | Liste: `userId, username, githubLogin, isSuperAdmin, communityCreationAllowed, createdAt`, sortiert nach Name |
| `GET /api/super-admin/users/{id}` | Detail: zusätzlich `githubName, displayName, email, bgColorHex, updatedAt` |
| `PUT /api/super-admin/users/{id}/community-creation` | Body `{"allowed": true}` → `200` mit dem aktualisierten Detail |

Eigene Sub-Ressource statt `PATCH /users/{id}`: so kann der Endpoint nicht unbemerkt zum
allgemeinen „Super-Admin editiert fremde Profile"-Tor auswachsen. Die Antwort ist das frische
Detail, damit die SPA aus Server-Wahrheit rendert statt lokal zu raten. Unbekannte id →
`UserNotFoundException` → `404`. Keine Autorisierungsprüfung im Controller, konsistent zur
bestehenden Konvention — mit demselben KDoc-Hinweis wie bei den anderen Super-Admin-Controllern.

Logik in einem neuen `SuperAdminUserService` (`iam/internal`): `list()`, `detail(id)`,
`setCommunityCreation(id, allowed)`.

### `community` — Durchsetzung

`CommunityController.create` fragt `userQuery.mayCreateCommunities(me.id)` und wirft sonst eine neue
`CommunityCreationNotAllowedException`, die in `CommunityExceptionHandler` neben `NotAdminException`
auf `403` läuft. Keine neue Modulkante: `community` hängt über `UserQuery`/`AuthenticatedUser`
schon an `iam`.

## Frontend

### Routen

```
pages/super-admin/index.vue          →  /super-admin              Nav-Liste + Super-Admins-Tabelle
pages/super-admin/communities.vue    →  /super-admin/communities  unverändert + Back-Link
pages/super-admin/users/index.vue    →  /super-admin/users        neu
pages/super-admin/users/[id].vue     →  /super-admin/users/:id    neu
```

`super-admin.vue` bleibt als Shell mit dem Zugriffs-Check. Das `users/`-Verzeichnis braucht keine
eigene Layout-Datei; die Seiten hängen direkt unter der Shell.

### `/super-admin` als Hub

Eine `<ul>` mit zwei vollbreiten `RouterLink`-Zeilen (Nutzer, Spielgemeinschaften) mit Chevron und
Tap-Target ≥ 44px, darunter Trenner und die heutige Super-Admins-Tabelle unter ihrer Überschrift.
Weil der Index jetzt ein echter Hub ist, bekommen die Unterseiten oben je einen Back-Link
(`← Super-Admin`, auf der Detailseite `← Nutzer`) — heute führt aus `communities.vue` nur das
Konto-Menü zurück.

### Nutzer-Liste

Mobile-first als Zeilenliste, nicht als breite Tabelle: Name groß, `@githubLogin` klein darunter,
rechts Badges; die ganze Zeile ist der Link ins Detail. Sortierung nach Name.

Das Badge „Erstellen erlaubt" erscheint nur bei gesetztem `communityCreationAllowed` — `false` ist die stille Mehrheit und
braucht kein Etikett. Für Super-Admins erscheint stattdessen nur „Super-Admin": das subsumiert die
Berechtigung, und zwei Badges würden zwei unabhängige Zustände suggerieren.

### Nutzer-Detail

Kopf mit Name und `@githubLogin`, darunter eine Definitionsliste (GitHub-Login, GitHub-Name,
Anzeigename, E-Mail, Farbe als Swatch, Mitglied seit, zuletzt geändert), darunter der Aktionsblock
„Spielgemeinschaften erstellen" mit Freischalten/Entziehen.

Kein optimistisches UI: `PUT` abwarten, den Zustand aus der Antwort übernehmen, bei Fehler inline
meldern und den alten Zustand behalten. `state`-Handling wie auf den bestehenden Seiten
(`'loading' | 'ready' | 'error'`).

Bei einem Super-Admin ist die Aktion deaktiviert, mit dem Hinweis, dass Super-Admins immer erstellen
dürfen — das Flag umzuschalten hätte dort keine sichtbare Wirkung, und ein Schalter, der nichts tut,
ist schlimmer als keiner.

### API-Layer

`api/types.ts`: `mayCreateCommunities: boolean` auf `MeResponse`, plus `SuperAdminUserListEntry` und
`SuperAdminUserDetail`. `api/superAdmin.ts`: `listUsers`, `getUser(id)`,
`setCommunityCreation(id, allowed)`.

### Die Einstiegspunkte, die zugehen

| Ort | Was |
|---|---|
| `communities/CommunityMenu.vue` | `+ Spielgemeinschaft` (`data-test="create-community"`) hängt an `user?.mayCreateCommunities` |
| `pages/communities/index.vue` | Button „Spielgemeinschaft erstellen" per `v-if` |
| `pages/communities/index.vue` | Empty-State-Text verzweigt |
| `pages/communities/new.vue` | neues `communities/useCommunityCreationGuard.ts` |
| `POST /api/communities` | der echte Riegel → `403` |

Der Divider bei `CommunityMenu.vue:67` schließt den Admin-Block ab und bleibt; direkt vor
`+ Spielgemeinschaft` steht keiner. Es fällt nur der `RouterLink` weg.

**Leeres Menü vermeiden.** Heute garantiert der Create-Link, dass das Community-Menü immer
mindestens einen Eintrag hat. Fällt er weg, bekäme ein Nicht-Admin in genau einer Spielgemeinschaft
ein leeres Dropdown. Der `HeaderMenu` hängt darum an
`viewerIsAdmin || others.length > 0 || mayCreateCommunities` — kein Menü ist besser als ein leeres.

**Empty-State umformulieren.** Ein neuer, nicht freigeschalteter User ohne Einladung landet über den
Landing-Guard (`kind === 'none'` → `/communities`) auf einer Seite, deren Text ihn zum Erstellen
auffordert, während der Button fehlt. Für diesen Fall bleibt nur der Verweis auf den Einladungslink:

> Du bist noch in keiner Spielgemeinschaft. Öffne einen Einladungslink, den du erhalten hast.

Also keine Erklärung der Sperre — aber auch keine Aufforderung ins Leere.

**Guard.** `communities/useCommunityCreationGuard.ts` nach dem Vorbild von `useAdminGuard`:
`onMounted` → `router.replace('/communities')`, wenn die Berechtigung fehlt. `useAuth` ist vor dem
Mount bootstrappt, der Wert liegt also vor. Der Backend-`403` ist der echte Riegel; das hier ist UX.

## Aktions-Feedback

**`ui/useAction.ts`** kapselt eine async-Aktion und liefert `busy`, `error` und Doppelklick-Schutz.
Neben `ui/ActionButton.vue`, weil beide dasselbe Muster bilden; `ui/navigationProgress.ts` ist der
Präzedenzfall für ein `.ts` in diesem Ordner.

Bewusst **ohne** keyed Variante (`busyKey`, damit bei Zeilen-Aktionen nur der geklickte Button
spinnt): gebraucht wird sie erst von `requests.vue`/`members.vue`, und die liegen in der
Folgeaufgabe. Sie entsteht dort zusammen mit der Extraktion der beiden `run()`-Duplikate, an
echten Aufrufstellen statt auf Vorrat.

**`ui/ActionButton.vue`** — Props `busy`, `disabled`, `type`, Label im Slot. Geometrie:

- `display: inline-flex; justify-content: center`, links **und** rechts ein reservierter 14px-Slot.
  Das Label steht damit in jedem Zustand zentriert und die Button-Breite ändert sich nicht.
- Im Lauf belegt der vordere Slot den Spinner (`~icons/lucide/loader-circle`,
  `motion-safe:animate-spin`), der hintere bleibt leer.
- Das Label bleibt sichtbar und wird nur ausgegraut; dazu `disabled` und `aria-busy="true"`.
- Bei `prefers-reduced-motion` wird die Drehung stark verlangsamt, nicht abgeschaltet — sonst gibt
  es kein Signal.

Eingesetzt wird das an den Buttons dieser Story: `super-admin/users/[id].vue` (Freischalten /
Entziehen) und `communities/new.vue` (Erstellen).

### Folgeaufgabe

Die restlichen mutierenden Buttons bleiben vorerst ohne In-flight-Zustand und bekommen einen eigenen
Branch: `c/[slug]/requests.vue` (Annehmen, Ablehnen), `c/[slug]/members.vue` (Befördern,
Degradieren, Entfernen), `c/[slug]/settings.vue` (Speichern, Link neu erzeugen ×2, Link widerrufen),
`auth/MemberMenu.vue` (Abmelden), `pages/index.vue` (Erneut versuchen).

## Tests

Nach TDD, jeweils erst der fallende Test.

**Backend** (kotest-Matcher, mockk, MockMvc Kotlin DSL)

- `UserQueryService.mayCreateCommunities`: Flag gesetzt → `true`; Super-Admin ohne Flag → `true`;
  keins von beidem → `false`; unbekannte id → `false`.
- `POST /api/communities`: ohne Berechtigung `403`, mit Flag `201`, als Super-Admin `201` —
  `UserQuery` als `@MockkBean`. Die beiden bestehenden `POST`-Tests brauchen dafür einen Stub.
- `GET /api/me`: der Test, der den Mechanismus festnagelt — der Prinzipal trägt
  `communityCreationAllowed=false`, die von `UserProfileService.current` gelieferte Zeile `true`,
  die Antwort muss `true` sein. Plus: Zeile fehlt → `401`. Die bestehenden `/api/me`-Tests brauchen
  einen `current`-Stub.
- `PUT /api/super-admin/users/{id}/community-creation`: als Super-Admin mit `with(csrf())` → `200`
  und gedrehtes Flag; ohne CSRF → `403`; als normaler User → `403`; unauthentifiziert → `401`;
  unbekannte id → `404`.
- Integration gegen Testcontainers: `V2` läuft, Default ist `false`, Roundtrip über
  `UserRepository`.
- `ModularityTests` bleibt grün — es entsteht keine neue Modulkante.

**Frontend** (Vitest + `vi`)

- `useAction`: `busy` während des Laufs gesetzt und danach geräumt (auch bei Reject), Doppelaufruf
  blockiert, `error` bei Reject, alter Zustand bleibt.
- `ActionButton`: Label immer im DOM; bei `busy` zusätzlich `disabled` und `aria-busy="true"`; beide
  Slots vorhanden.
- `CommunityMenu`: Create-Link nur mit Berechtigung; Trigger verschwindet, wenn nichts übrig bleibt.
- `communities/index.vue`: Button und Empty-State-Text folgen der Berechtigung.
- `useCommunityCreationGuard`: `replace('/communities')` ohne Berechtigung, kein `replace` mit.
- `super-admin/index.vue`: beide Nav-Einträge mit korrekten Zielen, Super-Admins-Tabelle bleibt.
- `super-admin/users/index.vue`: Zeilen und Badges (Super-Admin subsumiert die Berechtigung), Link
  ins Detail, loading/error.
- `super-admin/users/[id].vue`: Felder gerendert; Freischalten ruft die API und übernimmt die
  Antwort; Fehler meldet inline und behält den Zustand; bei Super-Admin ist die Aktion deaktiviert.

## Entschiedene Alternativen

| Frage | Entscheidung | Verworfen |
|---|---|---|
| Berechtigung im Prinzipal? | live aus der DB | Flag auf `AuthenticatedUser` — Freischaltung wirkt erst beim nächsten Login |
| Bestandsuser | alle bei `false` | Grandfathering für heutige Community-Admins; „alle bestehenden User dürfen" |
| Nicht berechtigt sieht … | Einstieg ist einfach weg | Hinweistext statt Button; disabled Button mit Tooltip |
| Nav-Eintrag | „Nutzer" | „Spieler"; „Accounts" |
| Detailtiefe | Profil-Fakten + eine Aktion | plus Mitgliedschaften des Users; Toggle direkt in der Liste |
| Super-Admins-Tabelle | bleibt unter der Nav-Liste | eigener Nav-Eintrag; in die Nutzer-Liste gefaltet |
| Spinner im Button | Label bleibt, Slots beidseitig reserviert | Label wird `invisible`, Spinner überlagert; Slot nur einseitig |
| Umfang In-flight | nur die Buttons dieser Story | alle 12 Stellen sofort; nur lokales `busy` ohne Shared-Code |
