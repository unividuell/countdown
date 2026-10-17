# Platzierung („Place Patch“) — einen Bildausschnitt aufs Feld genau finden

**Status:** beschlossenes Design (2026-10-15).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Bild-Pool](2026-09-07-community-image-pool-design.md), der [Hülle](2026-09-25-reveal-cover-design.md)
und dem [Spiel-Labor](2026-08-08-game-lab-design.md). Die Punkte- und Zeitregeln samt Auflösungs-Takt
übernimmt es von [Musterung](2026-08-24-musterung-design.md) (`find-pattern`), Pool-Zugriff,
Einfrieren und Bühne von [Entstauber](2026-09-14-entstauber-design.md).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — mit derselben benannten Decke wie
Musterung.

**Berührt:** ein neues Modulith-Modul `placepatch` (ein Schema, eine Tabelle), den Adapter
`PlacePatchGameType` in `game.internal`, drei Exporte in `imagepool` (hochgezogen aus `deduster`,
Entstauber stellt um), eine Methode am gemeinsamen Vertrag (`GameType.assetStage`) samt je einer Zeile
in `PlayService.asset` und `LabService.asset`, und im Frontend ein neues Spielverzeichnis
`games/placepatch/` plus die Einträge in `games/registry.ts` und `gamelab/games.ts`.

## Zweck & Spielidee

Ein Foto aus dem Bild-Pool liegt in Graustufen auf dem Spielfeld. Darunter ein Ausschnitt desselben
Fotos — **in Farbe** und mit **ausgefransten Rändern**. Der Spieler legt einen Rahmen gleicher Größe
dorthin, wo der Ausschnitt herkommt. Nur die **exakte** Stelle zählt.

Entstanden aus zwei Spikes (2026-10-14/15). Was sie gezeigt haben und was daraus folgt:

- **Grob finden ist leicht, exakt treffen ist das Spiel.** Darum ein feines Raster (40 Spalten) und
  ein Ergebnis ohne Teilerfolg: Treffer oder nicht.
- **Ein Doppelgänger ist Pech, und das gehört zum Spaß.** Ein Ausschnitt aus gleichförmigem Himmel ist
  schwer bis unmöglich — es gibt keine Eindeutigkeitsprüfung bei der Ziehung, und sie soll auch nicht
  nachgerüstet werden.
- **Scharfe Kanten verraten die Stelle.** Wer die Kantenlinie des Ausschnitts im Graubild sucht, legt
  ihn wie ein Lineal an. Die ausgefransten Ränder nehmen genau diese Hilfe weg.

Referenz zum Anfassen: Branch `claude/find-patch-game-spike` (Stand `b6b2b50`), Seite
`/c/[slug]/spike/ausschnitt`, Code unter `webapp-vue/src/spike/findpatch/`. Der Spike rechnet alles im
Browser; hier rechnet der Server.

- **Codename:** `place-patch` (Game-ID), `placepatch` (Modul), `PlacePatch*` (Klassen).
- **Anzeigename:** „Platzierung“.

## Die Regeln

**Raster 40 Spalten, Zeilen aus dem Seitenverhältnis des Fotos (30, 40 oder 53), Ausschnitt 10 × 10
Zellen** — ein Viertel der Brettbreite.

**Tippabgabe:**

1. **Tippen** setzt den Rahmen zentriert unter den Finger.
2. **Ziehen** verschiebt ihn relativ, 1 : 1 zur Fingerbewegung — der Finger muss nicht auf dem Rahmen
   liegen und verdeckt ihn deshalb nicht. Der Rahmen rastet immer am Raster ein.
3. **Halten** des Abgabeknopfs (`HoldButton`) gibt den Tipp ab.

Es gibt genau einen Tipp pro Spieler und Runde — die Regel des Frameworks.

**Treffer heißt: die linke obere Zelle des Rahmens ist die des Ausschnitts.** Eine Zelle daneben ist
kein Treffer.

**Die Phasen — wörtlich die von Musterung:**

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein, das Brett ist sofort da | **ja, genau einmal** |
| Zeit | läuft nicht ins Ergebnis ein | entscheidet |
| Award | `ALL_QUALIFYING` — jeder Treffer 1 Punkt | `CLOSEST_ONLY` — **der schnellste** Treffer nimmt alles |

Im Vertrag: `requiresReveal(params) = scoresOnDuration(params) = params.timed`, `timed` setzt der Zug
aus der Phase — dieselbe Bauform wie `FindPatternParams.timed`. Die Punkte vergibt `awardFor` wie für
jedes Spiel; in Phase zwei ersetzt der Rahmen `deviation` durch die Spanne vom Aufdecken zum Tipp.

## Modulschnitt

```
game ──▶ placepatch ──▶ imagepool ──▶ community, iam
game ──▶ deduster   ──▶ imagepool
```

`placepatch` trägt: `PlacePatchLayout` (Seitenverhältnis → Raster und Zellgröße), `PlacePatchImages`
(Einfrieren, Graubild, Ausschnitt), `FrayMask` (die Fransen), `RoundImageStore` (die Tabelle). Der
Adapter trägt Params, Bühne, Payload, Lösung, Urteil — nichts davon kennt `placepatch`.

### `imagepool` exportiert, was beide Bildspiele brauchen

Mit dem zweiten Bildspiel stehen drei Dinge sonst doppelt im Code. Sie sind Bildwissen, kein
Spielwissen, und ziehen deshalb in die exportierte API des Pools; Entstauber stellt um, sein Verhalten
und seine Tests bleiben unverändert.

1. **Welche Bilder eine Gemeinschaft spielt** — die eigenen, sonst die globalen:

   ```kotlin
   interface ImagePoolQuery {
       // … candidateIds, displaySize, displayed wie bisher
       /** Die eigenen Bilder der Gemeinschaft; die globalen nur, wenn sie keine hat. */
       fun playableIds(communityId: UUID): List<UUID> =
           candidateIds(communityId).ifEmpty { candidateIds(null) }
   }
   ```

   Heute steht das als `DedusterPool.candidates`. Die Regel gehört keinem Spiel: so werden Bilder
   ausgewählt, für jedes Spiel. Das korrigiert den Satz „Die Vorrangregel lebt im Spiel, nicht im
   Pool“ der Entstauber-Spec.

2. **Die Seitenverhältnis-Klasse** eines Fotos — `AspectRatio { LANDSCAPE (4:3), SQUARE (1:1),
   PORTRAIT (3:4) }` mit `of(width, height)` und den Schwellen √(4/3) und √(3/4), die heute in
   `DedusterGrid.of` stehen. `DedusterGrid` bildet danach nur noch Klasse → Kachelraster ab
   (8 × 6, 7 × 7, 6 × 8).

3. **Zuschnitt und Kodierung** — mittig auf ein exaktes Verhältnis zuschneiden, verkleinern (nie
   vergrößern), als JPEG oder PNG schreiben. Heute `DedusterImages.render` und das private `jpeg`.
   Gezielt so geschnitten, dass Platzierung ein **exaktes** `cols : rows` übergibt (40 : 53 ist nicht
   genau 3 : 4) und Entstauber sein Kachelverhältnis.

### `GameType.assetStage` — zwei Bilder hinter einem Aufdecken

Vor dem Tipp gibt der Rahmen `key in 0..stage` frei: ein Schlüssel *ist* eine Stufe, ein einstufiges
Spiel kann also genau **ein** Bild hinter dem Aufdecken halten. Platzierung braucht zwei. Musterung
hat das mit `data:`-URIs im Payload umgangen — für ein Foto (Hunderte KB, bei jeder Aktion erneut
geschickt) und ohne Zugriff auf das eingefrorene Bild in `present(params)` geht das hier nicht.

```kotlin
/**
 * Which stage releases asset [key] before the guess. The default is today's rule: the key is the
 * stage (Anspielung's ladder). A single-stage game with two images maps both to 0.
 */
fun assetStage(params: P, key: Int): Int = key
```

`PlayService.asset` und `LabService.asset` prüfen danach `assetStage(params, key) in 0..stage` statt
`key in 0..stage`; `SCENE_ASSET_KEY` und `SOLUTION_ASSET_KEY` bleiben, wie sie sind. Für jedes
bestehende Spiel ändert sich nichts.

Das ist ein Notbehelf und als solcher benannt: das Asset-Modell gehört als Ganzes aufgeräumt —
[unividuell/countdown#101](https://github.com/unividuell/countdown/issues/101), nach diesem Spiel.

## Raster und Zuschnitt

```kotlin
const val COLS = 40   // Spalten — flexibel gehalten, siehe unten
const val SIZE = 10   // Ausschnitt in Zellen: ein Viertel der Breite
```

Die Zeilen folgen aus der Seitenverhältnis-Klasse: `rows = round(COLS × Höhe/Breite der Klasse)`,
also **30** (4 : 3), **40** (1 : 1) oder **53** (3 : 4). Ein Panoramafoto wird damit kein endloses Brett.

Das Foto wird mittig **exakt** auf `cols : rows` zugeschnitten und so verkleinert, dass die Zellen
ganzzahlig und quadratisch sind:

```
zelle  = min(30, floor(zuschnittBreite / cols))   // nie hochrechnen
breite = cols × zelle   → bei 40 Spalten 1200 px
höhe   = rows × zelle
```

**Flexibel ohne Regler.** `cols`, `rows` und `size` werden in den Params eingefroren, und alles danach
liest nur dort — Bildaufbereitung, Urteil, Frontend, Historie. Gewählt wird an genau einer Stelle, der
Ziehung. Ein anderes Raster ist später eine Änderung dieser zwei Konstanten; alte Runden behalten ihre
Werte. Ein Admin-Regler oder eine pro Runde gezogene Schwierigkeit wird nicht gebaut.

## Der Zug

```kotlin
data class PlacePatchParams(
    /** Weiche Referenz in den Pool. Nach dem Einfrieren nur noch Herkunftsnachweis. */
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val size: Int,
    /** Linke obere Zelle des Ausschnitts — das Rundengeheimnis. */
    val x: Int,
    val y: Int,
    /** Seed des Fransenmusters. */
    val fraySeed: Int,
    val timed: Boolean,
)
```

Gezogen wird nach Veröffentlichung (siehe [game-rounds.md](../../../.claude/guidelines/game-rounds.md)):

| Wert | Strom | warum dieser |
|---|---|---|
| Bild, daraus `cols`/`rows` | `scene` | Das Raster steht in der Bühne, vor dem Aufdecken |
| `fraySeed` | `presentation` | Die Fransen werden mit dem Ausschnitt ab dem Aufdecken sichtbar |
| `x`, `y` | `solution` | Das Geheimnis |

- **Bild:** `random.scene.pick` aus `playableIds(community)` ohne die Bilder, die Platzierung in
  dieser Edition schon hatte (`context.previousParams`); bleibt nichts übrig, zählt wieder die volle
  Liste — wörtlich die Regel von Entstauber. Ein Bild, das zwischen Liste und Messen verschwindet, ist
  ein `checkNotNull` wie dort.
- **Position:** `x = random.solution.nextIntBetween(0, cols − size)`, `y` ebenso über `rows`.
- **Fransen:** `fraySeed = random.presentation.nextInt(Int.MAX_VALUE)`.
- **`timed`** = `context.phase == Phase.TWO`.

**Verfügbar** ist das Spiel, solange `playableIds(community)` nicht leer ist (`isAvailable`).

## Bilder

### Einfrieren beim Ankündigen

`materialised(params, roundGameId)` holt das Foto aus dem Pool (`displayed`, kurze Kante
`min(cols, rows) × 30`), schneidet und skaliert wie oben und speichert es als JPEG (Qualität 0,82):

```sql
CREATE SCHEMA IF NOT EXISTS placepatch;

CREATE TABLE placepatch.round_images (
    round_game_id UUID PRIMARY KEY,   -- weiche Referenz auf game.round_games, wie deduster.round_images
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Idempotent über `INSERT … ON CONFLICT DO NOTHING`, weil beim Ankündigungsrennen beide ersten Aufrufer
den Haken ziehen. **Gespeichert wird nur das Farbfoto** — es ist die Quelle beider Bilder, die der
Spieler sieht. Ausgeliefert wird es nie.

### Abgeleitet beim Abruf

Beide Bilder sind eine reine Funktion aus eingefrorenem Foto und Params, gerechnet bei jedem Abruf
(einige zehn Millisekunden) — keine zweite Tabelle, keine Release-Logik für sie:

| Schlüssel | Bild | Format |
|---|---|---|
| 0 | **Brett** — das Foto in Graustufen | JPEG, einkanalig (`TYPE_BYTE_GRAY`) |
| 1 | **Ausschnitt** — `size × size` Zellen ab (`x`, `y`), farbig, ausgefranst | PNG mit Alpha |

**Graustufen** wie im Spike: Helligkeit als OKLab-L, ausgegeben als neutrales Grau gleicher
Helligkeit (`Y = L³`, zurück nach sRGB). Wahrnehmungsgerecht — zwei gleich helle Farben werden
dasselbe Grau, und genau das macht die Farbe im Ausschnitt zur Information.

**Fransen** — die Maske aus dem Spike (`frayMask` in `spike/findpatch/patch.ts`), nach Kotlin
übertragen:

- Tiefe `t = 15 %` der Ausschnittkante (bei 10 × 10 Zellen à 30 px: 45 px), eine Konstante im Code.
- Die Grenze wandert zwischen 35 % und 100 % von `t`: `kante(x, y) = t · (0,35 + 0,65 · n(x, y))`.
- `n` ist Value-Noise in zwei Oktaven — Gitterabstand `t` und `t/4`, gewichtet 0,65 / 0,35, zwischen
  den Gitterpunkten mit `3s² − 2s³` geglättet. Die Gitterwerte kommen aus
  `SeededRandom.fromSeed(fraySeed)`: dasselbe Muster bei jedem Abruf.
- Alpha = `clamp((abstandZumRand − kante) / (t/4), 0, 1)`.

Im Spike lagen damit 37 % der Ausschnittfläche ganz frei und 51 % voll deckend. Kein Fall für
[cross-runtime-parity](../../../.claude/guidelines/cross-runtime-parity.md): nur der Server rechnet.

Eine spätere Änderung von Tiefe oder Graustufen-Formel lässt alte Runden in der Historie leicht anders
aussehen — derselbe Preis, den Musterung für seine Blockgröße benannt hat. Kosmetik, keine Fairness.

### Assets und das Tor

| Schlüssel | frei ab | Quelle |
|---|---|---|
| 0 Brett | Aufdecken (`assetStage` → 0) | abgeleitet |
| 1 Ausschnitt | Aufdecken (`assetStage` → 0) | abgeleitet |
| 98, 99, jeder andere | — | `null` → 404 |

Eine abgeschlossene Runde ist wie jede offen; die Historie zeigt Brett und Ausschnitt.

- `produceAssets(params)` rechnet für das **Labor** beide Bilder auf einmal in den Speicher — aus dem
  Pool, ohne Tabelle, mit denselben Funktionen.
- `releaseStageAssets` bleibt der leere Standard: die Historie braucht das Foto.
- `releaseAssets` löscht die Zeilen, wie bei Entstauber.

## Rundengeheimnis: die Ausgänge

Jeder Ausgang ist durch einen Feldmengen-Test gepinnt (Jackson 3, `propertyNames()`):

| Ausgang | wann | Felder |
|---|---|---|
| Bühne `PlacePatchScene` | ab Ankündigung | `cols, rows, size` |
| Payload `PlacePatchPayload` | ab Aufdecken | `cols, rows, size` |
| Lösung `PlacePatchSolution` | nach dem eigenen Tipp | `x, y` |
| Outcome `PlacePatchOutcome` | nach dem eigenen Tipp, für alle | `correct` |

**Keine `imageId` im Payload** — sie wäre eine zweite, ungetorte Adresse auf dasselbe Foto. Die Bilder
kommen über die Asset-URL der Runde (`/api/communities/{slug}/rounds/{n}/assets/{key}`).

**Ströme.** Der Ausschnitt ist eine Funktion eines Zugs aus dem Solution-Strom — erlaubt aus demselben
Grund wie Musterungs Muster-Bild: veröffentlicht wird kein roher Wert aus diesem Strom, sondern die
Pixel an dieser Stelle. Die engen die Position auf „die passende Stelle“ ein — und genau das ist die
Aufgabe.

**Tipp auf der Leitung:** `{ x: Int, y: Int }`. Gültig ist `0..cols−size` und `0..rows−size`; alles
andere — außerhalb, fehlend, nicht ganzzahlig — ist `InvalidGuessException` → 400, **vor** jedem
Schreibvorgang. `judge` gibt `qualifies = (x == params.x && y == params.y)`, `deviation = 0.0`
(Phase zwei: ersetzt durch die Dauer) und `PlacePatchOutcome(correct)`.

## Integrität — die Decke, benannt

**Kein Farbwert vor dem Tipp.** Graustufen und Ausschnitt rechnet der Server; das Farbfoto und die
unversehrten Kanten des Ausschnitts verlassen ihn nie. Wer den Netzwerk-Tab öffnet, sieht genau, was
auf dem Bildschirm steht.

**Die Decke bleibt die von Musterung:** ein Skript, das den Ausschnitt in Graustufen umrechnet und per
Bildvergleich im Brett sucht, findet die Position in Sekunden — die Fransen ändern daran nichts, der
Kern genügt. Kategorie „Lösung liegt im Sichtbaren“. In Phase zwei bestraft die Uhr genau diesen
Aufwand; in Phase eins ist ein Skript-Treffer ein sicherer Punkt, wie bei Musterung auch.

## Frontend

```
games/placepatch/
  PlacePatchGame.vue        Ablauf: Hülle → Brett → Auflösung
  PlacePatchBriefing.vue    InfoBox („place-patch“) + AwardBox, mit PlacePatchRules.vue
  PlacePatchBoard.vue       Graubild mit Rahmen, Ausschnitt darunter, HoldButton
  stamp.ts                  Tippen/Ziehen, Einrasten, Begrenzung — rein, ohne DOM testbar
  outlines.ts               Rahmen stapeln, wie marks.ts bei Musterung
  PlacePatchReveal.vue      die Auflösung
  PlacePatchScoreboard.vue  + scoreboard.ts
  types.ts                  Payload, Bühne, Lösung, Tipp, eigener Tipp — defensiv eingeengt
```

Dazu `'place-patch': PlacePatchGame` in `games/registry.ts` und `{ id: 'place-patch', title:
'Platzierung' }` in `labGameList`. Bilder über die bestehende `assetUrl(key)`-Prop, wie Entstauber.

### Brett

Von oben nach unten:

1. **Das Graubild** (Asset 0), kartenbreit wie bei Entstauber — randlos, ohne Obergrenze —, darüber
   ein Overlay mit dem Rahmen in der **eigenen Spielerfarbe** (aus `entries`, wie Musterungs Rahmen).
2. Die Frage „Wo gehört dieser Ausschnitt hin?“.
3. **Der `HoldButton`** in seiner eckigen Form (`shape="square"`), aktiv, sobald ein Rahmen liegt,
   und auf ihm **der Ausschnitt** (Asset 1), **im Maßstab des Bretts** — genau so groß wie der
   Rahmen, damit keine Größe im Kopf umgerechnet werden muss. Knopf und Ausschnitt sind gleich groß;
   der Knopf diktiert keine Größe. Ohne Rahmen und ohne abgerundete Ecken: beides würde die Kante
   zurückbringen, die die Fransen wegnehmen.

Der Platz des Knopfs steht schon unter der Hülle, leer — die Bühne trägt dafür `size` mit —, damit
beim Aufdecken nichts nach unten rutscht.

**`stamp.ts`** — alles in Rastereinheiten, damit es ohne Layout testbar ist:

- Unter ~8 CSS-px Bewegung zwischen `pointerdown` und `pointerup` ist es ein **Tippen**: der Rahmen
  springt zentriert unter den Finger — ungerade Größen auf die Zelle, gerade auf den nächsten
  Kreuzungspunkt.
- Wer ab 500 ms liegen bleibt und ohne Ziehen loslässt, hat es sich anders überlegt: der Rahmen
  bleibt, wo er war.
- Darüber ist es **Ziehen**: der Rahmen wandert um die Fingerbewegung, 1 : 1. Die Position wird
  fein (in Bruchteilen von Zellen) mitgeführt und eingerastet angezeigt, damit langsames Ziehen nicht
  hängen bleibt.
- Ziehen beginnt irgendwo auf dem Brett; mit Pointer-Capture darf der Finger es verlassen.
- Liegt noch kein Rahmen, setzt der Beginn des Ziehens ihn zentriert, danach geht es relativ weiter.
- Der Rahmen bleibt immer ganz im Raster.

Schwelle und Übersetzung werden im Labor auf dem Telefon nachgestimmt.

**Phase zwei:** die `RevealCover` liegt über dem Brett; die Bühne (`cols`, `rows`, `size`) gibt ihr
vor dem Aufdecken schon das richtige Seitenverhältnis und die Höhe des Ausschnitts.

### Auflösung

Im Takt von `revealChoreography.ts`, die Stufen von Musterung:

1. **Wechsel** — der eigene Rahmen bleibt, wo er lag. Keine Animation, sondern die Abwesenheit einer.
2. **`SOLUTION_DELAY_MS` (900 ms)** — **der farbige Ausschnitt setzt sich an seinen Platz ins
   Graubild**, wie ein angenähter Flicken, markiert in Weiß: ein kleines X in der Mitte und die vier
   Ecken knapp außerhalb des Quadrats, so dass der Rahmen eines Treffers sie berührt und kein Stapel
   von Tipps sie verdeckt — keine Spielerfarbe, die Lösung gehört niemandem. Kein Rahmen: die Rahmen
   der Tipps liegen auf derselben Kante und deckten ihn zu, und nach innen rücken dürfen sie nicht,
   sonst springt der eigene beim Wechsel. Dazu der Tabellenkopf. Dafür reicht das schon geladene
   Asset 1.
3. **`RESULTS_DELAY_MS` (ab 1900 ms)** — die Rahmen der anderen Tipps, jeder über `cellDelayMs` an
   seine Tabellenzeile gekoppelt. Der eigene liegt außen (Einrückung 0), fremde je Kollision 2 px nach
   innen (`outlines.ts`). Die eigene Zeile borgt das Timing der ersten fremden (`tickOfRow`).

Es gibt **keinen Umschalter aufs Farboriginal** — die Auflösung ist das Graubild mit dem
eingesetzten Flicken. Feinabstimmung der Takte im Labor.

### Rangliste

Echte Tabelle im Stil von Musterung. Spalten: **Name · [mm:ss] · Pkt** — [mm:ss] nur in Phase
zwei; ob getroffen, sagen die Punkte und der Rahmen auf dem Bild. Sortierung wie bei Musterung:
Punkte absteigend (`null` zuletzt), Treffer vor Nicht-Treffern, Dauer aufsteigend, `userId` als
Tiebreak. Als pure `scoreboard.ts`.

### Erklärung

`InfoBox` mit Storage-Key `place-patch`. Kurztext: „Finde die Stelle, an die der Ausschnitt gehört —
aufs Feld genau.“ Die Regeln darunter: Tippen setzt den Rahmen, Ziehen verschiebt ihn; zählt nur der
exakte Treffer. Was die Runde zahlt und dass in Phase zwei die Zeit zählt, sagt die `AwardBox`.

## Labor

`place-patch` / „Platzierung“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide
Gesichter: Phase eins sofort spielbar, Phase zwei mit Hülle und Uhr. Assets über `produceAssets` im
Arbeitsspeicher. Der Seed in der URL macht Bild, Position und Fransen reproduzierbar — die bekannte,
bewusste Grenze des Labors. Hier werden Ziehen und Auflösungs-Takte nachgestimmt.

## Tests

**Kotlin**

- **Zug:** Bild variiert nur mit dem Scene-Seed, `fraySeed` nur mit dem Presentation-Seed, `x`/`y`
  nur mit dem Solution-Seed (Bauform von `GuessHueDrawTest`); Edition-Ausschluss früherer Bilder und
  Rückfall auf die volle Liste; `timed` aus der Phase.
- **Ausgänge:** Feldmengen-Tests für Bühne, Payload, Lösung und Outcome.
- **`judge`:** Treffer; eine Zelle daneben in jeder Richtung; Grenzen `0` und `cols−size`/`rows−size`;
  `−1`, `cols−size+1`, fehlendes und nicht-ganzzahliges Feld → `InvalidGuessException`.
- **Raster:** jede Klasse ergibt 40 × 30 / 40 × 40 / 40 × 53; die Zelle ist ganzzahlig und ≤ 30 px;
  ein kleines Foto wird nicht hochgerechnet.
- **Bilder:** Maße sind Vielfache der Zelle; das Brett ist grau (R = G = B); der Ausschnitt hat in der
  Mitte Alpha 255 und an der Kante 0; dieselben Params ergeben dieselben Bytes; ein anderer `fraySeed`
  ein anderes Alpha.
- **Tor:** in `PlayService` und Labor sind 0 und 1 nach dem Aufdecken frei, 2 bleibt verboten; für
  Anspielung ändert sich nichts (die Vorgabe `assetStage = key`).
- **`imagepool`:** `AspectRatio` an beiden Schwellen; Zuschnitt auf ein exaktes Verhältnis;
  `playableIds` mit und ohne eigene Bilder.
- **Entstauber:** die bestehenden Tests unverändert grün.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `stamp.ts`: Tippen gegen Ziehen an der Schwelle; Ziehen relativ mit Einrasten und Bruchteilen;
  Begrenzung an allen vier Rändern; Ziehen ohne vorhandenen Rahmen; gerade und ungerade Größen.
- `outlines.ts`: Stapeln bei gleicher Position.
- `scoreboard.ts`: Sortierung in beiden Phasen, mm:ss, fehlende Werte.
- Brett: Tippen und Halten → ein `guess` mit `{ x, y }`.
- Auflösung: der Ausschnitt sitzt an der Lösung, Rahmen gestapelt.
- `types.ts`: Einengen von Payload, Bühne, Lösung und eigenem Tipp (`NaN` fällt raus).

## Bewusst verschoben

- **Raster und Schwierigkeit als Regler** oder pro Runde gezogen — die Params tragen schon alles; es
  wäre eine Änderung an der Ziehung, sonst nirgends.
- **Eindeutigkeitsprüfung** gegen Doppelgänger — siehe *Zweck & Spielidee*: gewollt nicht.
- **Anomalie-Erkennung** unrealistisch schneller Treffer — dieselbe Begründung wie bei Musterung.
- **Rauschen im Bild** gegen den Bildvergleich — wirkungslos gegen ein Skript, teuer im Spielgefühl.
- **Das Asset-Modell aufräumen** — [unividuell/countdown#101](https://github.com/unividuell/countdown/issues/101).

## Folgen für andere Dokumente

- **Entstauber-Spec:** Die Vorrangregel, die Seitenverhältnis-Klassen und der Zuschnitt leben ab jetzt
  in `imagepool`; der Satz „Die Vorrangregel lebt im Spiel, nicht im Pool“ ist zu korrigieren.
- **Bild-Pool-Spec:** Die exportierte Schnittstelle wächst um `playableIds`, `AspectRatio` und den
  Zuschnitt.
- **`game-rounds.md`:** Die Freigabe von Assets vor dem Tipp läuft über `assetStage`; der Satz zu
  `key in 0..stage` wird bei der Umsetzung nachgezogen.
