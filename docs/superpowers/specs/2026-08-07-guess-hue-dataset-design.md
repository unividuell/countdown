# Guess Hue — das Datenset

**Status:** beschlossenes Design (2026-08-07), grundlegend überarbeitet (2026-08-16).

**Portiert aus:** `huettehuette.unividuell.org`, `components/games/guessColor/GuessColorGame.vue`
(dort `GameType.GuessColor`). Seit der Überarbeitung werden die Beschreibungen des Originals
**übernommen**, nicht ersetzt — siehe *Bestand und Herkunft*.

**Berührt:** das Spielmodul `guesshue` im Backend und dessen Deployment. Keine Migration, kein
Frontend-Code, kein Wire-Vertrag. Dieser Spec beschreibt **nur die Form und die Regeln** des
Datensets, nicht den Spielrahmen — und **nicht seinen Inhalt**, siehe *Ablage und Übergabe*.

## Zweck

Das erste portierte Mini-Spiel. Ein Text malt eine Farbe mit Worten aus, der Spieler dreht ein
Farbrad, bis er sie getroffen zu haben glaubt. Gewertet wird der Abstand auf dem Farbkreis.

## Namen

| Ebene | Name |
| --- | --- |
| Enum | `GameType.GuessHue` |
| Slug / Route | `guess-hue` |
| Anzeigename (de) | **Farbausmalung** |

`GuessColor` war zu allgemein: es wird weitere Spiele geben, die mit Farbe arbeiten. `GuessHue`
benennt exakt, was der Spieler tut — er rät einen Winkel, nicht eine Farbe. Sättigung und
Helligkeit bekommt er geschenkt.

„Farbausmalung" ist der Originalname und bleibt. Der Doppelsinn („sich etwas ausmalen" = mit Worten
schildern / „ausmalen" = Farbe auftragen) trägt nach der Umbenennung eher besser als vorher:
**der Bezeichner beschreibt, was der Spieler tut, der Anzeigename, was das Spiel ihm gibt.**

## Die geerbte Mechanik (Kontext, nicht Scope)

Aus dem Original übernommen und hier nur festgehalten, weil das Datenset davon abhängt:

- Der Spieler verstellt **ausschließlich den Hue**. Sättigung und Helligkeit stehen fest und sind im
  Rad sichtbar — das gesamte Rad wird in ihnen gemalt, nicht nur die Zielfläche.
- **Toleranz ±10°** (20° Gesamtfenster), in Phase 2 des Countdowns aufgehoben. Distanz auf dem
  Kreis: `min(|a−b|, 360−|a−b|)`. Das Original spielte mit exakt derselben Toleranz
  (`useGamePointsCalculator.ts`, `20 / 2`).
- Ein Guess pro Spieler und Runde, per langem Druck bestätigt.

## Der Datensatz

Englische Keys, deutsche Texte:

```yaml
entries:
  - hue: 190
    saturation: 0.45
    lightness: 0.35
    generatedAt: 2026-08-16
    description: >-
      Beispieleintrag Alpha, kein Spielinhalt.
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `hue` | `Int`, `[0,360)` | **Nominaler** Farbwinkel. Nicht der Zielwert der Runde. |
| `saturation` | `Double`, `[0,1]` | Sättigung. Geht unverändert in die Runde. |
| `lightness` | `Double`, `[0,1]` | Helligkeit. Geht unverändert in die Runde. |
| `generatedAt` | Datum, `YYYY-MM-DD` | Wann der Eintrag entstand. Reine Autoren-Statistik. |
| `description` | `String` (de) | Der Text, den der Spieler sieht. |

**Ein Eintrag ist ein Farbwert, keine Farbfamilie.** Das ist die zentrale Korrektur vom 2026-08-16;
die Begründung steht im nächsten Kapitel.

**HSL, nicht Hex.** Das Frontend malt mit `hsl()`; ein Umweg über RGB könnte den Hue um Bruchteile
verschieben, und der Hue *ist* die Lösung. Beim Import aus dem Original wird der Hex-Wert einmalig
umgerechnet, danach ist HSL die Quelle.

**Keine `difficulty`.** Das Feld hatte außerhalb des Datenset-Moduls nie einen Konsumenten. Mit der
neuen Schreibregel wäre seine einzige ehrliche Bedeutung „nennt einen Farbnamen oder nicht" — und
das steht bereits im Text. Ein Feld, das dieselbe Aussage ein zweites Mal behauptet, kann nur davon
abdriften.

## Warum die Zweitakt-Regel verworfen wurde

Die erste Fassung dieses Specs schrieb vor, dass jede Beschreibung aus zwei Takten besteht: einem
poetischen Anker und einer mechanischen Kalibrierung („…liegt auf der orangen Seite von reinem Rot,
nicht auf der bläulichen"). `difficulty` steuerte, wie viel Kalibrierung darüber lag, und ein
Validator prüfte die Regel.

Im Spiel war das Ergebnis eindeutig: **der zweite Takt entwertet den ersten.** Der Spieler liest die
Kalibrierung, orientiert sich ausschließlich an ihr und braucht den Anker nicht mehr. Der Mohn, der
Backstein und der Kürbis waren Dekoration vor einer Gradangabe in Worten. Damit war weg, was das
Spiel im Original getragen hatte — die Diskussion in der Runde darüber, welche Farbe dieses Bild nun
eigentlich meint.

Die Ursache lag eine Ebene tiefer. Das Original speicherte je Eintrag einen **Hex-Wert**; sein Server
würfelte nur den Startwinkel des Rades neu (`[round].ts`), Sättigung und Helligkeit blieben die des
Eintrags. Deshalb konnten die Texte „ein **dunkles** Smaragdgrün", „ein **helles** Orange-Gelb" sagen
— es stimmte und war auf dem Rad zu sehen. Die erste Fassung dieses Specs hat S und L stattdessen pro
Runde aus einem engen Korridor gezogen. Damit verlor die Beschreibung ihr halbes Vokabular, und
schlimmer: ein Gegenstand hat charakteristische Sättigung *und* Helligkeit, also wurde das Bild
regelmäßig vom eigenen Rad widerlegt — Moos auf der Nordseite eines Grabsteins, gemalt in frischem
Mittelgrün.

Die Zweitakt-Regel war die Kompensation dieses Verlusts. Der Korridor war seine Ursache. Also fällt
beides, und S und L kommen zurück in den Eintrag.

Nebenwirkung, die in Kauf genommen wird: derselbe Eintrag sieht beim zweiten Auftreten identisch aus,
weil nichts mehr an ihm gewürfelt wird außer dem Jitter. Der Korridor hatte das kaschiert — um den
Preis, dass alle Runden einander glichen, weil sie alle aus demselben schmalen Korridor kamen.

## Die Schreibregel

Für **neu geschriebene** Einträge. Sie ersetzt die Zweitakt-Regel vollständig.

- **Ein Anker, ein bis zwei Sätze.** Ein Gegenstand, eine Szene, eine kleine Erzählung. Er trägt
  allein.
- **Der Farbname darf beiläufig fallen** — als Apposition im selben Satz, nie als eigener
  Kalibriersatz. Er ist die Kalibrierung, genau wie im Original; er darf nur nicht als Mechanik
  auftreten.
- **Verboten:** Richtungsangaben („auf der orangen Seite von"), Schlussformeln mit Maß („einen
  Fingerbreit Richtung Gelb"), Gradzahlen und Ziffern.
- **Erlaubt und erwünscht:** „dunkel", „blass", „kräftig", „stumpf". Seit S und L aus dem Eintrag
  kommen, stimmt es wieder.
- **Der Anker muss ein Gegenstand sein, dessen Farbe alle gleich benennen würden.** Das ist die
  schärfste Regel des Kapitels und die, an der die meisten Entwürfe scheitern. Ein Feuerlöscher ist
  rot, darüber streitet niemand. Ein Bauzaun, eine Krankenhausschale, eine Straßenlaterne, eine
  Anhängerplane, ein Schokoriegelpapier sind dagegen das, wofür sich der Hersteller in dem Jahr
  entschieden hat — der Text zeigt dann auf gar keine Farbe. Zwei verwandte Fehler fallen unter
  dieselbe Regel: **Nischenvokabular** (ein „Streckenposten" ist Motorsport) und **konstruierte
  Betrachtungsbedingungen** („gegen das Fenster gehalten", „wenn das Licht günstig steht"). Wer den
  Gegenstand nicht kennt oder ihn nie so gesehen hat, liest an einem leeren Bild vorbei.
- **Anker und Farbwert müssen zusammenpassen.** Der Gegenstand bestimmt nicht nur den Hue, sondern
  auch Sättigung und Helligkeit des Eintrags. Das ist die eigentliche Qualitätsregel — sie ersetzt
  vier mechanische.
- **Einträge ganz ohne Farbnamen bleiben die Ausnahme.** Sie sind der Gesprächsstoff, und das
  Original hat gezeigt, dass die Runde sie erträgt — aber sie sind wirklich schwer, und eine Liste,
  in der zu viele davon stehen, ist keine schwere Liste, sondern eine willkürliche. Ein paar pro
  Runde Schreibarbeit, nicht ein Drittel. *(Korrigiert am 2026-08-16 nach der ersten Durchsicht:
  die erste Fassung dieses Kapitels forderte grob ein Drittel. Von den vier namenlosen Einträgen
  des ersten Schwungs sind zwei sofort wieder aussortiert worden.)*

**Kein Raster, und keine Abdeckungspflicht.** Die erste Fassung verteilte 60 Einträge in zwölf
Sektoren zu je fünf, rund 6° auseinander; die Überarbeitung ersetzte das zunächst durch eine
Höchstlücke von 15°. Auch die ist gestrichen. Der Gegenstand hat den Hue, den er hat, und **eine
Lücke auf dem Kreis ist kein Mangel** — sie kostet niemanden etwas, während ein erzwungener Eintrag,
den es nur gibt, weil dort ein Loch war, jede Runde kostet, in der er gezogen wird. Die Vorschau
zeigt die Lücken weiterhin an; sie sind ein Hinweis, wo sich Schreiben lohnt, keine Vorgabe.

## Bestand und Herkunft

Das Datenset hat **keine feste Größe**. Nachlegen ist jederzeit möglich und kostet nichts als den
Text.

| Herkunft | `generatedAt` | Register |
| --- | --- | --- |
| aus `huettehuette` übernommen | `2024-03-03` | das historische, siehe unten |
| neu geschrieben | `2026-08-16` | die Schreibregel oben |

Absichtlich ohne Stückzahlen: die Liste wächst und schrumpft, und eine Zahl in einem Spec ist
spätestens nach der nächsten Durchsicht falsch. Wie viele Einträge je Kohorte tatsächlich geladen
sind, sagt die Startmeldung — siehe unten.

Die übernommenen Einträge folgen der Schreibregel **nicht** und werden nicht nachträglich daran
angepasst. Ihr Register ist ein anderes: Farbname mit Modifikator im ersten Satz, danach drei bis
vier Sätze Stimmung und Assoziation, rund 300 Zeichen. Genau diese Verschiedenheit ist der Grund für
die Übernahme — zwei Register nebeneinander geben dem Spiel mehr Abwechslung als eines allein, und
das historische hatte seine Fans.

Beim Import entfallen **zwei** der 78 Original-Einträge: ihr Text kam dort doppelt vor, bei zwei
verschiedenen Farbwerten, und die beiden Antworten lagen mehr als 40° auseinander (die Hues 112 und
306 sind gestrichen, ihre Zwillinge bei 63 und 264 bleiben). Derselbe Text mit zwei Antworten ist
kein Rätsel, sondern eine Falle. Zwei weitere Dubletten bleiben stehen, weil ihre Antworten 6° bzw.
10° auseinanderliegen und damit im selben Toleranzfenster.

### Was `generatedAt` ist und was nicht

Reine Autoren-Statistik: wann ein Eintrag entstand. **Es verlässt das Backend nie** — weder im
Payload noch in der Solution. Der Feldmengen-Test über `GuessHuePayload` hält es draußen.

Damit es nicht das Schicksal von `difficulty` teilt und unbemerkt verrottet, hat es genau einen
Leser: die bestehende Startmeldung in `GuessHueDatasetConfiguration` nennt zusätzlich die Kohorten,
älteste zuerst — `Guess Hue loaded N entries from … — X from 2024-03-03, Y from 2026-08-16`. Ein
Feld ohne Leser gehört in einen Kommentar, nicht ins Schema. Diese Zeile ist zugleich die einzige
Stelle, an der die aktuellen Stückzahlen stehen; kein Dokument wiederholt sie.

## Die Runde

Deterministisch aus `(communityId, round)` — server-autoritativ, per Seed aus der
[RNG-Spec](2026-08-02-cross-runtime-rng-design.md). Die Reihenfolge der Ziehungen ist Teil des
Vertrags:

```
entry    = presentation.pick(entries)
initH    = presentation.nextDouble() * 360.0        // unabhängig vom Ziel
targetH  = wrap360( entry.hue + solution.nextDouble() * 10.0 - 5.0 )
sat      = entry.saturation                          // nicht gezogen
light    = entry.lightness                           // nicht gezogen
```

Zwei Ziehungen weniger aus dem Presentation-Stream als in der ersten Fassung. Die **Zwei-Strom-Regel
bleibt unverändert** und ist der Grund, warum die Reihenfolge ein Vertrag ist: alles, was der Spieler
zu sehen bekommt, stammt aus `presentation`, das einzige Geheimnis der Runde — der Jitter — aus
`solution`. Ein Strom genügte nicht, und zwar nicht, weil ein veröffentlichter Wert zufällig die
Lösung sein könnte: `SeededRandom.nextDouble` veröffentlicht 53 Bit zweier aufeinanderfolgender
Wörter, und die Transition des Generators ist eine Bijektion — wenige veröffentlichte Doubles legen
den Zustand fest und erlauben, ihn **rückwärts** zu dem zu drehen, was derselbe Strom für die Lösung
gezogen hat.

Dass `sat` und `light` jetzt gar nicht mehr gezogen werden, macht die Trennung nicht schwächer,
sondern kürzer: was nicht aus einem Strom kommt, kann keinen verraten.

**Keine Schwierigkeitsprogression.** Der Eintrag wird gleichverteilt gezogen. Die Dramaturgie des
Countdowns trägt allein die Wertungsumstellung in Phase 2.

### Warum der Nominalwert jittert

Der Jitter ist keine Kosmetik, er ist die einzige Verteidigung, die eine kuratierte Liste im
laufenden Betrieb hat.

Guess Hue überträgt in einer einzelnen Runde kein Geheimnis: Beschreibung, Sättigung und Helligkeit
dürfen vollständig zum Client, ohne die Lösung zu verraten. Über **viele** Runden hinweg gilt das
nicht mehr — wer genug Runden mitschreibt, besitzt die Tabelle *Beschreibung → Hue*. Dafür braucht es
kein Skript, ein Ordner mit Screenshots reicht.

`±5°` macht diese Tabelle unzuverlässig, ohne den Text zu entwerten: sie führt in die Nachbarschaft,
aber nicht auf den Punkt, und bei ±10° Toleranz reicht sie nicht mehr sicher für Punkte. Umgekehrt
bleibt ein perfekter Leser, der den Nominalwert trifft, immer innerhalb der Toleranz — weil der
Jitter kleiner ist als sie. **Diese Ungleichung ist der Grund für die 5, und sie muss erhalten
bleiben**, falls die Toleranz je verändert wird.

### Warum die Startfarbe unabhängig gezogen wird

`initH` ist der Winkel, auf dem das Rad steht, bevor der Spieler es dreht. Naheliegend wäre, ihn
garantiert weit vom Ziel zu setzen — das wäre ein Fehler: eine Startfarbe, die *immer* mindestens 60°
entfernt liegt, verrät, dass das Ziel in diesen 120° **nicht** liegt, und schneidet den Suchraum von
360° auf 240°.

Also gleichverteilt und unabhängig. Dass der Start gelegentlich nahe am Ziel landet, ist Glück — und
für alle dasselbe Glück, was der Fairness-Grundlage aus der
[Anti-Cheat-Spec](2026-08-02-anti-cheat-design.md) genügt.

### Was der Client bekommt

Beschreibung, Startwinkel und die Sättigung/Helligkeit des Eintrags. **Nie** `targetH`, auch nicht
abgeleitet, bis die Runde ausgewertet wird. Und nie `generatedAt`.

**Kein Korridor.** Sättigung und Helligkeit dürfen den ganzen Bereich `[0,1]` annehmen. Die erste
Fassung schränkte sie auf `S 50–78 % · L 38–52 %` ein, damit der Farbton auf dem Rad gut
unterscheidbar bleibt. Das war nicht falsch — der Ring wird komplett in diesen Werten gemalt, ein
Eintrag bei `S 0.09` ergibt einen grauen Ring —, aber es war die Ursache der Monotonie, und das
Original ist jahrelang ohne diese Grenze gelaufen. Ein extremer Eintrag macht eine einzelne Runde
schwerer; ein Korridor macht alle Runden gleich.

Die Grenze verschwindet damit nicht, sie wechselt den Ort: **statt vom Code geklemmt zu werden,
wird ein unbrauchbarer Eintrag beim Durchsehen gestrichen.** Das ist keine Theorie — bei der ersten
Durchsicht am 2026-08-16 waren sechs der sieben aussortierten Alt-Einträge genau die, bei denen die
Vorschau „Ring fast grau" oder „Ring fast weiß" markiert hatte. Ein Klemmen im Code hätte sie
behalten und dabei ihren Text zur Lüge gemacht: ein blasses Graugrün, das auf einmal sattgrün
erscheint, beschreibt nichts mehr. Deshalb markiert die Vorschau diese Fälle, und deshalb
entscheidet sie ein Mensch.

## Ablage und Übergabe

Das GitHub-Repository muss öffentlich bleiben (kostenfreie GHA-Runner). **Die Einträge sind damit
selbst ein Geheimnis** — nicht wegen einer einzelnen Runde, sondern weil die vollständige Liste die
Lösung aller Runden ist. Das gilt auch für die übernommenen: `unividuell/huettehuette` ist ein
privates Repository, die Texte waren nie öffentlich.

### Die harte Regel

**Der Klartext des Datensets erscheint nirgends im Repository.** Nicht in diesem Spec, nicht in einem
Plan, nicht in einer Commit-Message, nicht in einer PR-Beschreibung, nicht in einer Test-Fixture.
Auch nicht in einem Commit, der später wieder zurückgenommen wird — Git vergisst nichts, und ein
einmal gepushter Blob ist öffentlich, selbst wenn kein Branch mehr auf ihn zeigt.

Diese Regel entstand teuer: der erste Entwurf dieses Specs enthielt alle Einträge als Tabelle und war
damit exakt das Leck, gegen das der Rest des Kapitels argumentiert.

### Der Weg eines Eintrags

| Schritt | Ort | Versioniert? |
| --- | --- | --- |
| 1. schreiben / ändern | `.local/guess-hue-dataset.yaml` (gitignored) | nein |
| 2. ansehen | lokale Wegwerf-Vorschau **außerhalb** des Repos | nein |
| 3. verschlüsseln | `sops -e` → `guess-hue-dataset.sops.yaml` | **ja**, verschlüsselt |
| 4. ausrollen | `update.sh` entschlüsselt auf den Server | nein |

`.local/` liegt im **Haupt-Checkout**, nicht in einem Worktree — Worktrees sind temporär, und mit
ihnen verschwände die einzige Klartextkopie. Die Pufferdatei ist jederzeit aus der verschlüsselten
Fassung reproduzierbar (`sops -d`); sie ist ein Durchgangsposten, kein Original.

Schritt 2 ersetzt den früheren Prüf-Testlauf: Ob ein Text trägt, ob Anker und Farbwert
zusammenpassen, ob die Liste den Kreis abdeckt — das sieht man, es lässt sich nicht behaupten. Die
Vorschau ist eine Wegwerf-Seite, die Farbfläche neben Text stellt, und sie entsteht außerhalb des
Repos, damit auf diesem Weg kein Klartext hineingerät.

Dieselbe Pufferdatei ist auch der **lokale Opt-in-Pfad**: wer am Spiel arbeitet, entschlüsselt sie
(`scripts/guess-hue-dataset.sh decrypt`) und zeigt `GUESS_HUE_DATASET_PATH` darauf, um vor dem
Deployen mit dem echten Datenset statt dem Sample zu arbeiten. `.claude/launch.json` tut das für den
lokalen Dev-Server automatisch, soweit die Maschine entschlüsseln kann.

### Ablage im Betrieb

| Ort | Inhalt |
| --- | --- |
| `deploy/guess-hue-dataset.sops.yaml` | das echte Datenset, SOPS-verschlüsselt gegen age-Keys |
| `core/src/main/resources/guess-hue-dataset.sample.yaml` | wenige offensichtlich unechte Einträge, im Classpath |
| Server, außerhalb des Repos | der **eigene** private age-Key des Servers |
| `GUESS_HUE_DATASET_PATH` | Pfad auf die entschlüsselte Datei |

Die Asymmetrie ist beabsichtigt: das Beispiel **soll** in den Classpath, es ist der Fallback. Das
verschlüsselte Datenset soll es nicht — im Jar wäre es totes Gewicht. `deploy/` ist ohnehin das
Verzeichnis, aus dem `update.sh` alles zieht, was der Server braucht.

Der Server bekommt ein eigenes Schlüsselpaar, keine Kopie des Autoren-Schlüssels: getrennte
Lebenszyklen, denn der Autoren-Schlüssel gehört nicht auf eine exponierte Maschine — bei einer
Kompromittierung müsste sonst alles rotiert werden, nicht nur der Server. Details zur Einrichtung
stehen in [`deploy/README.md`](../../../deploy/README.md).

`update.sh` entschlüsselt beim Deployment in einen Pfad, den das Compose-File mountet. **Kotlin weiß
nichts von SOPS** — das Backend liest schlichtes YAML von einem Pfad, ohne Krypto-Bibliothek und ohne
Schlüsselverwaltung im Anwendungscode. Die Verschlüsselung ist vollständig eine
Deployment-Angelegenheit.

CI braucht den Schlüssel nie: die Tests laufen gegen das Beispiel-Datenset. Damit bleibt auch ein
Fork-PR grün, dem GitHub grundsätzlich keine Secrets gibt.

SOPS verschlüsselt gegen **mehrere Empfänger** — jeder Berechtigte entschlüsselt mit seinem eigenen
privaten Key, aufgenommen wird jemand durch einen Eintrag in `.sops.yaml` und ein Neu-Verschlüsseln.
Ein Commit, reviewbar. Was das Verfahren **nicht** kann: Entzug wirkt nicht rückwirkend. Wer einmal
Empfänger war, kann jeden Stand der Git-History entschlüsseln — jemanden entfernen heißt deshalb
immer auch, den Inhalt neu zu würfeln.

### Das Beispiel-Datenset

Liegt im Klartext im Repo, weil es keinen Spielinhalt enthält. Es dient den Tests und macht sichtbar,
wie ein Eintrag aussieht; es deckt beide Register ab, damit beide Formen belegt sind. Seine Größe ist
Sache der Tests, die es als Fixture verwenden, und keine Aussage über das echte Datenset:

```yaml
entries:
  - hue: 0
    saturation: 0.72
    lightness: 0.45
    generatedAt: 2026-08-16
    description: Beispieleintrag Alpha, kein Spielinhalt.
  - hue: 120
    saturation: 0.30
    lightness: 0.62
    generatedAt: 2024-03-03
    description: >-
      Beispieleintrag Beta, kein Spielinhalt. Er steht hier stellvertretend für
      das längere historische Register und sagt über Farben nichts aus.
```

### Fail-Fast

Hat die Anwendung das Beispiel-Datenset geladen (weil `GUESS_HUE_DATASET_PATH` fehlt oder ins Leere
zeigt) **und** ist eines der deployten Profile aktiv — `production` oder `staging` — **bricht sie
ab**. Das ist eine Allow-List auf genau diese zwei Profile, keine Deny-List auf „alles außer `dev`" —
dieses Repo kennt kein `dev`-Profil; lokale Läufe und `@SpringBootTest` verwenden die namenlose
Default-Config (`application.yaml`). Ein versehentlich ausgeliefertes Beispiel ist schlimmer als ein
nicht startender Container: das Spiel wäre still und leise kaputt, ohne dass es jemandem auffällt.

## Validierung

Es gibt keinen Validator mehr. `GuessHueDatasetValidator` und die drei Tests, die ihn bedienten, sind
am 2026-08-16 gelöscht worden — zusammen mit den Regeln, die sie prüften: Satzzahl je `difficulty`,
Maßwortliste, Sektorquote, feste Gesamtzahl. Sie prüften Geschmack, und Geschmack lässt sich nicht
prüfen; was sie tatsächlich erzwangen, war das Formular, das dieser Überarbeitung zum Opfer gefallen
ist.

Was bleibt, ist **Parsen**, nicht Bewerten, und lebt im `GuessHueDatasetYamlReader`:

1. jedes Feld vorhanden und vom richtigen Typ,
2. `hue` in `[0,360)`, `saturation` und `lightness` in `[0,1]`,
3. `generatedAt` ein Datum (SnakeYAML liefert für ein unquotiertes `2024-03-03` ein
   `java.util.Date`, für ein quotiertes einen `String` — der Reader nimmt beides an und normalisiert
   auf `LocalDate`),
4. `description` nicht leer.

Jede Meldung nennt Herkunft und Position, weil die Datei beim Debuggen typischerweise nicht offen
auf dem Rechner liegt, sondern entschlüsselt auf einem Server.

Ob die Liste gut ist, entscheidet der Blick auf die Vorschau (Schritt 2 oben). Das ist keine
Verschlechterung gegenüber dem Validator: der konnte einen schlechten Text ohnehin nie erkennen, hat
aber den Eindruck erweckt, es täte jemand.

## Bewusst nicht in diesem Spec

Der **Spielrahmen** — Modulith-Modul, Rundenpersistenz, Guess-Endpunkt, Punkteberechnung,
Vue-Komponente, Farbrad. Er ist seit dem 2026-08-08 gebaut und hat eigene Specs
([Input](2026-08-08-guess-hue-input-design.md),
[Guesses-Übersicht](2026-08-09-guess-hue-guesses-overview-design.md)).

## Verhältnis zur Anti-Cheat-Randbedingung

[anti-cheat-design.md](2026-08-02-anti-cheat-design.md) führte als „nicht verhandelbar", dass Inhalte
zur Spielzeit **prozedural** entstehen müssen. Guess Hue kollidierte damit frontal: eine gute
Farbbeschreibung ist von Hand geschrieben, sonst ist sie keine gute Beschreibung.

Die Kollision hat die Regel korrigiert, nicht das Spiel. Gemeint war nie das Verfahren, sondern die
Kostenstelle: **wiederkehrender** Admin-Aufwand je Runde ist das Problem, **einmaliger** je Spieltyp
war nie eines — irgendwer stellt immer etwas bereit. Die Randbedingung ist am 2026-08-07 entsprechend
neu formuliert, und die Content-Pipeline darf seither **erzeugen oder auswählen**.

Damit erfüllt Guess Hue sie: die Einträge einmal geschrieben, danach kostet keine Runde mehr etwas.
Der Seed zieht den Eintrag und jittert den Winkel — die Zusammenstellung passiert zur Spielzeit,
genau wie bei einem Generator.
