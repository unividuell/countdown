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
Spielverderber. Die Hauptcommunity sind **Informatiker** — der erste Blick geht in die
**Browser-DevTools**, und zwar in beides: den Netzwerk-Verkehr *und* die JS-Konsole samt
Komponenten-State.

Daraus die Zielformulierung, an der jede Maßnahme gemessen wird:

> **Nicht „unmöglich", sondern „nicht direkt greifbar".** Die Lösung darf nicht übertragen werden und
> nicht in einer JS-Variablen stehen. Dieses Level, nicht mehr.

Das ist eine schärfere Anforderung als „kein Lösungsfeld im JSON": sie schließt auch **abgeleitete,
aber gehaltene** Werte ein. Ein `ref`, das den gesuchten Index für ein Hint-Overlay ausrechnet, ist im
Komponenten-State sichtbar — Payload-Hygiene allein genügt also nicht. **Der Client darf die Lösung
nie materialisieren**, nicht nur nie empfangen.

Was wir *nicht verhindern können* — Bildschirm-Pipette, selbstgeschriebenes Skript — bleibt möglich.
Es wird **geduldet, nicht gebilligt**: es wird nie eine Regel geben, die das erlaubt, und wir bauen
auch nichts, das es bequemer macht. Nur weil eine Grenze nicht durchsetzbar ist, wollen wir sie nicht
auch noch fördern.

Und die zweite Hälfte, die aus der Zeitwertung folgt: **die Uhr ist die Verteidigung.** Weil ab dem
Start-Klick gemessen wird, muss das Ableiten der Lösung nicht unmöglich sein — es muss *länger
dauern als ehrliches Spielen*.

### Der Gegner ist das wiederverwendbare Skript, nicht der Neugierige

Zwei Verhaltensweisen mit völlig unterschiedlicher Ökonomie, und nur eine ist gefährlich:

| | Kosten | über 20 Runden |
|---|---|---|
| **Neugier** — manuell in DevTools stöbern, Feld suchen, ablesen | fallen **jede Runde neu an**, z. B. 40 s bei laufender Uhr | 20 × Strafe, rechnet sich nie |
| **Skript** — einmal schreiben, danach einfügen und ausführen | **einmalig**, z. B. 30 min; dann 0,2 s pro Runde | verteilt sich auf ≈ 0 |

Dieselbe Schwäche ist beim Neugierigen also harmlos und beim Skript-Schreiber tödlich. Daraus folgt,
worauf Maßnahmen zielen müssen: **auf die Einmalkosten, nicht auf die Kosten pro Runde.**

Und diese Einmalkosten müssen **intrinsisch** hoch sein. Darauf zu bauen, dass der Angreifer beim
Entwickeln eine Runde opfert, trägt nicht — er kann sein Skript gegen den Payload einer **bereits
beendeten** Runde schreiben und zahlt dann kompetitiv gar nichts.

Deshalb zielen die beiden wichtigsten Maßnahmen auf **verschiedene** Gegner, und das sollte man beim
Priorisieren nicht verwechseln:

- **„Payload erst beim Start-Klick"** trifft den Neugierigen — aus „in Ruhe vorher anschauen" wird
  „anschauen, während die Uhr läuft". Den Skript-Schreiber kostet es fast nichts.
- **Die perzeptuelle Hürde** (Bild statt Array) trifft den Skript-Schreiber — sie hebt den
  Einstiegspreis von „drei Zeilen Konsole" auf „eine Bildverarbeitung schreiben". Das ist der
  eigentliche Gewinn dieser Maßnahme.

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
- **Inhalte müssen zur Spielzeit prozedural entstehen — Admin-Aufwand ist ein Kostenfaktor.**
  Siehe unten; das ist die Randbedingung, die am ehesten Maßnahmen kippt.

## Der Seed als Content-Pipeline (nicht nur als Determinismus-Trick)

Ein Vorteil von huettehuette, der in der Diskussion zu kurz kam und der eine **Produkt**-Anforderung
ist, keine technische: man musste nur den Seed ablegen — oder ihn an etwas Festes hängen, etwa die
Rundennummer — und konnte damit das ganze Spiel zur Spielzeit zuverlässig erzeugen. Das heißt:
**praktisch unbegrenzt viele Runden eines Spieltyps, ohne Admin-Aufwand.** Kein Vorab-Generieren von
100 Bildern, kein Ablegen in der DB, keine Pflege.

Das muss erhalten bleiben, und **es bleibt erhalten**: server-autoritativ heißt nicht „vorproduziert".
Der Server leitet Rätsel *und* Lösung zur Spielzeit aus dem versteckten Seed ab, gespeichert wird nur
der Seed. Genau diese Eigenschaft ist der Grund, warum der Kotlin-Generator unabhängig vom
Browser-Thema nötig ist (siehe RNG-Spec) — sie ist nicht nur Determinismus, sie ist die Content-Pipeline.

### Kann der Server malen? Ja — anders als damals

Der Einwand ist berechtigt und war in huettehuette ein echtes Hindernis: dort stand **keine
node-canvas** zur Verfügung, also war server-seitiges Rendern keine Option. Auf der JVM ist das
anders, und das entscheidet über die Find-Pattern-Empfehlung. Gemessen auf **genau der JRE, die Paketo
ausliefert** (`bellsoft/liberica-openjre-debian:25`, headless):

```
java.desktop present=true      PNG writer available=true
wrote png=true bytes=225       byte-identical on rewrite=true
```

Also `BufferedImage` + `Graphics2D` + `ImageIO` aus dem JDK, **ohne jede Zusatz-Abhängigkeit und ohne
native Bibliothek**. Die Byte-Gleichheit bei Wiederholung ist praktisch nützlich: sie erlaubt stabile
ETags/Cache-Keys pro Runde.

Damit gilt: **server-gerenderte Bilder kosten keinen Admin-Aufwand und keine Vorproduktion** — sie
entstehen zur Spielzeit aus dem Seed, genau wie die Rätseldaten. Die perzeptuelle Hürde ist also mit
der Content-Pipeline vereinbar, nicht im Konflikt mit ihr.

*Zu verifizieren:* dass die **tatsächlich gebaute** App-Image-JRE `java.desktop` enthält. Paketo
liefert standardmäßig eine vollständige JRE, aber eine jlink-minimierte Variante könnte das Modul
weglassen. Einzeiler gegen das gebaute Image genügt.

## Bedrohungsmodell

| # | Angriff | Einordnung |
|---|---|---|
| A | Lösung client-seitig aus dem Seed ableiten | **Zu schließen** — Kern des Fundaments |
| B | Lösung aus dem Netzwerk-Payload lesen | **Zu schließen** — die Messlatte |
| C | Manipuliertes Ergebnis einsenden („ich war korrekt / in 0,2 s") | **Zu schließen** — Server validiert |
| D | Mehrfach spielen, Bestes einsenden | **Geschlossen** — ein Guess pro Runde |
| D2 | Starten, in Ruhe umsehen, Muster einprägen, **Refresh**, dann mit Vorsprung spielen | **Zu schließen** — eine Uhr pro Runde, nie zurückgesetzt; Aufdecken ist Zustand |
| B2 | Lösung im **Komponenten-State / JS-Variablen** lesen, obwohl sie nicht übertragen wurde | **Zu schließen** — Client darf sie nie materialisieren |
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

Das trifft die Messlatte exakt: gegen Pipette und Bildverarbeitung kommen wir nicht an, gegen
`JSON.parse` und einen Blick in den Komponenten-State sehr wohl.

## Taxonomie — welches Geheimnis, welche Maßnahme

Der nützlichste Teil dieser Analyse. Jedes Spiel hat eine andere *Art* von Geheimnis, und daraus
folgt, wofür sich Komplexität lohnt:

| Art des Geheimnisses | Beispiel | Wirksame Maßnahme | Erreichbares Niveau |
|---|---|---|---|
| Die Lösung ist ein **Fakt** | eine Schätz-/Zuordnungsfrage, deren Antwort nur der Server kennt und die der Client nicht zum Rendern braucht | Server-only Seed + Server validiert | **vollständig** |
| Die Lösung ist ein **Zeitplan** | Deduster (Reaktion) | Zukunft nicht ausliefern, progressiv aufdecken | gut gegen Menschen, offen gegen Bots |
| Die Lösung liegt **im Sichtbaren** | Find Pattern, Puzzle Scramble | Darstellung perzeptuell machen + Erkennung | Aufwand erhöhen |
| **Präsentations-Zufall** | Anordnung, Sparkles, Deko | keine Geheimhaltung — aber **für alle identisch** (Presentation Seed) | nicht nötig |

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

### 3. Payload erst beim Start-Klick — und nur **einmal** aufdeckbar

Die Rätseldaten entstehen bzw. gehen erst raus, wenn der Start-Request kommt. Vorher existiert im
Netzwerk-Log **nichts zu inspizieren**. Damit wird „in Ruhe vorher anschauen" zu „anschauen, während
die Uhr läuft".

Das allein genügt aber nicht, denn es gibt einen Umweg: **starten, sich in Ruhe umsehen, das Muster
einprägen, Browser-Refresh, und dann mit dem Vorsprung durchspielen.** Dagegen zwei Regeln, in dieser
Reihenfolge wichtig:

1. **Eine Uhr pro Spieler und Runde, die nie zurückgesetzt wird.** Der Server stempelt das *erste*
   Aufdecken; ein Refresh startet die Messung nicht neu. Das ist die eigentliche Absicherung — wer sich
   in Ruhe umsieht, hat diese Zeit bereits bezahlt, und der Umweg bringt gar nichts mehr.
2. **Das Aufdecken wird als Zustand geführt**, nicht nur der Guess. Ein zweiter Aufdeck-Request für
   dasselbe (Spieler, Runde) wird erkannt und abgelehnt: *„Das Spiel ist nur einmal aufdeckbar — du
   bist raus für diese Runde."*

Regel 1 nimmt dem Trick den Nutzen, Regel 2 macht ihn explizit und sichtbar. Beide server-seitig.

*Kante, die bei der Umsetzung zu entscheiden ist:* ein harter Lockout trifft auch den Unschuldigen —
abgestürzter Tab, WLAN weg, versehentliches F5. Zwei Varianten:

- **(a) harter Lockout** wie oben. Klar und abschreckend, aber ein Verbindungsabbruch kostet die Runde.
- **(b) idempotentes Aufdecken:** derselbe Request liefert denselben Payload wieder, die Uhr läuft
  unverändert ab dem ersten Aufdecken. Der Cheat bringt nichts (Regel 1), und niemand wird für
  schlechtes Netz bestraft. Preis: der Trick bleibt unsichtbar, es gibt keine Meldung.

Vermutlich ist ein Mittelweg richtig — (b) als Verhalten, plus ein Zähler, der wiederholtes Aufdecken
protokolliert und ab einer Schwelle als Signal auftaucht. Am ersten Spiel zu entscheiden.

*Wichtige Einschränkung:* der Payload-erst-beim-Start-Teil wirkt **nur bei zeitgewerteten Spielen**.
Wo nicht auf Zeit gespielt wird, kostet Inspizieren nichts und die Maßnahme ist wertlos — die
Aufdeck-Regel bleibt trotzdem sinnvoll.

### 4. Server-autoritative Zeitmessung

Der Server stempelt das erste Aufdecken und den Eingang des Guess. Die Differenz ist die Wertung;
Client-Zeiten sind Anzeige. Die Runden-Engine liefert dafür schon absolute Instants.

### 5. Ein Guess pro Runde, server-seitig erzwungen

Unique-Constraint, First-write-wins. Nicht im Client prüfen. Zusammen mit dem einmaligen Aufdecken aus
(3) ergibt das den vollständigen Ablauf: **einmal aufdecken, einmal antworten** — beides
server-protokolliert.

### 6. DTO-Hygiene, testgestützt

Ein Test, der den **serialisierten** Payload prüft und fehlschlägt, wenn ein lösungsförmiges Feld
auftaucht. Kein Kommentar, keine Konvention — ein roter Test.

Und die Client-Hälfte davon, die aus der verschärften Messlatte folgt: **die Lösung darf im Frontend
nirgends materialisiert werden.** Kein `ref`, kein `computed`, keine lokale Variable, die sie hält oder
ausrechnet — auch nicht „nur" für ein Hint-Overlay oder eine Animation. Wer eine Rückmeldung braucht,
holt sie als Ergebnis vom Server. Das lässt sich schlechter automatisch prüfen als der Payload und ist
deshalb ein bewusster Review-Punkt bei jedem Spiel.

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
winziges PNG (225 Bytes im Messbeispiel), client-seitig ein `<img>`. Das ist die Maßnahme, die den
Skript-Schreiber trifft, also die wichtigste hier — und sie ist mit der Content-Pipeline vereinbar:
das Bild entsteht zur Spielzeit aus dem Seed, es wird nichts vorproduziert.

→ `searchPatternStartIndex` wird **nicht mehr client-seitig abgeleitet** (in huettehuette tut
`useFindPatternGameSolution` genau das). Server leitet ab, Server validiert. Und nach der verschärften
Messlatte gilt zusätzlich: der Index darf auch **nicht als abgeleiteter Wert im Client-State liegen** —
kein `computed`, kein `ref`, auch nicht für ein Hint-Overlay.

*Nicht verschleiern lässt sich:* das Gitter selbst. Wer das Muster per Pixel extrahiert hat, findet es
danach trivial — dokumentierte Obergrenze, siehe unten.

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

Korrektur an einer früheren Fassung dieses Dokuments: „Präsentations-Zufall braucht keinen Schutz" war
zu grob und stand im Widerspruch zur Fairness-Anforderung. Richtig ist:

> **Präsentations-Zufall braucht keine *Geheimhaltung*, aber dieselbe *Determiniertheit* wie alles
> andere.** Auch im Ratio-Spiel muss jedes Pixel bei jedem Spieler an derselben Stelle sitzen —
> sonst unterscheidet sich die **Wahrnehmung**, und damit die Schwierigkeit. Das ist genauso unfair
> wie ein anderes Rätsel.

`Math.random()` ist damit **nur** für Dinge zulässig, die die Wahrnehmung der Aufgabe nicht berühren
(ein Konfetti-Effekt nach der Auflösung). Alles, was zum Bild gehört, das bewertet wird, muss für alle
identisch sein.

Zwei Wege dorthin, mit unterschiedlichen Kosten:

- **Der Server schickt die Geometrie** — Koordinaten, Radien, Regionen. Kein Browser-RNG nötig, aber
  je nach Spiel ein spürbar größerer Payload.
- **Der Client leitet sie aus dem Presentation Seed ab** — winziger Payload, identisch für alle, und
  das Preisgeben des Seeds schadet nicht, weil daran nichts hängt, was der Spieler nicht sehen darf.

Der zweite Weg ist damit **der erste konkrete, wahrscheinliche Abnehmer für die
TS-Referenzimplementierung**, die derzeit in Test-Scope liegt — genau der Zweck, für den ihr Header sie
freigibt: „presentational and already public". Wenn Ratio portiert wird, wandert sie voraussichtlich
nach `src/lib/rng/`.

Wichtig dabei: dann führen Client und Server **zwei getrennte Generatoren** mit zwei Seeds. Der
Presentation Seed darf nie derselbe sein wie der versteckte — sonst ist die ganze Trennung aus (1)
hinfällig.

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
3. **Wie teuer ist server-gerendertes Bildmaterial** in der Praxis — Erzeugung pro Request, Caching,
   Cache-Keys pro Runde? (Dass es *geht*, ist geklärt; offen ist, was es kostet.) Dazu die
   Verifikation, dass die gebaute Image-JRE `java.desktop` mitbringt.
4. **Reicht Commit-auf-Lösung (a)**, oder wollen wir die volle Rundenprüfbarkeit (b) — und damit die
   TS-Referenzimplementierung als Verifikations-Werkzeug fördern?
5. **Hartes Aufdeck-Lockout (a) oder idempotentes Aufdecken (b)** — und wo liegt die Schwelle, ab der
   wiederholtes Aufdecken zum Signal wird?
6. **Ratio: Geometrie vom Server oder aus dem Presentation Seed?** Payload-Größe gegen einen zweiten
   Generator im Browser — und damit die Frage, ob die TS-Referenzimplementierung nach `src/lib/rng/`
   wandert.
7. **Woraus wird der Seed abgeleitet?** Runde? Community + Runde? UUID-v7-PK? Und verbindlich
   festlegen: `fromSeed(7)` und `fromSeed("7")` sind **verschiedene Ströme** (siehe RNG-Spec).
8. **Wo leben Spiel-Runden im Modulith** — eigenes `game`-Modul, Schema, Migrationen? Bewusst hier
   offen gelassen.
9. **Welche Anomalie-Grenzen** sind bei dieser Gruppengröße sinnvoll, und wie werden sie sichtbar
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

1. das **Fundament** trägt — kein Seed und keine materialisierte Lösung beim Client, Server validiert,
   einmal aufdecken mit einer Uhr, die nie zurückgesetzt wird, ein Guess, Serialisierungs-Test grün;
2. der **spielspezifische Hebel** funktioniert — Suchmuster als server-gerendertes Bild, sodass der
   Konsolen-Einzeiler nicht mehr reicht; und
3. wir wissen, was das an **Aufwand und Spielgefühl** kostet (offene Fragen 1–3).

Dass ein hartnäckiger Informatiker das Gitter danach immer noch per Skript durchsuchen kann, ist
eingeplant und kein Rückschlag — es ist die dokumentierte Obergrenze dieser Kategorie. Eingeplant
heißt nicht gebilligt: wir erleichtern es nicht.

Deduster würde ich zuletzt angehen: es bringt zusätzlich SSE, die Rhythmus-Frage und das Bot-Thema
mit, und möglicherweise eine Spieldesign-Entscheidung statt einer technischen.

## Feed knowledge back

Nach der Validierung am ersten Spiel gehören in `.claude/guidelines/` — vermutlich als neue Datei
`game-integrity.md`:

- **Hidden vs. Presentation Seed** als verbindliche Konvention, inklusive „nie im DTO-Typ" — und dass
  die beiden nie derselbe Wert sein dürfen.
- **Serialisierungs-Test** gegen lösungsförmige Felder als Pflicht für jedes Spiel-DTO, plus die
  Review-Regel, dass der Client die Lösung **nie materialisiert** (auch nicht abgeleitet).
- Die **Taxonomie** als Entscheidungshilfe: welche Art Geheimnis → welche Maßnahme → welches Niveau.
- **Zeitwertung ist server-autoritativ**, Client-Zeiten nur als Abgleich — und **eine Uhr pro Spieler
  und Runde, die ein Refresh nicht zurücksetzt.**
- **Präsentations-Zufall braucht keine Geheimhaltung, aber dieselbe Determiniertheit** — identische
  Wahrnehmung ist Teil der Fairness, nicht Kosmetik.
- **Inhalte entstehen zur Spielzeit aus dem Seed**, nicht vorproduziert in der DB — der Admin-Aufwand
  ist ein Designkriterium.
- Der Merksatz: **von parsebar nach perzeptuell**, sonst ist die Lösung ein Konsolen-Einzeiler. Und der
  Gegner ist das **wiederverwendbare Skript**, nicht der Neugierige — Maßnahmen zielen auf die
  Einmalkosten.
