# Anrührung („Mix Color“) — eine Farbe anmischen, Tropfen für Tropfen, ohne Zurück

**Status:** beschlossenes Design (2026-11-24). Gegengelesen von einem Bauenden gegen den Code.

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Spiel-Labor](2026-08-08-game-lab-design.md) und den Schritten der [Peilung](2026-10-25-peilung-design.md)
(`GameType.step`, `round_plays.steps`). Phasen und Wertung übernimmt es von
[Augenmaß](2026-11-19-augenmessung-design.md) und der Farbausmalung: Toleranz in Phase eins, nächster Tipp
in Phase zwei, kein Aufdecken, keine Uhr.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — Decke benannt unter *Integrität*.

**Berührt:** `ui/HoldButton.vue` (Halten ohne Finger), ein neues Modulith-Modul `mixcolor` (Mischmodell, Ziehung; kein Schema), den Adapter
`MixColorGameType` in `game.internal`, zwei Erweiterungen am Spielvertrag (`StepContext`,
`GuessContext.steps`) samt ihren Aufrufern, Goldvektoren unter `shared/mix-color/`, im Frontend
`games/mixcolor/` plus die Einträge in `games/registry.ts` und `gamelab/games.ts`. **Keine neue
Laufzeit-Abhängigkeit im Frontend**; spectral.js nur als Werkzeug zum Schreiben der Goldvektoren.

## Zweck & Spielidee

Eine Zielfarbe füllt das Spielfeld. In der Mitte steht ein Kreis. Fünf Düsen geben je einen Tropfen
einer Grundfarbe hinein — Cyan, Magenta, Gelb, Weiß, Schwarz. Der Spieler mischt, bis der Kreis aussieht
wie das Feld drumherum. **Was drin ist, bleibt drin**, und der Kreis fasst eine feste Zahl Tropfen (zum
Start 20). Gewertet wird der Farbabstand zwischen Kreis und Ziel.

**Sprache.** Spec, Plan und Code sprechen vom **Glas** (ein Reagenzglas von oben, darin ein Wirbel) —
das Bild hilft beim Reden über das Spiel. **Der Spieler hört davon nichts:** Erklärung, InfoBox und
Auflösung sprechen vom Kreis, in dem er die Zielfarbe mischt.

- **Codename:** `mix-color` (Game-ID), `mixcolor` (Modul), `MixColor*` (Klassen) — der Spieler mischt
  eine Farbe.
- **Anzeigename:** „Anrührung“ — Farbe anrühren, und die Rührung, wenn sie stimmt. *(Vorschlag des
  Entwurfs; ändert nur die Anzeige.)*

Entstanden aus einem Spike (Branch `feature/farbmischer-game-concept-853090`, `/spike/farbmischer`,
nicht zum Mergen). Was er gezeigt hat:

- **Pigment, nicht Licht.** Gemischt wird wie im Farbkasten (Blau + Gelb = Grün). Mittelwerte in RGB
  geben aus Rot und Grün ein dunkles Oliv, nie Gelb; das versteht niemand.
- **CMY + Weiß + Schwarz** fühlte sich besser an als Rot-Gelb-Blau oder RGB.
- **Tropfen per Tippen**, nicht Gießen per Halten.
- **20 Tropfen** reichten fast immer. Die Grenze ist der Kern des Twists: ohne sie ließe sich jedes
  Zuviel mit mehr vom Rest ausgleichen.
- **Kein Mindestfüllstand** — sein Nutzen blieb unklar.
- **Kein Schwierigkeitsregler.** Zwei Regeln (wo ein direkter Spieler hängen bleibt; trübe Ziele nur
  schwer) hielten im Spiel nicht. Ein Experiment mit 24 bewerteten Runden fand als einzige
  Zieleigenschaft „Schwarz im Rezept“ (schwer 5 von 7, leicht 2 von 13); auch daraus wird keine Regel.
  Schwer wird eine Runde, wenn eine fremde Grundfarbe ins Glas gerät — das ist das Spiel, kein Fehler.
- **Kein Abstand während des Spiels.** Das Auge vergleicht Glas und Feld an der Kante; eine Zahl
  machte daraus ein Suchspiel.

## Die Regeln

**Ziehung** aus `presentation` *(siehe Rundengeheimnis)*:

1. Zwei oder drei verschiedene Grundfarben, gleichverteilt (Anzahl per Münzwurf).
2. Gesamtzahl der Tropfen gleichverteilt aus `[Anzahl, capacity]`.
3. Jede gewählte Grundfarbe bekommt einen Tropfen, die übrigen verteilen sich einzeln gleichverteilt
   auf die gewählten.

So ist jedes Ziel in ganzen Tropfen erreichbar. `RoundContext.difficulty` bleibt ungenutzt.

**`capacity` ist ein Param**, beim Ziehen gesetzt und mit der Runde eingefroren; zum Start immer 20,
eine Konstante im Modul. Alles, was von der Glasgröße abhängt — Ziehung, `stages`, Füllstand, das
Ende —, liest `params.capacity`, nie die Konstante. So kann sie später geändert oder pro Runde gezogen
werden, ohne angekündigte Runden zu berühren.

**Der Zug.** Ein Tropfen ist ein Schritt (`POST …/skip` mit `input`), wie Peilungs Ping:

- Eingabe `{ "base": "c" }`, einer von `c m y w k`. Alles andere → `InvalidStepException`.
- Antwort `MixColorGlass { hex }`: die Farbe des Glases **nach** diesem Tropfen, `#RRGGBB`.
- `stages(params) = capacity + 1` (Stufe = Tropfen im Glas, 0 … `capacity`), `stagesScore = false`.
  Ein Tropfen über `capacity` ist `StageMovedOnException` wie jeder Schritt über die letzte Stufe — ein
  Randfall: die Oberfläche bietet ihn nie an.

**Der Tipp** ist „Fertig“, abgegeben per Halten (`HoldButton`). **Der letzte Tropfen ist zugleich der
Tipp:** bestätigt der Server den `capacity`-ten Tropfen, **hält das Brett „Fertig“ selbst** — der
`HoldButton` lädt sich sichtbar und hörbar auf wie unter einem Finger, und erst sein `confirm` schickt
den Tipp. Dieselbe Zeremonie wie beim gewöhnlichen Tipp: der Spieler sieht, was passiert. Findet das
Brett beim Laden ein volles Glas ohne Tipp (abgebrochen dazwischen), hält es dann. *(Im Client, weil
`skip` und `guess` im Framework getrennte Schreibwege sind.)*

Dafür lernt `HoldButton` ein Halten ohne Finger (Prop oder exponierte Methode, dem Bauenden
überlassen), standardmäßig aus; alle anderen Aufrufer bleiben unberührt — der Bauende prüft sie. Der Tipp trägt `{ "drops": <Int> }`, die Zahl
der Tropfen, die der Client im Glas glaubt. Weicht sie von den gespeicherten Schritten ab (ein Tropfen
noch unterwegs) oder ist das Glas leer → `InvalidGuessException`, vor jedem Schreiben. Gewertet wird das
Glas aus den gespeicherten Schritten, nie eine Angabe des Clients.

**Abweichung.** `deviation` = OKLab-ΔE × 100 zwischen Glas und Ziel, **beide als 8-Bit-sRGB-Farbe**
(`#RRGGBB`), so wie sie zu sehen sind. Gleiche sichtbare Farbe gibt denselben Wert, auch aus
verschiedenen Rezepten (1 : 1 und 2 : 2). Gleichstände in Phase zwei sind darum bitgleich und hier
häufiger als anderswo — jeder exakte Treffer ist 0,0. **Jeder Gleichstand bekommt den vollen Einsatz**,
wie `pointsFor` es für jedes Spiel tut; geteilt wird nicht. *(Entscheidung des Entwurfs: Teilen wäre eine
Änderung an `pointsFor` für alle Spiele.)* Faustregel: ab ΔE ≈ 2 sieht man nebeneinander einen
Unterschied.

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein | nein |
| Zeit | zählt nicht | zählt nicht |
| Qualifiziert | `deviation ≤ 4,0` | jeder Tipp |
| Award | `ALL_QUALIFYING` | `CLOSEST_ONLY` |

`tolerance: Double?` in den Params wie bei Augenmaß: `4.0` in Phase eins, `null` in Phase zwei.
`requiresReveal = scoresOnDuration = false`. Die 4,0 ist ein Startwert aus dem Spike: 13 von 25 Runden
endeten darunter, mit Runden, die der Spieler mittendrin abbrach. Gestimmt wird im Labor.

## Das Mischmodell

Kubelka-Munk nach **spectral.js 3.0.0** (MIT, Ronald van Wijnen), nach Kotlin portiert in
`mixcolor` — nur, was das Spiel braucht:

- sRGB → linear → 38-Band-Reflexion (`lRGB_to_R`) → K/S je Band;
- `mix`: Konzentration je Farbe = `Anteil² × Färbekraft² × Luminanz`, Färbekraft 1; gemischtes K/S
  zurück zur Reflexion (`KM`);
- Reflexion → XYZ → OKLab; zurück nach sRGB **mit spectral.js' Gamut-Mapping** (`toString`, Methode
  `map`), denn so entsteht die sichtbare Farbe;
- OKLab-ΔE.

Die Datei trägt den MIT-Hinweis des Originals und nennt Version und Datei, aus der portiert wurde.

**Grundfarben** (aus dem Spike, festgeschrieben im Modul): Cyan `#00A0E9`, Magenta `#E4007C`, Gelb
`#FFE600`, Weiß `#FFFFFF`, Schwarz `#1A1A1A`.

**Eine Implementierung.** Gemischt wird nur auf dem Server; der Client zeigt, was `step` antwortet
(`cross-runtime-parity.md`: Logik an einem Ort). Damit ist auch „nichts rausnehmen“ Sache des Servers —
Neuladen oder ein zweites Gerät setzen das Glas nicht zurück.

**Goldvektoren.** `shared/mix-color/spectral-vectors.json`, geschrieben von spectral.js 3.0.0 selbst
(dritte Implementierung, die für die Port-Treue bürgt; Rezept in `shared/README.md`). spectral.js
wird dafür einmalig außerhalb der Projekt-Abhängigkeiten installiert, wie Node's crypto für die
Siegel-Vektoren — weder in `dependencies` noch in `devDependencies`.: Rezepte quer
durch alle fünf Grundfarben, je erwartetes `#RRGGBB` und OKLab, dazu ΔE-Paare. Kotlin prüft das Hex
exakt und OKLab auf 1e-9. `pow` und `cbrt` sind zwischen V8 und JVM nicht bitgleich; kippt ein Hex an
einer Rundungsgrenze, nimmt der Bauende das Rezept aus den Vektoren, statt die Toleranz aufzuweichen.
Ohne zweiten Verbraucher kein `version`-Feld: gespeichert wird nur das Rezept, die Farbe wird jedes Mal
neu gemischt.

## Zwei Erweiterungen am Spielvertrag

Peilungs Ping hängt nur von seiner eigenen Eingabe ab. Ein Tropfen nicht: die Glasfarbe nach Tropfen
*n* ist die Mischung aller Tropfen bis *n*. Und `judge` sieht heute nur den Tipp, nicht die Schritte.

```kotlin
/** What a step may read besides its own input. */
data class StepContext(
    /** The inputs of stages 0 until this one, in order; JSON null where a step had none. */
    val earlier: List<JsonNode?>,
)

/** [step] with [context]. Only a game whose answer depends on earlier steps needs it. */
fun step(params: P, stage: Int, input: JsonNode?, context: StepContext): GameStepAnswer? =
    step(params = params, stage = stage, input = input)
```

```kotlin
data class GuessContext(
    val sinceRevealMs: Long?,
    val playId: UUID?,
    /** The stored step inputs, in order. Empty for a game without steps. */
    val steps: List<JsonNode?>,
)
```

- **Aufrufer von `step`** rufen die Variante mit Kontext: `RoundResponses` (Antwort je Stufe neu
  berechnet), `PlayService.skip` (Prüfen vor dem Schreiben), `LabService` (beide Stellen),
  `GameCatalog`. Bestehende Spiele überschreiben weiter die kurze Form; für sie ändert sich nichts.
- **`GuessContext.steps`** füllt `PlayService.guess` aus der Spielzeile, `LabService.guess` aus
  `LabRoundStore`; `DedusterGameType` übergibt die leere Liste.
- **Rein bleibt rein:** `step` rechnet aus Params und gespeicherten Eingaben, nichts wird gespeichert.
  Bei 20 Tropfen mischt eine Antwort für `MyPlayDto.steps` 1 + 2 + … + 20 = 210 Mal. Der Bauende misst;
  ist es spürbar, mischt `MixColorGameType` inkrementell über einen Cache je Rezeptpräfix, nicht über
  gespeicherte Antworten.
- Steht der Vertrag, folgt `game-rounds.md` → *Stages*: „Eine Stufe kann Daten tragen“ bekommt den
  Satz, dass eine Antwort die früheren Eingaben lesen darf.

## Rundengeheimnis

**Geheim ist allein das Rezept.** Die Zielfarbe muss der Spieler sehen; sie geht als `#RRGGBB` in den
Payload.

- **Die Ziehung kommt aus `presentation`**, wie bei Augenmaß: die Farbe ist öffentlich, und das Rezept
  folgt aus ihr (siehe *Integrität*). `solution`-Stream bleibt ungenutzt.
- **Das Rezept geht nur über die Lösung raus.**
- **Outcome:** `hex` (das eigene Glas), `recipe` (Tropfen je Grundfarbe), `deviation`,
  `withinTolerance` (`null` in Phase zwei). Nach dem Tipp geht die Lösung ohnehin raus.
- **`OtherPlayDto.steps`** trägt die Eingaben der anderen — gelistet erst nach dem eigenen Tipp. Ihre
  Glasfarbe steht im Outcome; der Client mischt nie selbst.

Params: `target` (Rezept), `targetHex`, `capacity`, `tolerance`. Payload: `targetHex`, `capacity`, die fünf
Grundfarben (Schlüssel, Name, Hex) — der Client kennt sie nicht aus eigenem Code, damit sie an einem
Ort stehen. Lösung: `recipe`, `tolerance`. Je ein Feldmengen-Test für Payload, Lösung, Outcome, Antwort.

## Integrität — die Decke, benannt

**Fertig gegen einen Tropfen von einem zweiten Gerät.** `drops` fängt den Tropfen, der auf demselben
Gerät noch unterwegs ist. Landet aber ein Tropfen aus einem zweiten Tab zwischen `judge` und dem
Schreiben des Tipps (`PlayService.guess` urteilt vor dem Lock, `recordGuess` prüft nur
`guessed_at IS NULL`), beschreibt das Outcome N Tropfen, `steps` hält N + 1. Hingenommen: dafür
braucht es zwei Geräte gleichzeitig in derselben Runde. Schließen hieße `recordGuess` um eine
Stufen-Bedingung erweitern, ein Statement, das jedes Spiel nutzt. *(Entscheidung des Entwurfs.)*

**Das Rezept ist aus der Zielfarbe errechenbar.** Wer die Farbe abliest (Pipette, Bildschirmfoto) und
alle 53 129 Rezepte bis 20 Tropfen durch das öffentliche Mischmodell schickt, findet das exakte Rezept in
einer Zehntelsekunde. Als Bild statt als Wert gewönne man nichts: ein einfarbiges Bild liest jede
Pipette. Die Farbe ist das Spiel. Hingenommen, wie die Anti-Cheat-Spec es unter Freunden tut.

## Frontend

```
games/mixcolor/
  MixColorGame.vue         Ablauf: Spielfläche → Auflösung
  MixColorBriefing.vue     InfoBox („mix-color“) + AwardBox
  MixColorRules.vue        Erklärung
  MixColorBoard.vue        Feld, Glas, Düsen, HoldButton
  MixerGlass.vue           Glas samt Wirbel — von Spielfläche und Auflösung geteilt
  DropBars.vue             Tropfen je Grundfarbe, Ziel über Spieler — Auflösung
  MixColorReveal.vue
  MixColorScoreboard.vue + scoreboard.ts
  types.ts                 Payload, Antwort, Lösung, Outcome — defensiv eingeengt
```

### Spielfläche

```
┌──────────────────────────┐
│ Zielfarbe                │
│        ╭────────╮        │   Glas ≈ 58 % der Breite, mittig
│        │  Glas  │        │   leer: neutrales Grau #8C8C8C
│        ╰────────╯        │
└──────────────────────────┘
▕████████░░░░░░░░░░░░▏ 8 / 20
 (C)  (M)  (Y)  (W)  (K)       Düsen: Kreise in der Grundfarbe, ≥ 44 px
[ ███ halten zum Abgeben ]
```

- **Feld** quadratisch, ganz in der Zielfarbe. **Glas** ein Kreis mit hellem Rand; leer neutralgrau
  (sonst schimmert das Ziel durch, und der Start sähe aus wie ein Treffer).
- **Wirbel nur beim Mischen.** Ein Tropfen fliegt als Klecks seiner Farbe ein und dreht sich zur Mitte.
  Darüber wirbeln feine Schlieren in seiner Farbe, schnell, während das Glas zur neuen Farbe überblendet;
  danach blenden die Schlieren aus. **Gemischt ist das Glas ein ruhiger, einfarbiger Kreis**, ohne
  Streifen, ohne Bewegung. Werte aus dem Spike („fein, schnell“, `MixerSwirl.vue`): 7 Arme, 1,3
  Windungen, Strich 2,2, Deckkraft 0,45, Umlauf 0,7 s; Klecks 900 ms; Überblenden 700 ms; Ausblenden
  600 ms. Reduzierte Bewegung: kein Klecks, kein Wirbel, das Glas blendet nur über.
- **Füllstand** als Balken mit „8 / 20“ (aus `capacity`).
- **Ein Tropfen zur Zeit.** Man gibt einen Tropfen und schaut, wie die Mischung wird. Tippen startet
  den Klecks sofort und emittiert `skip`; solange die Anfrage läuft, setzt der Host `disabled`, und die
  Düsen und „Fertig“ sind gesperrt. Die Glasfarbe kommt mit der Antwort. Bestätigt ist, was in `steps`
  steht, wie bei Peilung; scheitert die Anfrage, zeigt das Glas weiter den letzten Stand aus `steps`.
  Keine Warteschlange, keine Änderung am Host-Vertrag.
- **Nie ein Tropfen zu viel:** Mit dem `capacity`-ten Tropfen sind die Düsen weg bzw. gesperrt, und der
  Brett hält „Fertig“ selbst (siehe *Der Tipp*).
- **Kein Abstand, kein Rückgängig, keine Mischanzeige in Zahlen.**
- **Neuladen** zeigt das Glas aus `MyPlayDto.steps` (letzte Antwort) — kein Zwischenstand im Client.

### Auflösung

Feld in der Zielfarbe, im Glas die eigene Farbe. Darunter **keine Tabelle**, sondern Tropfen: je
Grundfarbe eine Zeile, darin das Ziel als Reihe Tropfen in dieser Farbe, direkt darunter die Tropfen
des Spielers. Ein gemeinsames Raster (eine Spalte je Tropfen) macht die beiden Reihen zu
vergleichbaren Balken.

```
Cyan     Ziel ● ● ● ●
         Du   ● ● ●
Magenta  Ziel ● ●
         Du   ● ● ● ●
Gelb     Ziel
         Du   ●
…
```

Grundfarben, die weder im Ziel noch beim Spieler vorkommen, dürfen fehlen; Form der Tropfen, Abstände
und ob leere Zeilen stehen, verfeinert das Labor. Ein anderer Name in der Rangliste ist ein Knopf: das
Glas zeigt dessen Farbe (aus seinem Outcome), die Spieler-Reihen dessen Tropfen; nochmal tippen hebt
auf. Takt
nach `revealChoreography.ts`.

### Rangliste

Spalten **Name** (Knopf) **· Tropfen · Abstand · Pkt**. Abstand ist `deviation` auf eine Nachkommastelle,
Kopfzeile „Toleranz ≤ 4,0“ nur in Phase eins. Sortierung Punkte absteigend, dann Abstand aufsteigend,
`userId` als Tiebreak. Pure `scoreboard.ts`.

## Labor

`mix-color` / „Anrührung“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide Gesichter, der
Seed macht die Zielfarbe reproduzierbar. Gestimmt werden hier: Toleranz, Wirbel, Klang, die
Tropfen-Balken der Auflösung.

## Tests

**Kotlin**

- **Mischmodell** gegen die Goldvektoren: Hex exakt, OKLab auf 1e-9, ΔE.
- **Ziehung:** 2–3 verschiedene Grundfarben, jede ≥ 1, Summe in `[Anzahl, capacity]`; nur `presentation`
  bewegt sie; `tolerance` aus der Phase.
- **Schritt:** Antwort = Mischung aller Tropfen bis hier; ungültige Grundfarbe, fehlendes Feld →
  `InvalidStepException`; Tropfen über `capacity` → `StageMovedOnException`; `stages` folgt
  `params.capacity` (Test mit einer anderen Kapazität als 20).
- **Wertung:** gleiches Glas wie Ziel → 0; 1 : 1 und 2 : 2 bitgleich; Grenze 4,0 in Phase eins; Phase
  zwei qualifiziert alles; leeres Glas, `drops` ≠ gespeicherte Schritte → `InvalidGuessException` ohne
  Schreiben.
- **Vertrag:** `StepContext.earlier` und `GuessContext.steps` kommen in Spiel und Labor an; Peilung
  unverändert. `GameCatalogTest` und `DedusterGameTypeTest` bauen `GuessContext` und ziehen mit.
- **Ausgänge:** Feldmengen-Tests — das Rezept nie im Payload, nie in einer Schritt-Antwort.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `scoreboard.ts`, `types.ts` (Einengen: Hex-Form, unbekannte Grundfarbe fällt raus).
- Spielfläche: Halten schickt `{ drops }` mit der bestätigten Zahl; `disabled` sperrt Düsen und
  „Fertig“; nach dem `capacity`-ten bestätigten Tropfen hält das Brett „Fertig“ selbst, und erst dessen
  `confirm` schickt den Tipp; ebenso bei einem vollen Glas ohne Tipp beim Laden.
- `HoldButton`: Halten ohne Finger lädt auf und feuert `confirm` wie ein echtes Halten; ohne die
  neue Option unverändert.
- `DropBars`: Ziel- und Spielerreihe je Grundfarbe, gleiches Raster.

## Bewusst nicht

- **Schwierigkeit** in jeder Form — siehe *Zweck*.
- **Gießen, Mindestfüllstand, Abstand während des Spiels.**
- **Mehrere Tropfen unterwegs.** Einer zur Zeit hält den Client einfach und entspricht dem Spiel.
- **Das Labor-Bild beim Spieler** — siehe *Sprache*.
- **Andere Grundfarben oder Mischen wie Licht.**
- **Mischen im Client**, auch nicht für eine sofortige Anzeige: zwei Implementierungen, die nie ganz
  bitgleich rechnen, für eine Verzögerung, die der Wirbel verdeckt.
- **Zeitwertung, Aufdecken.**

## Dem Bauenden überlassen

- Klang des Tropfens und der Auflösung — nach Gehör im Labor.
- Ob die Antwort für 20 Tropfen spürbar dauert, und dann der Cache.
- Fehleranzeige bei einem gescheiterten Tropfen.
- Die Rezepte in den Goldvektoren.

## Folgen für andere Dokumente

- `game-rounds.md` → *Stages*: Schritt-Antwort darf frühere Eingaben lesen (`StepContext`); `judge`
  sieht die Schritte (`GuessContext.steps`).
