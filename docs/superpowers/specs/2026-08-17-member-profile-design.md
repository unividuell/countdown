# Profil bearbeiten — Design

Zu [Issue #55](https://github.com/unividuell/countdown/issues/55).

## Scope

Ein Nutzer soll seinen Anzeigenamen und seine Hintergrundfarbe selbst setzen können — global, und
davon abweichend pro Spielgemeinschaft. Wer in einer Gruppe anders heißen will als in einer anderen,
soll das dort hinterlegen; wo nichts hinterlegt ist, gilt das Globale.

Das Backend kann die globale Hälfte bereits: `PATCH /api/me` mit `displayName` und `bgColorHex`
existiert samt Hexprüfung. Es hat nur nie jemand aufgerufen — im Frontend gibt es keinen einzigen
Einstieg ins eigene Profil. Diese Scheibe baut den Einstieg, das Formular und den Override pro
Mitgliedschaft.

Nicht in dieser Scheibe: Overrides in den Admin-Listen (Mitglieder, Anfragen) und in den
Super-Admin-Ansichten — dazu unten unter *Reichweite*. Und keine Eindeutigkeitsprüfung: zwei
Mitglieder derselben Gemeinschaft dürfen denselben Spitznamen tragen.

## Der Einstieg

Das Issue benennt die eigentliche Schwierigkeit selbst: nicht das Speichern, sondern der Weg
dorthin. Zwei Ebenen — global und pro Gemeinschaft — dürfen nicht zu zwei Orten werden, an denen
man raten muß, welcher gerade gemeint ist.

**Eine Zeile im Fußblock des Drawers**, über „Super-Admin“ und „Abmelden“, mit dem Label „Profil
bearbeiten“. Ohne Symbol und ohne Avatar: die anderen Fußzeilen tragen keins, und der eigene Avatar
steht bei offenem Drawer ohnehin im Header darüber — ihn hier zu wiederholen hieße, dieselbe Person
zweimal übereinander zu zeichnen.

**Zwei Routen, ein Formularaufbau.** Innerhalb einer Gemeinschaft verlinkt die Zeile auf
`/c/‹slug›/profile`, außerhalb auf `/profile`. Die URL sagt damit selbst, welche Gemeinschaft
gemeint ist — sie überlebt Neuladen und läßt sich verschicken, und die Seite muß den Kontext nicht
aus dem Navigationszustand raten. Die community-gebundene Route liegt in der bestehenden
`[slug]`-Shell und bekommt Name und Kontext von dort geschenkt.

`/c/‹slug›/profile` zeigt zwei Blöcke untereinander: zuerst „Bei ‹Gemeinschaft›“, darunter
„Überall“. `/profile` zeigt nur den zweiten. Was oben steht, ist das, was hier und jetzt gilt.

## Datenmodell

Zwei neue Spalten auf der bestehenden Mitgliedstabelle
(`community/V5__add_member_profile_columns.sql`):

```sql
ALTER TABLE community.community_members
    ADD COLUMN display_name TEXT NULL,
    ADD COLUMN bg_color_hex TEXT NULL;
```

`CommunityMember` bekommt `displayName: String? = null` und `bgColorHex: String? = null`. Keine
eigene Tabelle: der Override *ist* eine Eigenschaft der Mitgliedschaft, und wer die Gemeinschaft
verläßt, verliert die Zeile und damit seinen Auftritt dort — das steht schon im Schema, ohne
zusätzlichen Fremdschlüssel und ohne Cascade.

Beide Spalten sind einzeln nullbar, obwohl das Formular sie zunächst nur gemeinsam schreibt (siehe
*Frontend*). Die Datenbank soll nicht abbilden, was heute die Oberfläche kann: ein Teil-Override —
anderer Name, gleiche Farbe — ist fachlich sinnvoll, und die Auflösung unten behandelt die Felder
ohnehin einzeln.

Nebeneffekt, der die Wahl bestätigt: `RosterService` lädt die Mitgliedszeilen bereits
(`members.findByCommunityId`); der Override kommt dort ohne eine einzige zusätzliche Abfrage mit.

## Auflösung und Modulgrenze

Die Regel, pro Feld, an genau einer Stelle:

```
username    = member.displayName ?: user.displayName ?: user.githubName ?: user.githubLogin
bgColorHex  = member.bgColorHex  ?: user.bgColorHex  ?: derive(user.id)
shortName   = MemberShortName.of(username)
```

`AvatarColor.resolve` bleibt unverändert — es bekommt lediglich `member.bgColorHex ?:
user.bgColorHex` gereicht statt `user.bgColorHex`. Die abgeleitete Farbe hängt weiter an der
User-ID: wer nirgends etwas einstellt, sieht überall gleich aus.

`iam.Avatar` bekommt eine zweite Fabrik `of(user, nameOverride, bgColorHexOverride)`. Damit bleibt
`iam` die einzige Stelle, die aus einem Namen vier Zeichen und aus nichts eine Farbe macht — und
kennt trotzdem keine Gemeinschaft: es nimmt zwei Werte entgegen, die gewinnen, wenn sie da sind, und
weiß nicht, woher sie kommen.

Neu im `community`-Modul, öffentlich:

```kotlin
data class MemberIdentity(val username: String, val avatar: Avatar)

interface MemberIdentityQuery {
    fun of(communityId: UUID, userIds: Collection<UUID>): Map<UUID, MemberIdentity>
    fun of(communityId: UUID, userId: UUID): MemberIdentity?
}
```

Die Batch-Variante ist die eigentliche: wer viele Zeilen zeichnet, muß sie benutzen — dieselbe Regel,
die `UserQuery.findAllById` schon trägt.

Dahinter, modulintern, ein `MemberIdentityResolver`, der aus *einer* Mitgliedszeile und *einem* User
eine `MemberIdentity` macht. Ihn benutzen beide: der Port (der die Zeilen selbst lädt, für `game` und
`gamelab`) und `RosterService` (der sie schon hat). Eine Auflösungsregel, kein doppelter Read im
Roster.

Umgestellt auf den Port: `RosterService`, `RoundResponses` — dessen Signatur bekommt die
`communityId`, die der Aufrufer über den Slug längst kennt — und `LabService`. `Avatar.of(user)`
bleibt für alles ohne Gemeinschaft: `/api/me`, Super-Admin, Dev-Login.

`game` und `gamelab` hängen bereits an `CommunityQuery`/`MembershipQuery`; die Kante ist keine neue
Richtung, und `ModularityTests` bleibt grün.

## API

**`iam` — ein Feld mehr.** `MeResponse` bekommt `displayName: String?`, den *rohen* selbstgewählten
Namen. `username` daneben bleibt der effektive; das Formular braucht den rohen, um ein leeres Feld
von einem übernommenen GitHub-Namen unterscheiden zu können. `PATCH /api/me` bleibt wie es ist.

**`community` — drei Endpunkte.**

```
GET    /api/communities/{slug}/me/profile  → 200 { displayName, bgColorHex, identity }
PUT    /api/communities/{slug}/me/profile  { displayName, bgColorHex } → 200 { identity }
DELETE /api/communities/{slug}/me/profile  → 204
```

Das `GET` liefert den rohen Override zum Vorbelegen *und* die effektive Identität für die Vorschau.
`PUT` trägt dieselbe Sollzustand-Semantik wie `PATCH /api/me`: der Rumpf ist der vollständige
gewünschte Zustand, `null` löscht ein Feld. `DELETE` ist der Schalter-Aus und setzt beide Spalten auf
`NULL`.

Alle drei gehen durch `CommunityAccess.requireActiveMember`, das für Fremde und für unbekannte Slugs
gleichermaßen **404** liefert (`CommunityAccessDeniedException`) — eine Gemeinschaft, zu der man
nicht gehört, existiert für einen nicht. Kein 403: das bleibt dem Fall „Mitglied, aber kein Admin“
vorbehalten, den es hier nicht gibt.

Ein Sonderfall, den `requireActiveMember` durchläßt: der Super-Admin kommt auch ohne Mitgliedschaft
durch. Für ihn gibt es dann keine Mitgliedszeile, in die ein Override gehörte. Die beiden
Schreibpfade zielen deshalb ausdrücklich auf die *eigene* Mitgliedszeile und antworten 404, wenn es
sie nicht gibt — statt still null Zeilen zu aktualisieren und 200 zu melden.

**Vorschau — zwei weitere Endpunkte**, je einer neben seinem Schreibpfad:

```
POST /api/me/avatar-preview                       { displayName, bgColorHex } → 200 { username, avatar }
POST /api/communities/{slug}/me/avatar-preview    { displayName, bgColorHex } → 200 { username, avatar }
```

`POST`, nicht `GET`: der Name gehört nicht in eine URL und damit nicht in Zugriffsprotokolle und
Zwischenspeicher.

Beide führen **keine eigene Logik** aus. Sie rufen dieselbe Auflösung wie der Ernstfall, nur mit
einer ungespeicherten Zeile: der globale Endpunkt bildet `user.copy(displayName = …, bgColorHex = …)`
und reicht ihn durch `Avatar.of`, der community-gebundene ruft `MemberIdentityResolver` mit den
Kandidatenwerten statt den gespeicherten Spalten. Damit ist die Vorschau nicht *ungefähr* das
Ergebnis des Speicherns, sondern beweisbar dasselbe — und `MemberShortName` bleibt eine einzige
Implementierung in einer einzigen Laufzeit. Es gilt dieselbe Validierung wie beim Schreiben: was der
Server nicht speichern würde, zeigt er auch nicht als Vorschau.

**Für den Header** bekommt `CommunityResponse` ein `viewerIdentity: { username, avatar }` — die
effektive Identität des Betrachters in dieser Gemeinschaft. Guard-eigene Navigationsdaten, wie
`viewerIsAdmin` und `pendingCount` daneben; bewußt nur der effektive Wert, kein Formularzustand.

**Validierung an einer Stelle.** Das Hexmuster lebt heute als privates `Regex` in
`UserProfileService`; das `community`-Modul bräuchte dasselbe. Also ein kleines öffentliches
`iam.ProfileFields`:

- `normalizeName`: trimmen, leer → `null`, höchstens 32 Zeichen (sonst 400).
- `normalizeColor`: `#rrggbb`, klein geschrieben gespeichert (sonst 400).

Beide Schreibpfade benutzen es. Trimmen und Länge sind neu — sie fehlen der globalen Hälfte bisher,
und ein Name, der eine Zeile sprengt, ist auf beiden Ebenen derselbe Fehler.

### Zur Länge

32 Zeichen, hergeleitet am engsten Ort: der voll ausgeschriebene Name steht im
`GuessHueScoreboard` in einer `truncate`-Zelle, die auf einem 375px-Telefon nach den drei
Zahlenspalten noch etwa 200px behält — rund 24 Zeichen bis zum Abschneiden. Trotzdem nicht 24: die
Grenze gilt nur für das selbstgewählte Feld, während der Rückfall `githubName` nirgends gekürzt wird.
Eine Grenze unterhalb üblicher GitHub-Anzeigenamen hieße, man dürfte seinen eigenen GitHub-Namen
nicht abtippen. 32 liegt über allem Realistischen und bleibt begrenzt; das Kürzen im engen Layout
bleibt Aufgabe von `truncate`, nicht der Validierung.

## Frontend

**Blöcke statt Seiten.** `src/profile/GlobalProfileBlock.vue` und
`src/profile/CommunityProfileBlock.vue`; jeder Block lädt und speichert sich selbst.
`src/pages/profile.vue` rendert nur den globalen, `src/pages/c/[slug]/profile.vue` beide. Dazu
`src/api/profile.ts` und die Typen in `src/api/types.ts`.

**Der Community-Block** trägt einen Schalter „eigener Auftritt hier“. Aus: ein Satz, der sagt, was
stattdessen gilt, samt globaler Vorschau. An: Namensfeld und Farbwähler, vorbelegt mit den *aktuell
wirksamen* Werten — beim Einschalten darf sich nichts unsichtbar ändern.

Geschrieben wird erst beim Speichern: `PUT`, solange der Schalter an ist, `DELETE`, wenn er aus ist.
Der Schalter selbst schreibt nichts — ein Umlegen, das sofort wirkt, wäre das einzige Bedienelement
der Seite, das den Speichern-Knopf übergeht.

**Der globale Block** hat dasselbe Feldpaar. Das Namensfeld leer bedeutet: GitHub-Name, der als
Platzhalter sichtbar steht. Der Farbwähler bekommt zusätzlich einen kleinen Knopf „Automatisch“, der
auf die abgeleitete Farbe zurückstellt (`bgColorHex = null`) — ein `<input type="color">` hat keinen
leeren Zustand, dieser dritte Zustand braucht also ein eigenes Bedienelement.

**Feldpaar in einer Zeile**, Name breit, Farbe schmal daneben — die Form aus der Vorlage
(`UserStatusProfile.vue` im Ursprungsprojekt, dort 4/5 zu 1/5). Kompakt genug fürs Telefon, und der
Farbwähler bleibt ein Daumenziel.

**Vorschau, die beim Tippen mitzieht.** Je Block ein `Avatar`, der zeigt, wie man nach dem Speichern
aussähe. Das ist der Zweck der Seite: die vier Zeichen, die aus einem Namen werden, will niemand
raten — und die Vorlage macht es genauso.

Gerechnet wird sie trotzdem nicht im Browser. `MemberShortName` ist Kotlin und bleibt es; das
Frontend bekommt `shortName` fertig geliefert. Eine Portierung der Reduktionsregeln nach TS wäre ein
zweiter Bestand derselben Logik in zwei Laufzeiten, den
[cross-runtime-parity.md](../../../.claude/guidelines/cross-runtime-parity.md) nur mit goldenen
Vektoren und aus zwingendem Grund erlaubt. Stattdessen fragt der Block den Server: `POST` auf den
passenden `avatar-preview`-Endpunkt, entprellt auf 300 ms nach dem letzten Tastendruck
(`watchDebounced` aus VueUse, das im Haus ohnehin die Zeitgeber stellt).

Zwei Dinge gehören zu dieser Entscheidung dazu:

- **Veraltete Antworten fallen unter den Tisch.** Jede Anfrage bekommt eine laufende Nummer, und nur
  die jüngste darf die Vorschau setzen — sonst überschreibt eine langsame Antwort auf „Kle“ die
  schnellere auf „Klemens“. Dasselbe Muster wie im Community-Guard (`routeData.ts`, `seq`).
- **Auch die Farbe kommt aus der Antwort**, nicht direkt aus dem Farbwähler. Naheliegend wäre, den
  gewählten Hexwert sofort in die Vorschau zu schreiben — aber sobald das Feld leer ist, gilt die
  abgeleitete Farbe, und dann stünde die halbe Kette doch wieder im Browser. Ein `<input
  type="color">` ist ohnehin sein eigener Farbfleck und quittiert die Wahl sofort; die 300 ms bis
  zum Avatar fallen nicht auf.

Scheitert eine Vorschau-Anfrage, bleibt schlicht der letzte gültige Avatar stehen: eine Vorschau ist
kein Grund, dem Nutzer einen Fehler vor die Nase zu setzen, und der Fehlerbereich gehört dem
Speichern.

**Speichern je Block** mit `ActionButton` und `useAction` (Pending und Fehler gibt es dort schon),
darunter ein eigener Bereich für die Fehlermeldung — `<p v-if="error" class="text-sm text-red-600">`,
wie in `settings.vue`. Kein neues Knopfverhalten, insbesondere kein grüner Erfolgszustand wie in der
Vorlage. Nach dem globalen Speichern ruft der Block `bootstrap()` aus `useAuth`, damit der Header
sofort stimmt.

Abmelden bleibt im Drawer. Die Vorlage mischt es ins selbe Panel; hier ist die Seite reines Profil.

### Reichweite

Der Avatar im Header folgt der Gemeinschaft: `NavDrawer` zeichnet
`activeCommunity?.viewerIdentity.avatar ?? user.avatar`. Was man oben rechts sieht, ist damit immer
das, was die anderen gerade von einem sehen. `activeCommunity` bekommt das Feld in `context.ts` und
`publishCommunity`; beim Verlassen des Community-Bereichs räumt der Guard es schon heute auf, also
steht dort wieder das Globale.

Nach dem Speichern eines Overrides ist man auf `/c/‹slug›/profile` — also innerhalb der Shell. Der
Block ruft nach erfolgreichem Schreiben `refresh()` aus dem Community-Kontext, damit Header und
Roster die neue Identität übernehmen, ohne daß irgendwo ein zweiter Zwischenspeicher entsteht.

Roster und Rundenauswertung zeigen die Identität der jeweiligen Gemeinschaft — das ist das Feature.
Die Admin-Listen (Mitglieder, Anfragen) und die Super-Admin-Ansichten zeigen weiterhin den globalen
Namen: ein Admin, der eine Beitrittsanfrage bewertet oder jemanden entfernt, muß die Person
zuordnen können, und ein Spitzname, den sich dieselbe Person gerade selbst gegeben hat, hilft ihm
dabei nicht.

## Tests

**Backend** (TDD, mockk + kotest, MockMvc-DSL, Testcontainers):

- `MemberIdentityResolver` — die Fallback-Matrix als Einheit: nur Name überschrieben, nur Farbe,
  beides, nichts. Dazu leere Zeichenketten, weil `""` und `null` hier dasselbe bedeuten müssen.
- `ProfileFields` — trimmen, leer → `null`, Maximallänge, Hexmuster, Kleinschreibung.
- Service mit mockk: `PUT` schreibt beide Spalten, `DELETE` nullt beide, Nicht-Mitglied fliegt raus,
  und der Super-Admin ohne Mitgliedschaft bekommt 404 statt einer Antwort ohne Wirkung.
- MockMvc für die drei Schreib-/Lese-Endpunkte: 401 unangemeldet, 404 für Fremde, 400 bei kaputtem
  Hex und bei zu langem Namen, und der Sollzustand-Fall (`null` löscht).
- Die beiden Vorschau-Endpunkte: dieselben Zugriffs- und Validierungsantworten wie ihre
  Schreibpfade, und — der eigentliche Test — dieselbe Identität wie ein anschließendes Speichern
  derselben Werte. Ein Vorschau-Ergebnis, das vom Gespeicherten abweicht, ist der einzige Fehler,
  den dieser Entwurf überhaupt zulassen kann; er wird direkt geprüft.
- Und das Gegenstück: die Vorschau schreibt nichts. Nach einem `POST` steht in der Mitgliedszeile
  und in `iam.users` unverändert das Alte.
- Das Feature einmal ganz durchgezogen: derselbe Nutzer mit Override in Gemeinschaft A und ohne in
  B — `/roster` und die Rundenantwort zeigen in A Spitzname und Farbe, in B das Globale. Das ist der
  Test, der bei einem Regress als erster kippt.
- `ModularityTests` bleibt grün.

**Frontend** (Vitest + `vi`):

- `GlobalProfileBlock`: Vorbelegung aus `/api/me`, GitHub-Name als Platzhalter, „Automatisch“ setzt
  die Farbe auf `null`, Speichern schickt `PATCH` und ruft `bootstrap()`.
- `CommunityProfileBlock`: Schalter aus zeigt keine Felder; Einschalten belegt mit den wirksamen
  Werten vor; Speichern schickt `PUT`, Ausschalten `DELETE`.
- Vorschau: Tippen löst nach der Entprellzeit genau *eine* Anfrage aus (Zeitgeber über `vi`
  gesteuert, nicht gewartet); die Antwort landet im Avatar; eine verspätet eintreffende ältere
  Antwort wird verworfen; eine gescheiterte Anfrage läßt den letzten Avatar stehen und erzeugt
  keine Fehlermeldung.
- `NavDrawer`: die Zeile existiert und zeigt innerhalb einer Gemeinschaft auf `/c/‹slug›/profile`,
  außerhalb auf `/profile`.
- Header-Avatar: mit gesetztem `viewerIdentity` zeichnet der Drawer-Auslöser dessen Avatar, sonst den
  globalen.
- Routen-Spec: beide neuen Routen existieren und hängen am Auth-Guard.

## Was bewußt offen bleibt

- **Teil-Override in der Oberfläche.** Das Schema kann ihn, das Formular schaltet vorerst beide
  Felder gemeinsam. Wenn sich herausstellt, daß Leute nur die Farbe angleichen wollen, wird aus dem
  einen Schalter ein Schalter pro Feld — ohne Migration.
- **Das Profil anderer ansehen.** Die Vorlage zeigt beim Antippen eines Mitglieds dessen Profil
  lesend an. Hier gibt es dafür noch keinen Ort.
- **Spitznamen in den Admin-Listen.** Falls ein Admin einmal nicht mehr weiß, wer „Zwerg“ ist, wäre
  die Antwort, beide Namen nebeneinander zu zeigen — nicht, den globalen zu ersetzen.
