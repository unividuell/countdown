# Hochstapler („Stack Floor“) — Balken stapeln, Überstand fällt weg

**Status:** beschlossenes Design (2026-11-26).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), der
[Hülle](2026-09-25-reveal-cover-design.md), der [Rundenrampe](2026-11-22-rundenrampe-design.md), dem
[Spiel-Labor](2026-08-08-game-lab-design.md), der Schwierigkeit aus der
[Peilung](2026-10-25-peilung-design.md), Start, Neuladen und Zeit-Untergrenze aus
[Entstauber](2026-09-14-entstauber-design.md) und der
[Kotlin/TS-Parität](../../../.claude/guidelines/cross-runtime-parity.md). Phasen, Punkte,
Auflösungs-Takt, antippbare Namen und Zwischenstand übernimmt es von
[Verrohrung](2026-11-18-verrohrung-design.md) und deren Vorgängern.

**Berührt:** ein neues Modulith-Modul `stackfloor` (reine Logik, kein Schema), den Adapter
`StackFloorGameType` (id `stack-floor`) in `game.internal`, Golden Vectors unter
`shared/stack-floor/`, im Frontend ein neues Spielverzeichnis `games/stackfloor/` mit TS-Spiegel der
Turm-Funktion und Klängen, Einträge in `games/registry.ts` und `gamelab/games.ts`. Keine Migration,
keine neue Abhängigkeit, keine Änderung am Rahmen.

## Zweck & Spielidee

Ein Geschicklichkeitsspiel, das sich in Sekunden erklärt.

```
 ┌──────────────────────────┐
 │      ◄═══════════►       │  gleitet von Kante zu Kante
 │          ║               │  Hilfslinie: Mitte des obersten Balkens
 │        ══════   ▪        │  Stockwerk 2, abgeschnittenes Stück fällt
 │       ════════           │  Stockwerk 1
 │       ════════           │  Fundament, ~2/3 Feldbreite
 └──────────────────────────┘
```

1. Unten liegt ein Fundament, etwa 2/3 so breit wie das Feld.
2. Der oberste liegende Balken zeigt eine senkrechte Hilfslinie nach oben, exakt in seiner Mitte.
3. Darüber gleitet ein Balken gleicher Breite mit fester Geschwindigkeit von Feldkante zu Feldkante.
4. Ein Tipp hält ihn an der Stelle des Tipps an, **mit kurzem Ton**.
5. **Was seitlich über den Balken darunter hinausragt, wird abgeschnitten** — der Kern des Spiels.
   Das abgeschnittene Stück **fällt animiert nach unten** aus dem Bild. Der Rest ist der neue oberste
   Balken; der nächste gleitet in dessen Breite (zurück zu 3).
6. Hält der Balken ohne Kontakt zum Balken darunter, endet der Lauf, und er wird abgegeben.

**Höhe** = Zahl der liegenden Stockwerke über dem Fundament.

## Ziele

- Phase eins: eine Mindesthöhe N schaffen. Phase zwei: der höchste Turm.
- **Genau ein Versuch** pro Runde, in beiden Phasen.
- Der Server rechnet jeden Turm nach; der Client behauptet keine Höhe.

## Nicht-Ziele

- Kein Bündel mehrerer Turm-Varianten in einem Spieltyp. Ein weiteres Turmspiel wird ein eigenes
  Spiel.
- Keine Wiederholung, kein Zocken (abgeben oder neu bauen) — erwogen und verworfen: zu viel Aufwand
  für den Reiz.
- Keine Zeitwertung, auch nicht als Gleichstand-Brecher.
- Kein Perfekt-Bonus in Punkten. Ein perfekter Halt — höchstens `perfectTolerance` Einheiten daneben
  (vorläufig 4), dann rastet er ein — bekommt nur Ton und Funken.
- Keine Anzeige von N als Zahl.

## Ansätze

| | Weg | Ergebnis |
|---|---|---|
| **1** | Client schickt Klickzeiten, Server rechnet den Turm mit derselben reinen Funktion nach | **gewählt** |
| 2 | Client schickt die Lage jedes Balkens | verworfen: drei Zeilen Skript bauen einen perfekten Turm |
| 3 | Ein Serveraufruf je Tipp, Server stempelt | verworfen: Latenz verschiebt jeden Tipp, am Handy unspielbar (Entstauber-Grund) |

Ebenfalls verworfen: mehrere Turm-Varianten pro Runde, ein Bündel-Spieltyp mit `variant` in den
Params, Wiederholungen über die Stufen-Leiter.

## Phasen

| | Phase eins | Phase zwei |
|---|---|---|
| Start | Hülle mit START (`requiresReveal = true`) | Hülle mit START (`requiresReveal = true`) |
| Qualifiziert | Höhe ≥ N | jede Abgabe |
| `deviation` | `0.0` | `−Höhe` |
| Award | `ALL_QUALIFYING` — 1 Punkt | `CLOSEST_ONLY` — der höchste Turm nimmt alles |

- **Gleichstand teilt:** gleiche Höhe, alle bekommen den vollen Einsatz — `pointsFor` vergleicht
  `deviation ==`, wie in jedem anderen Spiel.
- `scoresOnDuration = false` in beiden Phasen; eine Stufe, keine Schritte.

## Start und Neuladen

Wie Entstauber: Der Lauf lebt zwischen Aufdecken und Abgabe nur im Browser. **Das Aufdecken ist der
Start**, und nach einem Neuladen legt das Spiel seine eigene Hülle auf, ohne POST, mit „Neu geladen —
dein Lauf wird markiert.“ Der Lauf trägt `restarted` in `outcome.marks`. Mark, never reject.

**Auch in Phase eins**, anders als bei den Rätselspielen: Ohne Aufdecken sähe der Server kein
Startsignal, und jedes Neuladen wäre ein unbemerkter neuer Versuch. N verlöre sein Gewicht. Der Preis
ist ein Tipp mehr nach dem Plakat.

**Rampe und Plakat:** Vor jeder Runde steht das Plakat der Rundenrampe, wie bei jedem Spiel. Der Balken
gleitet erst los, wenn der Vorhang offen ist (wie Anrührung und Augenmessung warten).

## Schwierigkeit

- **Nur N hängt an der Schwierigkeit**, gezogen aus `GameRandom.presentation` in einem Bereich, den
  `RoundContext.difficulty` verschiebt. Kein Geheimnis zu schützen, aber nicht aus dem Szenen-Strom.
- **Startgeschwindigkeit und Startbreite sind konstant**, für jede Runde gleich. **Jedes Stockwerk gleitet
  schneller:** um `accelPercent` % der Startgeschwindigkeit je Stockwerk (vorläufig 3 %), ganzzahlig in
  der Turm-Funktion, eingefroren in den Params.
- **N reicht von etwa 26 (leichteste Runde) bis etwa 60 (schwerste).** Die Geschwindigkeit wird im
  Labor so eingestellt, dass diese Grenzen passen; sie und die Startbreite sind vorläufig.

## Die Turm-Funktion — Kotlin und TS, bit-genau

Beide Seiten müssen den Turm selbst berechnen: der Client, um ihn live zu zeigen, der Server, um ihn
nachzurechnen. Das rechtfertigt den Spiegel ([Parität](../../../.claude/guidelines/cross-runtime-parity.md)).

- **Nur Ganzzahlen.** Feldbreite in ganzzahligen Einheiten, Zeit in ganzen Millisekunden, Lage des
  gleitenden Balkens als Dreieckswelle über die Zeit (hin, Kante, zurück), Geschwindigkeit als Bruch
  ganzer Zahlen. Kein `sin`, keine Fließkomma-Rundung, die Engines verschieden machen.
- **`tower(params, clicks) → { bars, height }`** — rein; `clicks[i]` = Millisekunden seit Erscheinen
  des Balkens von Stockwerk i. Wo jeder Balken beginnt und in welche Richtung er gleitet, folgt aus den
  Params (Bauers Wahl, ob fest oder je Runde gezogen). Kotlin ist die Quelle, TS spiegelt im selben
  Commit.
- **Golden Vectors** in `shared/stack-floor/tower.json` mit `version`, von Kotlin geschrieben, von
  Kotlin und Vitest geprüft.
- **Der Client zeigt, was die Funktion sagt.** Die Lage eines haltenden Balkens kommt aus der
  ganzzahligen Klickzeit, nicht aus der animierten Pixel-Lage im Moment des Tipps — sonst zeigt der
  Bildschirm einen anderen Turm als der Server zählt.
- Der Tipp ist `pointerdown` aufs ganze Brett ([frontend-ui.md](../../../.claude/guidelines/frontend-ui.md)).
- **Ein Lauf endet nur mit dem Fehlgriff oder bei `maxFloors`.** Kein Stopp-Knopf: der Fehlgriff kostet
  nichts, die Höhe zählt nur liegende Balken. Wer in Phase eins N erreicht, baut weiter. Der letzte
  Klick eines Tipps muss ein Fehlgriff sein, außer der Tipp erreicht `maxFloors`.

## Tipp, Payload, Outcome, Lösung

| Ausgang | wann | Felder |
|---|---|---|
| Payload `StackFloorPayload` | ab Aufdecken | Feldbreite, Startbreite, Geschwindigkeit, Startlagen, N, Farbstart |
| Tipp | Abgabe | `clicks: [ms]` |
| Outcome `StackFloorOutcome` | nach eigener Abgabe, an alle | `height`, `marks` |
| Lösung | — | `null`: nichts zu verbergen, was nicht schon in der Payload steht |
| Szene | unter der Hülle | `null` oder Feldbreite, Fundament — Bauers Wahl, nichts aus `presentation` |

- Jeder Ausgang bekommt seinen Feldmengen-Test ([game-rounds.md](../../../.claude/guidelines/game-rounds.md)).
- **N steht in der Payload, aber nicht auf dem Bildschirm** (siehe *Brett*). Wer im Netzwerk-Tab
  nachsieht, gewinnt nichts: N ist kein Geheimnis, nur kein Spoiler.
- `judge` wirft `InvalidGuessException` bei fehlenden, negativen, nicht ganzzahligen Klickzeiten, mehr
  Klicks als `maxFloors` oder einem Tipp, der nicht mit dem Fehlgriff endet.

## Integrität

- **Untergrenze, nie Obergrenze** (Entstauber): Die Laufzeit — Summe der Klickzeiten plus feste
  Übergangszeiten — darf `GuessContext.sinceRevealMs` nicht übersteigen. Sonst eine Markierung in
  `outcome.marks`, nie eine Abweisung.
- **`maxFloors` als verdeckte Decke** für die Länge des Tipps (vorläufig 999).
- **Die Decke, benannt:** Die Payload enthält alles, um perfekte Klickzeiten auszurechnen. Ein Bot baut
  einen Turm ohne Verlust bis `maxFloors`. Gegen Skripte hilft nur die Zeit-Untergrenze; mehr wird
  nicht gebaut, bis ein Fall auftritt.

## Brett

- Kartenbreit, mobil zuerst. Quer ist das Brett das Feld (jede Länge ein Anteil seiner Breite, auf
  jedem Gerät gleich); hoch ist es fest: 450 px Brett, 22,5 px Balken, 50 px Luft unter dem
  Fundament, egal wie breit. Der Turm wandert nach unten weg, damit der gleitende
  Balken sichtbar bleibt. Die Seite bleibt im Lauf scrollbar; nur ein Wisch auf dem Brett ist ein Tipp.
- **Balken wie gefräste Holzbalken:** scharfe Ecken, oben eine schmale helle Fase, unten eine dunkle.
- **Jeder Balken hat eine leicht andere Farbe:** Farbton um einen festen Schritt weiter, wie auf dem
  Farbkreis. Startton aus der Payload, Schrittweite und Sättigung im Labor, hell und dunkel lesbar.
- **Der N. Balken sieht anders aus** — das Signal „Ziel erreicht“, nur in Phase eins. Man sieht ihn erst,
  wenn er gleitet; N steht nirgends als Zahl. **Gold, mit Funken, glimmend** — nicht vom Farbkreis.
- **Halten:** tiefer Klopfton, wenn etwas abgeschnitten wird; der Fehlgriff, der den Lauf beendet, noch
  eine Oktave tiefer und nachklingend. Ein perfekter Halt klingt hell und
  sprüht kurz Funken an den unteren Ecken des Balkens; jeder weitere in Folge steigt eine Stufe der
  Dur-Tonleiter, bis zur Oktave. **Schnitt:** das Stück fällt animiert nach unten
  ([frontend-ui.md](../../../.claude/guidelines/frontend-ui.md), Animation; reduzierte Bewegung
  beachten). Ton über `useSoundStage()` wie bei den anderen Brettern.

## Auflösung

Wie Verrohrung: Takt, Zwischenstand, antippbare Namen. Je Spieler die Höhe, in Phase zwei der Sieger
vorn; in Phase eins steht im Kopf „Lösung ≥ N“. **Ein Name im Scoreboard zeigt dessen Turm**, nachgebaut aus den Klickzeiten im Tipp, wie die
antippbaren Namen der anderen Spiele. Es steht immer genau ein Turm auf dem Brett: meiner zuerst,
ohne eigenen Tipp der erste der Tabelle; der gewählte Name lässt sich nicht abwählen. Der Turm steht ganz im Bild:
das Brett zoomt heraus, statt zu scrollen.

## Labor

Läuft durch denselben Ablauf wie jedes Spiel, Rampe zuschaltbar. N-Bereich, Geschwindigkeit und
Startbreite werden im Code eingestellt und im Labor geprüft.

## Leitlinien danach

- `game-integrity.md`: Hochstapler als zweite benannte Decke neben Entstauber.

## Offen für den Bauer

- Startlagen und Richtungen je Stockwerk; feste Übergangszeit zwischen Stockwerken.
- Farbschritt, Klänge, Fall-Animation; Feinheiten von Gold, Funken und Glimmen.
- Geschwindigkeit und Startbreite — vorläufig, im Labor eingestellt.
