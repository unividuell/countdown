# Audio-Pool — private Community-Audiodateien und ein globaler freier Bestand

**Status:** Entwurf (2026-10-24).

**Baut auf:** dem [Community-Modul](2026-08-03-community-members-design.md), über dessen öffentliche
`CommunityQuery`/`MembershipQuery`, und auf `iam` (wer hochgeladen hat).

**Vorbild:** der [Bild-Pool](2026-09-07-community-image-pool-design.md). Rechte, Aufnahmekette,
Auslieferung, Zwischenspeicher und Backup folgen ihm. Dieses Dokument nennt nur, was davon abweicht,
und was beim Übertragen auf Audio neu zu entscheiden war.

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — wie beim Bild-Pool der Grund, warum
die Liste eines Pools nicht für alle offen ist.

**Berührt:** ein neues Modulith-Modul `audiopool` (ein Schema, eine Tabelle), zwei
Controller-Namensräume (`/api/communities/{slug}/audio`, `/api/super-admin/audio`), im Frontend zwei
dünne Seiten über einer gemeinsamen Komponente, den Upload-Beistand aus `api/images.ts` (wird
verallgemeinert, nicht kopiert), die Upload-Warteschlange aus `ImagePool.vue` (wird ein geteiltes
Composable), den Navigationseintrag und den Backup-Beiwagen in `deploy/compose.yaml`.

## Zweck

Kommende Spiele brauchen Audio. Das erste ist ein Ortungsspiel mit kurzen Sprüchen aus der
Community (eigene Spec, folgt). Die Audiodateien einer Spielgemeinschaft sind privat. Daneben steht
ein kleiner globaler Bestand freier Audiodateien, den der Super-Admin pflegt.

Was hier entsteht: hochladen, privat halten, anhören, löschen, sichern. **Sonst nichts.**

## Abgrenzung — der Pool kennt kein Spiel

**Der Pool prüft nur, was jeder Pool prüft:** Format, Größe, Duplikat, Quote, Rechte. Er prüft weder
Länge noch Inhalt noch, ob am Anfang Stille steht. Er schneidet nichts zu und rechnet nichts auf
Mono herunter. Was ein Spiel braucht, leitet es beim Materialisieren seiner Runde aus dem
gespeicherten Signal ab. Ein späteres Spiel kann Audio mit ganz anderen Anforderungen brauchen
(Clemens, 2026-10-24).

Wie beim Bild-Pool gibt es **keine nach außen exportierte Modul-API**: `org.unividuell.countdown.core.audiopool`
bleibt leer, alles liegt in `.internal`. Das erste Audiospiel bringt die Schnittstelle mit
(`AudioPoolQuery`), weil es dann weiß, was es braucht. Braucht später ein zweites Spiel dieselbe
Ableitung (etwa den Schnitt am ersten Laut), wandert sie als Export hierher — so kamen `ImageFit` und
`AspectRatio` in den Bild-Pool.

Ausdrücklich **nicht** gebaut: Titel-, Beschreibungs- und Credit-Felder, Kategorien, Aufnehmen im
Browser, ein Schnitt-Werkzeug (frühestens Ausbaustufe 2; bis dahin liefern Mitglieder fertig
geschnittene Dateien), Wellenform-Vorschau, Umwandlung in komprimierte Formate.

## Sichtbarkeit und Rechte

Wörtlich die des Bild-Pools:

| | Mitglied | Community-Admin | Super-Admin |
|---|---|---|---|
| Community-Pool: hochladen | ja | ja | ja (als Mitglied) |
| Community-Pool: Liste | nur eigene | alle | alle |
| Community-Pool: löschen | nur eigene | alle | alle |
| Globaler Pool: lesen | ja | ja | ja |
| Globaler Pool: schreiben/löschen | nein | nein | ja |

- Das Ziel eines Uploads bestimmt der Namensraum, nicht die Person. Kein Ziel-Auswahlfeld.
- „Globaler Pool: lesen“ ist eine Regel über die Daten, kein Endpunkt. Eingelöst wird sie vom ersten
  Audiospiel, das globale Dateien in eine Runde zieht.
- Wer etwas nicht sehen darf, bekommt **404, nicht 403**.
- **Löschen ist endgültig.** Kein Soft-Delete. Ein Spiel, das eine Datei in einer Runde verwendet,
  hält ab dem Materialisieren eine eigene Kopie als Runden-Asset; vergangene Runden bleiben heil.

## Das Format — die eine echte Abweichung

**Das Problem.** Handys nehmen in Formaten auf, die die JVM nicht lesen kann: iOS als m4a/AAC,
Android-Rekorder und Messenger oft als Ogg oder WebM mit Opus. Das JDK liest WAV von Haus aus
(`javax.sound.sampled`), MP3 über JLayer (schon eine Abhängigkeit, wegen Anspielung). AAC und Opus
gehen nicht ohne ffmpeg, und das ist im Buildpacks-Image nicht enthalten.

**Die Entscheidung.** Der **Browser dekodiert** die gewählte Datei mit `decodeAudioData` — also alles,
was das Gerät abspielen kann — und lädt **WAV** hoch:

- RIFF/WAVE, PCM, **16 Bit** vorzeichenbehaftet, Little Endian;
- **Kanäle wie dekodiert** (Mono bleibt Mono, Stereo bleibt Stereo);
- **Abtastrate wie dekodiert.** Das ist die Rate des `AudioContext` (meist 44,1 oder 48 kHz), nicht
  zwingend die der Datei: `decodeAudioData` rechnet auf sie um.
- Float-Samples werden auf `[−1, 1]` begrenzt und auf 16 Bit gerundet.

Der Server nimmt **nur** dieses WAV an.

**Die Folge, damit sie ausgesprochen ist.** Der Bild-Pool bewahrt das unangetastete Original. Hier
bleibt das **unangetastet dekodierte Signal**: Behälter und Codec der Handy-Datei gehen verloren, die
Abtastrate womöglich auch. Was ein verlustbehafteter Codec schon weggeworfen hatte, bleibt weg; mehr
geht nicht verloren. Für jede Ableitung, die ein Spiel braucht, reicht das.

**Der Dateiname bleibt** (meine Festlegung). Eine Audioliste hat kein Bild; ohne Namen müsste man jede
Zeile anhören, um die richtige zu finden. Der Name kommt aus der Datei, niemand füllt ein Feld aus —
die Regel des Bild-Pools („kein Feld, das ein Mensch ausfüllt“) bleibt gewahrt. Er wird so gespeichert,
wie die Datei hieß (ohne Pfad, auf 200 Zeichen gekürzt), und nur der Leitung und dem Hochladenden
gezeigt.

## Datenmodell

Modul `audiopool`, Schema gleichen Namens, Migration unter `db/migration/audiopool/`. Pfeile:
`audiopool → community`, `audiopool → iam`. Eine Tabelle.

```sql
CREATE SCHEMA IF NOT EXISTS audiopool;

CREATE TABLE audiopool.clips (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    -- NULL = globaler Pool, mit derselben Begründung wie imagepool.images.
    community_id UUID REFERENCES community.communities(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES iam.users(id),
    file_name    TEXT        NOT NULL,   -- wie die gewählte Datei hieß, für die Liste
    channels     SMALLINT    NOT NULL,
    sample_rate  INT         NOT NULL,
    frames       INT         NOT NULL,   -- Dauer = frames / sample_rate
    byte_size    INT         NOT NULL,
    sha256       BYTEA       NOT NULL,
    bytes        BYTEA       NOT NULL,   -- das WAV, wie hochgeladen
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clips_pool_sha256 ON audiopool.clips (community_id, sha256) NULLS NOT DISTINCT;
```

Kein Vorschau-Feld: eine Zeile in der Liste braucht keine Bytes (siehe *Frontend*).

**Grenzen als Konfiguration** (`AudioPoolProperties`, Präfix `audiopool`):

| Eigenschaft | Wert |
|---|---|
| `audiopool.per-community-limit` | 200 |
| `audiopool.global-limit` | 50 |
| `audiopool.max-bytes` | 5 MB (≈ 27 s Stereo oder 54 s Mono bei 48 kHz) |
| angenommenes Format | WAV, PCM 16 Bit, 1–2 Kanäle, 8–96 kHz |

Das sind meine Startwerte, keine Spielannahmen; sie lassen sich anheben. `max-bytes` muss unter
`spring.servlet.multipart.max-file-size` (15 MB) bleiben, wie beim Bild-Pool kommentiert.

**Was die Quote wirklich zusagt:** `200 × 5 MB` = 1 GB pro Community, mit drei Communities und dem
globalen Bestand ausgereizt 3,25 GB. Erwartet ist weit weniger: ein Spruch von 1,5 s wiegt in Stereo
rund 290 KB, 200 davon knapp 60 MB.

## Aufnahme

`POST /api/communities/{slug}/audio` und `POST /api/super-admin/audio`, `multipart/form-data`,
**eine Datei pro Request**, Feld `file` mit dem ursprünglichen Dateinamen.

Geprüft wird von billig nach teuer:

1. **Magic Bytes:** `52 49 46 46` (`RIFF`) und `57 41 56 45` (`WAVE`) an Byte 8. Alles andere ist
   `UNSUPPORTED_FORMAT` — trifft nur, wer den Browser umgeht.
2. **Größe** ≤ `max-bytes`.
3. **Kopf** über `AudioSystem.getAudioFileFormat`: `PCM_SIGNED`, 16 Bit, Little Endian, 1–2 Kanäle,
   8–96 kHz, mehr als null Frames. Sonst `UNSUPPORTED_FORMAT` (falsche Kodierung) oder `BROKEN_AUDIO`
   (Kopf unlesbar).
4. **sha256** gegen den Pool — schon vorhanden ergibt `DUPLICATE`. Dieselbe Handy-Datei auf zwei
   Geräten dekodiert kann verschiedene Bytes ergeben; das wird hingenommen.
5. **Quote** unter `pg_advisory_xact_lock`, wie beim Bild-Pool, aber in **eigenem Schlüsselraum**:
   der Bild-Pool sperrt mit `lockPool(key: Long)`; leitet der Audio-Pool denselben Schlüssel ab, warten
   Bild- und Audio-Uploads einer Community aufeinander, und die Konstanten der globalen Pools
   kollidieren. Die Zwei-Argument-Form `pg_advisory_xact_lock(int, int)` mit einer Klasse pro Pool
   trennt das; wie, entscheidet der Umsetzer.
6. Speichern.

Prüfen läuft **vor** der Transaktion, wie beim Bild-Pool. Das Dekodieren entfällt hier ganz: der
Server liest nur den Kopf.

## Auslieferung

| Methode | Pfad | Antwort |
|---|---|---|
| `GET` | `/api/communities/{slug}/audio` | Liste (JSON, **ohne Bytes**) |
| `GET` | `…/audio/{id}` | das WAV, `audio/wav` |
| `DELETE` | `…/audio/{id}` | löschen |

Gespiegelt unter `/api/super-admin/audio` für den globalen Bestand.

- Die Liste ist eine **explizite Projektion** ohne `bytes`: `id`, `fileName`, `durationMs` (aus
  `frames` und `sample_rate`), `channels`, `byteSize`, `createdAt`, `uploadedBy` (Anzeigename).
  Dazu wie beim Bild-Pool `used`, `limit`, `viewerIsAdmin`, und neu `maxBytes`, damit der Browser die
  Grenze vor dem Upload kennt. Neueste zuerst.
- Wer was sieht, ist eine Bedingung in derselben Abfrage: Admin `community_id = ?`, Mitglied
  zusätzlich `uploaded_by = ?`.
- **Das Tor gehört dem Modul:** `audiopool` löst den Mandanten selbst auf, wie `ImagePoolGate` —
  `CommunityQuery.findBySlug`, dann `MembershipQuery.isActiveMember`/`isAdmin`, Super-Admin davor
  durchgereicht — mit eigenen Ausnahmen (→ 404 / → 403).
- **Zwischenspeicher:** `Cache-Control: private, max-age=31536000, immutable`, so wie der Bild-Pool es
  tatsächlich ausliefert. Ein `ETag` fehlt dort trotz seiner Spec; unter einer unveränderlichen ID
  bringt er nichts, also auch hier keiner.

## Frontend

```
pages/c/[slug]/audio.vue        dünn: Endpunkt der Community
pages/super-admin/audio.vue     dünn: globaler Endpunkt
audio/AudioPool.vue             Liste, Zähler, Upload, Abspielen
audio/toWav.ts                  Datei → WAV wie oben — rein, ohne DOM testbar
api/audio.ts                    Liste, Löschen, URLs
```

**Navigation:** „Bilder“ ist in der Navigationsleiste ein Symbol in der Zeile der aktuellen Community.
„Audio“ wird ein zweites Symbol daneben (`aria-label="Audio"`), für jedes Mitglied sichtbar. Englisches
Pfadsegment `audio`, deutsche Oberfläche.

**Was geteilt wird statt kopiert** (meine Festlegung, nach Prüfung beider Aufrufer):

- Der XHR-Beistand `uploadImage(base, file, onProgress)` wird zu einem allgemeinen
  `uploadFile(base, blob, fileName, onProgress)`; der Bild-Pool übergibt seine `File` weiter, sein
  Verhalten bleibt gleich. Zeitlimit, CSRF-Kopf, 401-Behandlung und `UploadError` bleiben wie sie sind.
- Die Warteschlange aus `ImagePool.vue` (der Reihe nach, Zeile pro Datei mit Fortschritt und Grund,
  ein Fehlschlag reißt die übrigen nicht mit) wird ein Composable, das beide Pool-Komponenten nutzen.
  Die Kachel des Bild-Pools und die Zeile des Audio-Pools bleiben getrennt.

**Upload:** `<input type="file" accept="audio/*" multiple>`. Pro Datei in der Schlange:

1. **Erst die Dauer, dann das Dekodieren** (meine Festlegung). Ein Handy soll keine Stunde Podcast in
   Float-Samples entpacken: 25 MB AAC sind 25–50 Minuten, dekodiert in Stereo bei 48 kHz 0,5–1,2 GB
   — die Seite stürzt ab, und mit ihr der Rest der Schlange. Die Dauer kommt aus den Metadaten eines
   `<audio>`-Elements (`loadedmetadata`) über eine Object-URL. Ist sie länger als 60 s, scheitert die
   Datei sofort mit „Zu lang“ — mehr ergäbe ohnehin kein WAV unter `max-bytes`. Liefert das Element
   keine endliche Dauer (manche WebM-Aufnahmen melden `Infinity`), gilt ersatzweise: höchstens 2 MB
   Eingabe.
2. `decodeAudioData` über den geteilten Graphen (`audioGraph()`). Scheitert das: „Dein Browser kann
   diese Datei nicht abspielen.“ — ohne Request.
3. `toWav` baut das WAV. Wird es größer als `max-bytes`: „Zu lang (höchstens 5 MB als WAV, etwa
   27 s Stereo).“ — ohne Request. Die Grenze liefert die Liste mit (`maxBytes`), sie steht nicht
   doppelt im Code.
4. `uploadFile` mit dem ursprünglichen Dateinamen.

`decodeAudioData` braucht keinen sicheren Kontext; das Hochladen über die LAN-Adresse im Dev bleibt
möglich.

**Liste:** eine Zeile pro Datei — Abspielknopf, Dateiname, Dauer (eine Nachkommastelle), für die
Leitung der Name des Hochladenden, Löschen mit Rückfrage. Darüber der Zähler „12 von 200“.

**Abspielen:** Antippen reicht die Same-Origin-URL des WAV an `usePlayback.setSource` (das Cookie
reist ohnehin mit) und spielt es über den geteilten Graphen ab, wie in `frontend-state.md` für kurze
Clips verlangt — eine Datei kann unter einer Sekunde liegen. So bleibt `context.resume()` in der
Tippgeste (nötig auf iOS), die ein vorgeschalteter Blob-Abruf verstreichen ließe; dafür laden Element
und Graph das WAV beim ersten Antippen womöglich je einmal (typisch ~300 KB). Es spielt immer nur
eine; ein zweites Antippen stoppt. Dafür gibt es `usePlayback` (`games/songsnippet/`), das genau das
schon sicherstellt: wiederverwenden, nicht nachbauen. Ob es dafür nach `ui/` umzieht, entscheidet der
Umsetzer. Geladen wird erst beim Antippen, nie für die ganze Liste. Der Pool spielt das gespeicherte
Signal, keinen Zuschnitt eines Spiels.

**Gründe** an der betroffenen Zeile, deutsch, mit `„…“` wo zitiert: `UNSUPPORTED_FORMAT`,
`BROKEN_AUDIO`, `TOO_LARGE`, `POOL_FULL`, `DUPLICATE`, `NETWORK`, dazu die beiden Browser-Gründe oben.

## Backup

Der erwartete Bestand (unter 100 MB) passte in den Tagesdump, der zugesagte (3,25 GB) nicht: sieben
Tagesstände wären dann über 20 GB für Daten, die sich fast nie ändern. Darum **dieselbe Teilung wie
beim Bild-Pool**:

```
app-<ts>.sql.gz      täglich         pg_dump --exclude-table-data=imagepool.images
                                             --exclude-table-data=audiopool.clips
images-<ts>.sql.gz   bei Änderung    wie bisher
audio-<ts>.sql.gz    bei Änderung    pg_dump --data-only --table=audiopool.clips
```

Ausgelöst über denselben Fingerabdruck (Anzahl plus md5 der IDs) auf `audiopool.clips`, mit eigener
Fingerabdruck-Datei. Vorhaltung `AUDIO_BACKUP_KEEP`, voreingestellt 8, in `.env.<target>`. Die
Härtung des Beiwagens bleibt (`set -eo pipefail`, `until pg_isready`, `$$(...)`).

`deploy/README.md` bekommt die Reihenfolge der Wiederherstellung: erst der Tagesdump, dann Bild- und
Audio-Dump (beide zeigen per Fremdschlüssel auf `community.communities` und `iam.users`).

## Folgen für die Kuration

Globale Audiodateien nur aus Quellen **ohne Namensnennungspflicht** (CC0, Public Domain) — die
Begründung des Bild-Pools gilt unverändert: es gibt keine Credit-Spalte und keinen Ort, an dem ein
Credit stünde. Der globale Bestand entsteht über dieselbe Oberfläche, kein Seed im Repo.

## Tests

**Kotlin**

- MockMvc-Kotlin-DSL: Mitglied sieht nur eigene, Admin alle, Fremder bekommt 404 statt 403; Quote
  greift; Duplikat wird benannt; Löschen ist endgültig; der globale Namensraum ist nur dem
  Super-Admin offen.
- Aufnahme für sich: Magic Bytes; Kopf mit 16 Bit Mono und Stereo wird angenommen; 8 Bit, 24 Bit,
  Float, drei Kanäle, null Frames, ein abgeschnittener Kopf werden abgelehnt. Die Test-WAVs baut der
  Test selbst (`AudioSystem.write`, wie `SnippetCutter`), keine Dateien im Repo.
- Testcontainers: die Listenabfrage fasst `bytes` nicht an; der Sperrschlüssel des Audio-Pools
  kollidiert nicht mit dem des Bild-Pools.
- `ModularityTests` bleibt grün: `audiopool` zeigt nur auf `community` und `iam`.

**Vitest**

- `toWav`: Kopf (Größen, Kanäle, Rate, Blockausrichtung), Verschränkung der Kanäle, Begrenzung und
  Rundung auf 16 Bit — mit einem selbstgebauten `AudioBuffer`-Double, weil happy-dom keinen hat.
- Warteschlange (aus den bisherigen `ImagePool`-Tests ins Composable gezogen): der Reihe nach, ein
  Fehlschlag reißt die übrigen nicht mit, der Grund steht an der richtigen Zeile; die beiden
  Browser-Gründe scheitern ohne Request.
- `AudioPool.vue`: Abspielen lädt erst beim Antippen; ein zweites Antippen stoppt; es spielt nur eine.
- Die Bild-Pool-Tests bleiben grün, nachdem Warteschlange und Upload-Beistand geteilt sind.

## Folgen für andere Dokumente

- **`frontend.md`**: der Upload-Beistand heißt jetzt `uploadFile` und nimmt einen Blob.
- **`deployment-server.md`** und **`deploy/README.md`**: der dritte Dump und seine Reihenfolge.
- **`modules-and-migrations.md`**: `audiopool` in der Modulliste, falls sie dort geführt wird.
