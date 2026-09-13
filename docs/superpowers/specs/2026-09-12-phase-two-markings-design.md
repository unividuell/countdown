# Phase zwei sichtbar machen — eine Farbe, eine Gewinner-Box

**Status:** beschlossenes Design (2026-09-12).

**Baut auf:** der [Spieluhr im Band](2026-09-11-game-stopwatch-design.md) — von dort kommt das
Bernstein, das hier seine Bedeutung bekommt — und auf `ui/InfoBox.vue`, der Anleitungsbox.

**Steht neben:** [Musterung](2026-08-24-musterung-design.md) und Weltanschauung, den beiden
zeitgewerteten Spielen, und dem Scoreboard-Begriff „vorläufig" (`games/awards.ts`).

**Berührt:** `webapp-vue` ausschließlich. Ein Token in `main.css`, `ui/InfoBox.vue`, eine neue
`ui/AwardBox.vue`, `ui/GameHeader.vue`, `rounds/RoundCard.vue`, die Laborseite und je ein Einbau in
allen vier Spielen. Kein Backend-Change, keine Wire-Änderung.

## Zweck

Eine Runde in Phase zwei ist eine andere Runde: der Einsatz wächst ab der Schwelle um einen Punkt
pro Runde, und nur der beste Tipp bekommt ihn. Beides ist heute nirgends zu sehen — die Karte sieht
aus wie jede andere, und wer die Regel nicht auswendig kennt, spielt gegen einen Einsatz, den er
nicht kennt.

Dazu die zweite Hälfte: die Wertungsregeln stehen bisher gar nicht in der App. Bei Farbausmalung
sind sie in einen grauen Hinweissatz gemischt, bei den übrigen fehlen sie.

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Keine Änderung am Server.** `awardRule` und `awardPoints` stehen auf jeder Rundenantwort.
- **Keine zweite Box-Komponente für die Mechanik.** Auf- und Zuklappen, Merken, Trefferfläche
  gibt es einmal.
- **Keine Einfärbung der Flip-Dots des Rundencountdowns.** Begründung unten.
- **Keine neue Wertungslogik im Frontend.** Die Box *erklärt* `Scoring.kt`, sie rechnet nichts nach.

## Bernstein heißt „Phase zwei“

```css
/* main.css, neben --color-live */
--color-phase-two: var(--color-amber-500);
```

Die Stoppuhr im Band ist seit der Spieluhr bernstein. Getimte Spiele gibt es **nur** in Phase zwei
— die Farbe hat dort also längst diese Bedeutung, sie war nur nie benannt. Damit gilt hier
dieselbe Regel, die der `--color-live`-Kommentar für „vorläufig“ formuliert: eine Bedeutung, eine
Farbe.

**Eine Kopie bleibt, und zwar bewusst.** `board.ts` braucht einen konkreten Farbwert, weil die Dots
ihre Farbe per `setAttribute` und in WAAPI-Keyframes bekommen — dort hilft keine Klasse und kein
`currentColor` (die Keyframes interpolieren zwischen *zwei* Farben, an/aus). `DOT_ALARM_ON` bleibt
der Hex derselben Tailwind-Farbe, mit einem Kommentar, der `--color-phase-two` als seinen Zwilling
benennt — dieselbe Ausnahme, die der `--color-live`-Kommentar für sich selbst schon vorsieht.

**Der Rundencountdown bleibt weiß.** Er bernstein zu färben lag nahe, kollidiert aber mit sich
selbst: die laufende Stoppuhr ist bernstein, und getimte Spiele gibt es nur in P2 — beides bernstein
heißt, die Farbe unterscheidet die beiden Anzeigen gar nicht mehr, und das ausgerechnet dort, wo die
Stoppuhr überhaupt vorkommt. Die Phasenmarkierung sitzt deshalb links an der Rundennummer, die
Uhrmarkierung rechts im Feld, und nichts überlagert sich.

| Ort | P1 | P2 |
|---|---|---|
| Rundennummer im Band | `text-stone-400` | `text-phase-two` |
| Flip-Dots des Countdowns | weiß | weiß |
| Flip-Dots der Stoppuhr | — (gibt es nicht) | bernstein |
| Gewinner-Box | sky, wie die Anleitung | bernstein |

## Die zwei Boxen

`InfoBox` behält seine Mechanik und bekommt zwei Props: einen `tone` (`'info' | 'phase-two'`) und
ein Icon. `AwardBox` ist die zweite Box — sie besitzt den Regeltext, nicht die Mechanik, und
mountet `InfoBox` mit dem Ton, den die Phase verlangt.

| | Anleitung | Gewinner (P1) | Gewinner (P2) |
|---|---|---|---|
| Ton | sky | sky | bernstein |
| Icon | `info` | `chart-pie` | `chart-pie` |
| Headline | der eine Satz des Spiels | „Jeder richtige Tipp: 1 Punkt“ | „Winner takes it all: 7 Punkte“ |

**Das Kuchendiagramm, weil das die Frage ist:** wie viel vom Gesamtkuchen bringt diese Runde. Das
ist in P2 die eigentliche Information, und sie ändert sich jede Runde.

**Die Punktzahl steht in der Headline, nicht im Körper.** Zugeklappt ist der Zustand, in dem die
Box die meiste Zeit steht, und der variable Teil muss der sein, der dann noch zu sehen ist. Das ist
genau die Doktrin, die `InfoBox` schon hat — „the abstract always shows“.

**Das Zuklappen wird nach Spiel *und* Phase gemerkt** (`award:{gameId}:{phase}`). Wer die Box in
Phase eins weggeklappt hat, bekommt sie in der ersten Runde der Phase zwei wieder — dort ändert sich
die Regel vollständig und der Einsatz beginnt zu wachsen. Ein Fold, der das überdeckt, wäre der
falsche.

**„Winner takes it all“** ist der Name der Regel, nicht eine Umschreibung davon — der Ausdruck steht
schon so in der Musterung-Vorlage. Er ersetzt den längeren Satz über den späteren, besseren Tipp;
was dieser Satz zusätzlich sagt — dass eine Wertung wieder wegfallen kann — deckt der Körper ab und
`isProvisional` zeigt es im Scoreboard ohnehin an.

**Vertrag von `AwardBox`:**

```ts
defineProps<{
  /** Die Wertungsregel der Runde. `CLOSEST_ONLY` ist Phase zwei. */
  awardRule: AwardRule
  /** Was in dieser Runde zu holen ist. In P1 immer 1, in P2 wachsend. */
  awardPoints: number
  /** Die Spiel-Id — die eine Hälfte des Storage-Keys. */
  gameId: string
}>()
```

Zwei Slots, `#qualifies` und `#closest`; die Box rendert genau einen. Der Storage-Key ist
`` `award:${gameId}:${awardRule === 'CLOSEST_ONLY' ? 'p2' : 'p1'}` `` — die Phase steht als `p1`/`p2`
darin und nicht als Rundennummer, denn gemerkt werden soll die Phase, nicht der Tag.

## Was die Box sagt, und wer es sagt

Der Rahmen gehört dem Framework und rechnet aus `awardRule` und `awardPoints`. Den Satz darunter
kann nur das Spiel sagen — und er ist **pro Phase verschieden**, also zwei Slots, von denen die Box
den rendert, den die Phase verlangt.

Warum zwei und nicht einer: in Phase eins lautet die Frage „was zählt als richtig“, in Phase zwei
„wer gewinnt unter den richtigen“. Das sind verschiedene Sätze, und bei den zeitgewerteten Spielen
kommt in Phase eins gar keine Zeit vor.

| Spiel | P1 — was zählt | P2 — wer gewinnt |
|---|---|---|
| Farbausmalung | innerhalb der erlaubten Abweichung | am nächsten am Farbton — es gibt keine Grenze mehr, jeder ist Kandidat |
| Musterung | das richtige Muster gefunden | das richtige Muster **und** die kürzeste Zeit |
| Song-Snippet | den richtigen Song erkannt | der richtige Song **und** der kürzeste Schnipsel |
| Weltanschauung | abgegeben — und von den Mitspielern nicht kassiert | die kürzeste Zeit, solange der Tipp stehen bleibt |

**Das „und“ ist keine Formel, sondern eine Eigenschaft des jeweiligen Spiels.** `Scoring.kt`:

```kotlin
val best = verdicts.filter { it.qualifies }.minOfOrNull { it.deviation }
CLOSEST_ONLY -> { verdict -> verdict.qualifies && best != null && verdict.deviation == best }
```

Qualifikation ist auch in Phase zwei Vorbedingung, und das Minimum wird nur über die qualifizierten
gebildet. Ob daraus ein sichtbares „und“ wird, hängt daran, ob das Spiel in Phase zwei überhaupt
eine Hürde kennt: Musterung und Song-Snippet tun es, Farbausmalung hebt sie auf
(`qualifies = tolerance == null || …`, „everybody is a candidate“) und Weltanschauung hat nie eine
(`qualifies = true`; nur das Kassieren nimmt einen Tipp wieder heraus). Deshalb steht der Satz beim
Spiel und nicht im Rahmen — eine gemeinsame Formulierung wäre für die Hälfte der Spiele falsch.

## Die Spiele

Alle vier bekommen die Gewinner-Box; die Wertung hängt an der Runde, nicht am Spiel, und zwei
Spiele mit Regeln und zwei ohne wären willkürlich.

- **Farbausmalung** und **Song-Snippet** bekommen beide Boxen neu, samt einer eigenen `*Rules.vue`
  nach dem Vorbild von `PatternRules.vue`.
- **Musterung** und **Weltanschauung** behalten ihre Anleitung und bekommen die Gewinner-Box dazu.
- Bei Farbausmalung wird der `hue-hint`-Absatz dabei **aufgelöst**: sein erster Teil („Du stellst
  nur den Farbton ein …“) ist Anleitung, sein zweiter („Eine kleine Abweichung ist erlaubt“ /
  „wer am nächsten dran liegt“) ist Wertung. Damit verschwindet auch die Phasenverzweigung, die
  `GuessHueBoard` heute von Hand macht — die Box kennt die Phase ohnehin.
- Song-Snippets `skipCost` bleibt, wo es ist: ein Tooltip am Stufenknopf, keine Regel.

Beide Boxen sitzen auf dem Spielbrett, nicht auf dem Reveal — dort steht das Scoreboard, das die
Wertung zeigt statt sie zu erklären.

## Das Band

`GameHeader` bekommt eine Prop `phaseTwo: boolean`, gespeist aus `awardRule === 'CLOSEST_ONLY'`.
Das ist eins zu eins Phase TWO (`Awards.kt:32-41`) und steht schon auf `RoundResponse` wie auf
`LabRoundResponse` — kein neues Wire-Feld, und keine zweite Definition von „Phase zwei“, die driften
könnte. `RoundCard` reicht es aus seiner Runde durch, die Laborseite aus ihrer.

Gefärbt wird genau eine Sache: die Rundennummer.

## Das schiefe Chevron

Die Zeile ist `items-start`, das Info-Icon ist 20px hoch, sein Mittelpunkt sitzt also 10px unter der
Oberkante. Der Klappknopf ist `size-11` (44px) mit zentriertem Inhalt und `-m-2` (−8px), sein
Chevron sitzt damit bei −8 + 22 = **14px** — vier zu tief.

`-m-2` wird `-mx-2 -mt-3 -mb-3`: der Knopf beginnt bei −12px, das Chevron landet bei −12 + 22 =
10px, exakt auf der Mitte von Icon und Überschrift. Die 44px Trefferfläche bleiben unangetastet, und
die negativen Ränder oben und unten sorgen dafür, dass der Knopf die Zeilenhöhe weiterhin nicht
treibt (44 − 12 − 12 = 20px, genau die Icon-Höhe).

## Tests

| Was | Wie |
|---|---|
| `AwardBox` | P1-Text mit 1 Punkt, P2-Text mit der Punktzahl aus `awardPoints`; der richtige Slot je Phase; der Ton je Phase; der Storage-Key trägt Spiel und Phase |
| `InfoBox` | Ton und Icon kommen an; jeder bestehende Fall bleibt grün, weil beide Props defaulten |
| Chevron | happy-dom rechnet kein Layout, also pinnt der Fall die Klassen — dieselbe Bauart wie „Titel kürzt vor Uhr“ im Header |
| `GameHeader` | die Rundennummer trägt in P2 `text-phase-two`, sonst `text-stone-400`; die Dots bleiben unberührt |
| Vier Spiele | je ein Fall: beide Boxen hängen, mit den richtigen Storage-Keys |

## Offene Kante

`--color-phase-two` und `DOT_ALARM_ON` müssen dieselbe Farbe benennen, und nichts erzwingt das:
Tailwind v4 führt seine Palette in `oklch`, der Board-Konstante steht ein Hex, und ein Test, der
beide vergleicht, müsste Farbräume umrechnen. Es bleibt bei zwei Kommentaren, die aufeinander
zeigen. Wer die Farbe ändert, ändert sie an beiden Stellen.
