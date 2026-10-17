# Runden-Assets — ein Modell statt vier Sonderwege

**Status:** Entwurf (2026-10-17). Issue: unividuell/countdown#101.

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Materialisierungs-Takt](2026-10-11-round-materialisation-schedule-design.md), der
[Hülle](2026-09-25-reveal-cover-design.md) und dem [Spiel-Labor](2026-08-08-game-lab-design.md).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — das Vorab-Laden gibt die Größe eines
Assets vor seiner Stufe preis, benannt unter *Integrität*.

**Berührt:** `GameType`/`GameCatalog`, `RoundMaterialiser`, `PlayService`, `RoundResponses`,
`RoundController`, `AnnouncementService`, `MaterialisationSchedule`,
`LabService`/`LabRoundStore`/`LabController` samt `LabRoundResponse`, die Adapter von Anspielung,
Entstauber, Platzierung und Musterung, die Module `songsnippet`, `deduster`, `placepatch`, `findpattern`,
ein neues Flyway-Skript im Schema `game`, im Frontend die neue Abhängigkeit `@noble/ciphers`,
`api/rounds.ts`, `api/assets.ts`, `gamelab/api.ts`,
`RoundCard`/`RoundHistory`/`pages/c/[slug]/index.vue` und die vier Spielverzeichnisse, dazu
`game-rounds.md`.

## Zweck & Warum

Runden-Assets sind Spiel für Spiel gewachsen, und jedes neue Spiel hat den Mechanismus ein Stück weiter
verbogen:

- Der Schlüssel ist zugleich Identität und Sichtbarkeit: vor dem Tipp ist `key in 0..stage` abrufbar.
- Alles andere sind magische Zahlen: `SCENE_ASSET_KEY = 98`, `SOLUTION_ASSET_KEY = 99`, dazu
  `assetStage(params, key)` als Notlösung für Platzierungs zwei Bilder hinter einem Reveal.
- Die Regel, wer ein Asset sehen darf, steht doppelt: in `PlayService.asset` und `LabService.asset`.
- Fünf Lebenszyklus-Methoden für ein Anliegen: `produceAssets`, `materialised`, `asset`,
  `releaseStageAssets`, `releaseAssets`.
- Eine Tabelle derselben Form je Spielmodul (`songsnippet.round_audio`, `deduster.round_images`,
  `placepatch.round_images`), je mit Entity, Repository und Store.
- Platzierung speichert den Bildausschnitt und rechnet Brett und Stück bei jedem Abruf neu; das Labor
  liefert dieselben Bilder über `produceAssets`. Zwei Wege zu denselben Bytes.
- Musterung schickt ihre zwei Bilder als `data:`-URIs im Payload, weil das Tor vor dem Tipp nur ein Bild
  pro Stufe zuließ.
- **Platzierung lädt auf der Uhr.** In Phase zwei startet die gewertete Uhr beim Aufdecken; erst danach
  dürfen Brett und Stück (einige hundert KB) geladen werden. Das bricht die Regel der Hülle: „beim
  Eintreffen des Payloads wird nichts mehr vorbereitet, nur noch eingesetzt.“ Musterung entgeht dem nur,
  weil ihre Bilder im Payload stecken.

Vor dem nächsten Bildspiel soll ein Modell stehen, das ein neues Spiel nicht mehr verbiegen muss — und
das keine Bytes auf die Uhr legt.

## Ziele

- **Ein Spiel erzeugt nur noch.** Es liefert benannte Assets, jedes mit seiner Sichtbarkeit. Speichern,
  Ausliefern und Prüfen übernimmt das Framework.
- **Eine Sichtbarkeitsregel**, die echte Runde und Labor gemeinsam aufrufen.
- **Ein Speicher** für eingefrorene Runden-Bytes, im Schema `game`.
- **Ein Weg zu den Bytes:** erzeugt einmal bei der Materialisierung, danach nur gelesen.
- **Nichts lädt auf der Uhr.** Was mit einer Stufe sichtbar wird, liegt schon vorher verschlüsselt beim
  Client; mit der Stufe kommt nur der Schlüssel. Das repariert Platzierung.
- Musterung zieht auf denselben Weg um.

## Nicht-Ziele

- **Aufräumen beim Archivieren einer Edition.** Das ist die einzige künftige Aufräumaktion, aber noch
  nicht gebaut und nicht Teil dieser Arbeit. Mit einer Tabelle wird es später ein einziges `DELETE`.
- Assets, die *nach* der Materialisierung entstehen oder sich ändern.
- Andere Ablage als Postgres-`BYTEA` (Objektspeicher, Dateisystem).
- Spiele ohne Binärdaten (Farbausmalung, Street-View-Spiel, Blockierung) — sie bleiben unberührt bis auf
  den geänderten Prop-Typ von `assetUrl`.
- Ein Auffüll-Mechanismus im Framework. Würde die Größe eines Stufen-Assets die Lösung eingrenzen, macht
  das Spiel sie selbst konstant (siehe *Integrität*).

## Anti-Ziele

- **Kein zweites Sichtbarkeitskonzept neben dem neuen.** Nichts bleibt, das nach Nummer oder Sonderfall
  entscheidet. Das Vorab-Laden ist keine vierte Sichtbarkeit, sondern die Art, wie „ab Stufe n“
  ausgeliefert wird — immer, für jedes `n`.
- **Das Labor bekommt keine eigene Regel.** Es ruft dieselbe Funktion wie die echte Runde; wo es heute
  abweicht, gleicht es sich an (siehe *Sichtbarkeit*).
- **Keine Lösung vor dem Tipp — auch nicht verschlüsselt.** „Nach dem Tipp“ wird nie vorab geliefert:
  schon die Größe des Chiffrats könnte sie verraten (Anspielung: Die Größe des Vorschau-MP3s
  identifiziert den Titel im Deezer-Pool).

## Rahmen

- **Keine Nutzer, keine Bestandsdaten.** Alle Datenbanken (lokal, Staging, Prod) dürfen gelöscht werden.
  Es gibt keine Datenmigration und keine Rückwärtskompatibilität. Die API ändert sich in Backend und
  Frontend gleichzeitig.
- **Pfeilrichtung der Module:** `game` ruft die Spielmodule, nie umgekehrt. Ein Spielmodul kennt keine
  Typen aus `game`; der Adapter in `game.internal` übersetzt.
- **Ein Spiel ist eine reine Funktion seiner Params** (siehe `GameType`). Dieselben Params ergeben
  dieselben Klartext-Bytes — das Labor verlässt sich darauf. Schlüssel und Chiffrat sind zufällig und
  gehören dem Framework, nicht dem Spiel.
- **Die App läuft auf dem Handy über die LAN-IP per HTTP** (Dev-Server) — so wird heute getestet, und
  das muss bleiben. WebCrypto (`crypto.subtle`) gibt es dort nicht: Browser bieten es nur in sicheren
  Kontexten (HTTPS, `localhost`). Deshalb entschlüsselt das Frontend **nicht** mit WebCrypto, sondern
  überall mit `@noble/ciphers` (reines JS, auditiert, ohne Abhängigkeiten) — ein Weg für Prod, Staging,
  `localhost`, LAN und Vitest.
- Projekt-Leitlinien gelten unverändert: `persistence.md`, `modules-and-migrations.md`, `testing.md`
  (TDD), `kotlin.md`, `frontend*.md`, `game-lab.md`.

## Das Modell

### Ein Asset

Ein Asset ist **Name, Sichtbarkeit, Medientyp, Bytes**.

- **Name:** pro Runde eindeutig, URL-tauglich (`[a-z0-9-]+`), vom Spiel vergeben. Er ist reine Identität
  und sagt nichts über die Sichtbarkeit.
- **Sichtbarkeit**, genau eine von drei. Sie entscheidet auch, wie das Asset ausgeliefert wird:

| Sichtbarkeit | Bytes abrufbar (laufende Runde) | geöffnet für | Auslieferung | ersetzt heute |
|---|---|---|---|---|
| **Szene** | jedes Mitglied | jedes Mitglied | Klartext | Schlüssel 98 |
| **ab Stufe n** | jedes Mitglied | wer aufgedeckt hat und mindestens Stufe n erreicht hat; Stufe 0 heißt „ab dem Reveal“ | **Chiffrat**, der Schlüssel kommt mit der Stufe | Schlüssel 0…n, `assetStage` |
| **nach dem Tipp** | wer getippt oder aufgegeben hat | dieselben | Klartext | Schlüssel 99 |

Die Sichtbarkeit wird mit den Bytes eingefroren. Das Tor fragt das Spiel nicht mehr; es liest, was beim
Erzeugen festgelegt wurde.

### Vorab laden: Chiffrat früh, Schlüssel mit der Stufe

```
            unter der Hülle                         Aufdecken / Stufe n
Client ── GET …/assets/board ──► Chiffrat ─┐
                                           │   POST /reveal ──► Antwort: payload + assetKeys{board,…}
                                           └──────────────► entschlüsseln (noble) ──► einsetzen
```

- **Beim Materialisieren** verschlüsselt das Framework jedes „ab Stufe n“-Asset mit einem eigenen,
  zufälligen Schlüssel und speichert **nur das Chiffrat** plus den Schlüssel. Ein Asset, ein Schlüssel
  — ein gemeinsamer Rundenschlüssel würde mit Stufe 0 die ganze Leiter öffnen.
- **Verfahren:** ChaCha20-Poly1305 (RFC 8439, Teil von TLS 1.3), 256-Bit-Schlüssel, 96-Bit-Nonce
  zufällig; gespeichert und ausgeliefert als `nonce ‖ ciphertext ‖ tag`. Der Client trennt die ersten
  12 Bytes als Nonce ab und gibt den Rest an `chacha20poly1305(key, nonce).decrypt(…)` aus
  `@noble/ciphers/chacha.js`; Javas Cipher `ChaCha20-Poly1305` (JDK-eigen) hängt den Tag ebenso hinten
  an. Gewählt statt AES-GCM, weil es in reinem JS gut 3× so schnell entschlüsselt (Benchmark der
  Bibliothek, Apple M4: ≈ 340 statt ≈ 95 MiB/s).
- **Abrufen darf das Chiffrat jedes Mitglied**, sobald die Runde läuft — kein Play-Row nötig, wie bei der
  Szene. Es kommt als `application/octet-stream`.
- **Die Schlüssel reisen in der Runden-Antwort**, als Feld des Frameworks neben `payload` (nicht im
  Payload — das Spiel kennt keine Schlüssel). Je geöffnetem Asset: Schlüssel und echter Medientyp. Die
  Antwort enthält genau die Schlüssel, die die Sichtbarkeitsregel dem Betrachter öffnet; jede Antwort,
  die einen Zustand ändert (Aufdecken, nächste Stufe), bringt die neu geöffneten mit.
- **Der Client** lädt die Chiffrate der nächsten Stufe, solange die Hülle liegt (Zustand `preparing` aus
  dem Hüllen-Design); `ready` erst danach. Trifft der Schlüssel ein, wird nur entschlüsselt und
  eingesetzt. Wann ein Spiel spätere Stufen vorlädt (Anspielung: alle Clips oder nur den nächsten),
  entscheidet das Spiel im Frontend.
- **Was beim Eintreffen bleibt:** entschlüsseln und das Bild dekodieren. Das ist die neue Grenze der
  Hüllen-Regel — Millisekunden statt einer Netzwerkrunde. Musterung dekodiert schon heute beim
  Eintreffen.

### Sichtbarkeit — eine Regel, zwei Aufrufer

Eine reine Funktion entscheidet aus der Sichtbarkeit und dem Zustand des Betrachters zwei Dinge: ob er
die Bytes abrufen darf und ob er den Schlüssel bekommt.

```
Betrachter: { abgeschlossen, aufgedeckt, stufe, getippt }

                 Bytes abrufen                  Schlüssel bekommen
abgeschlossen    alles                          alle
Szene            ja                             — (kein Schlüssel)
ab Stufe n       ja                             aufgedeckt && stufe >= n
nach dem Tipp    getippt                        — (kein Schlüssel)
```

Den Betrachter-Zustand liefert jeder Aufrufer aus seiner eigenen Quelle:

| | echte Runde (`PlayService`, `RoundResponses`) | Labor (`LabService`) |
|---|---|---|
| abgeschlossen | Rundennummer größer als die laufende | nie |
| aufgedeckt | Play-Row existiert | wie das Labor-Payload heute: `!requiresReveal \|\| hasOpened` |
| stufe | `round_plays.stage` | `LabRoundStore.stageOf` |
| getippt | `guessed_at` gesetzt | eigener Eintrag im Snapshot |

„Aufgedeckt“ ist damit genau die Bedingung, unter der heute das Payload ausgeliefert wird: Payload und
Stufe-0-Schlüssel kommen in derselben Antwort.

**Folge fürs Labor:** Heute gibt es Stufe-0-Assets auch ohne Öffnen heraus (Standardstufe 0). Danach
nicht mehr — es verhält sich wie die echte Runde und wie sein eigenes Payload.

Die Fehlercodes des Asset-Endpunkts bleiben in ihrer Bedeutung (404 kein Asset/keine Runde, 409 nicht
aufgedeckt, 403 Tipp fehlt); sie treffen jetzt nur noch „nach dem Tipp“.

### Lebenszyklus

```
Ankündigung / Tagestakt / GET-Fallback
        │
        ▼
RoundMaterialiser.materialise ──► GameType.produceAssets(params)
                                        │  „ab Stufe n“: verschlüsseln
                                        ▼
                                  game.round_assets
                                        │
   GET …/rounds/{n}/assets/{name} ──► Regel ──► Bytes (Klartext oder Chiffrat)
   Runden-Antwort                 ──► Regel ──► assetKeys

Labor: dieselbe Regel, LabRoundStore im Speicher, einmal erzeugt und verschlüsselt
```

- **Erzeugen:** einmal, beim Materialisieren der Runde, an der Stelle, an der heute
  `materialised(...)` aufgerufen wird. Das Framework verschlüsselt und speichert, was das Spiel liefert.
- **Idempotent:** Beim Announce-Rennen materialisieren beide Aufrufer. Existieren für die Runde schon
  Assets, wird nichts erzeugt; das Einfügen hält dem Rennen zusätzlich über den Unique-Key stand. Weil
  Schlüssel zufällig sind, dürfen die Zeilen des Verlierers nie die des Gewinners ersetzen.
- **Fehler beim Erzeugen** behalten die heutige Semantik des jeweiligen Spiels: Entstauber und
  Platzierung liefern bei fehlendem Bild nichts und loggen eine Warnung; Anspielung wirft.
- **Freigeben: gar nicht.** Alles bleibt bis zur (noch nicht gebauten) Archivierung liegen, auch die
  Stufenleiter von Anspielung. Damit hat die Historie immer alles, was die Runde hatte.

### Speicher

Eine Tabelle im Schema `game`, als neues Flyway-Skript des Moduls `game`:

```
game.round_assets
  id            UUID   PK, uuidv7()
  round_game_id UUID   NOT NULL, FK → game.round_games
  name          TEXT   NOT NULL
  visibility    TEXT   NOT NULL   -- SCENE | STAGE | AFTER_GUESS
  stage         INT    NULL       -- nur bei STAGE (CHECK)
  media_type    TEXT   NOT NULL   -- der echte Typ, auch bei STAGE
  encryption_key BYTEA NULL       -- 32 Bytes, nur bei STAGE (CHECK)
  bytes         BYTEA  NOT NULL   -- STAGE: nonce ‖ ciphertext ‖ tag; sonst Klartext
  UNIQUE (round_game_id, name)
```

Die Tabelle liegt jetzt im selben Modul wie `round_games`; der Fremdschlüssel, den die Spieltabellen
wegen der Pfeilrichtung nicht haben durften, ist damit möglich. Schlüssel liegen neben dem Chiffrat —
die Verschlüsselung schützt die Leitung zum Client vor der Stufe, nicht die Datenbank.

### `GameType`

Bleibt: **eine** Methode, `produceAssets(params)`, Standard „keine Assets“. Sie liefert eine Liste von
Assets (Name, Sichtbarkeit, Medientyp, Klartext-Bytes). Teuer, darf Netzwerk-I/O machen. Vom Verschlüsseln
weiß das Spiel nichts.

Fällt weg: `assetStage`, `materialised`, `asset`, `releaseStageAssets`, `releaseAssets`, die Konstanten
`SCENE_ASSET_KEY` und `SOLUTION_ASSET_KEY`, die entsprechenden Weiterleitungen in `GameCatalog`,
`RoundMaterialiser.releaseStagesOlderThan` samt den Aufrufen in `AnnouncementService` und
`MaterialisationSchedule`.

### HTTP

- Echte Runde: `GET /api/communities/{slug}/rounds/{roundNumber}/assets/{name}`, **plus die
  `round_games`-ID** in der URL (Form dem Builder überlassen). Rundennummern beginnen mit jedem Lauf neu;
  ohne die ID träfe eine neue Runde einen 24 h `immutable` gecachten Eintrag der alten — heute zeigt das
  still ein altes Bild, mit Chiffrat scheiterte das Entschlüsseln einen Tag lang. Passt die ID nicht zur
  aufgelösten Runde: 404. Die Runden-Antwort bekommt dafür die ID (`roundGameId`); `RoundDto` bleibt die Zeit-Runde.
- Labor: derselbe Pfadteil `/assets/{name}` an der Labor-URL. Eine Labor-Runde kann neu entstehen (ein
  anderer Tester wechselt den Seed) und bekommt dann neue Schlüssel; das fängt der Frontend-Helfer ab.
- `Content-Type`: Medientyp des Assets bei Klartext, `application/octet-stream` beim Chiffrat.
  `Cache-Control: private, max-age=86400, immutable` unverändert — ein Name ist pro Runde
  unveränderlich, das gilt auch fürs Chiffrat.
- Runden-Antwort und `LabRoundResponse` bekommen ein Feld mit den geöffneten Schlüsseln, je Name
  Schlüssel (Base64) und Medientyp.

### Frontend

- `assetUrl: (name: string) => string` statt `(key: number) => string`, überall, wo es durchgereicht wird.
- Ein gemeinsamer Helfer in `api/assets.ts` lädt ein Asset als `Blob`: Klartext direkt, Chiffrat erst
  laden, dann mit dem Schlüssel aus der Runden-Antwort entschlüsseln. Laden und Entschlüsseln sind
  getrennt aufrufbar, damit das Laden unter der Hülle passiert. Scheitert das Entschlüsseln, lädt er das
  Chiffrat **einmal** am Cache vorbei neu (`cache: 'reload'`) und versucht es erneut; danach ist es ein
  Fehler.
- Die Namen stehen als Konstanten im `types.ts` des jeweiligen Spiels. Die nachgebauten Zahlen (98, 99,
  `BOARD_ASSET_KEY`, `PATCH_ASSET_KEY`) verschwinden.

## Pro Spiel

| Spiel | Assets (Name → Sichtbarkeit) | Was sich ändert |
|---|---|---|
| **Anspielung** | `clip-0` … `clip-4` → ab Stufe 0 … 4; `solution` → nach dem Tipp | `round_audio` mit Entity/Repo/Store fällt weg; `SongSnippetStages.SOLUTION_KEY` fällt weg; `SnippetCutter.ladder` liefert die fünf Clips, das MP3 hängt der Adapter an. Clips kommen verschlüsselt; Anspielung hat keine Uhr, gewinnt aber Vorladen beim Stufenwechsel |
| **Entstauber** | `photo` → Szene | `deduster.round_images` mit Entity/Repo/Store fällt weg |
| **Platzierung** | `board`, `patch` → ab Stufe 0 | speichert die **fertigen** Bilder statt des Ausschnitts; `placepatch.round_images` mit Entity/Repo/Store fällt weg; das Rechnen beim Abruf entfällt. Das Stück wird unkomprimiert kodiert (*Integrität*). **Lädt nicht mehr auf der Uhr:** Chiffrate unter der Hülle, `ready` erst danach |
| **Musterung** | `board`, `pattern` → ab Stufe 0 | `boardImage`/`patternImage` verlassen Payload; `FindPatternImages` liefert PNG-Bytes statt `data:`-URIs; Chiffrate unter der Hülle wie Platzierung |

Die Schemas `songsnippet`, `deduster` und `placepatch` haben danach keine Tabelle mehr. Ihre
Migrationsordner werden **gelöscht**, nicht per Drop-Skript abgebaut.

## Integrität

Das Chiffrat verrät vor seiner Stufe genau eins: **seine Größe** (Klartext + 28 Bytes). Für ein
„ab Stufe n“-Asset gilt damit dieselbe Regel wie für einen Szenen-Wert — es darf die Lösung nicht
eingrenzen. `game-rounds.md` nimmt das neben die Regel der drei Zufallsströme auf.

| Spiel | was die Größe sagt | Decke |
|---|---|---|
| Anspielung | Clips haben feste Dauer, also feste Größe | nichts |
| Musterung | Kompressibilität der Farbverteilung | nichts, was beim Suchen hilft |
| Platzierung, Brett | die JPEG-Größe hängt vom Foto ab | Wer die Pool-Originale hat (Admins, Hochlader; Entstauber zeigt Pool-Fotos vorab in Farbe), erkennt das Foto. Ohne das Stück grenzt das die Position nicht ein. Hingenommen |
| Platzierung, Stück | **muss konstant sein.** Als komprimiertes PNG folgte die Größe der Textur bei (x, y); wer das Foto hat, rechnet alle Kandidaten vor und vergleicht — in „schnellster exakter Treffer“ entscheidet das die Runde | Das Stück wird als **unkomprimiertes PNG** kodiert: die Größe hängt nur von seinen Maßen ab, nicht von der Position. Ein Test sichert das |

Rand-Fall: Der Reveal-Request trug keine Rundennummer. Endete das Halten knapp nach dem Rundenwechsel
(eine Runde beginnt zu ihrer eigenen Startzeit), deckte er die nächste Runde auf, deren Chiffrat nicht
vorgeladen ist. Abgesichert in unividuell/countdown#105 (Rundennummer am Reveal, 409 wie bei Tipp und
Skip), nicht hier.

## Deploy

Weil angewandte Flyway-Skripte verschwinden, startet die App gegen eine alte Datenbank nicht
(Flyway-Validierung). Beim Ausrollen werden die Datenbanken **lokal, auf Staging und in Prod neu
aufgesetzt** — mit Zustimmung, es gibt keine Nutzer. Der PR nennt diesen Schritt ausdrücklich.

## Backup

Keine Änderung an `deploy/compose.yaml`. `game.round_assets` landet im täglichen Dump und wächst mit
jeder Runde: eine Anspielung-Runde ≈ 4,5 MB (Stufenleiter als WAV plus MP3), eine Bildrunde einige
hundert KB. Bei sieben Spielen im Wechsel grob 1 MB pro Runde im Schnitt. Überragt die Tabelle den
Rest, kommt der Split nach `deployment-server.md` („Split a dump on table data …“).

## Leitlinien

`game-rounds.md` wird nachgezogen: die Abschnitte zu Assets vor dem Reveal, zum Asset-Tor und zum
Aufräumen beschreiben das neue Modell, dazu die Größenregel aus *Integrität*. Was dort über Schlüssel
98/99, `assetStage` und die zwei `release*`-Haken steht, fällt weg. `feeding-knowledge-back.md` gilt wie
immer.

## Dem Builder überlassen

- Die Kotlin-Form der Sichtbarkeit (sealed interface, Enum plus Stufe, …) und des Betrachter-Zustands.
- Wo die gemeinsame Regel lebt — exponiert in `game`, weil das Labor sie braucht, wie `GameType` selbst.
- Entity, Repository, Store für `round_assets` nach `persistence.md`; ob Tor und Runden-Antwort ohne
  Bytes lesen.
- Name und genaue Form des Schlüssel-Felds in der Runden-Antwort.
- Ob das Dekodieren beim Eintreffen über `createImageBitmap` oder `<img>` läuft.
- **Messen, nicht schätzen:** Entschlüsseln in reinem JS ist langsamer als nativ. Der Plan misst auf
  einem Handy die Zeit für Platzierungs Stufe 0 (Brett plus unkomprimiertes Stück, ≈ 0,7 MB; geschätzt
  7–10 ms) und den größten Clip (Anspielung `clip-4`). Liegt Stufe 0 spürbar über einem Frame, kommt das
  Ergebnis zurück ins Gespräch, bevor weitergebaut wird.
- Testzuschnitt (TDD): Regel als reine Funktion, Tor und Schlüssel beider Aufrufer, Idempotenz der
  Materialisierung, Ver-/Entschlüsseln über beide Laufzeiten (ein Kotlin-Chiffrat entschlüsselt im
  Frontend-Test), Adapter je Spiel, Frontend je Spiel.
- Reihenfolge der Schritte im Plan.

## Meine Entscheidungen (nicht besprochen)

- Vorab-Laden gilt für jedes „ab Stufe n“, nicht nur für Stufe 0 — ein Weg statt zwei.
- Ein zufälliger Schlüssel je Asset, gespeichert neben dem Chiffrat.
- Entschlüsseln im Frontend mit `@noble/ciphers` statt WebCrypto, damit das Handy über LAN-HTTP
  weiter funktioniert. Kein WebCrypto-Pfad daneben.
- Platzierungs Stück unkomprimiert, damit seine Größe die Position nicht verrät; die Größe des Bretts
  (verrät das Foto) hingenommen. Kein Auffüllen im Framework.
- `round_games`-ID in der Asset-URL; der Helfer lädt bei gescheitertem Entschlüsseln einmal neu.
- Reveal am Rundenwechsel: eigener PR (#105) statt Teil dieser Arbeit.
- Sichtbarkeit wird mit den Bytes gespeichert, statt beim Abruf das Spiel zu fragen.
- Platzierung speichert fertige Bilder statt des Ausschnitts.
- Migrationsordner löschen plus DB-Reset statt Drop-Skripte.
- Fremdschlüssel von `round_assets` auf `round_games`.
- Namen der Assets je Spiel wie in der Tabelle oben.
- Labor verlangt fürs Stufe-0-Asset künftig das Öffnen, wie die echte Runde.
- Kein Backup-Split jetzt; erst wenn die Tabelle den Rest überragt.
