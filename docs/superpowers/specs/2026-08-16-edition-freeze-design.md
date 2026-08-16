# Edition einfrieren — Design

**Umgesetzt** — `frozenSince`, der 409 in `EditionService.update`, `editionFrozen` auf der Wire und
das gesperrte Settings-Formular samt „Erste Spielrunde“ stehen.

Zu [Issue #56](https://github.com/unividuell/countdown/issues/56).

## Scope

Ein Lauf, der begonnen hat, darf sein Rundenraster nicht mehr verschieben. Konkret: `startsAt` und
`startsAtTimezone` einer `CommunityEdition` werden unveränderlich, sobald deren erste spielbare Runde
begonnen hat. Alles andere an der Edition bleibt änderbar — nur nicht so, dass die Edition dadurch
wieder auftaut.

Dazu kommt `gamesFromRound` ins Settings-Formular: es entscheidet über den Einfrierpunkt, und was
darüber entscheidet, muss einstellbar sein.

Nicht in dieser Scheibe: eine Schaltfläche „neue Edition starten“ im Admin-UI (siehe *Was bewusst
offen bleibt*), und irgendeine Form von Reparatur bereits verschobener Läufe.

## Das Problem

Verschiebt ein Admin `startsAt`, verschiebt sich das gesamte Raster mit — die Rundennummer ist keine
gespeicherte Eigenschaft, sondern eine Funktion aus `startsAt`, `startsAtTimezone` und „jetzt“:

```
round n = [startsAt − (n+1) Tage, startsAt − n Tage)
```

`game.round_games` hält dagegen bereits Zeilen mit genau dieser Nummer, und `UNIQUE (edition_id,
round_number)` ist die einzige Klammer darum. Wird der Start um zwei Tage nach hinten gelegt, zeigt
das Raster erneut auf Nummern, die längst angekündigt, gespielt und bepunktet wurden: die Runde ist
festgeschrieben, wer damals geraten hat, kann nicht noch einmal, und wer neu dazukommt, spielt gegen
ein Spiel von vorgestern. In die andere Richtung werden Nummern übersprungen. Beides ist unfair und
für Spieler nicht erklärbar. Die Zeitzone tut dasselbe, nur in Stunden.

## Die Regel

Eine Edition ist **eingefroren**, sobald ihre erste spielbare Runde begonnen hat:

| Zustand | eingefroren ab |
|---|---|
| `startsAt == null` | nie — es gibt kein Raster, das kollidieren könnte |
| `gamesFromRound == null` (nach oben unbegrenzt) | sofort: jede Runde trägt ein Spiel, also läuft mit dem gesetzten Datum bereits eine spielbare |
| `gamesFromRound == f` | `startsAt − (f + 1) Tage`, gerechnet in `startsAtTimezone` |

Der Einfrierpunkt ist genau der Beginn der Runde `gamesFromRound` — der früheste Moment, in dem
jemand eine Runde ankündigen und damit eine Zeile in `game.round_games` erzeugen kann. Die Regel
greift also, bevor der erste Schaden entstehen kann, und nicht erst, wenn er entstanden ist.

**Gerechnet wird kalendarisch**, nicht in 24-Stunden-Blöcken (`ZonedDateTime.minusDays`), damit ein
DST-Tag genauso eine Runde ist wie jeder andere — dieselbe Zusage, die `CountdownEngine` gibt.

**Maßgeblich ist die persistierte Edition, nie der Request.** Sonst könnte sich ein Admin mit einem
Datum weit in der Zukunft selbst wieder auftauen.

**Ein identischer Wert ist keine Änderung.** Der PATCH ist „null = beibehalten“, aber das
Settings-Formular schickt `startsAt` und `startsAtTimezone` heute bei jedem Speichern mit. Ohne diese
Ausnahme scheiterte nach dem Einfrieren auch eine reine Umbenennung. Verglichen wird auf Gleichheit
(`Instant`, String), nicht auf Anwesenheit im Request.

**Rückwirkend, ohne Migration.** Der Zustand ist abgeleitet, nichts davon wird gespeichert. Bestehende
Läufe sind ab dem Deployment eingefroren, wenn ihr Raster schon läuft — genau das ist die Absicht.

## Was nicht einfriert

`phaseTwoStartRound`, `gamesFromRound`, `gamesUntilRound` und `label` bleiben änderbar — auch
`phaseTwoStartRound`, obwohl das Issue es nennt. Der Grund: Regel und Einsatz einer Runde sind **schon
heute** pro Runde eingefroren (`award_rule`, `award_points` in `game.round_games`, festgeschrieben bei
der Ankündigung), eine Verlegung trifft also nur kommende Runden. Das ist eine
Spielleiter-Entscheidung mit sichtbarer Wirkung, keine stille Verfälschung von Historie.

Für das Spielfenster gilt dasselbe bewusst: es verkleinern senkt Punktstände, es wieder öffnen stellt
dieselbe Zahl unverändert her — beides ist in
[game-rounds.md](../../../.claude/guidelines/game-rounds.md) als Design festgehalten und heilt sich
selbst. Das Raster tut das nicht.

Auch **kein Super-Admin-Bypass**: die Regel schützt die Spielhistorie, nicht die Rechte.

### Aber: was eingefroren ist, bleibt eingefroren

`gamesFromRound` bleibt änderbar und bestimmt zugleich den Einfrierpunkt. Wer es herabsetzt, schiebt
den Punkt in die Zukunft — zwei PATCHes hintereinander, und der Start wäre wieder frei. Die Regel
greift deshalb auf der **Wirkung**, nicht auf dem Feld:

> Ein Update, nach dem die Edition nicht mehr eingefroren wäre, obwohl sie es war, wird abgewiesen.

Das ist ein Vergleich zwischen vorher und nachher (`frozen(edition) && !frozen(next)` → 409) und
deckt jedes Feld ab, das je in den Einfrierpunkt eingeht — heute `gamesFromRound`, morgen was auch
immer dazukommt. Die Alternative, ein `frozen_at` zu persistieren, wäre monoton per Konstruktion,
kostet aber eine Spalte, eine Migration und einen Zustand, der von der Wahrheit abweichen kann.
Anheben bleibt erlaubt: das zieht den Einfrierpunkt nur weiter nach vorn.

## Wo die Regel lebt

`ModularityTests` pinnt die Richtung `countdown → community`, nie umgekehrt. `community` darf
`CountdownEngine` also nicht aufrufen, und die Prüfung gehört in `EditionService.update` — also nach
`community`.

Deshalb eine kleine reine Funktion in `community.internal`:

```kotlin
/** Ab wann das Raster dieser Edition fest ist — `null`, solange es keines gibt. */
fun frozenSince(edition: CommunityEdition): Instant?
```

Ohne `startsAt` gibt sie `null`; bei `gamesFromRound == null` gibt sie `Instant.MIN`, denn das Fenster
ist nach oben unbegrenzt — die erste spielbare Runde hat dann keinen Anfang, vor dem man noch ändern
dürfte. Der Aufrufer vergleicht nur `now >= frozenSince`, und beide Sonderfälle fallen damit ohne
zusätzlichen Zweig heraus.

Die eine Zeile Rastermathematik steht damit an zwei Stellen im Code. Dagegen steht ein
**Paritätstest** im Testbaum, der beide Module sehen darf (für den begrenzten Fall — nur der hat eine
Rundennummer, die die Engine kennt):

```
frozenSince(edition) == CountdownEngine.intervalOf(gamesFromRound, startsAt, zone).start
```

Faktisch bleibt die Engine damit die einzige Autorität über das Raster: ändert sich dort etwas, fällt
der Test um, statt dass zwei Wahrheiten nebeneinander weiterlaufen.

**Verworfen:** die Inversion über eine SPI (`community` deklariert ein Interface, `countdown`
implementiert es und bringt die Engine mit). Sie wäre die lehrbuchreine Lösung, aber für zwei Zeilen
Datumsmathematik ist ein Interface, eine Implementierung und eine Bean-Verdrahtung mehr Apparat als
Nutzen — und der Paritätstest kauft dieselbe Sicherheit.

## Der Vertrag

**Backend.** `EditionService.update` prüft vor `validate`: ist die persistierte Edition eingefroren
und ändert der Request `startsAt` oder `startsAtTimezone`, dann `EditionFrozenException` → **409**,
gemappt im bestehenden `CommunityExceptionHandler` neben `EditionConflictException`. 409 und nicht
403: es scheitert nicht an der Rolle, sondern am Zustand der Ressource — dieselbe Lesart wie beim
Editionskonflikt.

`CommunityResponse` bekommt ein Feld `editionFrozen: Boolean` (aus derselben Funktion gegen die
`Clock`). Es ist reine Anzeige; die Durchsetzung ist der 409.

**Frontend.** `types.ts` bekommt das Feld; in `pages/c/[slug]/settings.vue` werden Start und Zeitzone
`disabled` und beim Speichern **nicht mitgeschickt**. Das Weglassen im Body ist die eigentliche
Absicherung gegen den Round-Trip des `datetime-local`-Felds (Minutengenauigkeit hin, `Instant`
zurück); die Gleichheitsprüfung im Backend ist der Gürtel dazu.

Unter dem Block aus Zeitzone und Start steht ein Satz, der den Zustand erklärt, in dem das Formular
gerade ist — nicht die Regel in ihrer allgemeinen Form:

| Zustand | Text |
|---|---|
| offen | Änderbar, bis die erste Spielrunde beginnt — danach ist der Lauf fix. |
| eingefroren | Der Lauf hat begonnen — Start und Zeitzone sind fix. |

### `gamesFromRound` gehört ins Formular

Das Feld gibt es im PATCH, aber in keinem Eingabefeld — und mit dieser Scheibe entscheidet es, **wann**
eingefroren wird. Ein Admin, der es nicht setzen kann, sitzt beim Default `null` fest, und der friert
sofort mit dem Datum ein. Das Formular bekommt deshalb ein Feld „Erste Spielrunde“ (`type="number"`,
`min="1"`, leer = ab der ersten Runde), mit dem Hinweis, dass eine größere Nummer früher liegt.

`gamesUntilRound` bleibt draußen: sein Default `0` ist T-0, der Tag vor dem Start, und damit für jeden
Lauf richtig, den es bisher gibt. Ein Feld dafür wäre eine Einstellung ohne Anlass.

## Tests

TDD, in dieser Reihenfolge:

- `EditionService`: Grenzfälle um den Einfrierpunkt — knapp davor änderbar, exakt darauf und danach
  409; `gamesFromRound == null` friert mit gesetztem Datum; `startsAt == null` friert nie;
  unveränderte Werte gehen auch eingefroren durch; jedes andere Feld bleibt eingefroren änderbar.
- Das Auftauen: eingefroren, dann `gamesFromRound` herabgesetzt → 409; anheben geht durch.
- Paritätstest gegen `CountdownEngine.intervalOf`, inklusive eines Laufs über eine DST-Grenze.
- MockMvc: `PATCH` mit verschobenem Start → 409; `GET` trägt `editionFrozen` in beiden Ausprägungen.
- Frontend (`settings.spec`): gesperrte Felder samt passendem Hinweistext, der PATCH-Body enthält
  `startsAt` und `startsAtTimezone` nicht, wenn eingefroren, und „Erste Spielrunde“ geht als
  `gamesFromRound` mit — leer heißt „nicht mitschicken“, nicht `0`.

## Was bewusst offen bleibt

**Der Ausweg fehlt im UI.** Das Issue nennt ihn — „ansonsten kann man immer eine neue Edition
starten“ —, und `POST /api/communities/{slug}/editions` gibt es auch, aber keine Seite ruft ihn auf.
Der Hinweistext verweist deshalb nicht darauf, statt auf einen Knopf zu zeigen, den es nicht gibt. Ein
eigenes Issue: eine neue Edition zu starten ist ein Schnitt für sich (Bestätigung, Label, was mit den
Punktständen der alten Edition sichtbar bleibt) und hat mit dem Einfrieren nur den Anlass gemeinsam.

**Keine Karenzzeit.** Ein kurzes Korrekturfenster nach dem ersten Setzen des Datums wäre bequem für
Tippfehler, aber es ist ein zweiter Zeitpunkt, den man erklären, testen und im UI anzeigen muss —
gegen einen Fehler, der genau einmal pro Lauf passieren kann und für den es den Ausweg oben gibt.
