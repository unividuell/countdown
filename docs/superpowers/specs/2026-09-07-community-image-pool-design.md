# Bild-Pool — private Community-Bilder und ein globaler freier Bestand

**Status:** beschlossenes Design (2026-09-07).

**Baut auf:** dem [Community-Modul](2026-08-03-community-members-design.md) (Mandant,
`CommunityAccess`) und `iam` (wer hochgeladen hat).

**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — der Grund, warum die Sichtbarkeit
des Pools eine Spielentscheidung ist und nicht nur eine Frage der Bequemlichkeit.

**Berührt:** ein neues Modulith-Modul `imagepool` (ein Schema, eine Tabelle), zwei
Controller-Namensräume (`/api/communities/{slug}/images`, `/api/super-admin/images`), im Frontend
zwei dünne Seiten über einer gemeinsamen Komponente, einen zweiten binären Beistand neben
`fetchAssetBlob`, den Navigationseintrag und den Backup-Beiwagen in `deploy/compose.yaml`.

## Zweck

Kommende Spiele brauchen Bilder als Spielgrundlage. Die Bilder einer Spielgemeinschaft sind privat:
lesbar nur für diese Gemeinschaft. Daneben steht ein kleiner globaler Bestand freier Bilder, den
jede Gemeinschaft lesen darf — damit man anfangen kann, bevor jemand genug eigene Fotos
zusammengesucht hat.

Was hier entsteht: hochladen, privat halten, ansehen, löschen, sichern. **Sonst nichts.**

## Abgrenzung — was ausdrücklich nicht gebaut wird

Der Pool bereitet kein Spiel vor. Zum Zeitpunkt dieses Designs gibt es zwei Kandidaten (ein Bild
ganz zeigen; zwei Bilder in gleich große Quadrate schneiden und stückweise ausliefern), und beide
sind ungebaut. Ein Datenmodell, das ihre Zahlen schon kennt — 4:3, 1600×1200, Kachelraster — wäre
eine Wette auf Zahlen, die noch niemand gemessen hat.

**Die Absicherung gegen das Spiel in einem Jahr ist das unangetastete Original.** Jede abgeleitete
Form (Größe, Zuschnitt, Seitenverhältnis, Graustufen, Kacheln) entsteht daraus in Millisekunden.
Unwiederbringlich wäre nur, was der Hochladende weiß und nicht gefragt wurde — und genau das wird
bewusst nicht gefragt: ein Upload muss schnell gehen und mehrere Dateien auf einmal annehmen, ein
Formular davor würde ihn töten. Datum und ggf. Ort überleben im EXIF des Originals.

Daraus folgt konkret **nicht** gebaut: Ableitungstabelle und Spec-Enum, 4:3-Zuschnitt, Titel-,
Beschreibungs- und Credit-Felder, Kategorien/Tags, Fokuspunkt-Auswahl, eine mittlere Anzeigegröße,
und **keine nach außen exportierte Modul-API**. `org.unividuell.countdown.core.imagepool` bleibt
leer; alles liegt in `.internal`. Das erste Bildspiel bringt die Schnittstelle mit, weil es dann
weiß, was es braucht.

Vorbild ist das alte, manuelle Verfahren aus `huettehuette`
(`scripts/puzzle-scramble/prepare-puzzle-pieces.sh`): das Bild ging unverändert hinein, `magick`
machte alles Übrige — **neben** dem Produkt, nicht darin.

## Sichtbarkeit und Rechte

Hochladen darf jedes aktive Mitglied; die Liste sieht nur die Leitung. Das ist keine UI-Frage,
sondern Anti-Cheat: ein für alle sichtbarer Pool ist beim Kachelspiel praktisch
der Lösungsschlüssel. Ein Mitglied sieht nach dem Upload sein eigenes Bild — ein Einwurf, kein
Katalog.

| | Mitglied | Community-Admin | Super-Admin |
|---|---|---|---|
| Community-Pool: hochladen | ja | ja | ja (als Mitglied) |
| Community-Pool: Liste | nur eigene | alle | alle |
| Community-Pool: löschen | nur eigene | alle | alle |
| Globaler Pool: lesen | ja | ja | ja |
| Globaler Pool: schreiben/löschen | nein | nein | ja |

**Das Ziel eines Uploads bestimmt der Namensraum, nicht die Person.** `POST
/api/communities/{slug}/images` landet im Pool dieser Gemeinschaft — auch für den Super-Admin, der
über `CommunityAccess.requireActiveMember` ohnehin durchgereicht wird und dort schlicht als
Mitglied hochlädt. `POST /api/super-admin/images` landet im globalen Pool, und dorthin kommt
niemand sonst. Es gibt kein „Ziel“-Auswahlfeld im Formular: die Seite, auf der man steht, *ist* das
Ziel. Das folgt der Regel aus `multi-tenancy.md`, dass Community-Dinge unter `/c/` leben.

„Globaler Pool: lesen“ ist vorerst eine Regel über die Daten, kein Endpunkt: heute liefert nur
`/api/super-admin/images` den globalen Bestand aus, und dort kommt kein Mitglied hin. Eingelöst wird
das Recht vom ersten Bildspiel, das globale Bilder in eine Runde zieht — bis dahin gibt es keinen
Weg, auf dem ein Mitglied sie zu sehen bekäme.

Ein Bild, das man nicht sehen darf, antwortet mit **404, nicht 403** — dieselbe Nicht-Auskunft, die
die Community-Endpunkte schon geben.

**Löschen ist endgültig.** Kein Soft-Delete, keine aufgeschobene Byte-Freigabe. Die Folge, damit sie
ausgesprochen ist: benutzt eine vergangene oder laufende Runde das Bild, zeigt sie danach einen
Platzhalter. Der Pool kann das nicht verhindern — der Codepfeil wird `game → imagepool` zeigen, der
Pool weiß nichts von Runden, und die Runde hält nur eine weiche Referenz.

## Datenmodell

Modul `imagepool`, Schema gleichen Namens, Migration unter `db/migration/imagepool/`. Pfeile:
`imagepool → community`, `imagepool → iam`. Eine Tabelle.

```sql
CREATE SCHEMA IF NOT EXISTS imagepool;

CREATE TABLE imagepool.images (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    -- NULL = globaler Pool. Bewusste Abweichung von der NOT-NULL-Regel aus multi-tenancy.md:
    -- die Lesefrage jedes Spiels ist "community_id = ? OR community_id IS NULL", und wer das
    -- IS NULL vergisst, sieht zu wenig statt fremde Zeilen. Zwei Tabellen würden jeden Pfad
    -- doppeln (Upload, Thumbnail, Auslieferung) und dabei nichts absichern.
    community_id UUID REFERENCES community.communities(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES iam.users(id),
    media_type   TEXT        NOT NULL,
    width        INT         NOT NULL,
    height       INT         NOT NULL,
    byte_size    INT         NOT NULL,
    sha256       BYTEA       NOT NULL,
    bytes        BYTEA       NOT NULL,   -- das Original, unverändert
    thumb_bytes  BYTEA       NOT NULL,   -- JPEG, 400 px lange Kante, Seitenverhältnis erhalten
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dasselbe Bild zweimal im selben Pool ist ein Versehen. NULLS NOT DISTINCT, damit die Regel
-- auch für den globalen Pool greift (Postgres 15+).
CREATE UNIQUE INDEX images_pool_sha256 ON imagepool.images (community_id, sha256) NULLS NOT DISTINCT;
```

Alles in der Zeile steht in der Datei selbst — es gibt kein Feld, das ein Mensch ausfüllt. Das
Thumbnail wohnt als Spalte in derselben Zeile statt in einer Ableitungstabelle, weil es die einzige
Ableitung ist, die eine *heute existierende* Anforderung hat: eine Liste aus 150 Bildern darf
nicht 750 MB laden. Postgres lagert beide Byte-Spalten per TOAST aus, eine Abfrage ohne `bytes`
fasst das Original also gar nicht an.

**Warum die Bytes in Postgres liegen** und nicht auf einem Volume oder im Objektspeicher: bei dieser
Größenordnung (~2,45 GB) führt jede Alternative einen zweiten
Zustand ein, den jemand pflegen muss. Ein Volume kennt Waisen — eine gelöschte Zeile mit noch
vorhandener Datei, ein abgebrochener Upload — und bei endgültigem Löschen ist genau das die
Fehlerart, die zählt. Ein Restore müsste DB und Volume auf denselben Zeitpunkt bringen. Objektspeicher
löst das fremd, kostet dafür Konto und Rechnung, und privat bleiben die Bilder dort nur über
ablaufende signierte URLs oder einen Proxy durchs Backend — dann fließt der Verkehr doch wieder hier
durch. Das Projekt speichert mit `songsnippet.round_audio` bereits Binärdaten in Postgres. Der
Backup-Druck, das einzige ernsthafte Gegenargument, wird unten mit einem geänderten Dump-Aufruf
erledigt statt mit einem neuen Speichersystem.

**Grenzen als Konfiguration**, nicht als Konstante:

| Eigenschaft | Wert |
|---|---|
| `imagepool.per-community-limit` | 150 |
| `imagepool.global-limit` | 40 |
| `imagepool.max-bytes` | 15 MB |
| `imagepool.max-pixels` | 40 MP |
| akzeptierte Formate | JPEG, PNG, GIF, WebP |

Sie lassen sich später anheben und schneiden nichts ab, was man nicht neu hochladen könnte.

**Was die Quote wirklich zusagt**, ist nicht `150 × 5 MB`: die 5 MB sind der erwartete Schnitt, die
garantierte Obergrenze ist `150 × max-bytes` = 2,25 GB pro Community. Voll ausgereizt trägt der
Bestand also bis zu 7,35 GB (3 Communities plus globaler Bestand), erwartet ~2,45 GB. Wer eine der
beiden Zahlen anhebt, verschiebt den Plattenbedarf des Backups mit.

**Die Formatliste ist eine Entscheidung, keine Fähigkeitsgrenze.** JPEG, PNG und GIF liest das JDK
von Haus aus (BMP und TIFF ebenfalls — die bleiben draußen, sie treten hier nicht auf). **WebP
kostet eine Abhängigkeit**, `com.twelvemonkeys.imageio:imageio-webp`: das JDK hat keinen Leser
dafür, und WebP ist das Format, das moderne Geräte zunehmend ausgeben. HEIC und AVIF bleiben
außen vor.

Zwei Folgen, die man kennen muss:

- **Ein animiertes GIF läuft im Original, sein Thumbnail steht still** — `ImageIO` liest von einem
  animierten GIF das erste Bild. In der Verwaltungsliste stört das nicht; sobald ein Spiel bewegte
  Quellen zieht, muss *dieses Spiel* entscheiden, was ein animiertes Bild dort bedeutet.
- **Die Unterabtastung ist bei WebP keine Zusage.** Der TwelveMonkeys-Leser erfüllt die
  `ImageReadParam`-Schnittstelle, wendet die Unterabtastung aber unter Umständen erst nach dem
  vollständigen Dekodieren an. Bei den gemessenen Heap-Verhältnissen (unten) spielt das keine
  Rolle.

## Aufnahme

`POST /api/communities/{slug}/images` und `POST /api/super-admin/images`, `multipart/form-data`,
**eine Datei pro Request**. Mehrere Bilder heißt: das Frontend stellt sie in eine Schlange. Ein
Request mit zehn Dateien wären 150 MB Body und ein Alles-oder-nichts; einzeln ist jede Datei für
sich erfolgreich oder gescheitert — „Pool voll“ beim achten von zehn ist eine Aussage, kein Abbruch.

Geprüft wird von billig nach teuer, damit ein schlechter Upload früh stirbt:

1. **Magic Bytes**, nicht der `Content-Type` des Clients: `FF D8 FF` (JPEG), `89 50 4E 47` (PNG),
   `47 49 46 38` (GIF), `52 49 46 46` … `57 45 42 50` an Byte 8 (WebP, ein RIFF-Behälter).
2. **Größe** ≤ `max-bytes`.
3. **Maße aus dem Header** über `ImageIO.getImageReaders` + `getWidth`/`getHeight`, ohne
   vollständiges Dekodieren; > `max-pixels` fliegt raus.
4. **sha256** gegen den Pool — schon vorhanden ergibt eine klare Antwort, keinen stillen Erfolg.
5. **Quote** unter `pg_advisory_xact_lock` — Schlüssel ist die Community, für den globalen Pool
   eine feste Konstante, weil es dort keine ID gibt. Sonst kommen zwei gleichzeitige Uploads
   gemeinsam an der Quote vorbei.
6. **Thumbnail** erzeugen, dann speichern.

Zwei Fallen stecken in Schritt 6:

- **Unterabtastung beim Dekodieren** (`ImageReadParam.setSourceSubsampling`). Ein 40-MP-Bild wäre
  als `BufferedImage` ~160 MB Heap — bei den 1,41 GB, die der Buildpack-Rechner unter dem neuen
  `mem_limit: 2g` vergibt (gemessen), sind das 11 % des Heaps für einen einzigen Upload. Kein OOM,
  aber ohne Not. Klein dekodieren lässt davon ein paar MB übrig.
- **EXIF-Orientierung.** Die JDK-Bildbibliothek wendet sie nicht an, Handyfotos tragen sie fast
  immer — ohne Behandlung liegt jedes Hochformat in der Liste auf der Seite. Dafür
  `com.drewnoakes:metadata-extractor` (klein, abhängigkeitsfrei) zum Lesen des Tags, Drehung beim
  Erzeugen des Thumbnails. Das Original bleibt unberührt; Browser wenden die Orientierung selbst an.

Das Thumbnail ist **immer JPEG**, Alpha auf Weiß geflacht. Nicht wegen der Spalte — ein
formatgleiches Thumbnail käme mit `media_type` genauso aus —, sondern wegen der Größe: ein 400-px-
Foto wiegt als JPEG ~25 KB, als PNG ~250 KB, bei 150 Kacheln also 3,7 MB gegen 37 MB. Der Preis ist
die verlorene Transparenz, und den zahlen nur PNG-Grafiken, die in einem Fotopool der Sonderfall
sind.

**HEIC** kann die JDK-Bildbibliothek nicht lesen. iOS wandelt beim Datei-Upload meist selbst nach
JPEG, aber nicht zuverlässig. Die Ablehnung muss das benennen und sagen, was zu tun ist, statt
„ungültiges Format“.

## Auslieferung

| Methode | Pfad | Antwort |
|---|---|---|
| `GET` | `/api/communities/{slug}/images` | Liste (JSON, **ohne Bytes**) |
| `GET` | `…/images/{id}/thumb` | 400-px-JPEG |
| `GET` | `…/images/{id}` | das Original |
| `DELETE` | `…/images/{id}` | löschen |

Gespiegelt unter `/api/super-admin/images` für den globalen Bestand.

**Die Liste ist die Stelle, an der man sich verrechnet.** Ein Spring-Data-JDBC-Repository, das die
Entität zurückgibt, lädt *alle* Spalten — 150 Zeilen wären 750 MB Heap für eine Ansicht, die
Kacheln zeigt. Die Abfrage muss eine explizite Projektion sein, die `bytes` und `thumb_bytes` gar
nicht erst nennt: `id`, `width`, `height`, `byteSize`, `createdAt`, `uploadedBy`. Bytes kommen
ausschließlich über die beiden Byte-Endpunkte, jeder für genau ein Bild.

`uploadedBy` trägt den Anzeigenamen, nicht die ID — eine ID wäre in der Oberfläche wertlos und
erzwänge eine zweite Abfrage. Sortiert wird neueste zuerst.

Wer was sieht, ist eine Bedingung in derselben Abfrage: Admin `community_id = ?`, Mitglied
`community_id = ? AND uploaded_by = ?`.

**Zwischenspeicher:** Bilder sind unter ihrer ID unveränderlich, also `Cache-Control: private,
max-age=31536000, immutable` plus `ETag`. `private` ist kein Detail — es ist die Zusage, dass kein
geteilter Zwischenspeicher auf dem Weg ein Community-Bild aufbewahrt.

**Das Original wird nie automatisch geladen.** Die Liste zeigt Thumbnails; wer prüfen will, was er
hochgeladen hat, tippt darauf. Eine mittlere Anzeigegröße dafür einzuführen wäre die Ableitung, die
oben bewusst gestrichen wurde — und auf ein Antippen hin ist die volle Auflösung die ehrlichere
Antwort.

Der Original-Endpunkt setzt **kein `Content-Disposition: attachment`**. Er wird in einem neuen Tab
geöffnet, und mit `attachment` würde der Browser die Datei laden statt sie anzuzeigen.

## Frontend

Zwei dünne Seiten über einer gemeinsamen Komponente: `pages/c/[slug]/images.vue` und
`pages/super-admin/images.vue`, die sich nur im Endpunkt unterscheiden. Englische Pfadsegmente,
deutsche Oberfläche — wie `members`/`requests`/`settings`. Im Navigationsschubfach gehört der
Eintrag in den **Community-Block, nicht in den Admin-Block**: „Bilder“ sieht jedes Mitglied.

**Der Upload kann nicht über `apiFetch` laufen**, aus zwei unabhängigen Gründen: der Vertrag ist
JSON-only (`body?: string`), und `REQUEST_TIMEOUT_MS = 10_000` bricht einen 5-MB-Upload über
Mobilfunk zuverlässig ab. Es wird also ein zweiter binärer Beistand neben `fetchAssetBlob` —
dieselbe Rolle, dieselbe Begründung, die dort schon im Kommentar steht. Er nutzt
`XMLHttpRequest`, weil `fetch` keinen Upload-Fortschritt kennt und 5 MB auf dem Handy ohne Balken
wie ein Absturz aussehen. Aus `client.ts` holt er sich das Lesen des `XSRF-TOKEN`-Cookies und den
401-Handler, statt sie zu kopieren; beide sind dort heute privat und werden exportiert.

**Hochgeladen wird der Reihe nach, nicht parallel.** Über eine Mobilfunkleitung teilen sich
parallele Uploads dieselbe Bandbreite: alles dauert genauso lange, nur zeigen dann fünf Balken
gleichzeitig etwas Unbestimmtes an. Pro Datei eine Zeile mit Fortschritt und Ergebnis; „HEIC wird
nicht unterstützt“ oder „Pool voll“ steht an der Datei, die es betrifft, und die übrigen laufen
weiter.

Die Liste ist ein Thumbnail-Raster, zweispaltig auf dem Handy. Antippen öffnet das Original **in
einem neuen Tab**, nicht in einer Überlagerung: der Endpunkt liefert `Content-Type: image/jpeg` und
die Bytes, der Browser zeigt sie in seiner eigenen Bildansicht — Pinch-Zoom und Sichern sind dort
geschenkt, und es spart die Überlagerung samt Fokusfalle und Escape-Behandlung. Das ist die einzige
Stelle, an der jemals 5 MB fließen. Löschen mit Rückfrage, weil es endgültig ist. Darüber ein Zähler
„12 von 150“: ohne ihn wählt jemand fünfzig Bilder aus und erfährt erst bei Nummer neun, dass
Schluss ist.

**Der Datei-Auswähler ist der native des Systems**, wie ein Datumsauswähler: `<input type="file"
accept="image/jpeg,image/png,image/gif,image/webp" multiple>` öffnet auf iOS das System-Blatt („Fotomediathek“, „Foto
aufnehmen“, „Durchsuchen“), auf Android die System-Auswahl, und die Mediathek erlaubt
Mehrfachauswahl — die Schlange bekommt also alle Dateien auf einmal gereicht. `accept` ist dabei
mehr als ein Filter: greift Safari in die Mediathek und HEIC steht nicht darin, wandelt es beim
Übergeben nach JPEG — deshalb steht `image/jpeg` an erster Stelle. Über „Durchsuchen“ kann trotzdem ein HEIC hereinkommen; die Zusage bleibt die
serverseitige Ablehnung, `accept` ist die Bequemlichkeit davor.

## Backup und Betrieb

Der Bestand wiegt bei vollen Pools und 5-MB-Schnitt ~2,45 GB (3 × 150 Community plus 40 global; die
Thumbnails sind mit ~12 MB gerundet nicht sichtbar), im ausgereizten Fall das Dreifache. Ein
`pg_dump` in Klartext hext die Bytes auf das Doppelte, `gzip` holt das wieder herein — ein Dump
wiegt also ungefähr den Bestand selbst. Ungeteilt wären das jede Nacht neu und sieben Tage
vorgehalten ~17 GB, für Daten, die sich fast nie ändern.

Der Schnitt läuft nicht über Schemata, sondern über die Daten einer Tabelle:

```
app-<ts>.sql.gz      täglich   pg_dump --exclude-table-data=imagepool.images
images-<ts>.sql.gz   bei Änderung   pg_dump --data-only --table=imagepool.images
```

`--exclude-table-data` behält die Tabellendefinition und lässt nur den Inhalt weg. Das ist der
Unterschied, der zählt: eine Wiederherstellung allein aus dem Tagesdump ergibt eine **lauffähige App
mit leerem Pool** — nicht eine, die bei jeder Bildabfrage über ein fehlendes Schema stolpert. Der
Bilddump ist reines `--data-only` und legt sich konfliktfrei darüber.

Ausgelöst wird er über einen Fingerabdruck, nicht über einen Wochenrhythmus:

```sql
SELECT count(*) || '-' || coalesce(md5(string_agg(id::text, ',' ORDER BY id)), '0')
FROM imagepool.images
```

Der Schleifendurchlauf vergleicht ihn mit der Datei neben den Dumps und schreibt nur bei Abweichung.
Ein unveränderter Pool kostet damit eine Abfrage über ~490 Zeilen pro Tag statt 2,45 GB; ein Upload
landet noch in derselben Nacht im Backup, statt bis zu einem Wochentermin ungesichert zu liegen.

**Vorhaltung: `IMAGE_BACKUP_KEEP` Bilddumps, voreingestellt 8.** Die Zahl steht in `.env.<target>`
und ist damit auf dem Server drehbar, ohne Deploy. Sie darf großzügig sein: die Zielmaschine hat
181 GB frei bei 7 % Belegung (gemessen am 2026-09-10), acht Stände kosten bei vollen Pools ~20 GB.

Weil die Auslösung an der Änderung hängt, sind das die letzten acht *Änderungen*, nicht die letzten
acht Tage — ein versehentliches Massenlöschen und sieben weitere Uploads verbrauchen alle Stände.
Bei handverlesenen Uploads ist das ein Puffer über Monate; es ist nur nicht dasselbe wie acht Tage.

`deploy/README.md` bekommt die Reihenfolge: **erst der Tagesdump, dann der Bilddump** — die
Bildzeilen zeigen per Fremdschlüssel auf `community.communities` und `iam.users`.

Der Beiwagen bleibt bei der Härtung aus `deployment-server.md`: `set -eo pipefail`, `until
pg_isready`, `$$(...)` in `command:`-Blöcken.

Beim Bauen nachzuziehen: `spring.servlet.multipart.max-file-size` / `max-request-size` auf
15/16 MB — die Vorgabe ist 1 MB und würde jeden echten Upload ablehnen.

Was am 2026-09-10 auf `oci.unividuell.org` nachgesehen und **erledigt** ist: weder der eigene noch
der geteilte Rand-Caddy setzt ein `request_body max_size`, der Upload läuft also ungehindert durch.

Bei der Vermessung fiel auf, dass `core` ohne `mem_limit` lief — weshalb der Buildpack-Rechner
jeder der beiden JVMs (prod und staging) ~20 GB Heap zubilligte, auf einer Maschine mit 23 GB, neben
`comunio-news`, `mobility-manager` und dem Rand-Caddy, und beide mit `-XX:+ExitOnOutOfMemoryError`.
Unkritisch, solange nichts allokiert; Bilddekodierung wäre die erste Last in dieser App, die
schubweise hunderte MB anfasst. **Das ist auf diesem Branch bereits behoben** (`mem_limit:
${CORE_MEM_LIMIT:-2g}`, gemessene Folge: `-Xmx1477094K` gegen ~715 MB Arbeitsmenge) und damit eine
Voraussetzung dieses Entwurfs, keine offene Aufgabe.

## Tests

Backend, MockMvc-Kotlin-DSL: Mitglied sieht nur eigene, Admin alle, Fremder bekommt 404 statt 403;
Quote greift; Duplikat wird benannt; Löschen ist endgültig. Testcontainers für das Repository —
besonders dafür, dass die Listenabfrage die Byte-Spalten wirklich nicht anfasst.

Die Aufnahme-Kette wird für sich geprüft: Magic Bytes, Maße aus dem Header, unterabgetastetes
Dekodieren, Orientierung. Testbilder erzeugt der Test selbst, wie `FindPatternImages` es vormacht —
mit einer Ausnahme: ein kleines JPEG **mit** EXIF-Orientierung kommt als Datei ins Repo, weil EXIF
im Test zusammenzubauen mehr Code wäre als das, was es prüft. Kein Spielinhalt, kein Geheimnis.

`ModularityTests` bleibt grün: `imagepool` zeigt nur auf `community` und `iam`, exportiert nichts.

Frontend, Vitest: die Warteschlange läuft der Reihe nach, ein Fehlschlag reißt die folgenden Dateien
nicht mit, die Meldung steht an der richtigen Zeile. `XMLHttpRequest` gibt es in happy-dom nicht
brauchbar, also ein Double, das Fortschritts- und Abschlussereignisse selbst auslöst.

## Folgen für die Kuration

Globale Bilder nur aus Quellen **ohne Namensnennungspflicht** (CC0, Public Domain, Unsplash,
Pexels). Wikimedia-CC-BY fällt aus, weil es einen Credit verlangt, den es nirgends anzuzeigen gibt —
die Credit-Spalte wurde bewusst gestrichen.

Der globale Bestand entsteht dadurch, dass ein Super-Admin ihn über dieselbe Oberfläche hochlädt.
Es gibt keinen zweiten Aufnahmeweg: kein Seed im Repo (öffentlich — der ganze Bestand wäre für jeden
einsehbar, und git behielte jede Fassung für immer), kein Tarball beim Deploy. Eine frische Staging-
oder Lokal-Datenbank startet damit ohne Bestand; dort tun ein paar Beispielbilder, sofern überhaupt
jemand sie vermisst.
