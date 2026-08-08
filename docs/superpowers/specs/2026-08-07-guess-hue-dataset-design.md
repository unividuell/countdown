# Guess Hue — das Datenset

**Status:** beschlossenes Design (2026-08-07).

**Portiert aus:** `huettehuette.unividuell.org`, `components/games/guessColor/GuessColorGame.vue`
(dort `GameType.GuessColor`). Die Beschreibungen werden **nicht** übernommen — das Datenset
entsteht neu.

**Berührt:** ein künftiges Spielmodul im Backend und dessen Deployment. Keine Migration, kein
Frontend-Code. Dieser Spec beschreibt **nur die Form und die Regeln** des Datensets, nicht den
Spielrahmen — und **nicht seinen Inhalt**, siehe *Ablage und Übergabe*.

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
  Rad sichtbar. Eine Beschreibung, die Wörter auf „dunkel" oder „blass" verwendet, verschenkt sie.
- **Toleranz ±10°** (20° Gesamtfenster), in Phase 2 des Countdowns aufgehoben. Distanz auf dem
  Kreis: `min(|a−b|, 360−|a−b|)`.
- Ein Guess pro Spieler und Runde, per langem Druck bestätigt.

±10° ist eng. „Violett" allein spannt gut 40° — die Schreibregel unten existiert genau deshalb.

## Der Datensatz

Englische Keys, deutsche Texte. Drei Felder, mehr nicht:

```yaml
entries:
  - hue: 0
    difficulty: easy
    description: >-
      Beispieleintrag Alpha, kein Spielinhalt. Er steht praktisch auf dem
      reinen Rot, keinen Fingerbreit daneben.
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `hue` | `Int`, `[0,360)` | **Nominaler** Farbwinkel. Nicht der Zielwert der Runde. |
| `difficulty` | `easy` \| `medium` \| `hard` | Autoren-Metadatum. Siehe unten. |
| `description` | `String` (de) | Der Text, den der Spieler sieht. |

**Kein Hex, keine Sättigung, keine Helligkeit.** Die entstehen pro Runde (siehe *Die Runde*). Ein
Eintrag ist eine Farb*familie*, kein Farbwert.

## Die Zweitakt-Regel

Der Kern des Datensets. Beim Schreiben der ersten Beispiele fiel auf, dass jede brauchbare
Beschreibung aus **zwei Takten** besteht:

- **Takt 1 — der Anker.** Ein Gegenstand, eine Szene, eine Erzählung. Er setzt die Farbe grob und
  trägt den ganzen Charme. Er steht immer.
- **Takt 2 — die Kalibrierung.** Er nennt einen benachbarten Farbnamen und die Richtung, in die
  sich die Zielfarbe von ihm entfernt hat. Er ist mechanisch, kein bisschen poetisch, und er ist
  der Grund, warum ±10° überhaupt erreichbar sind.

Die Schwierigkeit steckt **im zweiten Takt, nicht in der Farbe**. Das ist die zentrale Entscheidung
dieses Specs. Der Grund ist, dass die Farbe sich nicht steuern lässt: 240° kann man nicht schwer
machen, Blau kennt jeder, und Gelbgrün wird nicht leicht, egal wie gut der Text ist. Steuerbar ist
nur, wie viel Kalibrierung darüber liegt.

| `difficulty` | Was Takt 2 leistet | Muster |
| --- | --- | --- |
| `easy` | Nachbar **+** Richtung **+** Maß | „…keinen Fingerbreit neben dem reinen Rot." |
| `medium` | Nachbar **+** Richtung, ohne Maß | „…auf der grünen Seite von reinem Gelb, nicht auf der orangen." |
| `hard` | entfällt — nur Takt 1 steht | — |

**Das Maß ist der Arbeitsschatz der leichten Stufe, nicht der Nachbar.** Ein benannter Nachbar
allein hilft kaum; erst die Schlussformel („aber wirklich nur einen Hauch") schließt das Fenster.
Ein Eintrag ohne sie ist nicht `easy`, egal wie viele Nachbarn er nennt.

### Nicht jede Farbe kann jede Stufe

Eine Einschränkung, die beim Schreiben auffiel und die man beim Auffüllen des Datensets kennen
muss:

- **Namenlose Zonen können nie `easy`.** Im Gelbgrün und im Grün-Türkis gibt es keinen Farbnamen,
  den Takt 2 benennen könnte. Diese Hues sind `medium` oder `hard`, nie leicht.
- **Kanonische Anker können kaum `hard`.** Rund um reines Blau landet jeder Anker unweigerlich bei
  „Blau" — und damit ist der Spieler bereits fast in der Toleranz, auch ohne Takt 2.

Die Verteilung im Datenset trägt das: Sektoren mit starken Ankern an beiden Rändern führen zwei
`easy`, namenlose Sektoren nur eines oder keines.

### Register

Vier Register, frei gemischt. Sie betreffen ausschließlich Takt 1.

| | Register | Muster |
| --- | --- | --- |
| **A** | Objektanker | ein Gegenstand, den jeder schon in der Hand hatte |
| **B** | Szene / Licht | ein Moment, eine Tageszeit, ein Lichtverhältnis |
| **D** | Nachbarschaft | die Farbnachbarn direkt benannt, ohne Gradzahl |
| **E** | Erzählung | eine kleine Geschichte, an deren Ende die Farbe steht |

Bewusst verworfen wurde ein fünftes Register, **Synästhesie** („klingt nach Kontrabass, schmeckt
nach Heidelbeere"). Es liest sich am besten und ist praktisch unratbar: drei Anker, die alle in
dieselbe vage Richtung zeigen, ohne dass einer kalibriert.

## Verteilung

60 Einträge, **12 Sektoren à 30°, je fünf** — so entsteht keine Lücke auf dem Farbkreis und keine
Häufung. Innerhalb eines Sektors liegen die Nominalwerte rund 6° auseinander.

20 Einträge je `difficulty`, ungleich über die Sektoren verteilt, weil nicht jeder Sektor jede
Stufe tragen kann (siehe oben).

## Die Runde

Deterministisch aus `(communityId, round)` — server-autoritativ, per Seed aus der
[RNG-Spec](2026-08-02-cross-runtime-rng-design.md). Reihenfolge der Ziehungen ist Teil des
Vertrags:

```
entry    = dataset[ rnd.nextInt(dataset.size) ]          // gleichverteilt über alle 60
targetH  = wrap360( entry.hue + rnd.nextDouble(-5.0, 5.0) )
sat      = rnd.nextDouble(0.50, 0.78)
light    = rnd.nextDouble(0.38, 0.52)
initH    = rnd.nextDouble(0.0, 360.0)                    // unabhängig vom Ziel
```

**Keine Schwierigkeitsprogression.** Der Eintrag wird gleichverteilt über alle 60 gezogen; die
Stufen fallen im Verhältnis der Datenlage, also etwa gleich oft. Die Dramaturgie des Countdowns
trägt allein die Wertungsumstellung in Phase 2. Damit liest zur Laufzeit **niemand** das Feld
`difficulty` — es ist reines Autoren-Metadatum und existiert, um die Zweitakt-Regel prüfbar zu
machen.

### Warum der Nominalwert jittert

Der Jitter ist keine Kosmetik, er ist die einzige Verteidigung, die eine kuratierte Liste im
laufenden Betrieb hat.

Guess Hue überträgt in einer einzelnen Runde kein Geheimnis: Beschreibung, Sättigung und Helligkeit
dürfen vollständig zum Client, ohne die Lösung zu verraten. Über **viele** Runden hinweg gilt das
nicht mehr — wer 60 Runden mitschreibt, besitzt die vollständige Tabelle *Beschreibung → Hue*.
Dafür braucht es kein Skript, ein Ordner mit Screenshots reicht.

`±5°` macht diese Tabelle unzuverlässig, ohne den Text zu entwerten: sie führt in die
Nachbarschaft, aber nicht auf den Punkt, und bei ±10° Toleranz reicht sie nicht mehr sicher für
Punkte. Umgekehrt bleibt ein perfekter Leser, der den Nominalwert trifft, immer innerhalb der
Toleranz — weil der Jitter kleiner ist als sie. **Diese Ungleichung ist der Grund für die 5, und
sie muss erhalten bleiben**, falls die Toleranz je verändert wird.

Nebeneffekt: dieselbe Beschreibung fühlt sich beim zweiten Auftreten nicht identisch an, weil auch
`sat` und `light` neu gezogen werden. Das dehnt die 60 Einträge spürbar.

### Warum die Startfarbe unabhängig gezogen wird

`initH` ist der Winkel, auf dem das Rad steht, bevor der Spieler es dreht. Naheliegend wäre, ihn
garantiert weit vom Ziel zu setzen — das wäre ein Fehler: eine Startfarbe, die *immer* mindestens
60° entfernt liegt, verrät, dass das Ziel in diesen 120° **nicht** liegt, und schneidet den
Suchraum von 360° auf 240°.

Also gleichverteilt und unabhängig. Dass der Start gelegentlich nahe am Ziel landet, ist Glück —
und für alle dasselbe Glück, was der Fairness-Grundlage aus der
[Anti-Cheat-Spec](2026-08-02-anti-cheat-design.md) genügt.

### Was der Client bekommt

Beschreibung und Startfarbe (`initH`, `sat`, `light` als Hex). **Nie** `targetH`, auch nicht
abgeleitet, bis die Runde ausgewertet wird.

Der Korridor `S 50–78 % · L 38–52 %` ist kein Geschmacksurteil: darüber und darunter wird der
Farbton auf dem Rad schwer unterscheidbar. Ein sehr dunkles oder ausgewaschenes Ziel macht das
Spiel nicht schwerer, sondern zufälliger.

## Ablage und Übergabe

Das GitHub-Repository muss öffentlich bleiben (kostenfreie GHA-Runner). **Die 60 Einträge sind
damit selbst ein Geheimnis** — nicht wegen einer einzelnen Runde, sondern weil die vollständige
Liste die Lösung aller Runden ist.

### Die harte Regel

**Der Klartext des Datensets erscheint nirgends im Repository.** Nicht in diesem Spec, nicht in
einem Plan, nicht in einer Commit-Message, nicht in einer PR-Beschreibung, nicht in einer
Test-Fixture. Auch nicht in einem Commit, der später wieder zurückgenommen wird — Git vergisst
nichts, und ein einmal gepushter Blob ist öffentlich, selbst wenn kein Branch mehr auf ihn zeigt.

Diese Regel entstand teuer: der erste Entwurf dieses Specs enthielt alle 60 Einträge als Tabelle
und war damit exakt das Leck, gegen das der Rest des Kapitels argumentiert.

### Der Weg eines Eintrags

| Schritt | Ort | Versioniert? |
| --- | --- | --- |
| 1. schreiben / ändern | `.local/guess-hue-dataset.yaml` (gitignored) | nein |
| 2. prüfen | Skript gegen die Pufferdatei, Regeln unten | — |
| 3. verschlüsseln | `sops -e` → `guess-hue-dataset.sops.yaml` | **ja**, verschlüsselt |
| 4. ausrollen | `update.sh` entschlüsselt auf den Server | nein |

`.local/` liegt im **Haupt-Checkout**, nicht in einem Worktree — Worktrees sind temporär, und mit
ihnen verschwände die einzige Klartextkopie. Die Pufferdatei ist jederzeit aus der verschlüsselten
Fassung reproduzierbar (`sops -d`); sie ist ein Durchgangsposten, kein Original.

Dieselbe Pufferdatei ist auch der **lokale Opt-in-Pfad**: wer am Spiel arbeitet, entschlüsselt sie
(`scripts/guess-hue-dataset.sh decrypt`) und zeigt `GUESS_HUE_DATASET_PATH` darauf, um vor dem
Deployen mit den echten 60 statt dem Sechs-Einträge-Sample zu arbeiten. Das bleibt bewusst opt-in,
kein Default: den age-Key braucht nicht jeder, und jeder zusätzliche Klartext auf einem weiteren
Rechner wäre der Preis eines Standard-Opt-ins.

### Ablage im Betrieb

| Ort | Inhalt |
| --- | --- |
| `deploy/guess-hue-dataset.sops.yaml` | die echten 60, SOPS-verschlüsselt gegen age-Keys |
| `core/src/main/resources/guess-hue-dataset.sample.yaml` | sechs offensichtlich unechte Einträge, im Classpath |
| Server, außerhalb des Repos | der **eigene** private age-Key des Servers |
| `GUESS_HUE_DATASET_PATH` | Pfad auf die entschlüsselte Datei |

Die Asymmetrie ist beabsichtigt: das Beispiel **soll** in den Classpath, es ist der Fallback. Das
verschlüsselte Datenset soll es nicht — im Jar wäre es totes Gewicht. `deploy/` ist ohnehin das
Verzeichnis, aus dem `update.sh` alles zieht, was der Server braucht.

Der Server bekommt ein eigenes Schlüsselpaar, keine Kopie des Autoren-Schlüssels: getrennte
Lebenszyklen, denn der Autoren-Schlüssel gehört nicht auf eine exponierte Maschine — bei einer
Kompromittierung müsste sonst alles rotiert werden, nicht nur der Server. Sein öffentlicher Teil
wird zweiter Empfänger in `.sops.yaml` (siehe unten für den Vorbehalt zum Entzug); Details zur
Einrichtung stehen in [`deploy/README.md`](../../../deploy/README.md).

`update.sh` entschlüsselt beim Deployment in einen Pfad, den das Compose-File mountet. **Kotlin
weiß nichts von SOPS** — das Backend liest schlichtes YAML von einem Pfad, ohne Krypto-Bibliothek
und ohne Schlüsselverwaltung im Anwendungscode. Die Verschlüsselung ist vollständig eine
Deployment-Angelegenheit.

CI braucht den Schlüssel nie: die Tests laufen gegen das Beispiel-Datenset. Damit bleibt auch ein
Fork-PR grün, dem GitHub grundsätzlich keine Secrets gibt.

SOPS verschlüsselt gegen **mehrere Empfänger** — jeder Berechtigte entschlüsselt mit seinem eigenen
privaten Key, aufgenommen wird jemand durch einen Eintrag in `.sops.yaml` und ein
Neu-Verschlüsseln. Ein Commit, reviewbar. Was das Verfahren **nicht** kann: Entzug wirkt nicht
rückwirkend. Wer einmal Empfänger war, kann jeden Stand der Git-History entschlüsseln — jemanden
entfernen heißt deshalb immer auch, den Inhalt neu zu würfeln.

### Das Beispiel-Datenset

Liegt im Klartext im Repo, weil es keinen Spielinhalt enthält. Es dient den Tests und macht
sichtbar, wie ein Eintrag aussieht:

```yaml
entries:
  - hue: 0
    difficulty: easy
    description: >-
      Beispieleintrag Alpha, kein Spielinhalt. Er steht praktisch auf dem
      reinen Rot, keinen Fingerbreit daneben.
  - hue: 60
    difficulty: medium
    description: >-
      Beispieleintrag Beta, kein Spielinhalt. Er liegt auf der grünen Seite von
      reinem Gelb, nicht auf der orangen.
  - hue: 120
    difficulty: hard
    description: Beispieleintrag Gamma, kein Spielinhalt.
  - hue: 180
    difficulty: easy
    description: >-
      Beispieleintrag Delta, kein Spielinhalt. Er sitzt so dicht am reinen
      Türkis, dass daneben nichts mehr passt.
  - hue: 240
    difficulty: medium
    description: >-
      Beispieleintrag Epsilon, kein Spielinhalt. Er liegt auf der violetten
      Seite von reinem Blau, nicht auf der türkisen.
  - hue: 300
    difficulty: hard
    description: Beispieleintrag Zeta, kein Spielinhalt.
```

### Fail-Fast

Startet die Anwendung außerhalb des `dev`-Profils und hat das Beispiel-Datenset geladen (weil
`GUESS_HUE_DATASET_PATH` fehlt oder ins Leere zeigt), **bricht sie ab**. Ein versehentlich
ausgeliefertes Beispiel ist schlimmer als ein nicht startender Container: das Spiel wäre still und
leise kaputt, ohne dass es jemandem auffällt.

## Validierung

Alles davon ist mechanisch prüfbar — die Zweitakt-Regel ist damit kein Geschmacksurteil, sondern
eine Zusicherung. Die Regeln laufen an drei Stellen: als Skript gegen die Pufferdatei beim
Schreiben, in der Testsuite gegen das Beispiel, und beim Start der Anwendung gegen die geladene
Liste.

**Nur für das Produktions-Datenset:**

1. **Vollständigkeit** — genau 60 Einträge; je 20 pro `difficulty`; jeder 30°-Sektor genau 5.

**Für jede geladene Liste, auch das Beispiel:**

2. **`hue`** — ganzzahlig, `[0,360)`, über alle Einträge eindeutig.
3. **Takte** — `hard` hat genau einen Satz, `easy` und `medium` mindestens zwei.
4. **Maß** — jede `easy`-Beschreibung enthält mindestens ein Wort aus der Maßliste:
   *Hauch · Fingerbreit · Handbreit · Drittel · Hälfte · Schritt · kaum · knapp · praktisch ·
   dicht*.
5. **Kein Winkel im Text** — keine Beschreibung enthält eine Gradangabe oder überhaupt eine Ziffer.
   Der Text malt aus, er rechnet nicht vor.

Regel 4 ist bewusst grob. Sie kann einen schlechten Text nicht erkennen, aber sie fängt den
häufigsten Fehler: einen als `easy` markierten Eintrag, dem der Schlussformel-Takt fehlt.

Was **keine** Regel fangen kann, ist Monotonie über die Liste hinweg. Beim ersten Durchgang begannen
19 der 20 `hard`-Einträge mit derselben Wendung — jeder für sich gültig, zusammen ein Formular. Das
bleibt Lesearbeit von Hand.

## Bewusst nicht in diesem Spec

Der **Spielrahmen** — Modulith-Modul, Schema, Rundenpersistenz, Guess-Endpunkt, Punkteberechnung,
Vue-Komponente, Farbrad. In [anti-cheat-design.md](2026-08-02-anti-cheat-design.md) ist die Frage
„eigenes `game`-Modul, Schema, Migrationen?" ausdrücklich als offen markiert; sie bekommt einen
eigenen Spec.

Ebenfalls offen: **wie das Punktesystem aus dem Abstand Punkte macht.** Das Original hat dafür
einen eigenen Rechner (`useGamePointsCalculator`) mit einer Phasenlogik; er wird beim Punkte-Spec
portiert, nicht hier.

## Verhältnis zur Anti-Cheat-Randbedingung

[anti-cheat-design.md](2026-08-02-anti-cheat-design.md) führte als „nicht verhandelbar", dass
Inhalte zur Spielzeit **prozedural** entstehen müssen. Guess Hue kollidierte damit frontal: eine
gute Farbbeschreibung ist von Hand geschrieben, sonst ist sie keine gute Beschreibung.

Die Kollision hat die Regel korrigiert, nicht das Spiel. Gemeint war nie das Verfahren, sondern die
Kostenstelle: **wiederkehrender** Admin-Aufwand je Runde ist das Problem, **einmaliger** je
Spieltyp war nie eines — irgendwer stellt immer etwas bereit. Die Randbedingung ist am 2026-08-07
entsprechend neu formuliert, und die Content-Pipeline darf seither **erzeugen oder auswählen**.

Damit erfüllt Guess Hue sie: 60 Einträge einmal geschrieben, danach kostet keine Runde mehr etwas.
Der Seed zieht den Eintrag, jittert den Winkel und würfelt Sättigung und Helligkeit — die
Zusammenstellung passiert zur Spielzeit, genau wie bei einem Generator.

Erwogen und verworfen wurde trotzdem eine Hybridform: kuratierte Anker je Sektor plus ein aus der
Distanz **berechneter** Takt 2. Sie hätte auch die alte, strenge Fassung erfüllt und beliebig viele
Texte erzeugt — zum Preis eines maschinell klingenden zweiten Takts. Nach der Korrektur der Regel
gibt es keinen Grund mehr, diesen Preis zu zahlen.
