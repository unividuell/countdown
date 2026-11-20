# Augenmaß („Match Scale“) — eine Silhouette auf die richtige Größe ziehen

**Status:** beschlossenes Design (2026-11-19).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Spiel-Labor](2026-08-08-game-lab-design.md) und dem Datenset-Muster der
[Farbausmalung](2026-08-07-guess-hue-dataset-design.md) (sops-Puffer in `.local/`, Beispieldatensatz,
Startabbruch unter `production`/`staging`). Phasen und Wertung übernimmt es von der Farbausmalung
(`GuessHueGameType`): Toleranz in Phase eins, nächster Tipp in Phase zwei, kein Aufdecken.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — Decke benannt unter *Integrität*.

**Berührt:** ein neues Modulith-Modul `matchscale` (Datenset, Ziehung; kein Schema), den Adapter
`MatchScaleGameType` in `game.internal`, ein Offline-Skript `scripts/match-scale-dataset.mts`, ein
sops-Skript `scripts/match-scale-dataset.sh`, ein Verzeichnis verschlüsselter Kategorien unter
`deploy/games/match-scale/categories/`, Mount und Download in `deploy/compose.yaml` und `deploy/update.sh`, und im
Frontend `games/matchscale/` plus die Einträge in `games/registry.ts` und `gamelab/games.ts`.

## Zweck & Spielidee

Zwei Dinge derselben Kategorie, als Silhouette im selben Blickwinkel: zwei Länder von oben, zwei Tiere
von der Seite. **A** steht fest. **B** zieht der Spieler größer oder kleiner, bis das Verhältnis
seiner Meinung nach stimmt. Gewertet wird, wie weit sein Faktor vom wahren abweicht.

Die Schwierigkeit liegt im Inhalt, nicht in der Mechanik. Darum ist der Kern dieses Dokuments, **woher
Silhouetten und Maße kommen**, und die Regel dafür lautet: **Was gezeichnet ist, wird gemessen.** Die
Lösung bezieht sich immer auf die Zeichnung, nie auf eine amtliche Zahl daneben. Ein Land ohne seine
Überseegebiete ist so groß, wie es gezeichnet ist; eine Katze samt Schwanz so lang, wie sie gezeichnet
ist.

- **Codename:** `match-scale` (Game-ID), `matchscale` (Modul), `MatchScale*` (Klassen) — der Spieler
  bringt B auf den Maßstab von A.
- **Anzeigename:** „Augenmaß“ — schätzen mit dem bloßen Auge.

## Kategorien

Eine Kategorie gibt **Blickwinkel** und Herkunft vor. Paare entstehen nur innerhalb einer Kategorie.

**Erster Schnitt:** Länder und Tiere, in zwei PRs. **Der erste bringt das Spiel mit Ländern**, die das
Skript vollständig erzeugt. **Der zweite bringt die Tiere** — ihre Handliste schreibt Claude
recherchiert direkt nach `.local/`, der Autor nimmt sie auf der Prüfseite ab. Der Tier-Teil des
Skripts gehört in den zweiten PR.

| Kategorie | Blick | Silhouette | Maß |
|---|---|---|---|
| Länder | von oben, flächentreu | Natural Earth Admin-0 (gemeinfrei) | aus der Geometrie selbst |
| Tiere | von der Seite | PhyloPic (meist CC0/CC BY) | von Hand, an der Silhouette gemessen |

**Eine Kategorie taugt nur, wenn sich die Größe ihrer Dinge unterscheidet.** Enthält die Zeichnung einen
gleich großen Bezug — eine Sitzreihe samt Vordersitz, ein Mensch daneben —, legt der Spieler Bezug auf
Bezug, und der Faktor ist immer etwa 1. Beinfreiheit ist deshalb mit dieser Mechanik kein Kandidat.

**Später, mit derselben Datei-Form und ohne Kotlin-Code:** Autos (Seite), Bauwerke (**nur frontal**,
also Handarbeit), Seen und Provinzen (Natural Earth), Orbits. Nicht von oben aus OpenStreetMap für
Bauwerke: der Grundriss reicht nicht.

## Die Regeln

**Ziehung.**

1. Kategorie gleichverteilt aus den geladenen Kategorien.
2. A gleichverteilt aus der Kategorie.
3. B gleichverteilt aus den übrigen Einträgen, deren Faktor zu A in **[1/10, 10]** liegt (Länge, nicht
   Fläche). Hat A keinen solchen Partner, wird A neu gezogen.

**Keine Wiederholung pro Edition, solange es geht** — wie die Pool-Spiele über
`context.previousParams`: ein Eintrag, der in einer früheren Runde der Edition als A oder B dran war,
wird nicht wieder gezogen. Bleibt in der Kategorie kein Paar übrig, gilt die Sperre für diese Kategorie
nicht mehr. *(Entscheidung des Entwurfs.)*

`RoundContext.difficulty` bleibt ungenutzt, wie bei der Farbausmalung. *(Entscheidung des Entwurfs.)*

Faktor = `metresPerUnit(B) / metresPerUnit(A)` — wie viel länger B in Wirklichkeit ist, wenn beide
Silhouetten gleich groß gezeichnet sind.

**Tipp.** `{ "scale": <Double> }` — der Faktor, um den der Spieler B gegenüber seiner Startgröße (gleich
A) vergrößert hat. Endlich und > 0, sonst `InvalidGuessException`. Ein Tipp pro Spieler und Runde,
abgegeben per Halten (`HoldButton`).

**Abweichung.** `deviation = |ln(scale / factor)|`. Doppelt so groß zählt wie halb so groß.

| | Phase eins | Phase zwei |
|---|---|---|
| Aufdecken | nein | nein |
| Zeit | zählt nicht | zählt nicht |
| Qualifiziert | `deviation ≤ ln 1,25` (Faktor 1,25 in beide Richtungen: 25 % zu groß oder 20 % zu klein) | jeder Tipp |
| Award | `ALL_QUALIFYING` — 1 Punkt je Treffer | `CLOSEST_ONLY` — der nächste Tipp nimmt alles |

Im Vertrag wie `GuessHueParams.toleranceDeg`: ein `toleranceFactor: Double?` in den Params, `1.25` in
Phase eins, `null` in Phase zwei, aus der Phase gesetzt. `requiresReveal = scoresOnDuration = false`.

## Der Datensatz

**Eine Datei pro Kategorie.** Neu verschlüsseln ändert jeden Wert einer Datei; getrennt bleibt eine
fertige Kategorie im Diff unberührt, wenn eine andere wächst.

```yaml
category: example            # Schlüssel, [a-z0-9-]+, eindeutig
displayName: Beispielkategorie
attribution: "Silhouetten: Beispielquelle"   # sichtbar in der Auflösung, optional
entries:
  - name: Beispielding Alpha
    path: "M0 0 L1000 120 …"   # SVG-Pfad, normiert: längste Seite der Bounding-Box = 1000
    width: 1000                # Bounding-Box des normierten Pfads
    height: 640
    metresPerUnit: 412.5       # 1000 Einheiten = 412,5 km
    measure:                   # optional: woraus metresPerUnit stammt
      axis: length             # length (Breite der Bounding-Box) | height
      kind: head-body          # optional: head-body | total-length (length), shoulder | total-height (height)
      metres: 412500
      source: "https://example.org/beispielding-alpha"
      span: [0, 1000]          # optional: die Strecke des Maßes entlang der Achse, normiert
    attribution: "Beispielkünstler, CC BY"   # pro Eintrag, optional, überschreibt die Kategorie
```

**`measure`** hält das Maß samt Quelle neben dem Eintrag, damit es beisammen und später nachprüfbar
ist. Von Hand gemessene Kategorien (Tiere) tragen es, erzeugte (Länder) nicht. Es ist so geheim wie
`metresPerUnit` (*Rundengeheimnis*).

**`measure.kind`** benennt das Maß in der Auflösung: `head-body` „Kopf-Rumpf“, `total-length` „Länge“,
`shoulder` „Schulterhöhe“, `total-height` „Höhe“. Der Leser prüft Wert und Passung zur Achse; fehlt `kind`,
steht die Achse da („Länge“/„Höhe“). `kind` reist nur in der Lösung.

**Gleiche Maße, an der richtigen Stelle.** Tiere messen überall dasselbe: `length` ist die
Kopf-Rumpf-Länge (Nasenspitze bis Schwanzansatz; ohne Schwanz im eigentlichen Sinn — Fisch, Vogel,
Wal — die Gesamtlänge der Quelle), `height` die Schulterhöhe (Boden bis Widerrist; ohne Widerrist —
Vogel, Giraffe — die Gesamthöhe). Wert ist die Mitte der Spanne Erwachsener, ein angegebener
Mittelwert geht vor; zeigt die Silhouette eindeutig ein Geschlecht (Geweih, Mähne), gilt dessen
Spanne. Ein Schwanz steht nicht gestreckt, ein Kopf überragt den Widerrist: darum hängt das Maß an
`span: [from, to]`, der Strecke in normierten Einheiten (x bzw. y, y nach unten), die es abdeckt —
Nasenspitze und Schwanzansatz, Boden und Widerrist. `metresPerUnit = metres / (to − from)`; ohne
`span` die ganze Bounding-Box-Seite. Die Punkte werden auf einem Raster abgelesen und eingezeichnet
geprüft. `span` bleibt auf dem Server: die Lösung trägt nur `axis`, `metres`, `source`.

**Klartext in `.local/games/match-scale/categories/<category>.yaml` (Hauptcheckout), über sops nach
`deploy/games/match-scale/categories/<category>.sops.yaml` — alle Kategorien, auch die aus gemeinfreien Daten.** Einheitlich
ist wichtiger als die Ausnahme. `scripts/match-scale-dataset.sh` mit `decrypt`, `encrypt`, `dev-path`
wie `guess-hue-dataset.sh`, nur über alle Dateien des Verzeichnisses.

**Ganz verschlüsselt**, wie jeder Spielinhalt (`game-content.md`); die bestehende Regel in `.sops.yaml`
deckt beide Pfade ab. Der Preis: die Datei wächst um grob ein Drittel (base64 plus IV und Tag je Wert),
und jedes Neuverschlüsseln schreibt einen frischen, nicht komprimierbaren Blob — bei Ländern einige
hundert KB. Die Datei pro Kategorie hält das selten: Länder werden einmal erzeugt, Tiere berühren sie
nicht.

**Größe im Blick:** Das Skript gibt je Kategorie Dateigröße, Punkte pro Pfad (Mittel, Maximum) und den
größten Eintrag aus. Richtwert für Länder: unter 500 KB Klartext; darüber zuerst die
Vereinfachungs-Toleranz und die Koordinaten-Schreibweise (ganze Zahlen, relative Befehle) prüfen. Die
Größe zählt doppelt: der Pfad geht mit jedem Payload über die Leitung.

**Backend.** `MATCH_SCALE_DATASET_DIR` zeigt auf ein Verzeichnis mit einfachem YAML; jede Datei ist eine
Kategorie. Leer → der Beispieldatensatz aus dem Classpath (`games/match-scale/sample/`, zwei
offensichtlich erfundene Kategorien mit je ein paar Rechtecken und Dreiecken), und unter
`production`/`staging` verweigert die App dann den Start — Bauform `SpotObjectConfiguration`. Eine
Kategorie mit weniger als zwei ziehbaren Paaren wird mit Warnung ausgelassen; ist keine übrig, ist das Spiel nicht verfügbar (`isAvailable` = false, eine Warnung beim Start).

**Schalter je Kategorie.** `deploy/games/match-scale/categories.txt` (unverschlüsselt) listet die aktiven
Schlüssel; Zeile auskommentieren (`# countries`) schaltet die Kategorie aus. `update.sh` und
`dev-path` legen die Liste neben die Klartextdateien; der Loader lädt nur die gelisteten Schlüssel.
Ein gelisteter Schlüssel ohne Datei oder ein ungültiger Schlüssel ist ein Startfehler, eine
ungelistete Datei wird mit einer Infozeile ignoriert. Ohne Liste im Verzeichnis zählen alle Dateien.

**Der Loader prüft nur Mechanisches:** Pfad nicht leer, `width`/`height`/`metresPerUnit` endlich und
> 0, `max(width, height) == 1000`, Schlüssel eindeutig; ein vorhandenes `measure` vollständig
(`axis` `length` oder `height`, `metres` endlich und > 0, `source` nicht leer, ein vorhandenes `span`
zwei endliche Zahlen mit 0 ≤ `from` < `to` ≤ 1000).

**Deployment.** `update.sh` kommt immer von `main`, `compose.yaml` vom deployten Branch
(`deployment-server.md`). Darum steht die Liste der Kategorien **nicht in `update.sh`**, sondern in einer
Datei auf dem Branch: `deploy/games/match-scale/categories.txt`, ein Schlüssel pro Zeile. `update.sh` holt sie
vom `$REF`, lädt jede genannte Datei und entschlüsselt sie in `./secrets/match-scale.<target>/`;
`compose.yaml` hängt das Verzeichnis nach `/config/match-scale/` ein. **Fehlt die Liste auf dem `$REF`,
überspringt `update.sh` den Schritt** — so kann die Änderung an `update.sh` zuerst und gefahrlos auf
`main`. Danach ist eine neue Kategorie eine neue Datei plus eine Zeile in der Liste, und sie erreicht
Staging ohne Release. Die Reihenfolge des ersten Rollouts gehört in die PR-Beschreibung.
*(Entscheidung des Entwurfs.)*

## Das Skript

`scripts/match-scale-dataset.mts`, Node 24 wie `turn-pipes-tiles.mts`. Es läuft offline beim Kuratieren,
nie im Build. **Drei Verzeichnisse, nie gemischt** *(Entscheidung des Entwurfs)*:

| Verzeichnis | Inhalt | sops |
|---|---|---|
| `.local/games/match-scale/categories/` | Ausgabe: eine Datei pro Kategorie, die das Backend liest | ganz → `deploy/games/match-scale/categories/` |
| `.local/games/match-scale/input/` | Handlisten mit echten Maßen | ganz → `deploy/games/match-scale/input/` |
| `.local/games/match-scale/raw/` | Downloads (Natural Earth, PhyloPic), Prüfseite | nie committet |

Die Handlisten sind ein Original, kein Puffer — ohne sie lässt sich eine Kategorie nicht neu erzeugen.
Darum werden sie verschlüsselt committet.

**Länder.** Liest Natural Earth Admin-0 (GeoJSON, Maßstab dem Bauenden überlassen, vermutlich 1:50m).
Pro Land:

1. **Teile wählen:** das größte Polygon und, was nah genug daran liegt; Überseegebiete fallen weg. Die
   Schwelle wählt der Bauende, entschieden wird auf der Prüfseite.
2. **Projizieren** flächentreu azimutal (Lambert) **um den Mittelpunkt des Landes** — Fläche *und* Form
   stimmen. Eine Weltprojektion verzerrt am Rand die Form, Mercator die Fläche.
3. **Normieren** auf längste Seite 1000, **dann** vereinfachen (Douglas-Peucker o. ä.) mit einer
   Toleranz in normierten Einheiten. Umgekehrt hätte ein großes Land mehr Punkte als ein kleines, und
   die Punktzahl verriete die Größe (*Rundengeheimnis*).
4. `metresPerUnit` = projizierte Länge der längsten Seite / 1000.

**Tiere.** Die Handliste in `.local/games/match-scale/input/animals.yaml` trägt je Tier Name, PhyloPic-UUID und
**ein Maß an der Silhouette** — welche Achse (`length`, die Länge des Tiers, also die Breite der
Zeichnung, oder `height`), wie viele Meter sie in Wirklichkeit ist und die Quelle dafür. Das Skript holt
das SVG, glättet Transformationen in einen Pfad, normiert, rechnet `metresPerUnit` aus dem Maß,
schreibt das Maß als `measure` mit und übernimmt die Lizenzangabe als `attribution`. Ob dafür eine
Abhängigkeit nötig ist (SVG-Pfad-Transformationen), entscheidet der Bauende.

**Prüfseite.** Das Skript schreibt eine HTML-Seite nach `.local/games/match-scale/raw/` — jede Silhouette
so, wie der Spieler sie sieht, mit Name und Maß, plus einige gezogene Paare im richtigen Verhältnis.
Markiert werden: winzige Länder, Pfade mit sehr vielen Punkten, Tiere ohne Lizenzangabe. Das ist der
Prüfschritt; gestrichen wird von Hand in der Eingabe.

## Rundengeheimnis

**Geheim ist allein `factor`** (bzw. die beiden `metresPerUnit` und die Maße dahinter). Name, Pfad,
`width`/`height` und Attribution der beiden Einträge gehen in den Payload.

- **Der Pfad darf die Größe nicht verraten.** Normiert auf 1000, vereinfacht in normierten Einheiten (siehe
  *Das Skript*). Der Payload trägt keine echten Koordinaten und kein `metresPerUnit`.
- **Die Ziehung kommt aus `presentation`.** Das Paar ist öffentlich; der Faktor folgt deterministisch aus
  ihm und dem Datensatz, er ist kein gezogener Wert. `solution` bleibt ungenutzt.
- **Die Maße gehen nur über die Lösung raus.** Meter von A und B ergeben den Faktor; im Payload
  stünde er damit offen.
- **Das Outcome trägt `deviation` und den eigenen `scale`.** Nach dem Tipp darf das den Faktor verraten —
  die Lösung geht dann ohnehin raus.

Params: Kategorie-Schlüssel und -Anzeigename, A und B (Name, Pfad, `width`, `height`, Attribution),
`factor`, `toleranceFactor`, `measureA`, `measureB`. Payload: alles außer `factor` und den Maßen.
Lösung: `factor`, `toleranceFactor`, `a` und `b` (je `axis`, `metres`, `source` oder `null`). Outcome:
`scale`, `deviation`, `withinTolerance` (`null` in Phase zwei). Je ein Feldmengen-Test.

## Integrität — die Decke, benannt

**Die Lösung ist nachschlagbar.** Die Namen stehen da, und Fläche oder Länge eines Landes oder Tieres
findet jeder in Sekunden. Wer nachschlägt, liegt in Phase eins sicher, in Phase zwei vermutlich vorn —
nicht genau, weil die Zeichnung (Überseegebiete weg, Schwanz dran) von der amtlichen Zahl abweicht.
Namen verstecken hieße ein anderes Spiel. Hingenommen, wie die Anti-Cheat-Spec es unter Freunden tut.

## Frontend

```
games/matchscale/
  MatchScaleGame.vue       Ablauf: Spielfläche → Auflösung
  MatchScaleBriefing.vue   InfoBox („match-scale“) + AwardBox
  MatchScaleBoard.vue      Spielfläche, Namen, HoldButton
  MatchScaleLegend.vue     Namen unter der Fläche — von Spielfläche und Auflösung geteilt
  ScaleField.vue           Raster, Bodenlinie, A, B, Zoom — von Spielfläche und Auflösung geteilt
  gestures.ts              Ziehen, Skalieren, Zoomen — rein, ohne DOM
  draft.ts                 Zwischenstand (Lage und Faktor von B, Zoom)
  MatchScaleReveal.vue
  MatchScaleScoreboard.vue + scoreboard.ts
  types.ts                 Payload, Lösung, Outcome, Tipp — defensiv eingeengt
```

### Spielfläche

```
┌──┬──┬──┬──┬──┬──┬──┐
├──┼──┼──┼──┼──┼──┼──┤
├──┼──┼──┼──┼──┼──┼──┤
├──┼▟▙┼──┼──┼─▟▙┼◢─┤                     ← Griff oben rechts an B
├─▐██▌──┼──┼▐██▌┼──┤
├──┼▀▀┼──┼──┼─▀▀┼──┤
══════════════════════                   ← Bodenlinie
├──┼──┼──┼──┼──┼──┼──┤
└──┴──┴──┴──┴──┴──┴──┘                   ← 2 Kästchen bis zum Rand
● Beispiel A                             ← Namen unter der Fläche, untereinander,
  Silhouette: Beispielkünstler, CC BY       in A- bzw. B-Farbe; Credit in Zeile zwei
● Beispiel B
  Silhouette: …
[ ███ halten zum Abgeben ]
```

- **Raster** aus feinen Linien, quadratische Kästchen, etwa **9 Kästchen hoch**. **Bodenlinie** 2 Kästchen
  über dem unteren Rand.
- **A und B starten nebeneinander auf der Bodenlinie, gleich groß** (längste Seite gleich); A links. Die
  Startgröße wählt der Bauende im Labor.
- **Zwei Farben.** Die Silhouetten sind deckend, ohne Transparenz. Die Namen stehen **unter** der
  Fläche, A über B, jeweils in der Farbe ihres Objekts; darunter klein die Attribution. Welche zwei
  Farben: Labor.
- **B verschieben:** Ziehen auf B bewegt B frei über die Fläche, auch **über A** — B liegt immer oben.
- **B skalieren:** Ziehen am **Griff oben rechts**. **Unten links bleibt fest.** Der Griff ist ein sichtbarer
  Knopf von mindestens 44 px, der über die Ecke hinausragt — bei kleinem B ist er größer als B selbst.
- **Zoomen:** zwei Finger auf der Fläche. Ein Finger auf leerer Fläche verschiebt die Ansicht.
- **Raster beim Zoomen:** offen, entschieden am Handy im Labor. Kandidaten: Raster fest am Bildschirm;
  Raster in Weltmaß, das mitzoomt (droht beim Herauszoomen zum Brei, beim Hineinzoomen zu leer zu werden);
  Weltmaß mit Stufen, bei denen Linien sich verdoppeln oder ausdünnen.
- **Zwischenstand** wie bei Verrohrung: Lage, Faktor, Zoom gesichert, wiederhergestellt, nach dem Tipp
  gelöscht.

### Auflösung

B wächst oder schrumpft von unten links aus auf den wahren Faktor; der eigene Tipp bleibt als
gestrichelter Umriss stehen. Takt nach `revealChoreography.ts`. Ein anderer Name in der Rangliste ist ein Knopf und zeigt dessen Umriss;
nochmal tippen hebt auf.

Unter der Fläche dieselben Namen wie beim Spielen, hinter jedem sein Maß aus der Lösung („Beispieltier
· 200 cm Kopf-Rumpf“), die Attribution in Zeile zwei. Vor dem Tipp kein Maß: gespielt wird nur das
Verhältnis.

**Eine Einheit je Runde.** Die größte aus mm, cm, m, km, in der das kleinere der beiden Maße noch
≥ 10 ist (Tiere: cm, Länder: km); alle Werte ganzzahlig darin, nie ein Komma. A und B stehen in
derselben Einheit, im Fließtext direkt an der Zahl. Pure `units.ts`.

Die Namenszeile bricht nie um, der Name wird notfalls gekürzt: so ist der Block beim Spielen und in
der Auflösung gleich hoch, nichts springt.

**Zählton.** Während B wächst, zählt ein kurzer Sinus-Tick hoch (B schrumpft: runter), je Tick 0,7
Halbtöne, so viel wie ein Schritt in B's Größe — B ×2 ≈ eine Oktave, höchstens 26 Ticks. Takt 58 ms,
gegen Ende bremsend. B's Wachstum folgt den Ticks (CSS `linear()`); die Zeilen der Rangliste warten,
bis B angekommen ist. 70 ms nach dem letzten Tick der Abschluss: Dur-Arpeggio bei Treffer, tiefer
Schnarrton daneben. Phase eins: Toleranz; Phase zwei: ich halte gerade die Punkte (vorläufig vorn).
Ohne eigenen Tipp kein Ton.

### Rangliste

Spalten **Name** (Knopf) **· Tipp · Abstand · Pkt**, Sortierung Punkte absteigend, dann
Abweichung aufsteigend, `userId` als Tiebreak. Pure `scoreboard.ts`.

Alles als Länge von B in der Einheit der Runde. Linear skaliert ist der Tipp
`b.metres × scale / factor`. Tipp „160“; Abstand = Tipp − Lösung, mit Vorzeichen: „−40“, „+50“,
„±0“ (aus den gerundeten Werten, so geht die Zeile auf). Darüber die Kopfzeilen „Lösung“ („200“) und
„Toleranz“ („160–250“, `round(b ÷ 1,25)` bis `round(b × 1,25)`, nur Phase eins). In den Zellen keine
Einheit: „Tipp*“ und „Abstand*“ tragen einen Stern, unter der Tabelle „* in cm“. Ganzzahlen rechtsbündig
in Tabellenziffern stehen von selbst untereinander.

Fehlt B's Maß, bleibt es beim Faktor mit zwei Nachkommastellen („1,90×“, „1,46× ↓“, „1,25×“), Kommas
untereinander, ohne Stern.

Jede Zeile blendet ihren Umriss für sich ein und aus; der eigene ist zu Beginn an.

## Labor

`match-scale` / „Augenmaß“ in `labGameList` und `registry`. Der Phasenschalter zeigt beide Gesichter, der
Seed macht Paar und Kategorie reproduzierbar. Gestimmt werden hier: Startgröße, Farben, Zoomgrenzen,
Raster beim Zoomen.

## Tests

**Kotlin**

- **Loader:** gültige Datei; je ein Fehlerfall pro mechanischer Prüfung; Kategorie ohne ziehbares Paar
  ausgelassen; Beispieldatensatz unter `production`/`staging` → Startabbruch.
- **Ziehung:** Faktor immer in [1/10, 10]; A ≠ B; beide aus derselben Kategorie; nur `presentation`
  bewegt sie; `toleranceFactor` aus der Phase.
- **Wertung:** `scale == factor` → 0; doppelt und halb gleich weit; Grenze ln 1,1 in Phase eins; Phase
  zwei qualifiziert alles; 0, negativ, `NaN`, unendlich, fehlendes Feld → `InvalidGuessException`.
- **Ausgänge:** Feldmengen-Tests für Payload, Lösung, Outcome — `factor`, `metresPerUnit` und
  `measure`/`metres` nie im Payload.
- `LabPointsParityTest` bleibt grün.

**Vitest**

- `gestures.ts`: Skalieren hält unten links fest; Verschieben ändert den Faktor nicht; Zoom ändert weder
  Lage noch Faktor in Weltmaß.
- `scoreboard.ts`, `types.ts` (Einengen, `NaN` und ≤ 0 fallen raus), Zwischenstand.
- Spielfläche: Halten schickt `{ scale }` mit dem aktuellen Faktor.

**Skript:** keine automatischen Tests — Prüfseite.

## Bewusst nicht

- **Beinfreiheit und andere Kategorien mit eingebautem Bezug** — siehe *Kategorien*.
- **Bauwerke von oben.**
- **Verhältnisse über 10×.**
- **Transparenz** von B.
- **Namen verstecken.**
- **Zeitwertung.**

## Dem Bauenden überlassen

- Natural-Earth-Maßstab, Schwelle für Teile eines Landes, Vereinfachungs-Toleranz — entschieden auf der
  Prüfseite.
- SVG-Parsing für PhyloPic, und ob das Skript dafür eine Abhängigkeit braucht.
- Startgröße, Farben, Zoomgrenzen, Verhalten des Rasters beim Zoomen — im Labor am Handy.
- Gültigkeitsbereich für `scale` über „endlich und > 0“ hinaus.
