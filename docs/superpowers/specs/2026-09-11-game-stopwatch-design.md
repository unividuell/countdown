# Die Spieluhr im Band — Countdown, Startsignal, Stoppuhr

**Status:** beschlossenes Design (2026-09-11).

**Baut auf:** dem [Runden-Frontend](2026-08-14-round-frontend-design.md) (`GameHeader`,
`RoundSurface`, `RoundCard`, `useRound`) und dem Flip-Dot-Board aus dem Community-Header.

**Steht neben:** [Musterung](2026-08-24-musterung-design.md) und Weltanschauung — den beiden
Spielen, die in Phase zwei nach Zeit gewertet werden und für die diese Uhr überhaupt existiert.

**Berührt:** `webapp-vue` ausschließlich. `ui/flipdot/` (Farbe, Randzellen), `ui/GameHeader.vue`,
zwei neue Module unter `ui/`, die Community-Seite und die Laborseite als die beiden Besitzer der
Zeremonie. Kein Backend-Change, keine Wire-Änderung.

## Zweck

In Phase zwei läuft ab dem Aufdecken eine Uhr, und ihre Dauer entscheidet die Punkte
(`PlayService`: `requiresReveal` ⇒ `deviation = guessedAt − revealedAt`). Gezeigt wird sie bisher
nirgends — der Spieler spielt gegen eine Uhr, die er nicht sieht. Das Band über der Karte hat oben
rechts bereits ein Display; es zeigt den Rundencountdown, der während des eigenen Spiels die
uninteressantere der beiden Zahlen ist. Dieser Platz wird geteilt.

Dazu eine Korrektur an der Optik des Bandes, die schon heute fällig ist: das Punktfeld endet vor
den Kanten des Headers, und weil die dunklen Dots (`#292524`) dem Bandhintergrund (`#44403c`) nahe
kommen, wirkt es wie ein schlecht freigestellter Aufkleber statt wie ein eingelassenes Display.

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Keine Zehntelsekunden.** Begründung unten, mit Zahlen. Sekundentakt.
- **Keine Änderung am Server.** Alles Nötige steht auf der Leitung: `game.requiresReveal`,
  `me.revealedAt`, `me.guessedAt`.
- **Keine Stundengruppe in der Stoppuhr.** `MM:SS`, nicht `HH:MM:SS`.
- **Keine Legende unter dem gepolsterten Board.** Siehe „Offene Kante“ am Ende.
- **Kein Serverstempel fürs Labor.** `LabRoundStore` führt `openedAt` intern; es wird nicht
  ausgeliefert, und im Labor wird nichts gewertet.
- **Kein neues Verhalten am Rundenende.** Läuft die Runde ab, während jemand noch spielt, zählt
  die Stoppuhr weiter und der Server weist den späten Tipp ab — genau wie heute.

## Auslöser

Die Stoppuhr läuft bei

```
round.game.requiresReveal  &&  round.me !== null  &&  round.me.guessedAt === null  &&  !closed
```

`requiresReveal` ist serverseitig exakt dasselbe Flag, das die Wertung nach Zeit auslöst
(`RoundResponses`: `val timed = handle.requiresReveal(params)`) — es gibt also keine zweite
Definition von „dieses Spiel läuft gegen die Uhr“, die driften könnte.

`closed` ist kein Beiwerk: in der Rundenhistorie stehen Zeilen mit `guessedAt === null`, weil
jemand nie getippt hat. Ohne diese Bedingung liefe dort eine Uhr bis in alle Ewigkeit.

Phase eins und ungetimte Spiele merken von alldem nichts — sie zeigen weiter den Rundencountdown.

## Die drei Gesichter des Bandes

```
tap „Aufdecken“  +1s      +2s      +3s                    Antwort
      │           │        │        │                        │
      ▼           ▼        ▼        ▼                        ▼
   [  3  ] ───▶ [  2  ] ─▶ [  1  ] ─▶ ███████████ ────────▶ [ 00:00 ] ──▶ läuft
      └ Relight   └ Flip    └ Flip     └ POST /reveal         └ Flip
        (300ms)                        └ Relight (300ms),
                                         danach volles Feld

   └──────────────── bernstein ──────────────────────────────────────▶ … bis zum Tipp,
                                                                        dann weiß + HH:MM:SS
```

Vier Entscheidungen darin sind nicht beliebig:

**Der POST fliegt erst, wenn die dritte Sekunde verbraucht ist.** Der Server stempelt
`revealedAt`, wenn er den Request bearbeitet — das ist der Start der gewerteten Zeit. Liegt das
Einzählen davor, ist die angezeigte Null auch die gewertete Null. Läge es dahinter, stünde die
Stoppuhr beim ersten Blick schon auf ~00:03, oder sie zeigte etwas anderes als das, was gewertet
wird.

**Das volle Feld ist der Ladeindikator.** Solange der Request unterwegs ist, leuchtet jeder Dot
des Bretts, Polsterung eingeschlossen; die Antwort flippt die Ziffern wieder heraus. Das kostet
keinen eigenen Zustand und keine Animation: die Volle-Feld-Bitmap ist genauso breit wie die
Anzeige darunter, also flippt das Brett dorthin und zurück wie in jede andere Anzeige. **Und sie
hat genau die Breite der Stoppuhr** — deshalb ist der Rückweg ein Flip und kein zweites Relight,
und die Uhr wird aus dem Feld herausgeflippt statt daneben aufgebaut.

Der Schritt dauert exakt so lange wie der Request und wird nicht gepolstert: ein Feld, das die
Antwort überdauert, würde „lädt" sagen über ein Spiel, das längst spielbar ist. Eine Untergrenze
braucht es trotzdem nicht — der Breitenwechsel vom einzelnen Beat auf die Uhrbreite relightet das
Brett, und ein Relight sind 300 ms leuchtende Dots. Ein blitzschneller Request flackert deshalb
nicht, und das Relight ist unsichtbar, weil seine Weißphase und das volle Feld dasselbe Bild sind.

**Die Beats sind gleich breit** — bare Ziffern, je ein Glyph. Damit flippen 3→2→1 dotweise. Nur
die Moduswechsel — Countdown hinein, Uhrbreite hinaus — ändern die Geometrie und lösen damit das
Relight aus, das `FlipDotBoard` für Geometriewechsel ohnehin schon fährt (weiß, halten,
einrollen). Der gewünschte „Flip mit Animation“ kostet keine Zeile Animationscode.

**Der Bernstein beginnt bei der Zeremonie.** Das Relight blendet alle Dots auf `DOT_ON` — beim
Eintritt also ein bernsteinfarbener Blitz, auf dem Rückweg nach dem Tipp ein weißer. Der
Farbwechsel versteckt sich vollständig in dem Moment, in dem nichts lesbar ist.

**Scheitern.** Schlägt der Reveal fehl (409 ⇒ `useRound` lädt neu, sonst `notice`), räumt die
Zeremonie im `finally` auf und das Band fällt auf den Rundencountdown zurück. Festgehalten wird
nur, was der Server bestätigt hat.

## Warum Sekunden und keine Zehntel

Technisch ginge es — `requestAnimationFrame` plus `performance.now()`, nicht `setInterval`. Am
Medium scheitert es:

- Ein Dot-Flip dauert `FLIP_MS = 170 ms`. Bei 100-ms-Takt beginnt die Zehntelstelle den nächsten
  Flip, bevor der vorige durch ist: Matsch statt Sportübertragung.
- Zehnfache Zahl an `Element.animate()`-Objekten, und genau dort hängt der dokumentierte
  Firefox-Hintergrundtab-Leak (2824 lebende Animationen in zwei Minuten, linear steigend).

Die geteilte Uhr tickt mit beliebiger Phase gegen `revealedAt`; die angezeigte Sekunde kann also
bis zu eine Sekunde hinterherhinken. Das ist dieselbe Abmachung, die der Rundencountdown schon hat
— die State-Guideline verlangt ausdrücklich, sie nicht „zu reparieren“: dass zwei Anzeigen
desselben Augenblicks übereinstimmen, wiegt schwerer als dass eine von beiden maximal frisch ist.

**Format** `MM:SS`. Über 99 Minuten wächst die Minutengruppe und löst ein Relight aus, das
praktisch niemand sieht; eine Stundengruppe, die 99,9 % der Zeit `00:` zeigt, wäre teurer Platz in
einem Band, in dem Platz die knappe Größe ist.

## Geometrie des Bandes

```
              ┌─ 5 Leerspalten links           5 Leerspalten rechts ─┐
        ┌─────┼───────────────────────────────────────────────────┼──┐  ─┐
        │ · · │· · · · · · · · · · · · · · · · · · · · · · · · · ·│· │   │ 2 Zeilen
 36px = │ · · │· · · · · · · · · · · · · · · · · · · · · · · · · ·│· │  ─┤
 43 Ein-│     │   ██  ██ · ██  ██ · ██  ██                        │  │   │ 7 Zeilen
 heiten │     │   ██  ██ · ██  ██ · ██  ██    ← 22,6px (heute 18) │  │  ─┤
        │ · · │· · · · · · · · · · · · · · · · · · · · · · · · · ·│· │   │ 2 Zeilen
        │ · · │· · · · · · · · · · · · · · · · · · · · · · · · · ·│· │   │
        └─────┴───────────────────────────────────────────────────┴──┘  ─┘
                                                                     └ Card-Radius 12px
```

Aus `PITCH = 4`, `RADIUS = 1.5` (also 1 Einheit Lücke) und `GLYPH_ROWS = 7`:

| | heute | neu |
|---|---|---|
| Dot-Zeilen | 7 | 11 (2 + 7 + 2) |
| Boardhöhe | 18px | 36px (`h-full` im `h-9`-Band) |
| Ziffernhöhe | 18px | 22,6px |
| Randzeile | — | 6,7px oben und unten |
| Randspalte | — | 16,7px links und rechts |
| Breite `HH:MM:SS` | 114px | 177px |
| Breite `MM:SS` und volles Feld | — | 123px |
| Breite eines Beats | — | 49px |

- **Rechts bündig:** Header wird `pl-4 pr-0`, das Punktfeld läuft in die Ecke. Der Radius frisst
  maximal 12px Breite, an der obersten *leuchtenden* Zeile (6,7px von oben) nur noch 1,2px. Die
  fünf Leerspalten rechts sind mit 16,7px also nicht wegen des Radius so breit, sondern weil das
  der heutige `px-4`-Gutter ist: die Ziffern bleiben waagerecht stehen, wo sie heute stehen.
- **Links dieselben fünf**, wofür es keinen Grund gibt außer Symmetrie — und die ist der Grund:
  die Anzeige sitzt mittig in ihrem Feld statt an ein Ende gedrückt. Sichtbar wird das erst, seit
  das Feld eine eigene Fläche ist, die man als Fläche wahrnimmt.
- **Unter `sm`** hat `RoundSurface` weder Radius noch `overflow-hidden`; dort läuft das Feld bis an
  den Viewport-Rand und die Leerspalten sind schlicht der Rand.
- **Gemessene Folge:** das Board wächst um 63px. Auf einem 360px-Viewport bleiben dem Spielnamen
  daneben ~131px statt ~194px. Er kürzt sich weiter mit Ellipse; die Uhr verliert nie Ziffern
  (`shrink-0`), weil ein gekürzter Messwert eine falsche Zeit ist.
- Der App-Header (`CountdownDisplay`) bekommt **kein** Padding: er sitzt frei in einer 44px-Zeile
  und hat keine Kante, an die er stoßen könnte — zwei Leerzeilen würden dort nur die Legende von
  den Ziffern wegschieben.

## Vertrag von `FlipDotBoard`

Drei neue optionale Props, alle mit dem heutigen Verhalten als Default, damit kein bestehender
Aufrufer sich ändert:

| Prop | Default | Wirkung |
|---|---|---|
| `tone` | `'default'` | Farbpaar statt der Konstanten. `'alarm'` = amber-500 (`#f59e0b`) auf unverändertem Feld. |
| `pad` | keine | Leerzeilen/-spalten rings um die Glyphen, in Dot-Zellen. |
| `solid` | `false` | Jeder Dot an, Polsterung eingeschlossen — das Brett beschäftigt statt lesend. |

`solid` ist **keine Rendermodus-Verzweigung, sondern eine andere Bitmap**: dieselbe Breite, alle
Dots an. Damit flippt das Brett dorthin und zurück wie in jede andere Anzeige, und der
Ladeindikator kostet keine Zeile Animationscode.

Das Padding wird **zur Bitmap addiert** (`padded()` in `font.ts`), nicht als CSS — sonst stimmen
viewBox, Dot-Indizes und die Wellenlogik nicht mehr überein. Die drei Stellen, die heute
`DOT_ON`/`DOT_OFF` direkt in den DOM schreiben (`flip`, `releaseWaves`, `createDueColumns`), lesen
künftig das Tonpaar des Boards.

Ein Tonwechsel ohne Geometriewechsel kommt in diesem Design nicht vor; trotzdem gibt `watch(tone,
releaseWaves)` die von Hand gehaltenen Dots frei, bevor sie in der alten Farbe stehenbleiben
können.

## Neue Module

- **`ui/elapsedClock.ts`** — rein, Schwester von `remainingClock.ts`. `elapsedClock(sinceIso,
  nowMs)` → `MM:SS`, `elapsedReading(…)` → „Deine Zeit: 1 Minute, 5 Sekunden“. Bei 0 geklemmt: die
  Skew-Korrektur kann die lokale Uhr in der ersten Sekunde hinter den Serverstempel setzen, und
  `-00:01` wäre der erste Eindruck.
- **`ui/useStartCeremony.ts`** — `step` (`'3' | '2' | '1' | 'waiting' | null`), `run(go)` und die
  Typen `StartBeat`/`StartStep`/`PlayClock`. `run` läuft die drei Beats im Sekundentakt, ruft
  danach `go()` und hält `waiting`, bis es abgeräumt ist; das `finally` räumt auf. Ein zweiter
  `run` während eines laufenden wird verworfen. Mit `disposed`-Flag und Aufräumen beim Unmount,
  wie es die State-Guideline für alles verlangt, was außerhalb von Vue tickt — und mit einem
  zweiten `disposed`-Blick nach der Beat-Schleife, damit eine verlassene Zeremonie nicht doch noch
  den einen Versuch des Spielers ausgibt.

`PlayClock` ist die Prop, die das Band liest:

```ts
export type PlayClock =
  | { phase: 'start'; beat: StartBeat }   // 3 · 2 · 1
  | { phase: 'waiting' }                  // der Reveal ist unterwegs, das Feld leuchtet
  | { phase: 'running'; since: string }   // ISO-Instant, ab dem die Spieluhr läuft
```

`null` heißt Rundencountdown. Damit bleibt jeder heutige Aufrufer von `GameHeader` unverändert.

Das Feld für `waiting` braucht einen Text, den nie jemand liest — er steht nur für seine *Breite*
da, und zwar die der Stoppuhr. Die Font bekommt keine Buchstaben: die Beats sind Ziffern.

## Wer besitzt was

Die Zeremonie gehört zur **Seite**, nicht zur Karte. `pages/c/[slug]/index.vue` hält schon den
einzigen `useRound`-Aufruf und reicht `reveal` herunter; sie reicht künftig `ceremony.run(reveal)`
herunter und ein `busy`, das den Zeremonieschritt einschließt — womit der Aufdecken-Knopf während der
Zeremonie von selbst tot ist, ohne zweites Flag.

**Der Sperrgriff gilt nur dem Knopf.** Das `busy`, mit dem die Seite den Aufdecken-Knopf während
der Zeremonie totlegt, erreicht auch das `disabled` des gemounteten Spiels. Ungefiltert hieße das:
die Antwort landet, das Brett erscheint — und nimmt bis zum Ende der Zeremonie keine Eingabe an,
während die gewertete Zeit längst läuft. Die Sperre hängt deshalb zusätzlich am Gesicht
(`stage === 'sealed'`), denn nur dort gibt es den Knopf überhaupt.

```
Seite  ──useRound──▶ reveal                    RoundCard  ──play──▶  GameHeader
  │                                                ▲                     │
  └──useStartCeremony──▶ run(reveal), beat ────────┘                     └─▶ FlipDotBoard
                                                                              (tone, pad, text)
```

`RoundCard` bleibt damit das, was sein Kommentar behauptet: eine Karte ohne eigenen Zustand. Sie
bekommt `play: PlayClock | null` mit Default `null` — die Rundenhistorie rendert Karten ohne Uhr —
und reicht es unverändert an `GameHeader` weiter.

## Labor

Dieselbe Verdrahtung, nur kommt der Start vom Client: `playStartedAt` wird gesetzt, wenn der
Lab-Reveal durchgeht, und beim Neuöffnen einer Runde (Seed- oder Phasenwechsel) wieder geleert.

Ein Reload mitten im Spiel verliert die Laboruhr: der Stempel lebt nur im Speicher der Seite, und
`openLabRound` antwortet `revealed: true`, weil der Server sein eigenes `openedAt` behält — also
setzt niemand den Stempel neu und das Band fällt auf den Rundencountdown zurück. Das ist der Preis
von „kein Serverstempel fürs Labor" und hier ausdrücklich in Kauf genommen.

Der Stempel ist zugleich die Bedingung. Im Labor bleibt `round.me` null, bis ein Tipp landet, und
`revealed` steht nach dem Aufdecken für beide Spielarten auf `true` — „gestempelt und noch kein
`me`“ ist also genau die Spielzeit, ohne ein zweites Flag. Die Ungenauigkeit gegenüber dem Server
ist im Labor folgenlos: dort wird nichts gewertet, die Uhr ist Anschauung.

## Barrierefreiheit

Ein Punktraster liest sich als nichts; das `aria-label` des Boards ist die einzige Stimme der
Anzeige. Es folgt dem Gesicht: „Noch … in dieser Runde“ (heute), „Start in 2 Sekunden“ / „Los“
während der Zeremonie, „Deine Zeit: …“ während des Spiels. Das Board ist im Band selbstbeschreibend
(nichts umschließt es), bleibt `role="img"` und ist keine Live-Region — die sekündliche Änderung
wird also nicht vorgelesen, sondern nur beim Anspringen.

## Tests

| Was | Wie |
|---|---|
| `elapsedClock` / `elapsedReading` | rein, ohne Mount — Format, Klemmung bei 0, Minuten > 99 |
| `padded()` | rein — Spalten/Zeilen wachsen, Dots verschieben sich, Glyphen bleiben heil |
| `useStartCeremony` | `vi.useFakeTimers()` — Beatfolge, `go()` erst nach der dritten Sekunde, `waiting` genau so lang wie ein langsamer `go()`, Aufräumen nach geworfenem `go()`, zweiter `run` verworfen, kein Reveal nach Unmount |
| `FlipDotBoard` | `pad` wächst die viewBox; `tone` färbt die Dots; `solid` leuchtet jeden Dot und kommt per Flip, nicht per Relight |
| `GameHeader` | vier Gesichter aus einer Prop; das Wartefeld hat die Breite der laufenden Uhr; `play: null` verhält sich wie heute |
| `RoundCard` | `play` nur bei `requiresReveal && !guessedAt && !closed` |
| Community-Seite | Reveal läuft durch die Zeremonie; `busy` während der Beats |
| Laborseite | Stempel wird gesetzt und beim Neuöffnen geleert |

`Element.animate` gibt es in happy-dom nicht; das Board steigt dort früh aus, die Flip-Wege bleiben
wie heute ungetestet.

## Offene Kante

`groupCentres()` rechnet über die **ungepolsterte** Breite. `pad` und `FlipDotLegend` komponieren
also nicht — die Legende säße gegen die Ziffern verschoben. Das fällt heute nicht auf, weil das
einzige gepolsterte Board keine Legende hat und das einzige Board mit Legende kein Padding. Wer
beides zusammenbringt, muss das Padding in `groupCentres` hineinreichen; ein Kommentar an beiden
Stellen sagt das.
