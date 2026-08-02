# Anti-Cheat für die Mini-Spiele

**Status:** **Absichtserklärung / Brainstorming-Ergebnis** (2026-08-02) — *kein beschlossenes Design.*
Bewusst so: das Tragfähige daran lässt sich erst **konkret an einem Spiel** beurteilen. Dieses
Dokument ist die Grundlage, mit der wir in die Entwicklung des ersten Mini-Games gehen; was sich dort
als falsch erweist, wird hier korrigiert, nicht verteidigt.

**Baut auf:** dem `rng`-Modul ([Cross-Runtime-RNG](2026-08-02-cross-runtime-rng-design.md)) und der
server-autoritativen Countdown-/Runden-Engine
([Countdown Engine + Display](2026-06-14-countdown-engine-display-design.md)).
**Referenz:** `huettehuette.unividuell.org` — die Vorgänger-Implementierung, aus der die Spiele
portiert werden.

## Die Messlatte

Es geht **nicht** um Geld. Die Spiele sind zum Spaß, aber sie sind kompetitiv, und Cheater sind
Spielverderber. Die Hauptcommunity sind **Informatiker** — der erste Blick geht in den
Netzwerk-Verkehr.

Daraus die Zielformulierung, an der jede Maßnahme gemessen wird:

> **Nicht „unmöglich", sondern „nicht offensichtlich".** Dass man Farben mit einer Bildschirm-Pipette
> ausliest oder sich ein Skript schreibt, ist akzeptiert. Dass die Lösung als Feld im JSON steht oder
> mit drei Zeilen in der Konsole fällt, ist es nicht.

Und die zweite Hälfte, die aus der Zeitwertung folgt: **die Uhr ist die Verteidigung.** Weil ab dem
Start-Klick gemessen wird, muss das Ableiten der Lösung nicht unmöglich sein — es muss *länger
dauern als ehrliches Spielen*. Wer erst ein Skript schreibt, verliert gegen den, der hinschaut.

Der eigentliche Gegner ist damit präzise benannt: **kein billiges, wiederverwendbares
Extraktionsskript darf gewinnen.** Einmalaufwand amortisiert sich über Runden, Neugier nicht.

## Randbedingungen (vom Produkt entschieden, nicht verhandelbar)

- **Gleiche Runde für alle.** Jeder muss jede Runde **exakt gleich** spielen können — das ist die
  Fairness-Grundlage. Damit sind **Seeds pro Spieler ausgeschlossen**, obwohl sie technisch der
  billigste Schutz gegen Antwort-Teilen wären.
- **Komplett kompetitiv.** Punkte und Rangliste sind der Kern, nicht Beiwerk.
- **Lösungsweitergabe in der Gruppe ist außerhalb des Scopes.** Wird sozial geregelt („wer die Lösung
  teilt, wird von der Gruppe runtergemacht"). Kein technischer Aufwand dagegen.
- **Ein Guess pro Spieler pro Runde**, und bestimmte Spiele werden per **einmaligem, explizitem
  Start-Klick** begonnen; ab dann läuft die Zeitmessung (Find Pattern Phase 2). Beides ist in
  huettehuette bereits so umgesetzt und wird übernommen.
- **Kein Offline-Modus.** Latenzunabhängigkeit ist unkritisch. (Deshalb sind Runden
  server-autoritativ — siehe RNG-Spec.)

## Bedrohungsmodell

| # | Angriff | Einordnung |
|---|---|---|
| A | Lösung client-seitig aus dem Seed ableiten | **Zu schließen** — Kern des Fundaments |
| B | Lösung aus dem Netzwerk-Payload lesen | **Zu schließen** — die Messlatte |
| C | Manipuliertes Ergebnis einsenden („ich war korrekt / in 0,2 s") | **Zu schließen** — Server validiert |
| D | Mehrfach spielen, Bestes einsenden | **Geschlossen** — ein Guess pro Runde |
| E | Bot spielt perfekt (v. a. Reaktionsspiele) | **Nicht verhinderbar** — erkennen, nicht blockieren |
| F | Zeitmanipulation (Client-Uhr, Throttling) | **Zu schließen** — Server stempelt |
| G | Assets inspizieren (Dateinamen, Bilder) | **Teilweise** — Obfuskation, siehe Puzzle Scramble |
| H | Lösung in der Gruppe teilen | **Außerhalb des Scopes** — sozial geregelt |

## Der unangenehme Befund

**Eine Lösung, die aus dem Sichtbaren berechenbar ist, kann man nicht verstecken.**

Bei Find Pattern siehst du das Gitter und das Suchmuster — ein Skript kann das Gitter genauso
durchsuchen wie ein Mensch, ohne je einen Seed zu kennen. Seed verstecken hilft dort **null**.

Konsequenz: die Obergrenze ist **pro Spiel unterschiedlich**, und für einen Teil der Spiele lautet sie
„Aufwand erhöhen + auffällige Ergebnisse erkennen", nicht „verhindern". Wer das nicht akzeptiert,
investiert in Krypto, die das falsche Problem löst.

Daraus folgt die generelle Regel, die überall greift, wo überhaupt etwas zu holen ist:

> **Die lösungstragende Darstellung von *parsebar* nach *perzeptuell* verschieben.**
> Nicht `pattern: [7,1,2]`, sondern Pixel — und was sich hörbar entscheidet, als Samples statt als
> Werteliste.

Das trifft die Messlatte exakt: Pipette und CV-Skript sind erlaubt, `JSON.parse` nicht.

## Taxonomie — welches Geheimnis, welche Maßnahme

Der nützlichste Teil dieser Analyse. Jedes Spiel hat eine andere *Art* von Geheimnis, und daraus
folgt, wofür sich Komplexität lohnt:

| Art des Geheimnisses | Beispiel | Wirksame Maßnahme | Erreichbares Niveau |
|---|---|---|---|
| Die Lösung ist ein **Fakt** | eine Schätz-/Zuordnungsfrage, deren Antwort nur der Server kennt und die der Client nicht zum Rendern braucht | Server-only Seed + Server validiert | **vollständig** |
| Die Lösung ist ein **Zeitplan** | Deduster (Reaktion) | Zukunft nicht ausliefern, progressiv aufdecken | gut gegen Menschen, offen gegen Bots |
| Die Lösung liegt **im Sichtbaren** | Find Pattern, Puzzle Scramble | Darstellung perzeptuell machen + Erkennung | Aufwand erhöhen |
| **Präsentations-Zufall** | Sparkles, Animationen, Deko | keine | nicht nötig |

## Das generische Fundament

Spielunabhängig, überschaubar, und es deckt A–D und F ab. Das ist der Teil, den ich für belastbar
halte — er nutzt ausschließlich Bausteine, die es schon gibt.

### 1. Zwei Seeds, zwei Vertrauensniveaus

- **Hidden Seed** — server-only, pro Runde persistiert, treibt alles, was der Spieler nicht wissen
  darf. Er darf in **keinem** DTO-Typ vorkommen — *strukturell*, nicht per `@JsonIgnore`. Ein Feld,
  das es im Typ nicht gibt, kann kein Refactoring versehentlich wieder einbauen.
- **Presentation Seed** — darf ausgeliefert werden, treibt ausschließlich Kosmetik oder schon
  Öffentliches (Animations-Jitter, Deko-Anordnung).

Beide sind 32-bittig (JSON-Zahl-sicher, siehe RNG-Spec) und werden mit `SeededRandom` aus dem
`rng`-Modul expandiert.

### 2. Der Server leitet ab und validiert

Niemals `correct: true` vom Client glauben. Der Server rekonstruiert die Lösung aus dem Hidden Seed
und vergleicht. Das ist der Punkt, an dem sich die RNG-Arbeit auszahlt: **eine Runde ist jederzeit aus
ihrem Seed reproduzierbar**, es muss kein generierter Zustand gespeichert werden — kein Cache, keine
Lösungstabelle.

### 3. Payload erst beim Start-Klick

Die Rätseldaten entstehen bzw. gehen erst raus, wenn der Start-Request kommt. Vorher existiert im
Netzwerk-Log **nichts zu inspizieren**. Damit wird „in Ruhe vorher anschauen" zu „anschauen, während
die Uhr läuft".

*Wichtige Einschränkung:* das wirkt **nur bei zeitgewerteten Spielen**. Wo nicht auf Zeit gespielt
wird, kostet Inspizieren nichts und die Maßnahme ist wertlos.

### 4. Server-autoritative Zeitmessung

Der Server stempelt den Eingang des Start-Requests und den Eingang des Guess. Die Differenz ist die
Wertung; Client-Zeiten sind Anzeige. Die Runden-Engine liefert dafür schon absolute Instants.

### 5. Ein Guess pro Runde, server-seitig erzwungen

Unique-Constraint, First-write-wins. Nicht im Client prüfen.

### 6. DTO-Hygiene, testgestützt

Ein Test, der den **serialisierten** Payload prüft und fehlschlägt, wenn ein lösungsförmiges Feld
auftaucht. Kein Kommentar, keine Konvention — ein roter Test.

### 7. Commit–Reveal

Vor Rundenbeginn einen Hash veröffentlichen, nach Rundenschluss auflösen. Das schützt nicht gegen
Spieler, sondern **gegen den Betreiber** — und macht die Runde nachprüfbar fair.

Hier gibt es eine Variantenwahl mit einer nicht offensichtlichen Konsequenz:

- **(a) Commit auf die Lösung:** `SHA-256(solution || salt || roundId)`, Reveal von `solution`+`salt`.
  Verifikation ist reines Hashen — **kein RNG im Browser nötig**. Empfehlung für das erste Spiel.
- **(b) Commit auf den Hidden Seed:** Reveal des Seeds, jeder rechnet die ganze Runde nach. Mächtiger
  (prüft auch, dass das Rätsel selbst nicht manipuliert war), verlangt aber unseren Generator im
  Browser — und wäre damit **der erste echte Abnehmer für die TS-Referenzimplementierung**, die
  derzeit in Test-Scope liegt. Das ist ein legitimer Grund, sie zu fördern; Verifikations-Werkzeug,
  nicht Spiellogik.

### 8. Erkennung statt Härtung

Zwei Sorten Signal, bewusst getrennt:

- **Physikalisch unmöglich** — Reaktion unter ~120 ms, gelöst bevor die Assets geladen sein konnten,
  perfekte Sortierung in Nullzeit. Harte Grenzen, wenige Zeilen, kein Framework.
- **Auffällig relativ zur Runde** — weil alle *exakt dieselbe* Runde spielen, ist ein Ausreißer
  aussagekräftig. Die harte Fairness-Anforderung liefert die Erkennung also gratis mit.

*Ehrliche Einordnung:* bei ~15 Mitspielern ist die Statistik dünn. Die harten Grenzen tragen, der
relative Ausreißer ist ein **weiches Signal** — gut für ein sichtbares 🤨 neben dem Score, nicht für
automatische Disqualifikation. Bei einer Freundesgruppe muss man den Cheater nicht aussperren, man
muss ihn bemerken; den Rest erledigt die Gruppe.

## Pro Spiel: die kreativen Hebel

### Find Pattern

Wären `blocks[]` und `pattern[]` im Payload, wäre die Lösung ein Dreizeiler in der Konsole — genau
das, was nicht passieren soll. Das Gitter *muss* als Daten kommen (Interaktion, Animation), **das
Suchmuster nicht**.

→ **Suchmuster als server-gerendertes Bild ausliefern.** Der naive Subsequenz-Scan scheitert dann
schon an „wonach suche ich überhaupt", und der Aufwand springt auf Pixel-Extraktion. Server-seitig ein
winziges PNG, client-seitig ein `<img>`. Bestes Verhältnis von allen Maßnahmen hier.

→ `searchPatternStartIndex` wird **nicht mehr client-seitig abgeleitet** (in huettehuette tut
`useFindPatternGameSolution` genau das). Server leitet ab, Server validiert.

*Nicht verschleiern lässt sich:* das Gitter selbst. Wer das Muster per Pixel extrahiert hat, findet es
danach trivial. Akzeptiert.

### Puzzle Scramble

Hier ein **konkreter Fund in der Referenzimplementierung**, der beim Portieren nicht mitwandern darf:
die Teile heißen `p_${puzzleAId}_${hashPieceId(puzzleAId, i)}.jpg`. Damit steht

- die **Puzzle-ID im Dateinamen** — wenn die Aufgabe ist, Teile A oder B zuzuordnen, steht die Lösung
  direkt im `<img src>`; und
- `hashPieceId` rechnet **client-seitig** (djb2 über `charCodeAt`), also ist zusätzlich der
  Teil-Index rekonstruierbar.

Die „Obfuskation" verdeckt gerade das nicht, was geraten werden soll.

→ **Opake IDs, server-seitig erzeugt**: `HMAC(serverSecret, puzzleId || index)` oder einfach
persistierte Zufalls-IDs. Kein Puzzle-Präfix im Namen, keine Gruppierung über die Reihenfolge,
`belongsToPuzzle` nicht im DTO. Danach ist Cheaten echte Bildarbeit.

### Deduster (Reaktion)

Aktuell der offenste Fall: die komplette Hot-Tile-Reihenfolge wird client-seitig aus der Rundennummer
berechnet (`seedrandom(round.toString())`). Dafür braucht man nicht einmal den Netzwerk-Tab.

Naiver Fix wäre „alles per SSE nachschicken" — und der hat ein echtes Problem: **er verschiebt den
Rhythmus.** Die Kadenz würde von Netzwerkjitter mitbestimmt, und ein stotterndes Spielgefühl ist ein
realer Schaden.

→ Die Trennung, die das löst: **das Timing ist nicht das Geheimnis, die Position ist es.**
Den Zeitplan (wann leuchtet etwas) beim Start vollständig mitschicken — der verrät nichts. Nur die
**Identität** des Tiles kommt just-in-time. Die Kadenz läuft lokal und ruckelfrei; das Netzwerk
entscheidet nur, ob die Identität rechtzeitig da ist (mit einigen hundert ms Puffer unkritisch).

→ **Nonce-Echo:** jede Aufdeckung enthält einen server-generierten Nonce, den der Klick mitschicken
muss. Wer die Zukunft vorhersagt, kann keinen Nonce echoen, den er noch nicht bekommen hat. Beweist
sauber „du hast nicht geantwortet, bevor du informiert wurdest" — ohne Krypto-Apparat.

→ **Obergrenze, offen benannt:** ein Bot, der auf das Aufdecken *reagiert*, schlägt jeden Menschen.
Hier ist Erkennung das Werkzeug, nicht Verhinderung. Möglicherweise ist die richtige Antwort sogar
eine **Spieldesign**-Änderung (nicht auf absolute Reaktionszeit werten) — zu entscheiden, wenn wir
Deduster tatsächlich portieren.

### Ratio / visuelle Spiele

Präsentations-Zufall. Presentation Seed, kein Schutz nötig. `Math.random()` genügt für Deko.

## Die Latenz-Spannung

Server-seitige Zeitmessung heißt: die RTT des Spielers geht in seine Zeit ein.

- Bei Find Pattern (Sekunden) ist das Rauschen.
- Bei Deduster (Millisekunden) entscheidet es.

Client-seitig messen wäre fairer, aber manipulierbar. Pragmatischer Mittelweg: **Server stempelt und
wertet**, der Client schickt seine eigene Messung als Zusatzfeld mit — nicht zur Wertung, sondern zum
Abgleich. Weichen beide systematisch auseinander, ist das selbst ein Signal.

Ob das reicht, ist ein Punkt, den nur ein echtes Spiel beantwortet.

## Explizit nicht

- **Client-Attestation, Bundle-Obfuskation, Anti-Debug.** Alles umgehbar, teuer, und es zerstört das
  Ziel, unseren Code vollständig zu durchblicken.
- **Seeds pro Spieler.** Wäre der billigste Schutz gegen Antwort-Teilen, ist aber durch die
  Fairness-Anforderung ausgeschlossen — und Antwort-Teilen ist ohnehin sozial geregelt.
- **Vollständige server-seitige Spielsimulation mit Input-Replay.** Für eine Rätsel-App
  überdimensioniert. (Teilweise billiger als es klingt: huettehuette sammelt mit `DedusterTrace` und
  `PuzzleScrambleTrace` schon Spielverläufe — die Daten für Plausibilitätsprüfungen existieren
  konzeptionell bereits. Als Ausbaustufe vormerken, nicht als Fundament.)
- **Payload-Verschleierung per Keystream aus dem geteilten RNG.** Wurde erwogen: Nutzdaten mit einem
  aus dem Presentation Seed abgeleiteten Strom XOR-en. Hebt die Latte von „lesen" auf „unseren Code
  lesen und umkehren" und kostet fast nichts. **Vorerst verworfen**, weil es die geteilte Ableitung
  wieder einführt, die wir bewusst abgeschafft haben — und weil „Payload erst beim Start" für
  zeitgewertete Spiele billiger dasselbe erreicht. Notiert, falls ein Spiel es doch braucht.

## Offen — am ersten Spiel zu entscheiden

Das ist die eigentliche Aufgabe dieses Dokuments: die Fragen benennen, die man am Schreibtisch nicht
seriös beantworten kann.

1. **Wie fühlt sich „Payload erst beim Start" an?** Ladezeit im gemessenen Fenster, Spinner,
   wahrgenommene Fairness bei unterschiedlichen Verbindungen.
2. **Trägt die server-seitige Zeitmessung**, oder wird die RTT-Ungerechtigkeit spürbar? Braucht es
   eine Kompensation (z. B. RTT/2 abziehen), und öffnet die ein neues Loch?
3. **Wie teuer ist server-gerendertes Bildmaterial** wirklich — Erzeugung, Caching, Cache-Keys pro
   Runde?
4. **Reicht Commit-auf-Lösung (a)**, oder wollen wir die volle Rundenprüfbarkeit (b) — und damit die
   TS-Referenzimplementierung als Verifikations-Werkzeug fördern?
5. **Woraus wird der Seed abgeleitet?** Runde? Community + Runde? UUID-v7-PK? Und verbindlich
   festlegen: `fromSeed(7)` und `fromSeed("7")` sind **verschiedene Ströme** (siehe RNG-Spec).
6. **Wo leben Spiel-Runden im Modulith** — eigenes `game`-Modul, Schema, Migrationen? Bewusst hier
   offen gelassen.
7. **Welche Anomalie-Grenzen** sind bei dieser Gruppengröße sinnvoll, und wie werden sie sichtbar
   gemacht, ohne jemanden falsch zu beschuldigen?

## Einstieg: Find Pattern

Wie im Referenzprojekt beginnen wir mit **Find Pattern**. Es hat schon eine Zeitwertung ab explizitem
Start (Phase 2) und übt damit den Kern des Fundaments (1–6) an einem echten Fall; es ist zugleich das
Spiel, an dem sich „Payload erst beim Start" überhaupt beurteilen lässt. Commit–Reveal (7) und die
Erkennungs-Grenzen (8) kann der erste Durchgang nachziehen — sie sind nicht Voraussetzung dafür, dass
das Spiel fair läuft.

Eine Erwartung dazu ausdrücklich geradestellen: Find Pattern liegt in der Kategorie **„Lösung liegt im
Sichtbaren"** — der schwersten. Das Gitter *muss* ausgeliefert werden, also bleibt es scriptbar, und
**vollständiger Schutz ist hier nicht das Erfolgskriterium.** Erfolgreich ist der erste Durchgang,
wenn

1. das **Fundament** trägt — kein Seed beim Client, Server validiert, Zeit server-gestempelt, ein
   Guess, Serialisierungs-Test grün;
2. der **spielspezifische Hebel** funktioniert — Suchmuster als server-gerendertes Bild, sodass der
   Konsolen-Einzeiler nicht mehr reicht; und
3. wir wissen, was das an **Aufwand und Spielgefühl** kostet (offene Fragen 1–3).

Dass ein hartnäckiger Informatiker das Gitter danach immer noch per Skript durchsuchen kann, ist
akzeptiert und kein Rückschlag — es ist die dokumentierte Obergrenze dieser Kategorie.

Deduster würde ich zuletzt angehen: es bringt zusätzlich SSE, die Rhythmus-Frage und das Bot-Thema
mit, und möglicherweise eine Spieldesign-Entscheidung statt einer technischen.

## Feed knowledge back

Nach der Validierung am ersten Spiel gehören in `.claude/guidelines/` — vermutlich als neue Datei
`game-integrity.md`:

- **Hidden vs. Presentation Seed** als verbindliche Konvention, inklusive „nie im DTO-Typ".
- **Serialisierungs-Test** gegen lösungsförmige Felder als Pflicht für jedes Spiel-DTO.
- Die **Taxonomie** als Entscheidungshilfe: welche Art Geheimnis → welche Maßnahme → welches Niveau.
- **Zeitwertung ist server-autoritativ**, Client-Zeiten nur als Abgleich.
- Der Merksatz: **von parsebar nach perzeptuell**, sonst ist die Lösung ein Konsolen-Einzeiler.
