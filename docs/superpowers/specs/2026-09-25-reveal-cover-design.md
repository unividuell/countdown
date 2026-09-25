# Die Hülle — das Aufdecken über dem gemounteten Spiel

**Status:** beschlossenes Design (2026-09-25).

**Baut auf:** dem [Runden-Frontend](2026-08-14-round-frontend-design.md) (`RoundCard`, `useRound`,
das Gesicht `sealed`), der [Spieluhr im Band](2026-09-11-game-stopwatch-design.md) (Einzählen,
volles Feld, Stoppuhr) und dem `GameType`-Vertrag aus der
[Rundenauswahl](2026-08-11-round-game-selection-design.md).

**Ist Vorarbeit für:** [Entstauber](2026-09-14-entstauber-design.md). Dessen Abschnitt „Der Start“
brauchte eine eigene Oberfläche fürs Aufdecken; diese Spec zieht stattdessen eine gemeinsame vor,
an die sich die bestehenden Spiele anpassen.

**Berührt:** den `GameType`-Vertrag (ein dritter Ausgang), `RoundResponses` und die
Laborantwort; im Frontend `RoundCard`, die Community- und die Laborseite, `GameHeader`,
`FlipDotBoard`, `HoldButton`, das Spielregister, Musterung und Weltanschauung. Farbausmalung und
Anspielung bekommen nur die neuen Props.

## Zweck

Heute ist das Aufdecken ein eigener Bildschirm: Warnsatz, Knopf, darunter die Regeln. Das Spiel ist
nicht gemountet, der Payload ist `null`. Erst die Antwort auf den Reveal bringt den Payload, erst
dann mountet das Spiel — und lädt, was es braucht, **auf der Uhr**.

Künftig ist das Aufdecken eine **Hülle**: das Spiel ist schon gemountet, seine Bühne steht fertig
vorbereitet unter Milchglas, und mit dem Aufdecken fällt nur noch das Glas.

```
vorher:   [ Aufdecken-Screen ] ──tap──▶ 3·2·1 im Band ──▶ POST ──▶ Spiel mountet, lädt … ──▶ spielbar
nachher:  [ Spiel + Bühne unter der Hülle ] ──halten 3·2·1──▶ POST ──▶ Hülle weg ──▶ spielbar
```

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Kein `scoresOnDuration`** und keine zweite Fassung des Warnsatzes. Beides braucht erst
  Entstauber und kommt mit dessen Spec.
- **Keine Assets vor dem Aufdecken.** Keine heutige Bühne braucht eines; das Gate in
  `PlayService.asset` bleibt, wie es ist. Entstaubers Foto ist der erste Fall und bringt die Regel
  mit.
- **Keine Änderung an Phase eins.** Musterung und Weltanschauung decken dort weiter implizit auf,
  Farbausmalung und Anspielung immer. Keine Hülle, kein Halten.
- **Kein Übergang beim Fallen.** Begründung unten.
- **Entstauber selbst.**

## Vertrag: ein dritter Ausgang

```kotlin
/** Was vor dem Aufdecken beim Client liegen darf — nie das Rätsel. Marker wie [GamePayload]. */
interface GameStage

/** `null` — die Vorgabe — ist ein Spiel, dessen Bühne allein sein Code ist. */
fun stage(params: P): GameStage? = null
```

**Vorgabe `null` ist die sichere Richtung:** ein Spiel, das nichts sagt, gibt vor dem Aufdecken
nichts heraus. `GameTypeHandle` reicht durch wie die übrigen Methoden.

`RoundResponse` und `LabRoundResponse` bekommen `stage: GameStage?`, gefüllt in **jeder** Antwort
auf eine angekündigte Runde, vor und nach dem Aufdecken. `payload` bleibt, wie er ist, hinter dem
Reveal; `solution` hinter dem Tipp.

Die Bühne ist veröffentlicht und kommt deshalb aus dem Präsentationsstrom — dieselbe Regel, die für
den Payload gilt. Und wie der Payload bekommt sie je Spiel einen **Feld-Set-Test**: genau diese
Felder, in beide Richtungen.

| Spiel | `stage` | Bühne unter der Hülle |
|---|---|---|
| Musterung | `FindPatternStage(cols, rows, patternLength)` | das leere Raster in richtiger Größe |
| Weltanschauung | `null` | die geladene Karte |
| Farbausmalung | `null` | — versiegelt nie |
| Anspielung | `null` | — versiegelt nie |

Musterungs drei Zahlen sind Konstanten aus `FindPatternLayout`, im Payload stehen sie heute schon.
Weltanschauungs Payload ist allein `term` — das Rätsel selbst —; seine Bühne ist keine Angabe,
sondern **Zeit**: die gemountete Komponente lädt unter der Hülle Konfiguration
(`/api/spot-object/config`, rundenunabhängig) und Maps-Skript.

Eine Bühne ist also zweierlei: **Daten** (`stage`, oft `null`) und **die Zeit, in der das Spiel
schon gemountet ist**.

## Vertrag der Spielkomponente

Jedes Spiel, das die Karte und das Labor rendern, bekommt drei Zusätze:

| | |
|---|---|
| Prop `sealed: boolean` | genau das Gesicht `sealed` aus `useRound`: angekündigt, noch nicht aufgedeckt, und das Spiel verlangt ein bewusstes Aufdecken |
| Prop `stage: unknown` | die Bühne, wie der Server sie liefert |
| Emit `reveal: []` | der Halt ist voll — jetzt aufdecken |

`payload` darf `null` sein, solange `sealed` gilt. Farbausmalung und Anspielung deklarieren die
Props und benutzen sie nie — derselbe Grund, aus dem Musterung `skip` deklariert, ohne es je zu
senden: der Vertrag hat für jedes Spiel dieselbe Form.

**Die Hülle gehört dem Spiel, nicht der Karte.** Das Spiel legt `RevealCover` über seine eigene
Spielfläche; seine Regelboxen darunter bleiben lesbar. Damit gehört ihm auch der Zustand der Hülle:
es weiß selbst, ob seine Bühne steht, und „nochmal versuchen“ ist sein eigener Nachlade-Aufruf.
Durch die Karte läuft dafür kein Ereignisprotokoll — sie reicht `sealed` herunter und nimmt
`reveal` entgegen, wie sie heute `guess` entgegennimmt.

Vergisst ein versiegelndes Spiel die Hülle, liegt seine Spielfläche offen, aber leer: `payload` ist
`null`. Der Fehler ist sichtbar, nicht gefährlich.

## Die Hülle

```
┌─ Spielfläche (gehört dem Spiel, relative) ───┐
│░░░░░░░░░ Bühne, verschwommen ░░░░░░░░░░░░░░░░│
│░░   Deine Zeit läuft ab dem Aufdecken —   ░░░│
│░░      und du hast nur einen Versuch.     ░░░│
│░░░░░░░░░░░░░░░░ ╭───────╮ ░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░ │ START │ ░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░ ╰───────╯ ░░░░░░░░░░░░░░░░░░░│
└──────────────────────────────────────────────┘
  Regelboxen des Spiels — lesbar
```

`ui/RevealCover.vue`, absolut über der Spielfläche, Milchglas (`backdrop-filter: blur`). Man sieht,
dass alles bereitsteht, ohne dass es zum Hineintippen einlädt. Sicher ist das, weil unter der Hülle
per Vertrag nur liegt, was vor dem Start beim Client liegen darf.

| Zustand (vom Spiel) | Hülle zeigt |
|---|---|
| `preparing` | „Wird vorbereitet …“; der Knopf ist unsichtbar (`HoldButton.ready = false`) |
| `ready` | der Knopf poppt herein — die vorhandene Einsprung-Animation des `HoldButton` |
| `busy` | Ring voll und pulsierend, solange der Reveal unterwegs ist |
| `failed` | ein Satz und „Nochmal versuchen“ → Emit `retry` an das Spiel |

`busy` ist kein Wissen des Spiels: es ist der `busy` der Karte, der das Spiel als `disabled`
erreicht — solange die Hülle liegt, kann `disabled` nichts anderes bedeuten. Scheitert der Reveal
(kein 409, sondern ein Fehler, der als `notice` über der Karte landet), steht der Knopf wieder auf
START statt auf vollem Ring: ein voller Ring ohne Wirkung sagte „läuft“ über etwas, das nicht läuft.

**„Aufdecken“ ist erst möglich, wenn die Bühne steht.** Das ist die Fairnesszusage: niemand
startet mit einer halb geladenen Bühne.

**Eine Bühne, die nicht steht, kostet keinen Versuch.** `failed` führt nur zu `retry`, nie zu einem
Reveal. Heute scheitert Weltanschauung in diesem Fall *nach* dem Reveal — auf der Uhr und mit
verbrauchtem Versuch. Das wird strikt besser.

**`inert` auf der Spielfläche, solange die Hülle liegt.** Milchglas hält den Finger ab, nicht die
Tastatur und nicht den Screenreader; ohne `inert` wäre die Karte darunter per Tab erreichbar.

**Der Warnsatz bleibt Framework-Text**, als Konstante in der Hülle: „Deine Zeit läuft ab dem
Aufdecken — und du hast nur **einen** Versuch.“ Er zieht aus `RoundCard` und der Laborseite dorthin
um, samt der Begründung, warum er dem Framework gehört.

### Das Fallen

Die Hülle verschwindet **im selben Render, in dem der Payload ankommt** — ohne Übergang, auch nicht
außerhalb von `prefers-reduced-motion`.

Die gewertete Uhr startet beim Server mit `revealedAt`, also bevor die Antwort beim Handy ist. Die
Laufzeit der Antwort liegt damit bei jedem auf der Uhr, und sie ist ungleich — das war vorher schon
so und ist Leitung. Ein Ausblenden käme obendrauf, und auf einem schwachen Handy ruckelte es länger
als auf einem schnellen. Den Teil, der uns gehört, lassen wir weg.

Daraus folgt eine Regel für jedes Spiel: **beim Eintreffen des Payloads wird nichts mehr
vorbereitet, nur noch eingesetzt.** Was Zeit kostet, gehört auf die Bühne. Musterung dekodiert beim
Eintreffen zwei PNGs von wenigen hundert Bytes — das ist die Grenze.

## Halten ist Einzählen

```
Ruhe: [ START ]  halten ──▶ [ 3 ] ──▶ [ 2 ] ──▶ [ 1 ] ──▶ voll ──▶ POST /reveal ──▶ Hülle weg
                 Ring:  0 ─────── ⅓ ─────── ⅔ ─────── 1
                 loslassen: Ring läuft doppelt so schnell zurück, die Ziffer zählt mit hoch,
                            am Ende steht wieder START
```

Der Knopf der Hülle ist der vorhandene `HoldButton`. Die Geste ist Schutz *und* Einzählen: ein
Fehltipp beim Scrollen löst nichts aus, und Loslassen ist der Abbruch. Bis der Ring voll ist, weiß
der Server nichts.

`HoldButton` bekommt einen optionalen Prop `beats`:

- gesetzt: `holdMs = beats × BEAT_MS` — für die Hülle `3 × 1000 ms`;
- die Beschriftung folgt aus `progress` (`3 − ⌊progress × 3⌋`, auf 1…3 begrenzt), beim Zurückspulen
  also rückwärts; in Ruhe steht `label` — hier „START“. Eine Quelle, kein zweiter Timer.
- nicht gesetzt: alles wie heute.

Der einzige bestehende `HoldButton` ist die Abgabe der Farbausmalung in der Mitte des Farbkreises
(`GuessHueBoard.vue`). Er ist ein *Bestätigen*, kein *Start*, und bleibt ohne `beats`.

Die Ziffern stehen in einer `aria-live="polite"`-Region, damit das Einzählen auch ohne Hinsehen
ankommt. Die Tastatur bekommt dieselbe Geste wie der Finger, das regelt `HoldButton` schon: Enter
drei Sekunden halten.

Für die Uhr-Spiele bleibt die angezeigte Null die gewertete Null: der POST fliegt erst bei vollem
Ring, genau wie er vorher erst nach der dritten Beat-Sekunde flog.

## Das Band zählt nicht mehr ein

Mit dem Einzählen im Knopf entfällt das Einzählen im Band.

- `ui/useStartCeremony.ts` wird gelöscht. Der Typ `PlayClock` zieht zu `GameHeader` und behält nur
  `running`.
- `GameHeader` verliert die Phasen `start` und `waiting`. Das Band zeigt bis zur Antwort den
  Rundencountdown und schaltet dann auf die Stoppuhr — ein Breitenwechsel, also ein Relight.
- `FlipDotBoard.solid` verliert seinen einzigen Nutzer und fällt weg. Das volle Feld als
  Ladeanzeige ersetzt der pulsierende Ring.

## Wer sich ändert

**Server**

| Ort | Änderung |
|---|---|
| `GameType` | `GameStage`, `stage(params)` |
| `GameTypeHandle` | `stage(params: JsonNode)` |
| `RoundResponses`, `RoundDtos` | `stage` in `RoundResponse` |
| `LabService`, `LabDtos` | `stage` in `LabRoundResponse` |
| `FindPatternGameType` | `FindPatternStage` |

**Client — Rahmen**

| Ort | Änderung |
|---|---|
| `rounds/RoundCard.vue` | der eigene `sealed`-Block, `briefing` und der Prop `step` fallen weg; im Gesicht `sealed` mountet das Spiel mit `sealed`, `stage`, `@reveal`. Die Prüfung „keine Ansicht in dieser Version“ bleibt davor |
| `pages/c/[slug]/index.vue` | `useStartCeremony` und `revealWithSignal` fallen weg; `reveal` geht direkt an die Karte |
| `pages/c/[slug]/lab/[game]/index.vue` | `lab-sealed`, `labBriefings` und die eigene Zeremonie fallen weg; `sealed = !round.revealed` |
| `gamelab/games.ts` | `labBriefings` fällt weg |
| `games/registry.ts` | `gameBriefings` fällt weg |
| `ui/GameHeader.vue`, `ui/flipdot/FlipDotBoard.vue` | siehe oben |
| `api/types.ts` | `stage: unknown` in beiden Rundenantworten |
| neu | `ui/RevealCover.vue`; `HoldButton` mit `beats` |

**Client — Spiele**

| Spiel | versiegelt |
|---|---|
| Musterung | das Board zeichnet das leere Raster aus `stage`, die Hülle liegt darüber, `ready` sofort nach dem Mount. Der heutige Zweig „`payload === null` → lässt sich nicht anzeigen“ unterscheidet künftig *versiegelt* von *kaputt* |
| Weltanschauung | das Board lädt Konfiguration und Maps-Skript unter der Hülle; `ready` = Skript geladen und Karte idle, `failed` bei einem Fehler, `retry` lädt neu. Der Begriff kommt erst mit dem Payload |
| Farbausmalung, Anspielung | deklarieren die neuen Props, sind nie `sealed` |

Die Briefing-Komponenten der Spiele bleiben: die Boards binden sie heute schon selbst ein
(`FindPatternBoard` unten, `SpotObjectGame` ebenso). Weg ist nur das Register, das sie für einen
Bildschirm ohne Spiel bereithielt.

## Tests

**Backend** (kotest, MockMvc-Kotlin-DSL):

- Feld-Set-Test für `FindPatternStage`; `stage == null` für die übrigen drei.
- `RoundResponses` vor dem Aufdecken: `stage` gesetzt, `payload` `null`; danach beide.
- Dasselbe für die Laborantwort.

**Frontend** (Vitest):

- `HoldButton` mit `beats`: Beschriftung aus `progress`, auch beim Zurückspulen;
  `holdMs = beats × BEAT_MS`. Die bestehenden Tests der Farbausmalung bleiben unverändert grün —
  das ist der Beweis, dass sie nichts merkt.
- `RevealCover`: die vier Zustände; `retry` löst nie `reveal` aus; `inert` auf der Spielfläche.
- `RoundCard`: versiegelt mountet das Spiel mit `payload = null` und reicht `reveal` durch; kein
  eigener Aufdeck-Block mehr.
- Musterung und Weltanschauung: Hülle über der Spielfläche, `ready`/`failed`, und **die Hülle ist
  im selben Render weg, in dem der Payload ankommt** — ohne Übergangsklasse.
- Community- und Laborseite ohne Zeremonie; `GameHeader` nur noch mit `running`.

**Nicht im Browser-Pane prüfbar:** das Halten läuft über `requestAnimationFrame`, und
`useHoldProgress` bricht bei `visibilitychange` ab — der Pane meldet sich immer als versteckt, der
Ring füllt sich dort nie. Die Handprobe gehört auf ein echtes Handy.

## Folgen für andere Dokumente

- **`game-rounds.md`:** „One secret per round, two exits“ bekommt die Bühne als dritte
  Veröffentlichung dazu — ausdrücklich *kein* Ausgang für das Geheimnis: sie trägt per Vertrag
  keins, und das pinnt ihr Feld-Set-Test.
- **Spieluhr-Spec:** Einzählen im Band und volles Feld sind zurückgebaut; ein Vermerk dort.
- **Entstauber-Spec:** „Der Start“ schrumpft auf: Bühne = `{cols, rows, intervalMs}` plus das Foto
  als Asset vor dem Aufdecken, `order` im Payload, die erste Kachel fällt einen Takt nach der
  Hülle. Nachzuziehen, sobald diese Spec umgesetzt ist.
