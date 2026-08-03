# Community Members — die Rangliste-Reihe

**Status:** beschlossenes Design (2026-08-03).

**Baut auf:** dem Fly-in-Spike auf `claude/member-animation-spike-ed3010` (Commit `57affce`,
`webapp-vue/src/spike/`) — die Physik ist dort fertig, getestet und wird übernommen, nicht neu
erfunden. Weiter auf dem [`rng`-Modul](2026-08-02-cross-runtime-rng-design.md), der
[Anti-Cheat-Absichtserklärung](2026-08-02-anti-cheat-design.md) und der
[Community-Route-Namespace](2026-08-02-community-route-namespace-design.md).

**Referenz:** `huettehuette.unividuell.org`, `components/user/status/UserStatus.vue` +
`composables/useUsers.ts`. Diese Ansicht wird portiert, nicht ersetzt: sie gefällt nach Jahren noch,
neu ist allein der Auftritt.

## Ziel

Auf der Community-Startseite `/c/{slug}` steht die Rangliste als dichte Reihe überlappender
Kreise — ein Kreis pro Mitglied, Kürzel im Kreis, Punkte-Pille darunter. Beim Laden der Seite finden
die Mitglieder von den Bildschirmrändern zusammen: verstreut, weil man online spielt, beieinander
für das Spiel.

## Scope

**Drin:** die Reihe selbst — Anzeige, Sortierung, Fly-in, horizontales Wischen, Lade- und
Fehlerzustand; ein member-sichtbarer API-Endpoint; die Naht, an der später echte Spielpunkte
andocken.

**Explizit draußen:**

- **Kein Klick-Detail.** Kreise sind nicht interaktiv. Die Auflösung des Kürzels passiert über
  `aria-label`/`title`, nicht über ein Panel.
- **Kein Profil-Bearbeiten.** `PATCH /api/me` mit `displayName` + `bgColorHex` existiert im Backend
  bereits ohne UI; das bleibt ein eigenes Feature.
- **Kein `noncompetitive`.** Das Original kannte ein Flag, das Mitglieder außer Konkurrenz ans Ende
  sortierte. Bewusst weggelassen — es gibt keinen Anlass, und es käme mit eigener Verwaltungs-UI.
- **Keine echten Spielpunkte.** Die Spiele sind nicht gebaut und laut Anti-Cheat-Spec
  server-autoritativ. Hier entsteht nur die Naht.

## Bestandsaufnahme

| Was | Zustand |
|---|---|
| `GET /api/communities/{slug}/members` | **admin-only** (`access.requireAdmin`), liefert auch `PENDING` — die Verwaltungsliste. Bleibt unangetastet. |
| `access.requireActiveMember(...)` | existiert, wird heute vom Self-Leave benutzt. |
| `User.bgColorHex` | Spalte existiert, nullable. |
| `User.username` | abgeleitet: `displayName ?: githubName ?: githubLogin`. |
| `SeededRandom` | `core/rng`, `fromSeed(String)` + `nextIntBetween(min, maxInclusive)`. |
| `/c/{slug}` (`index.vue`) | leer, Platzhalter. |
| Punkte, Runden-Ergebnisse | existieren nicht. |

Es kommt **keine Datenbankspalte** dazu, also **keine Flyway-Migration**.

## API

### `GET /api/communities/{slug}/roster`

Zugang: `access.requireActiveMember(me.id, me.isSuperAdmin, slug)`. Liefert ausschließlich
`ACTIVE`-Mitglieder, fertig sortiert.

```kotlin
data class RosterMemberResponse(
    val userId: UUID,
    val shortName: String,   // max. 4 Zeichen, für den Kreis
    val fullName: String,    // für aria-label / title
    val bgColorHex: String,  // nie null — aufgelöst, siehe unten
    val points: RosterPointsResponse,
)
data class RosterPointsResponse(
    val stable: Int,
    val live: Int?,          // null, solange der Betrachter sie nicht sehen darf
)
```

Ein eigener Endpoint statt einer Lockerung von `/members`: die Verwaltungsliste braucht `PENDING`
und `isAdmin`, die Reihe braucht Kürzel, Farbe und Punkte. Zwei Konsumenten, zwei Verträge.

**Kein `isAdmin`.** In der Reihe wird Admin-Status nicht dargestellt — auch das Original tat das
nicht. Ein Feld ohne Konsumenten wäre nur eine Einladung, später etwas darauf zu bauen.

### Sortierung

1. `stable + (live ?: 0)` absteigend.
2. Beitrittsdatum aufsteigend (`CommunityMember.createdAt`).
3. `userId` als letzter Tiebreak.

Die ersten beiden Stufen sind die Regel des Originals. Stufe 3 ist neu und notwendig: solange alle
auf 0 stehen, entscheidet sonst die Datenbank-Reihenfolge, und die Reihe würde zwischen zwei Aufrufen
springen.

Dass die Sortierung nach genau der Größe geht, die auch angezeigt wird, ist Absicht: eine Rangfolge,
die nach unsichtbaren Live-Punkten sortiert, wäre für den Betrachter unerklärlich. Weil `live` bei
fehlender Sichtbarkeit `null` ist, fällt das automatisch zusammen — kein Sonderfall nötig.

## Die Punkte-Naht

```kotlin
// publizierte Schnittstelle des community-Moduls
interface MemberPointsQuery {
    fun standings(communityId: UUID, viewerId: UUID, userIds: Collection<UUID>): Map<UUID, MemberPoints>
}
data class MemberPoints(val stable: Int, val live: Int?)
```

**Betrachterabhängig, und das ist der Kern.** Im Original hingen die Live-Punkte an
`exposeLiveCakePiece`: sie wurden erst gezeigt, wenn der Betrachter die aktuelle Runde selbst
gespielt hatte. Nach der Messlatte der Anti-Cheat-Spec — der Client darf die Lösung *nie
materialisieren*, nicht nur nie anzeigen — genügt es nicht, sie im Frontend zu verbergen: der Server
darf sie dann **nicht ausliefern**. Daher die `viewerId` im Port und `live = null` als Antwort.

**`live = null` heißt bewusst zweierlei:** „du darfst es nicht sehen" *und* „dieses Mitglied hat die
Runde noch nicht gespielt". Beide Fälle rendern identisch (kein `+N`-Badge) und sortieren identisch
(`+0`), sie sind also nicht unterscheidbar — und sie zusammenzulegen ist zugleich die sichere
Richtung, weil kein Zustand existiert, in dem versehentlich etwas durchsickert. Ein zusätzliches
`liveVisible`-Flag wäre redundant und würde eine Verzweigung einführen, die man falsch auswerten kann.

Zwei Implementierungen:

| Bean | Aktiv | Verhalten |
|---|---|---|
| `ZeroMemberPoints` | immer, wenn keine andere Bean da ist | `stable = 0`, `live = null` |
| `StubMemberPoints` | `@ConditionalOnProperty("app.stub-points.enabled")` | deterministische Werte aus der `userId` via `SeededRandom.fromSeed(userId.toString())`, inklusive Live-Punkte für einen Teil der Mitglieder |

`app.stub-points.enabled` ist ein **eigenes** Property, absichtlich nicht an `app.test-auth.enabled`
gekoppelt, und steht auf `true` in `application.yaml` (lokal) **und** `application-staging.yaml`.
Produktion überschreibt es auf `false`.

Staging bekommt die Stub-Punkte, weil dort ohnehin die geseedeten Testnutzer laufen
(`app.test-auth.enabled: true`): erfundene Punkte sind dort keine Aussage über echte Spieler, und mit
lauter Nullen wäre die Rangliste auf Staging gar nicht beurteilbar — genau das, wofür Staging da ist.
Das eigene Property bleibt trotzdem getrennt, damit „Testlogin an" und „erfundene Punkte an" einzeln
abschaltbar sind.

**Zur Modul-Grenze:** die Schnittstelle liegt im Consumer (`community`); ein künftiges Spiel-Modul
implementiert sie und hängt damit von `community` ab. Das ist eine bewusst provisorische Wahl — sie
kostet heute nichts und wird entschieden, wenn das erste Spiel existiert, nicht vorher.

## Ableitungen

### Kürzel (Backend)

Regel des Originals, unverändert übernommen. Eingabe ist `User.username`:

1. `uppercase()`.
2. **Nur wenn länger als 4:** Vokale `[AEIOU]` entfernen, dann alles außer `[a-zA-Z0-9]`.
3. **Nur wenn dann noch länger als 4:** aufeinanderfolgende Dopplungen kollabieren (`(.)\1+` → `$1`).
4. Auf 4 Zeichen abschneiden. Ist das Ergebnis leer, `":/"`.

Die Bedingung in Schritt 2 ist wesentlich und leicht zu übersehen: ein kurzer Name wie `":-|"` bleibt
dadurch **wörtlich stehen** — im Original-Screenshot ist genau das ein Avatar. Wer die Bedingung
wegoptimiert, löscht solche Namen.

### Hintergrundfarbe (Backend)

`user.bgColorHex`, falls gesetzt. Sonst deterministisch aus der `userId`:

```
hue = SeededRandom.fromSeed(userId.toString()).nextIntBetween(0, 359)
hsl(hue, 0.5, 0.5) -> #rrggbb
```

Sättigung und Helligkeit fest bei 0,5 wie im Original — das begrenzt den Farbraum auf Töne, auf denen
sowohl weiße als auch schwarze Schrift lesbar sein *kann*, und verhindert Neon.

**Warum im Backend:** die Ersatzfarbe braucht den seeded RNG. Ihn dafür im Frontend zu haben hieße,
die Referenz-Implementierung aus dem Test-Scope zu befördern, und
`webapp-vue/src/lib/rng/__tests__/seededRandom.reference.ts` schränkt das ausdrücklich ein. Eine
Ersatzfarbe erfüllt die dort genannte Bedingung („presentational und schon öffentlich") — aber es
wäre eine Entscheidung mit Gewicht für etwas, das das Backend ohnehin kann. Weil die Farbe damit nur
an *einer* Stelle entsteht, gibt es auch keine Cross-Runtime-Paritätsfrage.

### Textfarbe (Frontend)

`readableTextColor(hex)`: relative Luminanz nach WCAG, daraus `#111111` oder `#ffffff`. Reine
Funktion, keine Dependency (bewusst kein chroma-js — das Original brauchte es, wir brauchen 12
Zeilen), und die einzige Ableitung, die im Frontend bleibt. Sie gehört dorthin, weil sie eine
Aussage über das Rendern ist und keine über die Domäne.

## Frontend

Neues Modul `webapp-vue/src/members/`:

| Datei | Aufgabe |
|---|---|
| `swarm.ts` | die Physik, aus dem Spike übernommen (`git checkout claude/member-animation-spike-ed3010 -- …`) samt Tests, mit den drei unten beschriebenen Änderungen |
| `swarmTuning.ts` | die Konstanten; das Regler-Panel und `mockMembers.ts` bleiben im Spike |
| `readableTextColor.ts` | Kontrastfarbe |
| `useRoster.ts` | Laden, Lade- und Fehlerzustand |
| `MemberRow.vue` | die Reihe — im Kern `MemberSwarm.vue` des Spikes, gefüttert aus der API |

Dazu `RosterMemberResponse` in `src/api/types.ts`, `getRoster(slug)` in `src/api/communities.ts`, und
`/c/{slug}` rendert `MemberRow`.

### Darstellung

Wie das Original: `flex -space-x-2`, Kreis `size-12` mit `ring-2 ring-white`, Kürzel um −40° gedreht,
darunter die Punkte-Pille (`bg-yellow-400`) mit `points.stable`. Ist `points.live` gesetzt und
größer 0, zusätzlich ein `+N`-Badge mit Puls und gelbem Ring. Absteigende `z-index` nach Rang, damit
die Überlappung nach rechts hin „hinter" liegt.

### Mobile-first

Die Zielgruppe sind Telefone (siehe [frontend.md](../../../.claude/guidelines/frontend.md)). Neun
Kreise à 40 px Mittenabstand sind 360 px — auf einem 390er Display passt das knapp, darüber wird
gewischt: `overflow-x: auto` mit unterdrücktem Balken (`scrollbar-width: none` plus
`&::-webkit-scrollbar { display: none }`). Ein sichtbarer horizontaler Scrollbalken auf dem Telefon
ist ein Layoutfehler, keine Bedienhilfe.

### Die Animation

Die Reihe liegt im normalen Fluss und trägt nur ein `transform`; die Ruheposition ist damit per
Definition Offset 0, und das Layout bewegt sich nie. Die Kräfte werden über die Flugzeit gerampt:
der Sog zum Platz wächst, Kohäsion und Chaos verklingen, die Dämpfung steigt.

Die Werte bleiben die **am Spike gemessenen**: rund 0,7 s Trödeln, dann der Einsturz, ein
Überschwinger von ~42 px, drei abklingende Nachwipper, still nach ~2,9 s. Eine kürzere Gesamtdauer
war zwischenzeitlich erwogen und wieder verworfen: sie wäre nur der Preis für die Scroll-Sperre
gewesen, und die entfällt (siehe Punkt 1). Ohne diesen Zwang ist die längere, verspieltere Variante
die bessere — ein Nachwipper statt drei hätte den Fly-in knackig, aber ärmer gemacht.

Zwei Änderungen gegenüber dem Spike:

**1. Der Viewport ist eine Kiste — keine Scroll-Sperre mehr.** Im Spike starteten die Mitglieder
*außerhalb* des Viewports, größtenteils angeschnitten. Das war der Grund für die Scroll-Sperre: ein
transformiertes Element vergrößert die scrollbare Fläche seiner Vorfahren, also erzeugten die
Startpositionen Scrollbalken, und der Spike setzte hilfsweise `overflow: hidden` auf
`documentElement`.

Stattdessen bleiben jetzt **alle Positionen vollständig innerhalb des Viewports**: die Startpositionen
hängen von innen an den Rändern, und der Viewport bekommt Wände, an denen die Kreise abprallen
(dieselbe Restitution wie bei den Kreis-Kreis-Stößen). Damit entsteht nie scrollbare Fläche, die
Scroll-Sperre entfällt vollständig — und die Wandstöße machen den Flug sogar lebhafter, nicht ruhiger.
Bezahlt wird es mit dem „angeschnitten am Rand"-Bild, das im Spike ausdrücklich gewünscht war; dieser
Tausch ist bewusst getroffen worden, weil eine Scroll-Sperre beim Laden auf dem Telefon teurer ist
als der Effekt wert ist.

**2. `overflow` am scrollenden Vorfahren.** Neu, weil die Reihe im Spike gar nicht scrollte: Punkt 1
löst nur die *Dokument*-Scrollbalken, aber `overflow-x: auto` an der Reihe rechnet `overflow-y`
ebenfalls auf `auto` und würde die fliegenden Kreise am ~62 px hohen Reihenband abschneiden. Also
während des Flugs `overflow: visible`, erst nach dem Landen scrollbar.

Weil die Startpositionen jetzt von innen an den Rändern hängen statt außerhalb, sind die Flugwege
etwas kürzer als im gemessenen Spike-Lauf. Die ~2,9 s sind damit eine Obergrenze; einmal am laufenden
Bild nachmessen genügt, die Konstanten selbst sind belegt.

### Reduced Motion

`prefers-reduced-motion: reduce` überspringt die Animation vollständig: die Reihe steht sofort, kein
rAF-Loop.

### Lade- und Fehlerzustand

Die Ruhepositionen müssen gemessen werden, also kann erst nach dem Eintreffen der Daten animiert
werden. Bis dahin ein Platzhalter **in Reihenhöhe**, damit kein Layoutsprung entsteht. Fehler: eine
ruhige Meldung an derselben Stelle. Eine Community mit einem einzigen Mitglied animiert normal.

## Tests

**Backend** (mockk + kotest + MockMvc-DSL + Testcontainers, TDD):

- Zugang: Nicht-Mitglied abgewiesen, `PENDING`-Mitglied abgewiesen, aktives Mitglied bekommt 200,
  Super-Admin ohne Mitgliedschaft kommt durch.
- Inhalt: nur `ACTIVE`; `bgColorHex` nie null, auch wenn das Profil keine Farbe hat.
- Sortierung: nach Punkten; bei Gleichstand nach Beitrittsdatum; bei identischem Beitrittsdatum
  stabil über zwei Aufrufe.
- Live-Punkte: liefert der Port `live = null`, fehlt der Wert **im JSON** — nicht nur in der
  Darstellung. Das ist der Test, der die Anti-Spoiler-Zusage festnagelt.
- Kürzel-Regel als Unit-Test, mit `":-|"` als Fall, der unverändert bleiben muss, und `"anna"` →
  `"ANNA"`, `"hubert"` → `"HBRT"`.
- Farb-Determinismus: dieselbe `userId` ergibt zweimal denselben Hex-Wert.

**Frontend** (Vitest + `vi`):

- `readableTextColor`: dunkler Grund → weiß, heller Grund → dunkel, plus die Grenzfälle.
- `useRoster`: Erfolg, Fehler, und dass der Fehlerzustand nicht die Reihe rendert.
- `MemberRow`: rendert N Kreise in der vom Server gelieferten Reihenfolge (das Frontend sortiert
  **nicht** nach); `+N`-Badge nur bei gesetztem `live`; `prefers-reduced-motion` ohne Animation.
- Die Physik-Tests kommen aus dem Spike mit (Konvergenz, Endlichkeit, Terminierung bei feindlichem
  Tuning, Startpositionen am Rand und unregelmäßig verteilt) — mit zwei Anpassungen: die
  Startpositionen liegen jetzt **innerhalb** des Viewports, und neu dazu kommt die Zusage, die die
  Scroll-Sperre ersetzt: **keine Position verlässt zu irgendeinem Zeitpunkt den Viewport**, über den
  ganzen Flug geprüft, nicht nur am Start.
- Gesamtdauer: die Animation erreicht `finished` von selbst, nicht erst über die Notbremse — der
  Test aus dem Spike, der genau das festnagelt, bleibt.

## Bewusste Provisorien

Damit sie beim nächsten Anfassen nicht als Versehen gelesen werden:

- `MemberPointsQuery` liegt im `community`-Modul, obwohl Punkte eine Spiel-Angelegenheit sind.
- Der Spike-Branch bleibt liegen; nur `swarm.ts` und seine Tests wandern herüber.
