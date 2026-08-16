# Guess Hue — die Auswertungstabelle

**Status:** beschlossenes Design (2026-08-16).

**Baut auf:** [Tippübersicht im Farbrad](2026-08-09-guess-hue-guesses-overview-design.md) — dort
wurde diese Tabelle als eigener Schnitt angekündigt und die Auswertungskarte bewusst leer unter dem
Rad gelassen. [Round-Frontend](2026-08-14-round-frontend-design.md) liefert die Runde, die
Award-Regel und die Einträge.

**Portiert aus:** `huettehuette.unividuell.org`,
`components/games/guessColor/GuessColorAnalysis.vue`. Übernommen wird das **Layout und die
Farblogik**, nicht der Code.

## Scope

Unter dem Lese-Rad steht ab hier die Detailtabelle aller abgegebenen Tipps: Name, Tipp, Differenz,
Punkte — je Zeile in der Farbe der spielenden Person, die Tipp-Zelle in der Farbe des Tipps.

Enthalten ist die **Live-Variante** des Originals (das `live`-Chip und die pulsierenden Punkte einer
Runde, deren Wertung sich noch ändern kann) und die **Kopplung der Marker-Einblendung an die
Tabellenzeilen**.

Nicht enthalten: das **Toleranzband** über der Tabelle (entfällt ersatzlos, siehe unten) und
**Polling**. Die Seite lädt die Runde einmal beim Mount; `live` heißt „diese Zahlen können sich noch
ändern", nicht „sie aktualisieren sich vor deinen Augen" — genau wie das Live-Chip in der
Mitgliederzeile heute schon.

## Backend

**Nichts.** `OtherPlayDto` und `MyPlayDto` tragen `username`, `outcome` und `points` bereits für
jede Zeile, `RoundResponse` trägt `awardRule`. Die Abweichung kommt als `GuessHueOutcome.deviationDeg`
vom Server und wird im Client **nicht nachgerechnet** — das Original tat das noch.

## Warum die Tabelle so bunt sein darf

Die Farbe arbeitet hier zweimal. Sie trägt **Identität** — dieselbe Farbe, die die Person im
Avatar-Rad über der Karte hat, sodass man eine Zeile findet, ohne einen Namen zu lesen — und sie
trägt **Wert**: der Tipp als Fläche, senkrecht unter der Lösung als Fläche. Eine graue Tabelle mit
„128,4" könnte den zweiten Teil nicht.

Drei unauffällige Dinge halten das zusammen und sind deshalb **nicht verhandelbar**:

- die fast schwarze Kopfzeile als Anker — sie macht aus Buntheit ein Raster,
- die dünnen weißen Fugen zwischen allen Zellen — ohne sie wäre es ein Farbblock,
- `readableTextColor` pro Zelle — der automatische Tintenwechsel gegen jede Spieler- und Tippfarbe.

**Erwogen und verworfen:** nur die Namenszelle in der Spielerfarbe zu lassen und Differenz und Punkte
neutral zu halten. Das ließe die informative Farbe — den Tipp — stärker herausstechen, zerlegt die
Zeile aber in Streifen; sie hört auf, *eine* Person zu sein. Die Variante ist im Lab in zwei Minuten
nebeneinander zu sehen, falls die Frage wiederkommt.

**Das Toleranzband entfällt ohne Lücke.** In Phase 1 gilt `points > 0` genau dann, wenn der Tipp
innerhalb der Toleranz lag — die Pkt-Spalte sagt es also bereits. In Phase 2 gibt es gar kein Tor.
Das Fenster selbst zeigt der Sektor auf dem Rad.

## Datenweg

### `GameEntry` wächst um drei Felder

```ts
export type GameEntry = {
  userId: string
  username: string          // neu
  guess: unknown
  outcome: unknown          // neu
  points: number | null     // neu — LabEntryDto liefert `number`, das passt hinein
  avatar: { bgColorHex: string }
}
```

`LabEntryDto`, `MyPlayDto` und `OtherPlayDto` erfüllen das alle drei strukturell; kein Aufrufer muss
mappen. Der KDoc des Typs warnt heute vor dem Verbreitern — die Warnung bleibt und bekommt ihre
Grenze dazu: **erlaubt ist ein Feld nur, wenn jede Welt es hat.** Ein Feld, das nur das Lab kennt,
ist die Stelle, an der ein Spiel anfängt, am Lab zu hängen.

### `awardRule` als eigene Prop

Die Spiel-Komponente bekommt `awardRule: AwardRule | null` (aus `@/api/types`; die `LabAwardRule` des
Labs ist dieselbe String-Union und passt strukturell). `RoundCard` reicht `round?.awardRule` durch,
die Lab-Seite `round.awardRule`.

Durchgereicht wird die **Regel**, kein vorgekauter Boolean: `RoundDtos.kt` veröffentlicht sie
ausdrücklich, damit die UI „vorläufig" sagen kann, und die Auslegung soll an einer Stelle liegen
statt in zwei Aufrufern.

### Die Zeile

`analysis.ts`, rein:

```ts
export interface AnalysisRow {
  userId: string
  name: string
  colorHex: string        // Spielerfarbe — der Grund der Zeile
  hue: number
  guessHex: string        // der Tipp als Farbe, mit Sättigung und Helligkeit der Runde
  deviationDeg: number    // vom Server
  points: number | null
  provisional: boolean
}
```

- **Sortierung:** `deviationDeg` aufsteigend, bei Gleichstand `userId` — damit das Bild einen Reload
  übersteht. Die Tabelle ist also eine Rangliste der Runde, nicht die Abgabereihenfolge.
- **`provisional`** ist Wort für Wort die Regel aus `RoundPlayPoints.kt:87` —
  `points > 0 && awardRule === 'CLOSEST_ONLY'`. Der Kommentar zeigt dorthin, damit die beiden nicht
  auseinanderlaufen. Eine 0 kann unter „closest only" nicht mehr besser werden, sie pulsiert deshalb
  nicht.
- **Eine Zeile ohne numerisches `deviationDeg` fällt heraus** — dieselbe Behandlung, die `guesses`
  heute schon einem unplatzierbaren Tipp gibt, statt `NaN` zu drucken.
- `guessHex` nimmt Sättigung und Helligkeit **der Runde**, nicht die des Tipps; der Tipp ist nur ein
  Winkel.

`hslToHex` liegt heute privat in `reveal.ts` und wird von Rad *und* Tabelle gebraucht — es zieht in
ein eigenes `games/guesshue/color.ts` daneben.

## Die Tabelle

### Ein echtes `<table>`

Der Spec zur Tippübersicht hat die vollständige Aussage ausdrücklich dieser Tabelle zugeschoben
(„das `aria-label` des Rads ist bewusst weniger als Parität"). Dann muss sie sie auch abgeben
können. `<th scope="row">` auf der Namenszelle ist der Unterschied: ein Screenreader sagt dann
„Leela, Tipp 128,4" statt „128,4".

**Jede Zelle steht, wo sie im Original steht.** Das ist die Vorgabe, nicht ein Näherungswert: der
Kopfblock ist eine Zeile aus Überschrift links, Lösungsstapel über der Tipp-Spalte und `live`-Chip
über der Pkt-Spalte, darunter das schwarze Band.

```html
<table class="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5">
  <caption class="sr-only">Alle Tipps der Runde, nach Abstand zur Lösung sortiert</caption>
  <colgroup><col /><col class="w-14" /><col class="w-14" /><col class="w-9" /></colgroup>
  <thead>
    <!-- Kopfblock, Zeile 1: die Überschrift und das Etikett über der Tipp-Spalte -->
    <tr>
      <td rowspan="2" class="align-middle"><h2 class="text-2xl">Auswertung</h2></td>
      <th id="hue-solution">Lösung</th>
      <td />
      <td rowspan="2" class="align-bottom"><span>live</span></td>
    </tr>
    <!-- Kopfblock, Zeile 2: der Lösungswert unter seinem Etikett -->
    <tr><td headers="hue-solution">123,4</td><td /></tr>
    <!-- das Band -->
    <tr><th scope="col">Name</th><th scope="col">Tipp</th>
        <th scope="col">Differenz</th><th scope="col">Pkt</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">Leela</th><td>128,4</td><td>5,0</td><td>1</td></tr>
  </tbody>
</table>
```

Weil Kopfblock und Band **in derselben Tabelle** liegen, stehen Lösung und Chip per Konstruktion über
„Tipp" bzw. „Pkt" — im Original hielten zwei getrennte Grids dieselbe Spaltenvorlage von Hand
deckungsgleich. Dass die Lösung senkrecht über den Tipps steht, ist der klügste Teil des
Originallayouts; dass das Chip über der Spalte steht, die sich noch ändern kann, ist ebenso wenig
Zufall. Die Fuge zwischen Etikett und Wert ist dieselbe `border-spacing-y-0.5` wie zwischen allen
Zeilen — im Original war es das `gap-y-0.5` des Stapels, also derselbe Abstand.

**Der Lösungsstapel bekommt zwei eigene Zeilen**, statt Etikett und Wert in eine `<td>` zu pressen.
Mehr als ein `<thead>` erlaubt HTML nicht, mehrere `<tr>` darin schon. Überschrift und Chip
überspannen die beiden Zeilen per `rowspan="2"` — `align-middle` für die Überschrift, weil das
Original seine Kopfzeile `items-center` setzt, `align-bottom` für das Chip, weil es dort `self-end`
steht.

**Die Überschrift bleibt eine `<h2 class="text-2xl">` an ihrem Platz in Spalte 1.** Eine `<caption>`
ist immer eine eigene Box über der vollen Tabellenbreite; sie mit absoluter Positionierung in die
erste Spalte zu schieben hieße, ihre Breite gegen eine `auto`-Spalte unter `table-fixed` zu raten.
Semantik darf hier das Layout nicht verschieben. Die `<caption>` bleibt deshalb `sr-only` und sagt
etwas, das die Überschrift nicht sagt — was in der Tabelle steht und wonach sie sortiert ist —, statt
„Auswertung" ein zweites Mal vorzulesen.

**„Lösung" wird per `id`/`headers` mit seinem Wert verbunden**, nicht per `scope`: `scope="col"`
würde das Etikett auch über die Tipps darunter legen, deren Spaltenkopf „Tipp" ist. Die
Zuordnung ist damit explizit und hängt nicht daran, dass das Band dazwischenliegt.

Breiten: `table-fixed` plus `<colgroup>` mit `auto | w-14 | w-14 | w-9` — die Zahlen des Originals.
Auf 375 px bleiben dem Namen rund 150 px, er wird `truncate`; nichts scrollt seitwärts. Der
vollständige Name bleibt als Textknoten im DOM, Hilfstechnik bekommt ihn also ungekürzt.

### Farbe, Zahlen, Zustand

| Zelle | Hintergrund | Tinte |
| --- | --- | --- |
| Kopfband, „Lösung"-Etikett | `bg-neutral-900` | weiß |
| Name, Differenz, Pkt | Spielerfarbe | `readableTextColor` |
| Tipp | Tippfarbe | `readableTextColor` |
| Lösung | Lösungsfarbe | `readableTextColor` |

Zahlen rechtsbündig und `tabular-nums` — das fehlte im Original und fällt in einer pulsierenden
Spalte auf. Eine Nachkommastelle, mit **Komma**, weil die UI deutsch ist. Punkte ganzzahlig;
`points === null` ergibt „–" (kommt praktisch nicht vor, jede getippte Zeile ist gewertet, aber der
Typ lässt es zu).

**Live.** Das Chip erscheint nur unter `CLOSEST_ONLY`; eine Pkt-Zelle wird kursiv und pulsiert nur,
wenn zusätzlich `points > 0`. Das Chip ist dabei die **Legende** für den Puls: das gemeinsame Signal
zwischen Chip und Zelle ist die Bewegung, nicht die Farbe (die Zelle behält ja die Spielerfarbe).
Ohne die beschriftete Erklärung darüber wären Kursivsatz und Puls eine Behauptung, die nichts auflöst.
`motion-reduce:animate-none` überall.

**Was Hilfstechnik zusätzlich bekommt** — die Lektion aus `MemberRow`, wo weder Farbe noch Puls über
die Leitung gehen: das Chip trägt ein `sr-only` „Die Punkte können sich noch ändern", eine vorläufige
Pkt-Zelle ein `sr-only` „vorläufig". Sonst wären „1" und „1" für einen Screenreader dasselbe. Farbe
trägt nirgends allein eine Aussage: jeder Wert steht auch als Zahl da.

**Keine Zeilen** (alle `outcome`s unbrauchbar) rendert gar nichts; die Karte endet dann unter dem Rad.

## Die Choreografie

### Vier Takte

| Takt | wann | was | was man erfährt |
| --- | --- | --- | --- |
| 1 | 0 ms | der Mittelknopf verlässt die abgehende Karte | die Eingabe ist vorbei |
| 2 | 200 ms | Karten-Überblendung; die Tabelle steht ab hier als **leerer Kasten** | das ist mein Tipp |
| 3 | 900 ms | Toleranzsektor **und** Tabellenkopf | hier ist die Lösung |
| 4 | 1900 ms | die Auswertung: Zeile für Zeile, und mit jeder Zeile ihr Marker | so standen alle dazu |

Takt 3 sagt zweimal dasselbe — die Lösung als Sektor und als Zahl in ihrer Farbe. Takt 4 ebenso.

**Es bewegt sich nach der Überblendung nichts mehr im Layout.** Die Tabelle nimmt ihren Platz ab
Takt 2 vollständig ein, alle Zellen auf `opacity-0`; sichtbar wird nur Tinte. Die einzige
Höhenänderung der Sequenz ist die Überblendung selbst, und die ist ein bewusster Übergang, in dem
beide Karten ohnehin in derselben Rasterzelle liegen. Ein wachsender Kasten (`grid-rows-[0fr]` →
`[1fr]`) wurde erwogen und fallengelassen: er löst ein Problem, das der reservierte Platz gar nicht
erst hat.

### Schreibmaschine

Animiert wird die **ganze Zelle**, nicht nur ihr Text — die Spielerfarbe baut sich also von links
nach rechts auf. Die Konstanten — drei neue, zwei Umbenennungen —, erster Vorschlag, im Lab zu
drehen:

```ts
RESULTS_DELAY_MS = 1900   // Takt 4; hieß MARKERS_DELAY_MS
HEAD_DELAY_MS    = 900    // = SECTOR_DELAY_MS
CELL_STAGGER_MS  = 45     // zwischen den Spalten einer Zeile
ROW_STAGGER_MS   = 120    // zwischen Zeilen; hieß MARKER_STAGGER_MS
TYPE_BUDGET_MS   = 1200   // die Zeilenkaskade dauert nie länger
```

`ROW_STAGGER_MS` ist kleiner als eine Zeile breit ist (3 · 45 = 135 ms), die Kaskaden überlappen
sich also und es fließt, statt zu stottern.

```ts
rowStagger(rowCount) = min(ROW_STAGGER_MS, TYPE_BUDGET_MS / max(1, rowCount))
headCellDelayMs(row, column) = HEAD_DELAY_MS + row * ROW_STAGGER_MS + column * CELL_STAGGER_MS
cellDelayMs(rank, column, rowCount) =
  RESULTS_DELAY_MS + rank * rowStagger(rowCount) + column * CELL_STAGGER_MS
```

Der Kopf zählt drei Zeilen: Überschrift und Etikett (0), Lösungswert (1), Band (2). Spaltenindizes
sind `Name 0, Tipp 1, Differenz 2, Pkt 3`; jede Zelle erbt die Staffelung ihrer Spalte, die beiden
`rowspan`-Zellen die ihrer ersten Zeile. Getippt wird damit „Auswertung" → „Lösung" → `live` →
Lösungswert → Band, also in Lesereihenfolge.

Das Budget deckelt bei vielen Mitspielenden die Kaskade, statt die Runde zu verlängern — dieselbe
Idee wie `stackStep` bei den Marker-Bahnen. Bei drei Tippenden endet die letzte Zelle bei ~2575 ms,
bei fünfzehn rücken die Zeilen auf 80 ms zusammen und es endet bei ~3455 ms.

Mechanik wie im Rad, eins zu eins: ein einmal gefragtes `still` (`animate`,
`prefers-reduced-motion`, Hintergrund-Tab, kein `requestAnimationFrame`), ein `shown`-Ref, CSS-Delays
inline je Zelle, und der doppelte `requestAnimationFrame` mit erzwungenem Reflow, den
`HueWheelReveal` sich für Firefox angewöhnt hat. Rechnerisch ist das billig: `opacity` auf
HTML-Elementen, eine Klasse kippt, kein `Element.animate()` pro Element in einem Frame — die Falle,
vor der [frontend-ui.md](../../../.claude/guidelines/frontend-ui.md) warnt.

Für Screenreader ändert die Choreografie nichts: die Tabelle steht die ganze Zeit vollständig im DOM.

### Marker und Zeile sind ein Ereignis

Der Marker einer Person erscheint zusammen mit **ihrer Tipp-Zelle** — nicht mit dem Zeilenanfang:
Zelle und Marker sind beide „der Tipp als Farbe". Die Zeile liest sich dann als Name → *(die Farbe
erscheint zweimal gleichzeitig)* → Differenz → Punkte.

Technisch trägt `RevealGuess` dafür ein Feld `revealDelayMs`, gesetzt von `GuessHueGame` aus
`cellDelayMs(rank, 1, rowCount)` — der Stelle, die ohnehin Zeilen *und* Marker baut. Das Rad rechnet
damit **gar keinen eigenen Fahrplan mehr**; es liest den Wert vom Marker ab. Es gibt also nur eine
Zeitrechnung, die auseinanderlaufen könnte.

**Die Bahnzuteilung in `layoutGuesses` bleibt unangetastet winkelbasiert.** Sie ist eine
Kollisionsfrage, keine Dramaturgiefrage; nur der Staffelindex wechselt die Quelle.

Damit erscheinen die Marker künftig in **Rangreihenfolge** statt in Winkelreihenfolge: das Bild baut
sich von der Lösungslinie nach außen auf, statt einmal um das Rad zu laufen. Das ist die bessere
Lesart, nicht nur die konsistentere — „wie weit war ich weg" ist die Frage, die man an das Bild
stellt.

Drei Ränder:

- **Mein eigener Marker fadet nicht ein.** Er ist der Knopf, umgefärbt, und liegt seit Takt 2 da.
  Wenn meine Zeile kommt, passiert auf dem Rad nichts — richtig so, und es bekommt keinen
  Extra-Effekt: mein Tipp war die ganze Zeit da, jetzt steht dabei, was er wert war.
- Ein Tipp mit brauchbarer Hue, aber kaputtem `outcome`, steht auf dem Rad und nicht in der Tabelle.
  Sein Marker fällt ans **Ende** der Kaskade: `rank = rowCount + k`, wobei `k` seine nullbasierte
  Position unter den übrigen Tipps ohne Zeile ist. Einen Tipp aus dem Bild zu nehmen, weil seine
  Auswertung Müll ist, wäre der schlechtere Tausch.
- `growBand` wächst weiterhin ab `RESULTS_DELAY_MS` über `BAND_GROW_MS`, unabhängig von der Kaskade.

## „Vorläufig" bekommt eine Farbe

`assets/main.css` hat bereits einen `@theme`-Block; dort kommt `--color-live` dazu, und damit gibt es
`bg-live` / `text-live` / `ring-live` — genau der Name, den das Original hatte. `MemberRow.vue:95`
wechselt von `bg-rose-600` auf `bg-live`, die Tabelle nimmt dasselbe.

Danach hat „vorläufig" auf der Seite **eine** Farbe an **einer** Stelle. Das Token wird als Alias auf
`rose-600` geschrieben; ob Tailwind v4 die Variable stehen lässt oder wegoptimiert, wird im gebauten
Stylesheet geprüft — sonst steht dort der Literalwert mit `rose-600` im Kommentar. Der bestehende
`MemberRow`-Test prüft `animate-pulse`, keine Farbklasse, und bleibt grün.

## Bausteine

| Datei | Aufgabe | neu? |
| --- | --- | --- |
| `games/GameEntry.ts` | drei Felder mehr, plus die Grenze im KDoc | Änderung |
| `games/guesshue/color.ts` | `hslToHex` — aus `reveal.ts` gelöst, jetzt von Rad und Tabelle gebraucht | neu (Umzug) |
| `games/guesshue/analysis.ts` | rein: Zeilen bauen, sortieren, „vorläufig" entscheiden | neu |
| `games/guesshue/reveal.ts` | die Takte und `cellDelayMs`; `MARKER_STAGGER_MS` weicht `ROW_STAGGER_MS`, `MARKERS_DELAY_MS` heißt `RESULTS_DELAY_MS`; `RevealGuess.revealDelayMs` | Änderung |
| `games/guesshue/GuessHueAnalysis.vue` | die Tabelle, sonst nichts | neu |
| `games/guesshue/HueWheelReveal.vue` | liest die Verzögerung vom Marker statt sie zu rechnen | Änderung |
| `games/guesshue/GuessHueReveal.vue` | die Tabelle unter dem Rad; der Kommentar „nichts darunter" wird eingelöst | Änderung |
| `games/guesshue/GuessHueGame.vue` | baut Zeilen **und** Marker, verteilt die Ränge | Änderung |
| `rounds/RoundCard.vue`, `pages/c/[slug]/lab/[game].vue` | reichen `award-rule` durch | Änderung |
| `members/MemberRow.vue`, `assets/main.css` | `--color-live` | Änderung |

`GuessHueGame` bleibt die Stelle, die `unknown` in Zahlen verwandelt — Tabelle und Rad bleiben beide
dumm. Der Kommentar in `HueWheelReveal`, das `aria-label` sei „bewusst weniger als Parität, die
vollständige Aussage ist die Detailtabelle in einem eigenen Schnitt", wird umgeschrieben statt stehen
zu bleiben.

## Tests

Vitest mit `vi`; happy-dom rechnet kein Layout, geprüft wird die strukturelle Stellvertretung.

**`analysis.spec.ts`** — Zeilenbau aus Einträgen; Sortierung nach Abstand mit `userId` als
Gleichstandsregel; Ausfall einer Zeile ohne numerisches `deviationDeg`; `provisional` als Matrix aus
Award-Regel × {0, 1, null}; `guessHex` mit Sättigung und Helligkeit der Runde, nicht des Tipps.

**`reveal.spec.ts`** (Ergänzung) — `cellDelayMs` steigt mit Rang und Spalte; `rowStagger` greift ab
der Zeilenzahl, ab der das Budget bindet (10 Zeilen: 120 ms, 20 Zeilen: 60 ms); der Kopf ist fertig,
bevor Takt 4 beginnt.

**`GuessHueAnalysis.spec.ts`** — `<th scope="row">` je Person und `<th scope="col">` je Spalte; der
Kopfblock in Originalstellung (Überschrift und Chip mit `rowspan="2"`, der Lösungswert in Spalte 2
der zweiten Kopfzeile, per `headers` an sein Etikett gebunden); die `<caption>` ist `sr-only` und
wiederholt die Überschrift nicht; die vier Farbzuordnungen; das Chip nur unter `CLOSEST_ONLY`; Puls und Kursivsatz nur
auf vorläufigen Zellen; beide `sr-only`-Texte; `animate=false` zeigt alles sofort ohne Verzögerung;
keine Zeilen rendert nichts.

**`GuessHueGame.spec.ts`** (Ergänzung) — Rang und `revealDelayMs` landen auf dem Marker derselben
`userId` wie auf der Zeile; ein Tipp ohne Auswertung steht im Rad und nicht in der Tabelle und
bekommt einen Rang hinter allen Zeilen.

**`HueWheelReveal.spec.ts`** (Ergänzung) — die Verzögerung kommt vom Marker; mein Marker hat keine.

**`GuessHueReveal.spec.ts`**, **`RoundCard.spec.ts`**, Lab-Seite (Ergänzungen) — die Tabelle steht
unter dem Rad, `award-rule` wird durchgereicht.

**Im Browser** wird über das **Lab** verifiziert, in Phase ONE und TWO: in einer echten Runde kostet
das Prüfen einen unwiderruflichen Tipp. Zu beurteilen sind genau die Dinge, die kein Test sieht — ob
die Schreibmaschine flüssig läuft oder stottert, ob der reservierte Platz unter dem Rad vor Takt 4
leer wirkt, und ob die Kontraste über echte Spielerfarben tragen.

## Was bewusst nicht gebaut wird

- **Polling.** Siehe Scope. Ein Live-Chip ohne Nachladen ist die heutige Zusage der Mitgliederzeile,
  nicht mehr und nicht weniger.
- **Die eigene Zeile hervorheben.** Erwogen (ein schmaler Balken links, außerhalb der eingefärbten
  Flächen) und verworfen: man erkennt sich an der eigenen Avatarfarbe, und die Tabelle spricht schon
  über Farbe. Kein zweites Vokabular in einem ohnehin lauten Bild.
- **Die Doppelung der Punkte** mit den Live-Chips der Mitgliederzeile bleibt stehen. Der Roster
  beantwortet „wie steht es insgesamt", die Tabelle „wer lag wie und was hat es gebracht" — und ohne
  Pkt-Spalte hätte die Live-Variante nichts zum Pulsieren.
- **Eine Zeile für „hat nicht getippt".** Der Server liefert nur abgegebene Tipps; wer nur geschaut
  hat, taucht nirgends auf, und das ist eine Datenschutzentscheidung aus dem Round-Frontend.
