# Weltanschauung („Spot Object“) — einen genannten Gegenstand in Street View finden

**Status:** beschlossenes Design (2026-08-29).

**Baut auf:** dem Runden-Framework ([Round-Game-Selection](2026-08-11-round-game-selection-design.md)),
dem [Spiel-Labor](2026-08-08-game-lab-design.md) und [Musterung](2026-08-24-musterung-design.md) als
jüngster Referenzportierung.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — und stellt dessen Grundannahme auf
die Probe: dieses Spiel hat als erstes **kein Rundengeheimnis**.

**Berührt:** ein neues Modulith-Modul `spotobject` (keine eigene Tabelle, aber ein HTTP-Client),
den Adapter `SpotObjectGameType`, eine **Framework-Erweiterung um Peer-Review** (eine Tabelle, eine
Spalte, ein Schalter, ein Endpunkt) und im Frontend `games/spotobject/*`, `games/GameEntry.ts`,
`api/types.ts`, `games/registry.ts` sowie `rounds/review.ts`, den Weg der Stimmabgabe von der Seite
bis ins Grid (eine Kette je Welt).
Das Labor wird mitgezogen statt ausgenommen: `LabRoundStore`, `LabDtos`, `LabService`,
`LabController`, `gamelab/games.ts`.

## Zweck & Spielidee

Der Runde wird ein Gegenstand genannt. Der Spieler sucht ihn irgendwo auf der Welt in Google Street
View, stellt sich so hin, dass der Gegenstand im Bild ist, und gibt ab. Es gibt keine hinterlegte
Lösung: die Welt ist groß, und richtige Antworten gibt es beliebig viele.

Bewertet wird nicht durch die Maschine, sondern hinterher durch die Mitspieler. Wer abgibt, hat
zunächst recht.

- **Codename:** `spot-object` (Game-ID), `spotobject` (Modul), `SpotObject*` (Klassen).
- **Anzeigename:** „Weltanschauung“ — das Wortspiel aus *sich die Welt anschauen* und *Weltbild*.

## Die Regeln

1. Die Runde nennt **einen** Gegenstand. Beispiele aus dem Sample-Set, nicht aus der echten Liste:
   „Rosa Gartenzwerg“, „Umgedrehtes Fahrrad“.
2. Der Spieler bewegt sich frei in Street View und gibt ab, sobald er den Gegenstand im Bild hat.
3. **Phase eins:** jeder abgegebene Tipp zählt.
4. **Phase zwei:** die Stoppuhr läuft vom Aufdecken bis zur Abgabe; nur der schnellste Tipp zählt.
5. Nach der Abgabe sehen die Mitspieler die Tipps und können sie **bestätigen oder flaggen**. Ein
   überstimmter Tipp verliert seine Punkte.

**Gesucht wird im Ausland.** Wer in der eigenen Stadt sucht, weiß oft schon, wo etwas steht — das
verdirbt das Spiel. Die Regel wird aber **nicht durchgesetzt**: der Tipp wird angenommen, und im
Scoreboard steht die Landesflagge daneben. Wer einen Tipp aus dem Heimatland durchgehen lässt, hat
nicht aufgepasst; das Erkennen ist Spielerleistung, nicht Serverarbeit. Damit entfällt für v1 jede
Deny-Liste im Code — die Regel lebt im Regeltext des Spiels. Konfigurierbarkeit pro Community steht
unter *Bewusst verschoben*.

## Kein Rundengeheimnis — und was das für die zwei Ausgänge heißt

`params` ist der Begriff, und der wird veröffentlicht. Daraus folgt der Reihe nach:

- `present(params)` trägt genau ein Feld: `{term}`. `timed` (unten) bleibt in `params` und erreicht
  den Client nie — ob eine Uhr läuft, sagt ihm das Framework über das Reveal-Face und die
  ausgelieferte `durationMs`, nicht das Spiel.
- `solution(params)` gibt **`null`** zurück. Es gibt nichts zu enthüllen.
- `judge` antwortet `qualifies = true` und `deviation = 0.0` — für jeden formal gültigen Tipp.
- Die Zwei-Ströme-Regel wird **trivial**: alles kommt aus `random.presentation`, der
  `solution`-Strom bleibt unbenutzt. Es gibt keinen veröffentlichten Wert, aus dem sich ein
  zurückgehaltener rekonstruieren ließe, weil kein Wert zurückgehalten wird.

Die Feld-Set-Tests bleiben trotzdem, in beide Richtungen — sie pinnen dann eben die Leere. Das ist
kein Selbstzweck: sie sind die Stelle, an der auffällt, falls dem Payload später doch etwas beigelegt
wird, das nicht jeder sehen darf.

Ein Nebeneffekt ist erwähnenswert, weil er in den anderen Spielen anders liegt: die
Begriffs-Ziehung ist trotzdem nicht vorhersagbar. Die Seeds kommen aus `GameRandom.independent`
(zwei Ziehungen aus `SecureRandom`), nicht aus Rundenkoordinaten. Wer die ganze Begriffsliste
besitzt, weiß deshalb nicht, welcher Begriff morgen drankommt, und kann sich nichts vorbereiten.

## Der Tipp

Abgegeben und gespeichert wird **kein Bild**, sondern die Adresse eines Blicks:

```
{ panoId, heading, pitch, zoom }
```

Das reicht, um dieselbe Ansicht jederzeit wieder von Google rendern zu lassen, und es hält jedes
Byte Bildmaterial aus unserer Datenbank heraus. Die **Koordinate wird nicht persistiert** — sie wird
im Moment der Abgabe gebraucht, um das Land zu bestimmen, und danach fallen gelassen.

`judge` prüft die Form, bevor irgendetwas geschrieben wird: `panoId` nicht leer, `heading` in
[-180, 360], `pitch` in [-90, 90], `zoom` in [0, 5]. Ein Tippfehler darf den einen Versuch nicht
verbrauchen — deshalb `InvalidGuessException` statt eines gespeicherten Fehlschlags.

## Das Land

Beim Absenden löst der Server die Position per **Reverse Geocoding** in einen Ländercode auf und legt
ihn in `Judgement.outcome` ab:

```kotlin
data class SpotObjectOutcome(val country: String?) : GameOutcome
```

Der `outcome` ist der richtige Platz, weil er genau das ist, was der Server über den Tipp *berechnet*
hat — Pano und Blickwinkel stehen bereits in `guess` und werden ohnehin an alle ausgeliefert, sobald
der Betrachter geraten hat. Er ist als `JSONB` persistiert, das Land überlebt also die Runde und die
History, ohne dass für jede Anzeige neu geocodiert werden muss.

Zwei Festlegungen dazu, beide mit einem Preis:

**Der Aufruf sitzt in `judge`.** Das ist die einzige Stelle, die den Tipp vor dem Schreiben sieht,
und das Spiel besitzt seine Inhalte. Der Preis ist, dass eine Bewertungsfunktion damit Netz-I/O
macht, was sie sonst nirgends tut. Deshalb: kurzer Timeout, und **weich scheitern** — kein Land, kein
Fehler, der Tipp geht durch und die Kachel bleibt ohne Flagge. Eine fremde Störung darf niemandem die
Abgabe kaputt machen. Das ist ein Fall für [logging.md](../../../.claude/guidelines/logging.md):
still degradierendes Verhalten gehört geloggt.

**Kein Punkt-in-Polygon offline.** Die Antwort kommt von Google, statt aus Googles Daten von uns
abgeleitet zu werden. Das ist die Auslegung, die uns keine Diskussion einbringt.

## Peer-Review: eine Stimme mit zwei Seiten

Nicht zwei Mechanismen — **eine Stimme**, die zwei Werte annehmen kann:

```kotlin
enum class Vote { CONFIRM, FLAG }
```

Eine Zeile pro (Tipp, Abstimmer), änderbar und zurücknehmbar. Das verhindert strukturell, dass jemand
gleichzeitig bestätigt und flaggt, gibt einen natürlichen Weg aus einem Versehen heraus, und die
beiden Zählstände sind zwei Filter über dieselbe Tabelle statt zwei Spalten, die auseinanderlaufen
können. Der Oberbegriff für beides ist „Voting“; die Werte heißen nach dem, was sie bedeuten.

### Die Regel

```
gestrichen  ⟺  flags >= 2 && flags > confirms
```

Ein Ausdruck, zwei Fälle. Ohne Bestätigungen greift die Zwei-Stimmen-Schwelle: einer allein kann
niemanden abschießen, zwei Freunde reichen als Signal. Sobald bestätigt wird, muss die Mehrheit der
abgegebenen Stimmen gegen den Tipp stehen. Ein gestrichener Tipp kann durch spätere Bestätigungen
zurückkommen.

### Sofort und umkehrbar

Jede Stimme wertet die Runde neu aus — kein Sammeln, keine Abrechnung am Ende. Punkte wandern sofort,
und sie wandern zurück, wenn sich die Lage dreht. In Phase zwei erbt der Zweitschnellste den Sieg
automatisch, sobald der Erste gestrichen ist, und gibt ihn ebenso automatisch zurück.

Der Preis ist, dass die zweite Flagge sichtbar entscheidet. Das ist gewollt: **alles ist offen**,
Zählstände wie Namen. Wer flaggt, steht mit Namen daneben. Das nimmt der Sache die Anonymität, mit
der man leichtfertig abstimmt, und es ist unter Freunden der eigentliche Spaß daran — man wird
gefragt, warum.

### Das Fenster

Abgestimmt werden kann, solange die Runde die **aktuelle oder die unmittelbar vorherige** ist.
Danach friert das Ergebnis ein. Ohne das wären Tipps kurz vor Rundenende praktisch unangreifbar;
mit einem größeren Fenster wackelte die Tabelle noch nach Wochen.

Der Test dafür braucht keine Uhr: eine Runde `R` ist offen, wenn `R` die laufende ist oder wenn
`R == laufende.previousRoundNumber` — der Zeiger, den `ResolvedRound` ohnehin trägt.

### Wer abstimmen darf

Nur, wer die Runde selbst gespielt hat. Wer nicht gesucht hat, urteilt nicht. Das ist eine eigene
Regel und folgt **nicht** schon aus dem Framework: für die laufende Runde sieht man fremde Tipps zwar
erst nach der eigenen Abgabe, aber die History öffnet nach `closed` alles für jeden.

Auf den eigenen Tipp kann niemand abstimmen.

### Admin-Override

Eine nullable Spalte auf der Play-Zeile:

- `null` — die Abstimmung entscheidet.
- `true` — der Tipp zählt, unabhängig von den Flags.
- `false` — der Tipp ist gestrichen, unabhängig von den Bestätigungen.

Beide Richtungen kosten dasselbe wie eine, und der Override bleibt eine **gespeicherte Eingabe**:
niemand schreibt Punkte von Hand, die Neuauswertung bleibt eine reine Funktion. Er wird im Scoreboard
offen ausgewiesen („vom Spielleiter aufgehoben“) — er wäre sonst die einzige verdeckte Bewegung in
einem ansonsten vollständig offenen Verfahren.

Moderation während des Spiels ist ausdrücklich erlaubt; was
[game-content.md](../../../.claude/guidelines/game-content.md) ausschließt, ist wiederkehrende
Admin-*Vorbereitung*, nicht das Eingreifen.

### Warum das ins Framework gehört

Der Punktentzug **ist** Framework-Arithmetik. `qualifies` ist eine Framework-Spalte, `pointsFor` liest
sie, und „Punkte wegnehmen braucht keinen Mechanismus“ funktioniert nur, solange die Neuauswertung
dort läuft, wo sie schon läuft. Ein Spiel, das das selbst machte, müsste entweder eine zweite
Punkteberechnung bauen oder von außen in `round_plays` schreiben.

`pointsFor` bleibt deshalb **unverändert**. Was sich ändert, ist der Verdict, der hineingeht:

```kotlin
val effective = adminOverride ?: (play.qualifies == true && !struckOut(votes))
Verdict(id = play.id, qualifies = effective, deviation = play.deviation)
```

Ob ein Spiel überhaupt abstimmbar ist, beantwortet ein neuer Schalter:

```kotlin
fun allowsPeerReview(params: P): Boolean = false
```

**Mit** Default, anders als `requiresReveal` — und das ist kein Widerspruch, sondern dieselbe Regel:
der Default muss die sichere Richtung sein. Bei `requiresReveal` ist das bequeme `false` unsicher
(es startet eine fremde Uhr ungefragt), hier ist `false` schlicht das heutige Verhalten. Ein Spiel,
das nichts sagt, bekommt nichts Neues — Farbausmalung, Musterung und Anspielung bleiben deshalb
unangetastet: deren Lösung ist maschinell prüfbar, eine Flagge darauf wäre sinnlos.

### Schema

```sql
CREATE TABLE game.round_play_votes (
    id             UUID        PRIMARY KEY DEFAULT uuidv7(),
    round_play_id  UUID        NOT NULL REFERENCES game.round_plays(id) ON DELETE CASCADE,
    voter_user_id  UUID        NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    value          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    -- One ballot per voter and tip: changing your mind is an UPDATE, not a second row.
    UNIQUE (round_play_id, voter_user_id)
);

ALTER TABLE game.round_plays
    ADD COLUMN admin_override BOOLEAN NULL;
```

Der Endpunkt ist
`PUT /api/communities/{slug}/rounds/{roundNumber}/plays/{userId}/vote` mit
`{"value": "CONFIRM" | "FLAG" | null}` — `PUT`, weil pro Abstimmer und Tipp genau eine Stimme
existiert und ein zweiter Klick sie ersetzt oder zurücknimmt, statt eine zweite anzulegen. Er
schreibt die Stimme und wertet die Runde unter **derselben Zeilensperre** neu aus, die eine Abgabe
nimmt (`SELECT … FOR UPDATE` auf die Runde) — sonst verliert der Moment, in dem sich die
Punkte bewegen, ein Update.

## Phasen: das Framework kann das schon

Die beiden Phasen brauchen fast keinen neuen Code, weil sie auf vorhandene Mechanik fallen:

| | Phase eins | Phase zwei |
|---|---|---|
| Award-Regel | `ALL_QUALIFYING` | `CLOSEST_ONLY` |
| `requiresReveal` | `false` | `true` |
| `deviation` | `0.0`, unbenutzt | vom Framework mit der Reveal-zu-Guess-Dauer überschrieben |
| Wer punktet | jeder gültige Tipp | der schnellste |

Die Stoppuhr ist also bereits gebaut: `PlayService.guess` überschreibt die `deviation` eines
`requiresReveal`-Spiels mit der Dauer, und `CLOSEST_ONLY` vergibt an das Minimum über die
qualifizierenden Zeilen. Damit ist auch das Zusammenspiel mit dem Flagging umsonst zu haben.

Die Phase muss in `params` stehen, damit `requiresReveal(params)` sie sehen kann — wie
`toleranceDeg` bei Farbausmalung:

```kotlin
data class SpotObjectParams(val term: String, val timed: Boolean)
```

`timed` wird beim Ziehen aus `RoundContext.phase` gesetzt und friert damit ein, was zum Zeitpunkt der
Ankündigung galt.

## Bildquelle und Nutzungsbedingungen

Die Nutzungsbedingungen von Google Maps Platform wurden für dieses Konzept geprüft; wir halten es für
tragfähig. Was daraus als **Bauregel** folgt, gehört hierher, damit es niemand später versehentlich
kippt:

1. **Nie ein eigenes `StreetViewPanorama` konstruieren.** Immer die Standardansicht der Karte über
   `map.getStreetView()`. Gemessen: so entstehen keine Panorama-Kosten, nur eine Kartenladung pro
   Seitenaufruf. Ein konstruiertes Panorama pro Scoreboard-Kachel wäre der teure Sonderweg.
2. **Kein Bild in unserer Datenbank.** Gespeichert wird die `panoId` plus Blickwinkel.
3. **Keine Fremdkarte neben Street View.** Wenn im Bewertungs-Screen eine Karte auftaucht, ist es
   eine Google-Karte oder gar keine.
4. **Keinen rundenübergreifenden, durchsuchbaren Fundstellen-Katalog anlegen.** Tipps bleiben an
   ihre Runde gebunden.
5. **Unsere AGB und Datenschutzerklärung** müssen die Nutzer an Googles Bedingungen binden und auf
   Googles Datenschutzerklärung verweisen. Ein Absatz, gehört zum Feature.
6. **Google-Attribution sichtbar lassen** — nicht überdecken, nicht zuschneiden.

Für die Standbilder im Scoreboard wird die **Street View Static API** genutzt: ein reines JPEG, keine
Bedienelemente, keine Bewegung. Signiert wird **serverseitig** — das Signing-Secret darf den Browser
nicht sehen —, der Server liefert die fertige URL im DTO aus.

Wer sich einen Tipp genauer ansehen will, folgt einem Link in Googles eigene Street-View-Ansicht
([Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), kostenlos und ohne
Key). Bewegen und Zoomen passiert dort, nicht bei uns.

## Frontend

Das endgültige Layout ist ein bewusster Handgriff am Ende des MRs. Was hier steht, ist die im
Prototyp ausgehandelte **grobe Richtung**, damit dieser Handgriff nicht bei null anfängt.

### Spielfeld

Die Karte läuft **bis an alle Ränder** der Runden-Oberfläche; unsere eigenen Informationen liegen als
Overlay darüber — Begriff oben links, Aktionen unten. Kein Vollbildmodus.

- **Breite** bleibt gedeckelt wie überall (`max-w-xl`). Die Begründung steht bereits in
  `pages/c/[slug].vue`: ein Desktop-Spieler darf auf einen Blick nicht mehr erfahren als ein
  Telefon-Spieler.
- **Höhe** ist frei. Auf dem Telefon bekommt das Spielfeld die volle Bildschirmhöhe, ab `sm` wird es
  gedeckelt. Suchen braucht Fläche, und `aspect-square` ist ein Platzhaltermaß, keine Regel.
- Einstieg ist die **Weltkarte**, nicht ein zufälliger Ort: „Ich suche jetzt in Barcelona“ zu sagen
  ist der halbe Reiz. Dazu `StreetViewCoverageLayer` dauerhaft an, damit man vor dem Absetzen sieht,
  wo es überhaupt Abdeckung gibt (Google zeichnet die blauen Linien erst ab etwa Zoom 14).
- Keine Ortssuche. Man darf wissen dürfen, wo Barcelona liegt.
- Ein Weg **zurück zur Weltkarte** ist Pflicht.
- **Ein Fadenkreuz in der exakten Mitte**, in beiden Hälften des Spielfelds dasselbe kleine weiße
  Plus. Auf der Karte ist es das Ziel, im Panorama die Bildmitte, in die der Gegenstand gehört.
- **Zwei Wege hinein, nicht einer.** Googles Pegman bleibt (rechte Kante, mittig), denn er ist der
  einzige, der über jede Entfernung trägt. Daneben ein Druck auf das Fadenkreuz selbst — ein Ring
  im Durchmesser eines Knopfes um die Marke herum —, der
  `panorama.setPosition(map.getCenter())` aufruft: derselbe Aufruf, den ein landender Pegman macht,
  also unverändert kostenlos. Kein `StreetViewService`: der wäre eine neue Kostenfläche für
  dieselbe Antwort. Der Preis dafür ist hart: `setPosition` nimmt keinen Radius und sucht fix 50 m,
  der Druck greift also erst ab der Zoomstufe, auf der die blauen Linien gezeichnet werden. Darum
  bleibt die Abdeckungsebene an — sie ist das Zielkreuz-Futter — und darum ersetzt der Druck den
  Pegman nicht, er kürzt nur ab.
- **Der Ring weicht dem Pegman.** Er sitzt genau dort, wo ein fallengelassener Pegman am ehesten
  landet. Ein `pointerdown` auf `.gm-svpc` blendet ihn für die Dauer des Zugs aus (die Marke
  bleibt). Wieder eine Kopplung an Googles Klassennamen, aber eine, die richtig herum scheitert:
  kein Treffer heißt, der Ring bleibt einfach stehen.
- **Pfeiltasten scrollen nicht die Seite mit.** Google läuft und dreht auf ihnen, bricht sie aber
  nicht ab, sodass derselbe Druck die Seite unter dem Spielfeld wegscrollte. `preventDefault` auf
  dem Weg nach draußen: Googles Handler ist da schon gelaufen, weg ist nur das Scrollen.
- **Ein Fehlgriff ist unsere Antwort, nicht Googles.** Findet sich nichts, meldet `status_changed`
  etwas anderes als `OK`; das Panorama wird wieder ausgeblendet und unter dem Fadenkreuz steht, dass
  hier nichts ist. Bis die Karte bewegt wird, bleibt die Meldung stehen und ein zweiter Druck ist
  wirkungslos — dieselbe Frage ändert keinen Status und löst also nichts aus, was das graue
  „no imagery“-Panel wieder wegräumen würde.

### Reveal-Face: drei Komponenten, nicht zwei

`SpotObjectReveal.vue` komponiert, wie `FindPatternReveal.vue` es vormacht — untereinander gestapelt:

1. **`SpotObjectTipGrid.vue`** — neu, und ausdrücklich **nicht Teil des Scoreboards**. Ein
   **zweispaltiges Grid**, auch auf dem schmalsten Telefon zwei, weil der schnelle Überblick über
   alle Tipps sein Zweck ist. Pro Kachel: das Standbild, die Landesflagge, der Name, die Stimmen mit
   Namen, ein Link nach Google. Ein gestrichener Tipp ist als solcher erkennbar. Über dem Standbild
   liegt dasselbe Fadenkreuz wie beim Suchen: das Bild wird um die abgegebene Blickrichtung herum
   gerendert, der gemeinte Gegenstand *ist* also das mittlere Pixel — niemand muss raten, welches
   der Dinge im Bild der Tipp war.
2. **`SpotObjectScoreboard.vue`** — isoliert und in derselben Form wie bei jedem anderen Spiel,
   neben `FindPatternScoreboard.vue`. Es zeigt, was ein Scoreboard hier zeigt; die Tipps zu rendern
   ist nicht seine Aufgabe.

Die Trennung ist der Punkt: das Grid ist die Bewertungsfläche dieses Spiels, das Scoreboard ist die
Wertungsanzeige aller Spiele. In eine Komponente gefaltet, wäre das Scoreboard das einzige der
Spielsammlung, das nicht mehr wie die anderen aussieht.

### Stimmabgabe

**Im Grid selbst**, als Icon-Buttons über der Kachel. Ursprünglich war dafür eine eigene Route
vorgesehen — wegen der Zurück-Taste. Beim ersten Durchsehen der fertigen Ansicht war der Preis
sichtbar: Bewerten heißt vergleichen, und jede einzelne Stimme nahm die ganze übrige Runde für
einen Seitenwechsel vom Schirm. Die Route ist deshalb entfallen.

Bestätigen und Flaggen sind **gleich groß, gleich geformt, gleich platziert** — nur die Farbe
unterscheidet sie. Keine der beiden Richtungen wird durch das Layout nahegelegt. Die eigene
abgegebene Stimme zeigt der Knopf selbst (gefüllt statt weiß); ein gestrichener Tipp zeigt sich am
**durchgestrichenen Namen**, ohne Satz daneben.

Die Knöpfe stehen **senkrecht an den beiden oberen Ecken** und nie am unteren Rand: dort steht
Googles eingebrannte Wortmarke, und sie zu verdecken verletzt die Nutzungsbedingungen. Aus demselben
Grund sitzt der Maps-Link (Auge) unten links **über** dem Attributionsband statt in der Ecke.

### `GameEntry`

Bekommt die Stimmen und den Strich-Zustand. Das berührt die Regel „ein Feld nur, wenn jede Welt es
trägt“ — und sie ist erfüllt: das Labor trägt dieselben Felder (siehe *Labor*), nicht leere
Platzhalter.

## Inhalte

Die Begriffsliste ist kuratiert und wird **mit sops verschlüsselt**, wie die übrigen Spielinhalte —
obwohl der Begriff im Payload veröffentlicht wird und die Ziehung nicht vorhersagbar ist. Die
Begründung ist nicht Geheimhaltung, sondern Sparsamkeit: der Mechanismus existiert bereits, eine
zweite Liste dranzuhängen kostet nichts, und es nimmt die Restmöglichkeit, sich zu ein paar Begriffen
vorab Koordinaten zurechtzulegen.

Es gilt der Rest von [game-content.md](../../../.claude/guidelines/game-content.md) unverändert:
committetes Sample-Set für Tests und Beispiele, Fail-Fast unter `production`/`staging`, Prüfung nur
auf mechanisch Falsches.

Ein Begriff taugt, wenn er **weltweit** vorkommt und **im Bild erkennbar** ist. Was nur in einem
Kulturkreis existiert, macht die Suche zur Ortskunde; was man nur aus der Nähe erkennt, macht sie zum
Streit.

## Labor

Das Labor ist der Ort, an dem UI und UX dieses Spiels von Hand geprüft werden — Peer-Review
eingeschlossen. Es bekommt deshalb keine Ausnahme, sondern die Erweiterung: **das Labor passt sich
an, der Vertrag nicht.**

**Mehrspieler-Review geht dort heute schon.** `LabRoundStore` ist anwendungsweit und ausdrücklich
nicht sitzungsgebunden, damit Tester einander sehen. Zwei Konten über den Test-Login-Picker auf
derselben Laborrunde können sich also gegenseitig bestätigen und flaggen — das ist die echte
Prüfung, keine nachgestellte.

**Der Store wächst um zwei Felder**, im selben selbstbegrenzenden `Round` wie `openedAt`, und wird an
denselben zwei Stellen geleert, die schon alles andere vergessen (`resetRound`, `forget`):

```kotlin
val votes     = ConcurrentHashMap<UUID, ConcurrentHashMap<UUID, Vote>>()  // Ziel -> Abstimmer -> Wert
val overrides = ConcurrentHashMap<UUID, Boolean>()                        // Ziel -> Spielleiter-Urteil
```

Das ist exakt die Form, in der das Labor damals die Uhr bekommen hat: ein Feld mehr, keine parallele
Mechanik.

**Die Regel wird nicht kopiert.** `flags >= 2 && flags > confirms` — mit dem Override davor — lebt
als reine Funktion im exponierten Paket von `game`, neben `guessActionFor` in `PlayFlow.kt`, und
beide Welten rufen dieselbe auf. Eine laboreigene Zweitfassung wäre genau die parallele Abstraktion,
die im Labor schon einmal gelöscht wurde.

**Endpunkt** `PUT /api/lab/{slug}/{game}/plays/{userId}/vote`, in der Form der übrigen Lab-Aktionen
und hinter denselben zwei Toren (`@Profile("!production")` + eigener Schalter, 404 statt 403).

**`LabEntryDto` trägt Stimmen und Strich-Zustand** — dieselben Felder, die `MyPlayDto`/`OtherPlayDto`
tragen. Damit erfüllen beide Welten `GameEntry` strukturell, und die Komponente bleibt ahnungslos,
für welche sie rendert.

**Im Labor ist jeder Spielleiter.** Der Override braucht dort keinen eigenen Schalter — er sitzt an
derselben Stelle wie im Produkt, am Tipp, und jeder Tester darf ihn bedienen. Das ist keine neue
Mechanik, sondern das Weglassen einer Prüfung: Rollen modelliert das Labor ohnehin nirgends, seine
Endpunkte hängen an den zwei Toren und nicht an einer Berechtigung.

Die Komponente erfährt das über einen betrachterbezogenen Prop `canOverride` — dieselbe Form, in der
sie schon `mineUserId` und `awardRule` bekommt. Beantwortet wird er serverseitig und pro Welt: im
Produkt „ist Community-Admin“, im Labor immer `true`. Die Komponente ist in beiden Welten dieselbe,
und der Vertrag ändert sich nicht — das Labor passt sich an, wie überall.

**Die Stimmabgabe ist im Labor dieselbe Komponente an derselben Stelle.** Das Labor reicht sein
eigenes `RoundReview` hinein — dieselbe Form, die das Produkt reicht, nur mit den Lab-Endpunkten
dahinter und `canOverride` immer `true`.

Reverse Geocoding macht im Labor echtes Netz-I/O. Das ist hinnehmbar; wer offline arbeitet, sieht
Kacheln ohne Flagge, weil der Aufruf weich scheitert.

## Tests

- **Feld-Sets**, beide Ausgänge: `present()` auf `{term}`, `solution()` auf `null`.
- **`judge`** qualifiziert jeden formal gültigen Tipp und wirft `InvalidGuessException` bei jedem
  Feld außerhalb seines Bereichs — vor jedem Schreibzugriff.
- **Die Abstimmungsregel** als Tabelle: (0,0) bleibt, (1,0) bleibt, (2,0) gestrichen, (2,1)
  gestrichen, (2,2) bleibt, (3,2) gestrichen, (0,5) bleibt.
- **Neuauswertung in Phase zwei:** der Schnellste wird gestrichen → der Zweitschnellste bekommt die
  Punkte; die Streichung wird zurückgenommen → sie wandern zurück.
- **Fenster:** laufende und unmittelbar vorherige Runde nehmen Stimmen an, jede ältere nicht.
- **Berechtigung:** wer die Runde nicht gespielt hat, darf nicht abstimmen; auf den eigenen Tipp
  auch nicht.
- **Admin-Override** in beide Richtungen schlägt die Abstimmung.
- **Labor-Parität:** eine Laborrunde zahlt, was eine echte Runde zahlt — der bestehende
  `LabPointsParityTest`, erweitert um einen ausgestrichenen Tipp in Phase zwei, damit die
  Neuauswertung in beiden Welten nachweislich dieselbe ist.
- **Weich scheiterndes Geocoding:** ein Fehler des Dienstes lässt den Tipp durch, mit `country = null`.

## Bewusst verschoben

- **Deny-Liste konfigurierbar pro Community.** v1 setzt sie gar nicht durch; wenn sich zeigt, dass
  die soziale Kontrolle reicht, braucht es sie nie.
- **Ortssuche.** Bräuchte eine weitere API und nimmt dem Spiel etwas weg.
- **Peer-Review für andere Spiele.** Der Schalter existiert, die Antwort ist überall `false`.
- **Kosten oder Grenzen fürs Abstimmen.** Erst wenn jemand es ausnutzt; die offenen Namen sind
  vorerst die Bremse.
- **Der verbleibende Geräteunterschied.** Ein breiteres Fenster zeigt bei gleicher Zoomstufe mehr
  Horizont. Die Breitenbeschränkung deckelt das auf dasselbe Maß, das jedes Spiel hier hat, und
  weiter geht es nicht — akzeptiert, nicht offen.
- **Einstiegsziele filtern.** `sources: [OUTDOOR]` weist das Street-View-Control zurück — es wirft
  beim Bau des Controls und hinterlässt eine Karte ganz ohne Pegman; im Betrieb gemessen. Der Druck
  aufs Fadenkreuz kann es auch nicht: `setPosition` nimmt keine Quellenangabe. Wer auf einem
  Einzelfoto landet, geht zurück zur Weltkarte.
