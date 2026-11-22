# Rundenrampe — ein Plakat vor der aktuellen Runde

**Status:** Entwurf zur Abnahme (2026-11-22).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Spiel-Labor](2026-08-08-game-lab-design.md) und der Ton-Architektur aus
[`frontend-state.md`](../../../.claude/guidelines/frontend-state.md) („Sound“): ein geteilter
Audio-Graph, ein Schalter im Header, `useSoundStage()` für Bretter mit Deko-Ton.

**Referenz:** der Spike auf Branch `feature/game-rampe-intro-scene-53ca6b` (Stand `b902b289`),
`webapp-vue/src/spike/ramp/` und die Seite `/spike/rampe`. Aussehen, Maße und Zeiten dort sind am
Handy und im iOS-Simulator abgenommen. Wo dieses Dokument keine Zahl nennt, gilt der Spike.

**Berührt:** nur das Frontend. Neu `src/ui/ramp/`; geändert `rounds/RoundCard.vue`, die Lab-Seite
`pages/c/[slug]/lab/[game]/index.vue` mit `gamelab/LabControls.vue`, die vier Stellen mit einem
Auftritt beim Laden (siehe *Bühne frei*). Kein Backend,
keine Migration, kein neues API-Feld.

## Zweck

Die aktuelle Runde ist ohne Klick spielbar. Browser halten Ton aber stumm bis zur ersten
Nutzeraktion. Wer sofort loslegt, spielt deshalb erst einmal ohne Ton, obwohl er ihn nicht
abgeschaltet hat. Das wirkt wie ein Fehler.

Die Rampe stellt eine Szene vor die Runde: ein Plakat, das die Karte verdeckt. Ein Tipp löst es
auf, zeigt das Spiel und weckt dabei den Ton.

## Ziele

- Vor jeder Runde, die der Spieler noch spielen darf, steht ein Plakat. Ein Tipp öffnet sie.
- Derselbe Tipp weckt den Ton, wenn der Spieler ihn nicht stummgeschaltet hat.
- Das Plakat sieht nicht jeden Tag gleich aus: die Ausrichtung wechselt.
- Im Lab lässt sich die Rampe vor jedes Spiel schalten.

## Nicht-Ziele

- Kein Ersatz für `RevealCover`. Versiegelte Runden behalten ihre Abdeckung mit START.
- Keine Rampe vor gespielten oder geschlossenen Runden, nicht in der Historie.
- Kein Merken, ob jemand die Rampe schon gesehen hat.
- Keine Spielerfarbe: der Grund ist immer die Phasenfarbe.
- Der Tropfen, das Laufband und das Kalenderblatt aus dem Spike werden nicht gebaut.
- Keine eigene Schrift für die App. Die Buchstaben des Plakats stehen in der Systemschrift wie der
  Rest der App; eine App-Schrift ist ein eigenes Thema.

## Anti-Ziele

- Eine Runde, die halb stumm startet.
- Eine Rampe, die in einem laufenden Spiel auf Zeit Sekunden kostet.
- Spiele, die für die Rampe umgebaut werden müssen. Erlaubt ist genau eine Rücksicht: ein Auftritt
  wartet, bis die Bühne frei ist (siehe *Bühne frei*).
- Eine Schrift, die der Browser des Spielers bei einem Dritten holt.

## Wann die Rampe steht

Entschieden wird einmal, wenn die Karte erscheint. Danach kommt die Rampe für diese Karte nicht
wieder — auch dann nicht, wenn unter einem offenen Tab eine neue Runde in dieselbe Karte fällt
(Rundenwechsel, die Antwort 409 lädt neu). Der Spieler ist dann mitten in der Sitzung, der Ton ist
wach, und ein Plakat über der Meldung „Die Runde hat sich geändert“ wäre ein Hindernis
*(Setzung)*. Nur das Lab stellt sie nach Würfeln oder Zurücksetzen bewusst neu hin.

| Zustand der Runde | Rampe |
|---|---|
| versiegelt (`sealed`), noch nicht aufgedeckt | ja, danach die Abdeckung mit START |
| spielbar (`playing`), ohne laufende Zeit | ja |
| spielbar, Spiel auf Zeit läuft bereits (Seite mitten im Lauf neu geladen) | nein *(Setzung)* |
| gespielt (`done`), geschlossen, Historie | nein |
| kein Spiel, oder kein Renderer in diesem Build | nein |
| Rundennummer oder Spielname fehlt | nein *(Setzung)* |

Die Rampe steht auch dann, wenn der Ton schon wach oder stummgeschaltet ist *(Setzung)*: sie ist
der Auftritt der Runde, nicht nur ein Ton-Schalter. Sie steht bei jedem Laden neu, solange die
Runde spielbar ist.

## Ablauf

```
  Karte erscheint ──▶ Rampe steht ──(Tipp)──▶ läuft raus ──▶ weg
                      Karte darunter:         Karte            Karte
                      geladen, unsichtbar,    sichtbar,        bedienbar,
                      nicht bedienbar         nicht bedienbar  Bühne frei
```

**Das Spiel liegt geladen unter der Rampe.** Die Rampe deckt die ganze Karte samt Band exakt ab,
in jeder Höhe. Was sie freigibt, ist das fertige Spiel. Eine versiegelte Runde baut ihre Szene
schon unter der Rampe auf, wie heute unter der Abdeckung.

Der Aufruf, der eine Runde ohne Aufdecken beim Laden als gesehen stempelt (`useRound.reload`),
bleibt unverändert.

## Das Plakat

**Grund und Schrift:** Grund in der Phasenfarbe (`phase-one` / `phase-two`), Schrift in der
zugehörigen `on-phase`-Rolle. Mehr Farben gibt es nicht.

**Texte:**
1. „Aktuelle Runde“, klein.
2. Der Spielname, groß, in Versalien, auf die volle Breite eingepasst.
3. Die Rundennummer.
4. In Phase zwei die Punkte: oben rechts in einem Kreis über den Zeilen, gekleidet wie der Balken
   des Namens; die Zahl groß, darunter klein „Punkte“ („Punkt“ bei einem). Ohne Punktzahl kein Kreis.

**Zwei Stile.** Beide setzen die Nummer als „№ −98“ ins Kleingedruckte oben.

**Balken:** Der Name steht ausgespart in einem vollen Balken in der Mitte. Darüber
und darunter ziehen seine Umriss-Echos zeilenweise gegenläufig vorbei. Jedes Echo läuft um genau
eine Namensbreite, wie sie gesetzt ist, nicht um eine geschätzte: sonst springt es einmal je
Umlauf.

**Raster:** Der Name läuft Buchstabe für Buchstabe durch ein Schachbrett quadratischer Felder,
Zeile für Zeile, ein Name direkt nach dem anderen, ohne Leerfeld; Leerzeichen im Namen fallen weg.
Die Buchstaben stehen fest. Eine höhere Karte bekommt einfach mehr Zeilen. In Phase zwei deckt die
Punkte-Kachel in jedem Namen einen Buchstaben ab (welchen, bestimmt die Rundennummer) und zieht
alle 1,4 s ein Feld weiter; in Phase eins bewegt sich nichts. Statt Kreis also die Kachel.
Verworfen in der Handprobe: wandernde Buchstaben („zu stressig“) und ein Leerfeld zwischen den
Namen.

Verworfen nach der Handprobe: das Laufband (dem Balken zu ähnlich) und das Kalenderblatt mit der
Rundennummer als Held. Die Karte dahinter ist oft viel höher als der Bildschirm; die Nummer stand
dann in der Mitte, oben nur ein farbiger Block, man hätte scrollen müssen. Mit dem Kalenderblatt
entfällt Fraunces und das Vorzeichen als Balken über der Zahl. Aus demselben Grund stehen die
Punkte oben im Kreis statt in einer Zeile am Fuß.

**Ausrichtung:** steigt (−9°), gerade, fällt (+9°). Der Balken kippt das ganze Schriftfeld. Das
Raster deutet dieselbe Variation als Spaltenzahl: 3, 4 oder 5.

Ebenfalls verworfen: „Japanese Minimal“ (ein Kreis, dünne senkrechte Schrift, viel leerer Grund).
Zu wenig Inhalt für hohe Karten, die Punkte ohne Wucht, Stilbruch zum fetten Schnitt.

**Schrift:** Alle Buchstaben stehen in der Systemschrift, Schnitt 900. Das Bild unterscheidet sich
damit leicht je Gerät (Roboto auf Android, San Francisco auf Apple); das ist hingenommen.

**Vorzeichen:** Runden zählen im Normalfall negativ. Das Kleingedruckte schreibt die Nummer mit
echtem Minuszeichen („−“, U+2212).

**ß:** Versalien machen aus „ß“ ein „SS“ und nähmen „Anmaßung“ sein „Maß“. Das Plakat setzt das
große „ẞ“.

**Variation:** Welches Plakat eine Runde bekommt, ergibt sich allein aus ihrer Nummer, im Frontend
gerechnet. Es ist für alle Spieler gleich und braucht den Server nicht. Stil und Ausrichtung kommen
aus einer 32-Bit-Mischung der Nummer (`posterOf`): die Ausrichtung aus dem Rest durch 3, der Stil
aus dem Quotienten, beide Stile etwa gleich oft.

## Auflösung

Ein Tipp auf das Plakat. Jede Zeile ist ein Streifen mit eigenem Grund und
läuft seitlich raus, in die Richtung, in die sie vorher lief; ungerade und gerade Zeilen also
entgegengesetzt. Die Ränder gehen zuerst, der Name zuletzt. Bei geneigten Plakaten laufen die
Streifen die Schräge entlang. Der Punkte-Kreis läuft mit dem Kleingedruckten nach rechts. Dauer
rund 0,55 s.

Mit Beginn des Rauslaufens ist die Karte sichtbar; die Lücken zeigen sie. Bedienbar wird sie, wenn
der letzte Streifen weg ist.

## Ton

Der Tipp ruft `unlockSound()` synchron im Klick, wenn der Schalter an ist **und** ein Brett mit
Deko-Ton auf der Seite steht (`soundOnStage`). Das ist dieselbe Regel wie beim Schalter im Header;
`frontend-state.md` begründet sie damit, dass das Wecken die Audio-Sitzung des Geräts beansprucht
und auf iOS die Musik des Spielers beendet. Die Rampe übernimmt die Regel, sie prüft sie nicht neu.
Praktisch steht fast immer ein solches Brett: jeder Halte-Knopf, der Funken wirft, klopft auch.

Die Rampe selbst macht keinen Ton *(Setzung)*. Der Plopp des Spikes war nur ein Beleg.

## Bühne frei

Was beim Laden auftritt, träte unter der Rampe ungesehen auf. Heute sind das vier Stellen:

| Stelle | Auftritt | Ton |
|---|---|---|
| Augenmaß (`matchscale`) | Formen poppen auf | klopft dazu |
| Halte-Knopf (`ui/HoldButton`), wo er erst nach dem Laden bereit wird: START auf jeder Abdeckung, Farbausmalung | federt herein, sobald er bereit ist | stumm |
| Farbausmalung (`guesshue/HueWheelInput`) | das Rad fährt beim Einhängen einmal an | stumm |
| Anspielung (`songsnippet/StageBar`) | Balken wächst | stumm |

Die Rampe sagt deshalb, wann die Bühne frei ist: ein Signal, das die Karte bereitstellt
(`provide`/`inject`, wie `communities/context.ts`), mit einem kleinen Helfer in `ui/`. Es ist
**wahr**, wo keine Rampe steht (Historie, gespielte Runde, Lab ohne Rampe), und wird wahr, wenn
der letzte Streifen weg ist *(Setzung)*. Dann ist auch der Ton sicher wach.

**Alle vier warten auf dieses Signal.** Bis dahin ist vom Auftritt nichts zu sehen und nichts zu
hören; ist die Bühne frei, läuft er wie bisher. Der Halte-Knopf ist geteilte UI: eine Stelle deckt
alle Abdeckungen ab. Ein künftiges Spiel mit Auftritt fragt dasselbe Signal.

## Schrift

Die App liefert keine Schrift aus. Kommt je eine hinzu, dann vom eigenen Ursprung: kein
Google-Fonts-Link, kein `@import` einer fremden Adresse. Die IP-Adresse des Spielers geht für eine
Schrift nirgendwohin (`src/__tests__/ownFonts.spec.ts`).

## Lab

Ein Schalter „Rampe“ bei den Lab-Reglern in der Schublade, an die URL gebunden (`?ramp=1`) wie Seed
und Phase. Ist er an, steht die Rampe vor jeder Lab-Runde, die der Tester noch nicht gespielt hat,
und nach jedem Würfeln oder Zurücksetzen wieder. Die Rundennummer ist die des Labs
(`labRoundNumber`), die Punkte die der Lab-Runde.

Die Rampe ist dafür eine Komponente, die alles als Props bekommt und nichts selbst lädt. Das Lab
füttert sie, es passt sie nicht an.

## Bedienung ohne Bewegung

Unter `prefers-reduced-motion`, im Hintergrund-Tab und ohne `Element.animate` steht das Plakat
still, und der Tipp nimmt es ohne Übergang weg. Die Bühne ist dann sofort frei.

Das Plakat ist ein `<button>` mit einem lesbaren Namen (Runde, Spiel, in Phase zwei die Punkte). Die
Echos sind dekorativ und für Vorleser ausgeblendet. Solange die Rampe steht, ist die Karte
darunter `inert`. Nach dem Auflösen geht der Fokus auf die Karte *(Setzung)*.

Ein Button öffnet auch auf Enter und Leertaste, von selbst. Das ist kein Bedienweg, den jemand
entdecken soll, sondern der einzige für jemanden ohne Zeiger: die Karte darunter ist `inert`, ohne
das Plakat käme er nicht ins Spiel. Wer mit Tab darauf landet, sieht den Fokusring.

## Ansätze

**A — Das Spiel liegt geladen unter der Rampe.** *Gewählt.* Die Rampe deckt die Karte exakt ab,
das fertige Spiel steht beim Tipp sofort da, eine versiegelte Szene kann sich darunter aufbauen.
Preis: Ein Auftritt beim Laden muss warten lernen (*Bühne frei*), heute bei einem Spiel. Und ein
sehr hohes Spiel ergibt ein sehr hohes Plakat.

**B — Das Spiel wird erst beim Tipp geladen.** Kein Spiel müsste angefasst werden, und das Plakat
hätte immer dasselbe Format. Preis: Die Rampe bräuchte eine eigene Höhe, die Seite spränge beim
Tipp, und das Spiel lüde erst dann.

**C — Darunter laden, beim Tipp neu einhängen.** Kein Spiel müsste warten lernen. Verworfen: Das
Spiel lüde zweimal, und bei schon wachem Ton klopfte der versteckte erste Auftritt hörbar hinter
dem Plakat.

## Aufbau im Code

```
  RoundCard / Lab-Seite
    └─ RoundRamp  (ui/ramp)        hält: steht | läuft raus | weg; stellt „Bühne frei“ bereit
         ├─ Slot: RoundSurface + GameHeader + Spiel      (darunter, im selben Rasterfeld)
         └─ Plakat: Balken | Raster, je nach Nummer      (darüber, solange nicht weg)
```

- **`ui/ramp/`** — aus dem Spike übernommen und aufgeräumt: `BandPoster`, `PosterPrint`,
  `poster.ts` (Farben, Schrift, Einpassen, Rauslaufen), `variation.ts` (`posterOf`), `poster.css`.
  Neu: `RoundRamp` und das Signal „Bühne frei“. Später dazu: `RasterPoster`.
- **`RoundCard`** entscheidet aus dem, was es schon weiß (`face`, `closed`, `play`, Renderer), ob
  die Rampe steht, und reicht Nummer, Name, Phase und Punkte hinein.
- **Lab-Seite** tut dasselbe mit ihren Werten und dem URL-Schalter.
- **Nicht übernommen:** das Laufband, das Kalenderblatt, `GooFlood`, `RampTile` mit seinem Plopp, die Bogen-Seite. `src/spike/ramp/`
  und `pages/spike/rampe.vue` kommen nicht in den Merge.

Zwei Fallen, die der Spike schon gefunden hat:

- WebKit richtet Flex-Kinder eines `<button>` links aus, auf Inhaltsbreite geschrumpft
  (`items-stretch`; betraf das Kalenderblatt).
- Die unsichtbaren Mess-Elemente fürs Einpassen dürfen nicht nackt am `body` hängen: ein Name in
  Messgröße ist breiter als ein Handy und macht die Seite seitlich scrollbar.

## Tests

Vitest, was happy-dom sehen kann:

- `posterOf`: feste Vektoren (Nummer → Ausrichtung), negative Nummern.
- Schrift: in den Quellen und im `index.html` steht keine fremde Schrift-Adresse.
- `RoundRamp`: steht, wenn aktiv; Karte darunter `inert`; Tipp weckt den Ton genau dann, wenn
  Schalter an und Brett mit Ton; „Bühne frei“ wird wahr, wenn die Rampe weg ist; ohne Bewegung
  sofort weg.
- `RoundCard`: die Tabelle aus *Wann die Rampe steht*, Zeile für Zeile.
- Lab: `?ramp=1` stellt die Rampe hin, ohne den Parameter keine; nach Würfeln steht sie wieder.
- Die vier Auftritte: nichts vor „Bühne frei“, alles danach; ohne Rampe wie heute.
- Vorzeichen und „ẞ“ als reine Funktionen.

Einpassen, Laufen und Rauslaufen sieht happy-dom nicht. Das wird von Hand geprüft: Android-Firefox
und iOS-Simulator, je Ausrichtung, mit kurzem und langem Namen, ein- bis dreistelliger Nummer, beiden
Phasen.

## Im Lab herauszufinden

- Wie das Plakat vor einem Spiel wirkt, das viel höher ist als ein Quadrat (Kalenderblatt deshalb
  verworfen).
- Ob das Zusammenspiel Rampe, dann Abdeckung mit START, in Phase zwei zu viel ist.

## Dem Umsetzer überlassen

- Wie jeder der vier Auftritte anhält (angehaltene Animation, späteres Einhängen der Klasse).
- Der Wortlaut des Button-Namens für Vorleser.
- Was vom Gefundenen am Ende in die Guidelines gehört
  ([Feeding knowledge back](../../../.claude/guidelines/feeding-knowledge-back.md)).
