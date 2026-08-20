# Song Snippet („Anspielung") — Song-Raten in Stufen

**Status:** beschlossenes Design (2026-08-20).

**Baut auf:** dem Runden-Framework ([Round-Game-Selection](2026-08-11-round-game-selection-design.md)),
dem [Spiel-Labor](2026-08-08-game-lab-design.md) und Guess Hue als Referenzspiel
([Dataset](2026-08-07-guess-hue-dataset-design.md), [Scoreboard](2026-08-16-guess-hue-scoreboard-design.md)).
**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — dieses Spiel ist der erste Fall,
in dem der Server Inhalte *dosiert* ausliefern muss, nicht nur Lösungen zurückhalten.

**Berührt:** ein neues Modulith-Modul `songsnippet` (ohne eigenes Schema-Geheimnis, aber mit
eigener Tabelle), den `GameType`-Vertrag und den `RoundController` in `game`, eine Migration
V3 im `game`-Schema und V1 im `songsnippet`-Schema, das Spiele-Registry in `webapp-vue` samt
neuem Spielverzeichnis, und das Labor.

## Zweck & Spielidee

Man hört einen sehr kurzen Ausschnitt eines Songs und rät, welcher es ist. Wer mehr hören
will, schaltet längere Ausschnitte frei — auf Kosten seiner Platzierung. Das
Fairness-Fundament: **Der Server liefert ausschließlich die Bytes, die die Stufe des
Spielers erlaubt.** Es gibt clientseitig nichts zu holen, was der Server nicht hergibt.
Darüber hinaus gilt: Es ist ein Spiel — kompetitiv ja, aber der Maßstab ist fair und
spaßig, nicht maximal abgesichert.

- **Codename:** `song-snippet` (Game-ID), `songsnippet` (Modul), `SongSnippet*` (Klassen).
- **Anzeigename:** „Anspielung" — das Wortspiel aus *anspielen* und *Anspielung*.

## Die Regeln

**Stufenleiter: 0,1s → 0,5s → 2s → 8s → 15s** (fünf Stufen, Index 0–4). Alle Stufen sind
Präfixe desselben Ausschnitts — mehr hören heißt „mehr vom selben", nie eine andere Stelle.
Stufe 0 liegt sofort beim Betreten der Runde vor: `requiresReveal = false`, implizites Reveal
beim Landen wie bei Guess Hue. Es gibt keine Zeitmessung; jede freigeschaltete Stufe darf
beliebig oft und beliebig lange gehört werden. **Ein Browser-Refresh ist verlustfrei in beide
Richtungen:** Die Stufe lebt in `round_plays`, der Client findet nach dem Reload exakt seinen
Stand wieder — man verliert nichts (Fortschritt ist Server-Zustand, nie Client-Zustand) und
gewinnt nichts (wer bis Stufe 4 geskippt hat, kommt per Refresh nicht auf Stufe 0 zurück).

**Eine Stufe wird verbraucht durch:**
- **Skip** (freiwillig, ohne zu raten), oder
- **einen falschen Guess — nur in Phase eins.** Falsch unterhalb der letzten Stufe rückt vor
  statt zu speichern; erst der richtige Guess (beliebige Stufe) oder der falsche auf der
  letzten Stufe ist terminal. In Phase zwei ist **jeder** Guess terminal — genau ein Versuch.

**Aufgeben** (beide Phasen): ein expliziter Exit ohne (weiteren) Guess. Er verbraucht den
Einsatz (`guessed_at` wird gesetzt, `guess` bleibt leer), bringt 0 Punkte und öffnet das
Solution-Gate regulär — niemand muss einen Fehlversuch verbrennen, um die Auflösung sehen zu
dürfen.

**Am Ende steht in `round_plays` genau eine Zeile mit genau einem Guess** — dem richtigen,
dem letzten falschen, oder keinem (Aufgeben) — plus der erreichten Stufe. Die Ein-Guess-Zeile
des Frameworks bleibt die Wahrheit; die nicht-terminalen Fehlversuche der Phase eins werden
ge-judged, aber bewusst nicht persistiert.

### Punkte: die Framework-Ökonomie, keine eigene Leiter

Eine stufenabhängige Punkteleiter (erwogen war `[6,4,3,2,1]`) wurde **verworfen**: Das
Framework legt fest, dass Punktarithmetik für jedes Spiel dieselbe ist („the game judges, the
framework awards", `Scoring.kt`), und `pointsFor` kennt nur „volle `award.points` oder 0".
Eine Song-Runde, die 6 Punkte ausschüttet, während Guess Hue 1 zahlt, würde Song-Kundige
systematisch bevorzugen — das Gegenteil des Ziels, Song-Unkundige nicht zu bestrafen.

Stattdessen trägt **`deviation` die erreichte Stufe** (0 = bei 0,1s getroffen; kleiner ist
besser — exakt die dokumentierte Semantik „the one value the framework must be able to
*compare* without being able to *compute*"):

- **Phase eins** (`ALL_QUALIFYING`, 1 Punkt): jeder richtige Guess zählt gleich viel, egal auf
  welcher Stufe. Die Stufe ist Scoreboard-Ruhm — kompetitiv zählt sie, Punkte kostet sie
  nicht.
- **Phase zwei** (`CLOSEST_ONLY`, wachsender Einsatz): wer mit dem *wenigsten Audio* richtig
  lag, gewinnt. Gleichstand: beide voll (dokumentiertes Verhalten von `pointsFor`, bei
  ganzzahligen Deviations real erreichbar — gewollt). Skippen kostet damit strategisch etwas,
  ganz ohne eigene Punktemechanik.

## Audioquelle: Deezer

Empirische Grundlagen (Stichproben August 2026, per Waveform-Kreuzkorrelation gegen
iTunes-Previews verifiziert):

- Deezer liefert pro Track ein **~30s-Preview als Stereo-MP3** (44,1 kHz, 128 kbps), Feld
  `preview` in der Track-/Such-API. Kein API-Key, keine Registrierung.
- Der Ausschnitt ist **nicht der Songanfang**, sondern das vom Label/Distributor gesetzte
  Hook-Segment — dieselbe „markante Stelle", die auch Apple nutzt. Für ein Ratespiel ist das
  die richtige Stelle; wir müssen sie nicht suchen.
- Die ersten ~0,5s enthalten oft ein **Fade-in** → die Pipeline überspringt sie beim
  Schneiden, sonst wäre die 0,1s-Stufe faktisch Stille.
- Preview-URLs sind **signiert und laufen nach ~1h ab** → sie werden nie gespeichert, sondern
  im Moment des Gebrauchs frisch über die Track-ID aufgelöst (`api.deezer.com/track/{id}`).
- Die **Track-ID ist dauerhaft**: `deezer.com/track/{id}` bleibt für Admin-Zwecke jederzeit
  erreichbar — auch lange nach dem Audio-Cleanup („nach 26h meldet sich jemand und will den
  Song nochmal hören").
- Die Suche liefert `title_short` und `title_version` getrennt („Hotel California" +
  „(2013 Remaster)") — die Normalisierung baut darauf auf, statt selbst Klammern zu strippen.

**Haltung zur Ablage: flüchtiger Runden-Cache statt Bibliothek.** Audio lebt und stirbt mit
der Runde: Nur die *aktuelle* Runde ist spielbar (vergangene sind display-only und haben
keinen Audio-Endpoint), also löscht das Cleanup beim Materialisieren einer neuen Runde das
Audio **aller früheren Runden der Edition**. Eine zentrale, über Runden geteilte Songtabelle
wurde verworfen (die Dedup-Ersparnis wäre minimal). Das operative Risiko ist benannt und akzeptiert: **Schalten die offenen
Deezer-Endpunkte ab, ist dieses Spiel raus** — die Vendor-Interfaces (unten) halten einen
Umstieg offen.

### Gegenüberstellung: Apple/iTunes als Alternative (geprüft 2026-08-20)

| Anforderung der Spec | Deezer (keyless) | Apple keyless (Search-API + RSS) |
|---|---|---|
| Editorial-/Dekaden-Pool | ✓ öffentliche Playlists inkl. Tracks + Previews in einem Call | ✗ RSS-Feeds listen Playlists nur als Name + Link, ohne Trackliste; Tracks nur via Apple Music API (Dev-Token, 99 $/Jahr) |
| Suche als Gruppen-Proxy | ✓ ~50 Req/5s pro IP | ✗ ~20 Req/**Minute** pro IP — 30 tippende Spieler über unsere eine Server-IP unmöglich |
| Track-ID dauerhaft auflösbar | ✓ global | ⚠ Storefront-gebunden: eine US-Track-ID löst im DE-Store nicht auf (empirisch geprüft) |
| Judging-Felder | ✓ `title_short` + `title_version` getrennt | ⚠ nur `trackName` inkl. Klammerzusatz — selbst strippen |
| Preview-Audio | MP3 stereo, URL signiert (~1h) | AAC/M4A, URL unsigniert |
| Pipeline pure-JVM | ✓ JLayer (MP3) | ✗ AAC braucht ffmpeg (Multi-Stage-Image) |
| API-Zugang formal | Grauzone (Programm geschlossen) | ✓ offiziell offen & dokumentiert |

**Entscheidung:** Deezer bleibt die primäre Quelle. Apple scheitert keyless an beiden
Kernanforderungen (Editorial-Pool, Such-Rate-Limit). Falls Deezer abschaltet: Spiel ist raus
(akzeptiert), oder Umstieg auf die Apple Music API (Token) hinter den Vendor-Interfaces. Ein
Hybrid (Deezer-Suche + Apple-Audio) wurde als Komplexität ohne Gegenwert verworfen.

### Vendor hinter Interfaces

Alle Deezer-Berührungen liegen hinter zwei exponierten `songsnippet`-Interfaces, damit die
Implementierung austauschbar bleibt — und Tests ohne Netz laufen:

- **`SongCatalog`** — Pool aus Playlist-IDs, Suche, Track-Auflösung per ID.
- **`PreviewSource`** — Download des Preview-Audios zu einem Track.

Die `Deezer*`-Implementierungen sind die einzigen Orte mit Deezer-Wissen (URLs, Feldnamen,
Rate-Limits, Signatur-Verfall).

## Song-Pool

- **Keine Charts** — zu gegenwartslastig, zu Deutschrap-lastig, viele kennen nichts. Der Pool
  kommt aus **konfigurierten öffentlichen Deezer-Playlists** (Editorial-/Dekaden-Playlists wie
  „Deutschland, deine Hits – 00er/10er"), gemerged.
- Konfiguration: `app.song-snippet.playlist-ids` in `application.yaml`. Der Pool ist
  **öffentlicher Katalog, kein Geheimnis** — kein sops, kein `.local/`-Ritual; die
  game-content-Regeln gelten hier nicht. Er muss **für alle denkbaren Communities passen** —
  keine Annahmen über eine konkrete Zielgruppe. Eine Admin-Playlist pro Community ist bewusst
  nicht Teil dieser Ausbaustufe.
- Filter: nur Tracks **mit Preview**. Explizite Texte werden bewusst **nicht** gefiltert
  (Entscheidung 2026-08-20: einfach abspielen) — das `explicit_lyrics`-Flag wäre da, bleibt
  aber ungenutzt.
- In-Memory-Cache mit TTL (~6h); der Pool ändert sich langsam.
- **Ziehung:** uniform über den Solution-Stream von `GameRandom`. Ausschluss: Track-IDs aller
  früheren Song-Snippet-Runden derselben Edition (kein Song zweimal pro Sommer); ist der Pool
  erschöpft, sind Wiederholungen erlaubt. Dafür wird `RoundContext` minimal erweitert (die
  Params früherer Runden desselben Spiels in dieser Edition).

## Datenmodell & Modulzuschnitt

### `stage` gehört dem Framework

`game.round_plays` bekommt **`stage INT NOT NULL DEFAULT 0`** (Migration V3 im `game`-Modul).
Begründung: Der Guess-Flow (`PlayService`) muss die Stufe unter dem Runden-Lock lesen und
fortschreiben; „wie weit hat der Spieler die Runde aufgedeckt" ist die Verallgemeinerung von
`revealed_at`, also ein Framework-Begriff. *Was* eine Stufe bedeutet, weiß nur das Spiel. Für
Guess Hue bleibt die Spalte konstant 0 und bedeutungslos.

### `round_audio` gehört dem Spiel — bewusst ohne FK

**`songsnippet.round_audio(round_game_id UUID, stage INT, media_type TEXT, bytes BYTEA,
PRIMARY KEY (round_game_id, stage))`** — Migration V1 im `songsnippet`-Schema.

Ein FK auf `game.round_games` wurde diskutiert und **verworfen**: Der Code-Pfeil zeigt
`game → songsnippet` (der Adapter bleibt in `game.internal`, siehe unten), und die
Flyway-Reihenfolge folgt dem Code-Graphen (`SpringModulithFlywayMigrationStrategy`) —
`songsnippet` migriert also *vor* `game`, der FK könnte auf frischer DB nicht angelegt
werden. Das ist das klassische **Plugin-Muster: der Code ruft vom Host ins Plugin, die Daten
hängen vom Plugin am Host** — Code-Pfeil und DB-Pfeil zeigen legitim entgegengesetzt, und die
Regel „Ordnung aus dem Code-Graphen" kann das nicht ausdrücken. Statt an der
Migrationsstrategie zu schrauben (Over-Engineering für einen FK), verzichten wir: sollte je
eine Runde gelöscht werden müssen (praktisch nie), räumt Kotlin `round_audio` mit ab.
*Erkenntnis fürs Guideline-Update am Ende der Umsetzung vorgemerkt
(modules-and-migrations.md).*

Gespeichert werden pro Runde sechs Zeilen: die fünf Stufen als **Stereo-WAV** (16-bit,
44,1 kHz — Deezer liefert Stereo, es gibt keinen Grund für Mono) und **`stage 99` = das
originale 30s-MP3 unverändert** als Auflösungs-Audio. Summe ≈ 5,5 MB pro Runde, bis das
Cleanup sie holt.

### Rundengeheimnis

Bleibt vollständig in `round_games.params` (JSONB), wie bei Guess Hue: Track-ID, Artist,
Titel (`title_short`), Cover-URL, Deezer-Weblink (Admin-Komfort). Die Phase muss nicht
eingefroren werden — die bereits eingefrorene `award_rule` unterscheidet sie
(`ALL_QUALIFYING` = Phase eins, `CLOSEST_ONLY` = Phase zwei).

## Änderungen am `GameType`-Vertrag

Der Adapter `SongSnippetGameType` liegt wie Guess Hues in `game.internal` — die dokumentierte
Begründung („a change to the GameType contract stays local to this module") beweist in diesem
Vorhaben ihren Wert, denn der Vertrag ändert sich:

```kotlin
fun stages(params: P): Int = 1                     // Song Snippet: 5; Guess Hue: Default 1
fun materialised(params: P, roundGameId: UUID) {}  // Hook nach dem Announce-Insert
fun asset(params: P, roundGameId: UUID, key: Int): RoundAsset? = null   // Bytes + MediaType
fun releaseAssets(roundGameIds: List<UUID>) {}     // Cleanup abgelaufener Runden
```

- `materialised` lädt und schneidet das Audio und legt es über den exponierten
  `songsnippet`-Store ab (Java-Richtung bleibt einbahnig `game → songsnippet`).
- `asset` beschafft Bytes für den generischen Asset-Endpoint; das *Gate* (Stufe, Solution)
  prüft das Framework, nie das Spiel.
- `releaseAssets` bekommt vom Framework die Runden-IDs außerhalb des Standings-Fensters
  (Fensterlogik bleibt im Framework) und löscht die eigenen Zeilen.
- `RoundContext` wächst um die Params früherer Runden desselben Spiels in der Edition
  (Track-Ausschluss beim `draw`).

**Terminal oder vorrücken** entscheidet das Framework ohne neues Flag, als pure Funktion
(analog `pointsFor`, exponiert, damit das Labor dieselbe benutzt):
falscher Guess ⋀ `award_rule = ALL_QUALIFYING` ⋀ `stage < stages(params) − 1` → Stufe +1,
nichts speichern; sonst terminal. Für Guess Hue (`stages = 1`) ändert sich exakt nichts.

## Announce-Pfad: alles im ersten Request („Ansatz C")

Beim ersten `GET /current` der Runde, in der Announce-Transaktion:

1. `draw()` zieht den Track aus dem Pool-Cache (Solution-Stream, Editions-Ausschluss).
2. Nach dem Insert der Rundenzeile ruft das Framework `materialised(...)`: Preview-URL frisch
   auflösen, MP3 laden (~1 MB, Timeout 5s), Leiter schneiden, sechs Zeilen einfügen. Der Hook
   muss **idempotent** sein: Beim Announce-Race durchlaufen beide Erstaufrufer den
   Materialisierungszweig, im Verliererfall läuft er also doppelt (insert-if-absent fängt das
   ab).
3. **Cleanup im selben Ablauf:** Das Framework ruft `releaseAssets` für **alle früheren Runden
   der Edition** — nur die aktuelle Runde ist spielbar, vergangene sind display-only ohne
   Audio-Endpoint. Ein indexierter DELETE, Millisekunden, einmal pro Runde. Bewusst **kein
   Scheduler** (wäre ein Erstling im Backend) und kein eigener Trigger.
4. **Fehlerbild:** Deezer nicht erreichbar → die Transaktion rollt komplett zurück,
   `GET /current` liefert 5xx, der nächste Request versucht es neu. Keine halb-materialisierte
   Runde. Die bekannte Optimierung (Audio lazy beim ersten Asset-Request, „Ansatz A") ist
   dokumentiert verschoben — erst bauen, wenn der synchrone Pfad wirklich stört.

## Audio-Pipeline (pure JVM)

MP3 → **JLayer**-Decode (reines Java; auch der Grund, Deezer/MP3 statt Apple/M4A zu nehmen —
AAC-Decoder gibt es pure-JVM nur verwaist) → PCM → 0,5s Fade-Skip → **sample-genaue
Präfix-Schnitte** (0,1s = exakt 4.410 Samples) → WAV via `javax.sound.sampled` (kein Encoder,
kein ffmpeg, kein natives Binary — wichtig, weil Buildpacks Pakete-Nachinstallieren nicht
mögen). `stage 99` wird nicht dekodiert, sondern sind die Original-Bytes.

**Geschwindigkeit ist kein Argument in der Formatfrage** (gemessen 2026-08-20): ffmpeg
schneidet die komplette Leiter in ~0,2s (MP3 wie M4A); pure-JVM liegt in derselben
Größenordnung — beides verschwindet hinter dem Download (~0,5–1,5s). ffmpeg wird erst nötig,
wenn je eine AAC-Quelle (Apple) kommt, und hieße dann Multi-Stage-Image statt Buildpacks.

## API & Sichtbarkeit

- **`GET /api/communities/{slug}/rounds/current/assets/{roundNumber}/{key}`** — generischer
  Framework-Endpoint (Controller in `game.internal`, denn das Gate liest Framework-Zustand):
  erlaubt bei `key ≤ round_plays.stage` des Anfragenden (freigeschaltete Stufen bleiben
  abspielbar), `key 99` hinter dem Solution-Gate, sonst 403. Pro Runde und Stufe eine eigene,
  `private` cachebare URL — ohne die Rundennummer im Pfad würde der Browser-Cache von gestern
  die falsche Runde abspielen; der Server prüft gegen die DB, nie gegen Client-Angaben.
  Merkregel des Zuschnitts: **rundengebunden = Framework-URL, katalogweit = Modul-URL.**
- **`GET /api/song-snippet/search?q=…`** — Controller im `songsnippet`-Modul (braucht null
  Rundenzustand; die katalogweite Suche verrät nichts über den gewählten Song). Proxy auf die
  Deezer-Suche, gemappt auf `{trackId, artist, title, coverUrl}`. Der Proxy ist nötig, weil
  Deezer kein CORS für fremde Origins erlaubt (nur JSONP — mit unserer CSP unvereinbar); dass
  dadurch alle Spieler Deezers IP-Rate-Limit (~50 Req/5s) über *unsere eine* IP teilen, tragen
  Client-Debounce (300ms), Mindestlänge 3 und ein kleiner Server-Query-Cache (LRU, Minuten).
- **`GET /api/song-snippet/tracks/{trackId}`** — löst einen Track frisch auf (u. a.
  Preview-URL, ~1h gültig). Die Auflösung nutzt ihn, um falsche Tipps im Scoreboard direkt
  von Deezer abspielbar zu machen; gleicher Controller wie die Suche, gleicher Server-Cache.
- **`POST …/skip`** und **`POST …/give-up`** — generisch im `RoundController`, beide mit dem
  Rundennummer-Envelope wie `GuessRequest`. Skip: `UPDATE … SET stage = stage + 1 WHERE
  stage = :expected AND guessed_at IS NULL` — null Zeilen = 409, das etablierte Idiom.
  Auf der letzten Stufe gibt es kein Skip mehr (Guard `stage < stages − 1`); die Exits dort
  sind der terminale Guess oder Aufgeben.
- **Judging:** Guess = `{trackId, artist, title}` aus dem Autocomplete. Richtig bei
  Track-ID-Gleichheit *oder* normalisiertem Match auf Artist + `title_short` (lowercase,
  Whitespace kollabiert) — beides, damit weder Remaster-Duplikate noch ID-Pedanterie den
  Treffer stehlen. Binär; kein Teilpunkt für „richtiger Artist" (bewusst verschoben).
- **Sichtbarkeit:** `MyPlayDto` bekommt die eigene `stage`. **Die Stufe der anderen bleibt
  während der Runde verborgen** — in Phase zwei wäre „Bob hat auf Stufe 1 geraten" taktische
  Information (eine Distanz in Verkleidung, exakt die `OtherPlayDto`-Regel). Sie erscheint
  erst mit der Auflösung im Scoreboard. `present()` enthält null Track-Information — nur die
  Stufendauern `[0.1, 0.5, 2, 8, 15]` fürs UI. `solution()` liefert Artist, Titel, Cover,
  Deezer-Link; das Audio dazu kommt über `key 99`.
- `apiFetch` bleibt JSON-only: Audio holt der Client daneben per credentialed
  `fetch → Blob → ObjectURL` (GET, kein CSRF).

## Frontend

Registry-Eintrag `'song-snippet': SongSnippetGame`, gerendert über den bestehenden
Prop-Vertrag; er wächst um die Emits **`@skip`** und **`@give-up`** (durchgereicht
`RoundCard` → Page → `useRound` → `api/rounds.ts`).

**Layout (Referenzfoto vom 2026-08-20, Feinschliff am Prototyp):**
- Ganz oben ein **Cover-Platzhalter**: beim Raten ein Fragezeichen, nach der Auflösung an
  exakt derselben Stelle das echte Cover. Die Fläche ist von Anfang an reserviert — **das
  Layout springt nach der Tipp-Abgabe nicht**.
- Darunter die volle **Stufenleiste** mit drei Zuständen: leicht gefüllt = freigeschaltet,
  Striche = Stufengrenzen, volle Füllung = Song-Progress beim Abspielen. Eine Leiste, keine
  zweite Zeitachse.
- Die Play-Zeile: der **große runde Play-Button bleibt horizontal exakt zentriert** (startet
  immer von vorn per `currentTime = 0; play()`, ist nie gesperrt und wird nie selbst zum
  Pause-Button — schnelles Doppeltippen = den Anfang nochmal hören, das ist Feature); daneben
  ein **kleinerer, separater Pause-Button** — die Asymmetrie geht zu Lasten des
  Pause-Buttons, nie der Zentrierung. Dazu das Label der aktuellen Stufe („0.1s").
- Unten **Suche + Skip** in einer Zeile. Suche als Combobox: `watchDebounced` (300ms) +
  Generationszähler + `AbortSignal` (das `useProfileDraft`-Muster), Vorschläge mit Cover,
  Titel, Artist. **Skip trägt seinen Preis als Text:** Phase eins „kostet nur Ruhm", Phase
  zwei „kann den Sieg kosten".
- Guess-Abgabe über `HoldButton`, mit einer erklärenden Zeile daneben — in den Button passt
  sie nicht, die genaue Gestaltung entsteht am Prototyp: Phase eins „verbrennt höchstens
  diese Stufe", Phase zwei „kann die gesamte Runde verbrennen". **Aufgeben** ebenfalls hinter
  `HoldButton` (kein versehentlicher Exit).
- Falscher Guess in Phase eins: Server hat schon vorgerückt; UI zeigt „Falsch — nächste Stufe
  frei" und aktualisiert die Leiste.
- **Auflösung** bescheidener als Guess Hues Vier-Takt-Choreografie — und sie **übernimmt das
  Spiel-Layout an denselben Stellen**: der Cover-Platz zeigt jetzt das echte Cover, dieselbe
  Leiste zeigt die Song-Position im 30s-Hook (die Stufenstriche bleiben stehen), Play und
  Pause sitzen unverändert. Dazu Artist/Titel + Deezer-Link. Kein Autoplay — Browser-Policies
  verlangen eine Geste.
- Das **Scoreboard** nennt pro Spieler die gebrauchte Stufe, die Punkte — und **den
  abgegebenen Tipp in eigener Spalte** (am witzigsten, wenn er falsch war). Falsche Tipps
  sind direkt als 30s-Preview abspielbar, sofern Deezer eines hat: der Client spielt die
  frisch aufgelöste Preview-URL **direkt von Deezer** — davon wird serverseitig nichts
  gespeichert oder geschnitten. Läuft die Choreografie länger als 3,8s, wird
  `SPOILER_HOLD_MS` erhöht — das neue Spiel hebt die Konstante, es greift nie hinein.

## Labor

Das Labor passt sich an (Richtungsregel): Lab-Runden liegen in-memory, also erzeugt der
Lab-Pfad die Leiter über **dieselbe Pipeline** und hält die Bytes im selbstbegrenzenden
In-Memory-Eintrag. Der `LabController` bekommt einen Asset-Endpoint sowie `POST /skip` und
`/give-up`; die Spielerstufe lebt im In-Memory-Play-State. Die Terminal-oder-Vorrücken-
Entscheidung benutzt dieselbe exponierte pure Funktion wie `PlayService`, gepinnt durch einen
Parity-Test nach dem Vorbild von `LabPointsParityTest`.

## Tests

Die Vendor-Interfaces (`SongCatalog`, `PreviewSource`) halten Deezer aus allen Tests heraus. **Test-Fixtures sind einmalig eingefangene echte Deezer-Responses**, als
Strings in die Tests geschrieben — realistische Daten (`title_short`/`title_version`,
Remaster-Varianten), null Netz zur Testzeit. Dazu eine kleine committete Fixture-MP3 (~2s
generierter Ton) für die Pipeline.

- **Pipeline golden test:** exakte Sample-Zahlen pro Stufe, Fade-Skip, Präfix-Eigenschaft
  (Stufe n ist Präfix von n+1), Stereo erhalten, `stage 99` byte-identisch zum Original.
- **Judging:** Normalisierungsfälle aus den echten Fixtures; Track-ID-Kurzschluss; knapp
  daneben = falsch; `InvalidGuessException` bei kaputtem Guess-JSON.
- **Flow (MockMvc, Fake-Game):** falsch unterhalb letzter Stufe → +1, nichts recorded; falsch
  auf letzter → recorded; `CLOSEST_ONLY` → jeder Guess terminal; Skip-Guard (409); Give-up
  setzt `guessed_at` ohne Guess; Asset-Gate inkl. `key 99` hinter Solution-Gate.
- **Scoring-Mapping:** `deviation = stage` → `CLOSEST_ONLY` kürt das wenigste Audio;
  Gleichstand doppelt voll.
- **Pinning:** Exact-Field-Set auf `present()` und `solution()` (Jackson `propertyNames()`),
  Draw-Unabhängigkeit der beiden RNG-Streams, `ModularityTests.verify()`.
- **Integration (Testcontainers):** Migrationen `game` V3 + `songsnippet` V1, Announce-
  Happy-Path mit Stubs, Cleanup löscht Audio außerhalb des Fensters.
- **Frontend (Vitest/happy-dom):** Stufen-/Progress-Arithmetik der Leiste, Restart-Semantik
  (Stub für `HTMLMediaElement.play` — happy-dom spielt nichts), Combobox-Generationszähler.

## Bewusst verschoben

- **Lazy-Audio-Optimierung** („Ansatz A") — erst, wenn der synchrone Announce-Pfad stört.
- **Admin-/Community-Playlists** als Poolquelle.
- **Teilpunkte** („richtiger Artist, falscher Song").
- **UI-Feinschliff** — am stehenden Prototyp.
- **Guideline-Ergänzung** (Plugin-Muster: DB-Pfeil gegen Code-Pfeil ⇒ FK-Verzicht statt
  Strategie-Umbau) — beim Feeding-knowledge-back am Ende der Umsetzung.
