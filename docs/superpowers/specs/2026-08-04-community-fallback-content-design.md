# Community Fallback Content — die Fallblatt-Tafel

**Status:** beschlossenes Design (2026-08-04).

**Baut auf:** der [Countdown Engine + Anzeige](2026-06-14-countdown-engine-display-design.md)
(`useCountdown`, `computeView`, server-autoritative Runden) und der
[Rangliste-Reihe](2026-08-03-community-members-design.md) (`useRoster`, `MemberPointsQuery`).

**Berührt:** nur `webapp-vue`. Kein Backend-Change, kein neuer Endpoint, kein neues Feld.

## Zweck

Die Community-Landingpage `/c/<slug>/` zeigt heute nur die Rangliste-Reihe; darunter ist die Seite
leer. Der Runden-Content — die Mini-Games — existiert noch nicht. Diese Spezifikation füllt den
Platz mit dem **Fallback**: dem, was dort steht, solange keine Runde bespielbar ist.

Der Fallback ist kein Notbehelf, sondern der Normalfall in der längsten Phase des Produkts: die
Wartezeit vor dem Event ist genau das, was die App verkürzen soll. Also bekommt sie das
prominenteste Element der Seite.

## Entscheidungen (im Brainstorming festgelegt)

- **Drei Zustände, nicht zwei.** `startsAt` ist nullable (`Community.kt`, `V1__create_communities.sql`),
  und `startsAt` in der Vergangenheit ist ein eigener Fall. Jeder Zustand ist eine eigene Card.
- **Zustand 2 ist eine Fallblatt-Anzeige** (Flip-Dot): Punktscheiben, die von Schwarz auf Weiß
  kippen, wie an Flughäfen und Bahnhöfen. Layout: **Tageszahl als Hero**, darunter Std/Min/Sek als
  durchgehende Uhrzeit-Leiste.
- **Zustände 1 und 3 sind helle Cards im App-Stil** — keine schwarze Tafel. Die Tafel ist dem
  laufenden Countdown vorbehalten; ist keiner da, gibt es nichts anzuschlagen.
- **Alle drei Cards sind quadratisch.** Die Seite behält dieselbe Silhouette, egal welcher Zustand
  greift.
- **Einheiten-Labels sind Mono-Text**, keine Punktschrift. Bewusst zwei Schriftmaterialien: eine
  gepunktete Beschriftung müsste so klein werden, dass sie auf einem Handy an die Auflösungsgrenze
  gerät — und der Wortschatz (inklusive Umlaute) wäre teurer als der Gewinn.
- **Der Header verliert sein „Event läuft"-Label.** Diese Aussage macht ab jetzt die Card. Der
  T+-Aufwärtszähler bleibt oben stehen.
- **Kein Aufwärtszähler in der Card.** Zustand 3 trägt keine Zahlen.

## Die drei Zustände

### Zustand 1 — kein Termin (`startsAt === null`)

Helle Card, Inhalt zentriert:

> **Noch kein Termin**
> Diese Spielgemeinschaft entsteht gerade. Komm später wieder.

### Zustand 2 — Countdown (`startsAt` in der Zukunft)

Die Fallblatt-Tafel. Details unten.

### Zustand 3 — Event läuft (`startsAt` erreicht oder vorbei)

Helle Card, Inhalt zentriert. Gibt es einen Gewinner, trägt die Gratulation die Überschrift:

> **Herzlichen Glückwunsch, Fry!**
> Und jetzt viel Spaß zusammen!

Ohne Gewinner trägt der Spaß-Satz die Card allein:

> **Und jetzt viel Spaß zusammen!**

Es gibt bewusst keine Überschrift „Das Event läuft" — dass es läuft, sagt bereits der Zähler im
Header. Die Card fügt dem nichts hinzu, was sie nicht selbst meint.

## Zustandsermittlung — ohne Flackern

Die Reihenfolge ist wichtig, sonst blitzt beim Seitenaufbau die falsche Card auf:

1. **Zustand 1 entscheidet synchron** an `community.startsAt === null`. Die Route-Guard hat die
   Community aufgelöst, bevor die Route committet (`c/[slug].vue`) — es braucht dafür keinen
   Request und es gibt keinen Ladezustand.
2. **Zwischen 2 und 3 entscheidet `view.state`** aus `useCountdown` (`'before'` → Tafel,
   `'after'` → Meldung).
3. **Solange `view.state === 'idle'`** — die Countdown-Response ist noch unterwegs — steht ein
   gleich großer, leerer Platzhalter. `'idle'` bedeutet an dieser Stelle ausschließlich „noch nicht
   geladen", weil der `startsAt === null`-Fall schon in Schritt 1 abgefangen ist.

Der Platzhalter hat exakt die Kantenlänge der Cards. Dasselbe Muster wie bei der Rangliste-Reihe
(`index.vue`): die Seite darf nicht springen, wenn die Daten landen.

## Datenquelle

`RoundFallback` — nicht die Card — hält eine **eigene `useCountdown`-Instanz**, weil es `view.state`
für die Wahl zwischen Zustand 2 und 3 braucht. Der Slug wird dabei maskiert:

```ts
useCountdown(computed(() => (community.value.startsAt ? community.value.slug : null)))
```

Bei `startsAt === null` bleibt der Slug `null`, und `useCountdown` feuert keinen Request — Zustand 1
kostet also keinen Netzwerkverkehr. `CountdownCard` bleibt dumm und bekommt die fertigen Werte als
Props.

Gelesen wird `view.chips` bei `cfg = { months: false, weeks: false, days: true }`:

- `chips[0]` = Tage — das ist `round.number`, der autoritative Tageszähler vom Server
- `chips[1..3]` = Stunden/Minuten/Sekunden, zweistellig genullt

**Keine zweite Zeitlogik.** Die DST-empfindliche Rechnung bleibt im Backend, die Formatierung in
`computeView`; die Card rendert nur.

Bewusst eine **eigene Instanz** und nicht die des Headers: dessen `cfg` ist per Klick umschaltbar
(Monate/Wochen/Tage), und diese Umschaltung darf den Hero nicht mitverändern — er zeigt immer Tage.
Der Preis ist ein zweiter `GET /api/communities/<slug>/countdown` beim Seitenaufbau und ein zweiter
Sekunden-Timer. Beides ist billig; ein geteilter Per-Slug-Store wäre Infrastruktur für ein Problem,
das es nicht gibt.

## Die Fallblatt-Tafel

### Material

- Tafel: `bg-stone-900` (identisch mit dem App-Header), `rounded-xl`, `aspect-square`, volle Breite
  der `max-w-xl`-Spalte
- Punkt aus: `stone-800`, Punkt an: `stone-50`
- Labels: `font-mono`, 11 px, `tracking-[0.14em]`, `text-stone-500`

### Geometrie

**SVG mit `viewBox`, nicht 450 Divs.** Ein Rastergitter in Punkt-Einheiten skaliert verlustfrei vom
320-px-Handy bis zur 576-px-Spalte — ohne JS-Messung, ohne Container-Queries, und mit einem
DOM-Knoten pro Punkt statt eines Div-Baums.

Rastereinheiten: Zellabstand 4, Punktdurchmesser 3 (also 1 Einheit Luft). Glyphen sind 5 × 7 Punkte
mit 1 Spalte Zeichenabstand, also `spalten = zeichen * 6 - 1`.

Alle Prozentangaben beziehen sich auf die **Außenbreite der Card**; die Luft zum Rand entsteht
allein aus diesen Anteilen. Damit das auch stimmt, trägt die Card **kein horizontales Padding**
(nur vertikales) — sonst wäre der Prozentsatz einer vom Padding verkleinerten Content-Box —, und
der Block um die Hero-Tafel ist ausdrücklich `w-full`: in der `items-center`-Spalte wäre er sonst
shrink-to-fit und würde seine Breite vom einzigen breiten Kind nehmen, einem `<svg>` ohne
`width`-Attribut, das genau 300 px beiträgt. Der Hero wäre dann auf jedem Viewport 216 px breit.

**Hero (Tage).** Die Tageszahl wird auf **mindestens zwei Stellen genullt** — der letzte Tag zeigt
`00`, nicht `0`. Damit gibt es nur zwei reguläre Fälle. Die Breite der Hero-Tafel ist ein fester
Anteil, abhängig von der Stellenzahl; die Punktgröße fällt daraus automatisch:

| Stellen | Spalten | Breite |
| ------- | ------- | ------ |
| 2       | 11      | 72 %   |
| 3       | 17      | 92 %   |
| ≥ 4     | 6n−1    | 100 %  |

Beim Übergang 100 → 99 Tage schrumpft die Anzeige also einmalig sichtbar. Das ist die bewusst
gewählte Variante: randbündig **und** konstante Ziffernhöhe geht bei wechselnder Stellenzahl nicht
beides, und immer zentriert schlägt immer bündig. Die 4-Stellen-Zeile ist reine Robustheit — sie
greift ab 1000 Tagen Vorlauf und degradiert die Tafel, statt sie überlaufen zu lassen.

**Leiste (Uhrzeit).** `HH:MM:SS` — 8 Zeichen, 47 Spalten, konstant **94 %** der Card-Breite. Darunter
`STD` / `MIN` / `SEK` als Mono-Text, jeweils unter der Mitte ihres Ziffernpaars.

Vertikal: der Hero-Block ist im verbleibenden Raum zentriert, die Leiste sitzt unten.

### Die Punktschrift

Ein reines Modul `ui/flipdot/font.ts`, ohne DOM und ohne Vue:

```ts
export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7
export function bitmap(text: string): { cols: number; rows: number; on: boolean[] }
```

Der Zeichensatz umfasst genau `0`–`9`, `:` und Leerzeichen — mehr braucht die Tafel nicht, weil die
Labels Mono-Text sind. Ein unbekanntes Zeichen rendert als leere Zelle, nicht als Fehler: eine Tafel
mit einer Lücke ist ein besseres Verhalten als eine Exception im Sekundentakt.

### Der Kipp-Effekt

Animiert wird ausschließlich die **Differenz** — pro Sekunde sind das eine Handvoll Punkte, nicht die
ganze Tafel.

Pro geändertem Punkt, per Web Animations API:

- Dauer 170 ms, `ease-in-out`
- `scaleY` 1 → 0.12 (bei 49 %) → 0.12 (bei 50 %) → 1, die Scheibe kippt also auf die Kante und zurück
- Farbwechsel exakt bei 50 %, im Moment der geringsten Sichtbarkeit
- `fill: 'backwards'`, damit während der Verzögerung noch die alte Farbe steht
- Verzögerung `(rechteste geänderte Spalte − spaltenindex) * 9 ms` — die Welle läuft **von rechts nach
  links** und beginnt bei der äußersten Spalte, die sich überhaupt ändert. Die Richtung ist die des
  Übertrags: beim Herunterzählen kippt 20 → 19 erst die Null, und *dadurch* die Zwei. Und gemessen
  wird ab der geänderten Spalte, nicht ab dem Rand der Tafel — die Sekunden belegen die Spalten 42–46
  der `HH:MM:SS`-Leiste, ein absoluter Versatz hätte sie 414 ms warten lassen, bevor sich überhaupt
  etwas rührt. Gemessen im Browser: die Sekunde schaltet nur die Spalten 36–46, Spalte 46 startet bei
  0 ms, Spalte 36 bei 90 ms

`transform-box: fill-box; transform-origin: center` auf den Kreisen, damit `scaleY` um den
Punktmittelpunkt kippt und nicht um den SVG-Ursprung.

**`prefers-reduced-motion`:** kein Kippen, die Punkte wechseln hart die Farbe. Die Anzeige bleibt
vollständig und aktuell — es entfällt nur die Bewegung. (Dieselbe Haltung wie beim
Navigations-Fortschrittsbalken in `App.vue`.)

## Gewinnerermittlung

Kein neuer Endpoint: die Landingpage lädt den Roster ohnehin, und `RosterService` sortiert ihn
bereits absteigend nach `rank = stable + (live ?: 0)`.

Ein reines Modul `members/winner.ts`:

- `rank(member) = points.stable + (points.live ?? 0)`
- Maximalrang über alle Mitglieder; ist er `<= 0`, gibt es **keinen** Gewinner
- sonst **alle** Mitglieder mit diesem Rang, in Roster-Reihenfolge

**Derselbe Rang, nach dem die sichtbare Rangliste sortiert ist.** Ein Gewinner, der in der Reihe
darüber nicht vorne steht, wäre für den Betrachter unerklärlich.

**Gleichstand nennt alle.** Ein Name: `Fry`. Zwei: `Fry und Leela`. Drei und mehr:
`Fry, Leela und Bender`. Willkürlich einen von zwei Gleichplatzierten zu küren wäre eine
Behauptung, die die Anzeige nicht deckt. Genannt wird `fullName`.

## Header-Änderung

In `communities/CountdownDisplay.vue`:

- Der `<span>Event läuft</span>` vor den Ziffern entfällt.
- Das `title`-Attribut trägt im `after`-Zustand keinen Text mehr (`undefined`), im `before`-Zustand
  unverändert „Countdown bis zum Start".
- Der T+-Aufwärtszähler bleibt.

Die Aussage „das Event läuft" gehört ab jetzt der Card. Zwei Stellen, die dasselbe sagen, driften.

## Struktur

Jede Einheit klein und mit einer Aufgabe:

| Datei                                    | Aufgabe                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `ui/flipdot/font.ts`                     | Punktschrift: Text → Bitmap. Pur, kein DOM.                           |
| `ui/flipdot/FlipDotBoard.vue`            | Rendert ein Bitmap als SVG und animiert Differenzen. Dumm.            |
| `communities/fallbacks/CountdownCard.vue`| Zustand 2: die Tafel aus zwei Boards + Labels. Props, kein Laden.     |
| `communities/fallbacks/MessageCard.vue`  | Helle Card, Props `title` + optional `text`. Für Zustand 1 und 3.      |
| `communities/fallbacks/RoundFallback.vue`| Hält `useCountdown`, wählt den Zustand. Props: `community`, `members`. |
| `members/winner.ts`                      | Rang, Gewinnerliste, Namensformatierung. Pur.                         |

**Warum `ui/flipdot/` für die Tafel:** die Tafel weiß nichts über Communities, Runden oder
Countdowns — sie übersetzt Text in Punkte, sonst nichts. Sie gehört dorthin, wo `HeaderMenu.vue` und
`navigationProgress.ts` liegen, nicht in ein Fachmodul. Eigener Ordner, weil sie aus mehreren Teilen
besteht, die nur zusammen Sinn haben: Schriftdaten, Renderer, Tests. Wer die Primitive später
woanders braucht, nimmt den Ordner.

**Warum `communities/fallbacks/`:** das sind Community-Fallbacks, keine allgemeinen. Sie hängen an
`CommunityResponse`, an `useCountdown` und am Roster — außerhalb einer Community bedeuten sie nichts,
also gehören sie unter `communities/`. Innerhalb von `fallbacks/` ist ein `Fallback`-Präfix am
Dateinamen redundant — daher `MessageCard`, nicht `FallbackMessageCard`.

`pages/c/[slug]/index.vue` mountet `RoundFallback` unter der Rangliste-Reihe und gibt die schon
geladenen `members` weiter — `RoundFallback` lädt selbst keine Mitglieder.

`members/winner.ts` bleibt bei den Mitgliedern und wandert nicht nach `fallbacks/`: es rechnet mit
Mitglieder-Punkten und derselben Rang-Definition wie die Rangliste-Reihe. Dass heute nur der Fallback
es aufruft, ändert nichts daran, wovon es handelt.

## Tests

Vitest + `vi`, mobile-first geprüft:

- `ui/flipdot/__tests__/font.spec.ts` — Glyph → Bitmap, Spaltenzahl je Zeichenzahl, unbekanntes
  Zeichen → leere Zelle, Doppelpunkt.
- `members/__tests__/winner.spec.ts` — Gewinner bei klarer Spitze; **kein** Gewinner bei Maximalrang
  0; Gleichstand zu zwei und zu drei; Namensformatierung je Anzahl; `live` fehlt → nur `stable`.
- `ui/flipdot/__tests__/FlipDotBoard.spec.ts` — Anzahl der Kreise, `on`-Zustand der richtigen
  Punkte, Differenz-Update animiert nur geänderte Punkte, `prefers-reduced-motion` löst keine
  Animation aus.
- `communities/fallbacks/__tests__/RoundFallback.spec.ts` — Zustandswahl über `data-test`-Marker:
  `startsAt === null` → Meldung sofort und ohne Request; `'before'` → Tafel; `'after'` → Meldung mit
  bzw. ohne Gratulation; `'idle'` → Platzhalter gleicher Größe.
- `communities/__tests__/CountdownDisplay.spec.ts` — anpassen: kein „Event läuft" mehr im Header,
  Zähler weiterhin vorhanden.

## Ausdrücklich nicht dabei

- **Keine Punkte-Implementierung.** `MemberPointsQuery` bleibt gestubbt; die Gewinner-Logik wird
  gegen die vorhandene Naht gebaut und stimmt automatisch, sobald echte Punkte anhängen.
- **Kein Runden-Content, keine Mini-Games.** Sobald es sie gibt, ersetzt der Runden-Content
  **Zustand 2**; die Zustände 1 und 3 bleiben, wie sie hier stehen.
- **Keine Umlaut- oder Buchstaben-Glyphen** in der Punktschrift.
- **Keine Backend-Änderung.**
