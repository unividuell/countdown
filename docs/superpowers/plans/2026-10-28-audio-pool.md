# Audio-Pool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein spielneutraler Audio-Pool nach dem Vorbild des Bild-Pools: Mitglieder laden Audiodateien in den privaten Pool ihrer Spielgemeinschaft, der Super-Admin pflegt einen globalen Bestand; hochladen, anhören, löschen, sichern.

**Architecture:** Ein neues Modulith-Modul `audiopool` (Schema `audiopool`, Tabelle `clips`, alles in `.internal`), gebaut wie `imagepool`: Tor, Service mit Prüfung vor der Transaktion, Projektion ohne Bytes, zwei Controller. Im Browser dekodiert `decodeAudioData` jede abspielbare Datei und `toWav` baut 16-Bit-PCM; der Server liest nur den Kopf. Upload-Beistand und Warteschlange des Bild-Pools werden geteilt, `usePlayback` zieht nach `ui/`, der Backup-Beiwagen bekommt einen dritten Dump.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / PostgreSQL 18 · `javax.sound.sampled` · JUnit 5 + kotest-Matcher + mockk + MockMvc-Kotlin-DSL + Testcontainers · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4 · Docker Compose (Backup-Beiwagen).

**Spec:** [`docs/superpowers/specs/2026-10-24-audio-pool-design.md`](../specs/2026-10-24-audio-pool-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr. Vorbild im Code: `core/.../imagepool/internal/*`, `webapp-vue/src/images/ImagePool.vue`, `webapp-vue/src/api/images.ts`.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden oder schweigt):

1. **Präfix `Audio…`** für jede Klasse (`AudioPoolGate`, `AudioPoolService`, `AudioClipRepository`, `AudioPoolContext`, …). Spring benennt Beans nach dem einfachen Klassennamen; neben `ImagePoolGate` darf nichts kollidieren, und eine Fehlermeldung soll den Pool nennen.
2. **Sperre:** `pg_advisory_xact_lock(int, int)` mit `AUDIO_LOCK_CLASS = 0x41554449` („AUDI“) und dem Schlüssel `(communityId?.toString() ?: "audiopool:global").hashCode()`. Postgres hält Ein- und Zwei-Argument-Schlüssel in getrennten Räumen, also wartet kein Bild-Upload auf einen Audio-Upload.
3. **Null Frames → `BROKEN_AUDIO`:** ein Kopf ohne Signal ist eine kaputte Datei, keine falsche Kodierung.
4. **Dateiname:** der Teil nach dem letzten `/` oder `\`, getrimmt, auf 200 Zeichen gekürzt; leer oder fehlend → `audio.wav`.
5. **`durationMs = frames * 1000L / sampleRate`**, abgerundet, berechnet beim Bauen der Antwort.
6. **Float → 16 Bit:** auf [−1, 1] begrenzen, negativ × 32768, positiv × 32767, `Math.round`; NaN → 0.
7. **Browser-Codes** als `UploadError(code, 0)`, behandelt wie Server-Codes, ohne Request: `TOO_LONG` (Dauer > 60 s, oder unbekannt und Eingabe > 2 MB), `UNDECODABLE` (Dekodieren scheitert oder kein Graph), `TOO_LARGE` (WAV > `maxBytes`, derselbe Code wie der Server).
8. **Geteilt statt kopiert:** `api/upload.ts` (`UploadError`, `uploadFile`), `ui/useUploadQueue.ts` (der Ablauf) und `ui/UploadQueueRows.vue` (die Zeilen, Markup wörtlich aus `ImagePool.vue`). Die Liste darunter bleibt je Pool: Kacheln hier, Zeilen dort.
9. **`usePlayback` zieht nach `ui/usePlayback.ts`:** ein Pool importiert nicht aus einem Spiel. Reiner Umzug; nur das Log-Präfix wird `[playback]`.
10. **Abspielen:** eine `usePlayback`-Instanz pro `AudioPool`, `playingId` merkt die Zeile. `setSource` erst beim Antippen — es lädt sofort, also nie für die ganze Liste.
11. **Hochladen erst mit bekannter Grenze:** der Wähler ist deaktiviert, bis die Liste (und mit ihr `maxBytes`) geladen ist.
12. **Navigation:** Icon `~icons/lucide/audio-lines`, `data-test="community-audio"`, direkt rechts neben dem Bilder-Symbol. Auf `/super-admin` ein Eintrag „Audio“ nach „Bilder“, sonst wäre der globale Bestand nur per URL erreichbar.
13. **Backup:** der Fingerabdruck-Block wird eine Bash-Funktion `dump_on_change <table> <prefix> <keep>`, zweimal aufgerufen, statt 25 kopierter Zeilen.
14. **`RecordingTransactionManager`** zieht aus `ImagePoolServiceTest` in eine geteilte Testdatei; beide Service-Tests nutzen ihn.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Autor `cleemansen@gmail.com`. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit. Branch: `feature/audio-pool` (trägt die Spec), Worktree über superpowers:using-git-worktrees. Nicht pushen.
- **Kotlin:** benannte Argumente ab zwei Argumenten (`.claude/guidelines/kotlin.md`).
- **Tests:** mockk + kotest-Matcher + MockMvc-Kotlin-DSL + Testcontainers (`testing.md`); Vitest mit `vi` (`frontend-testing.md`). TDD: erst rot, dann grün.
- **Persistenz:** Spring Data JDBC, `uuidv7()` als Default, kein `@Column`, `@Table(schema = "audiopool", name = "clips")` (`persistence.md`).
- **Der Pool kennt kein Spiel:** keine Prüfung von Länge, Inhalt oder Stille, kein Schnitt, kein Heruntermischen. Keine Exporte im Wurzelpaket `audiopool`.
- **Grenzen:** `audiopool.per-community-limit` = 200, `audiopool.global-limit` = 50, `audiopool.max-bytes` = `5 * 1024 * 1024`. Angenommen: `RIFF`…`WAVE`, `PCM_SIGNED`, 16 Bit, Little Endian, 1–2 Kanäle, 8 000–96 000 Hz, > 0 Frames.
- **Rechte:** Unsichtbares ist **404, nie 403**. Mitglied: nur eigene; Community-Admin und Super-Admin: alle; `/api/super-admin/audio` nur für den Super-Admin.
- **Auslieferung:** `Content-Type: audio/wav`, `Cache-Control: private, max-age=31536000, immutable`, kein `ETag`. Liste ohne Bytes, neueste zuerst.
- **Frontend:** Handy zuerst, Tippziele ≥ 44 px (`min-h-11`, `size-11`), keine Secure-Context-APIs. Vor jedem Commit `pnpm test`, `pnpm lint`, `pnpm typecheck` grün.
- **Texte, wörtlich:**

  | Stelle | Text |
  |---|---|
  | Überschrift | „Audio“ |
  | Wähler | „Audiodateien auswählen“ |
  | Zähler (nur Leitung) | „12 von 200“ |
  | Abspielen / Anhalten (`aria-label`) | „Abspielen“ / „Anhalten“ |
  | Löschen (`aria-label`, Rückfrage) | „Datei löschen“, „Diese Datei endgültig löschen?“ |
  | Fehler Liste / Löschen | „Audio konnte nicht geladen werden.“, „Löschen fehlgeschlagen.“ |
  | `UNSUPPORTED_FORMAT` | „Dieses Format nimmt der Server nicht an.“ |
  | `BROKEN_AUDIO` | „Die Datei ließ sich nicht lesen.“ |
  | `TOO_LARGE` | „Zu lang (höchstens 5 MB als WAV, etwa 27 s Stereo).“ — Zahlen aus `maxBytes`: MB = `Math.round(maxBytes / 1048576)`, s = `Math.floor(maxBytes / 192000)` |
  | `TOO_LONG` | „Zu lang (höchstens 60 s).“ |
  | `UNDECODABLE` | „Dein Browser kann diese Datei nicht abspielen.“ |
  | `POOL_FULL`, `DUPLICATE`, `NETWORK` | „Der Pool ist voll.“, „Diese Datei ist schon im Pool.“, „Verbindung unterbrochen.“ |
  | sonst | „Upload fehlgeschlagen.“ |

## Review Focus

1. **Unbekannte Dauer:** Meldet `<audio>` `Infinity` oder gar nichts (`NaN`), läuft eine Datei über 2 MB als `TOO_LONG` aus, **ohne** dekodiert zu werden; eine kleine wird dekodiert. → Task 7.
2. **Nicht-endliche Samples** aus dem Decoder (`NaN`, `±Infinity`) werden 0 bzw. begrenzt, `toWav` wirft nie. → Task 7.
3. **Ein Dateiname mit Pfad, über 200 Zeichen oder leer** wird als reiner Name, gekürzt bzw. als `audio.wav` gespeichert. → Task 3.
4. **Wer die gerade spielende Datei löscht**, hört sie verstummen. → Task 8.
5. **Eine Datei, die gar kein Audio ist** (Android-Dateiwähler ignoriert `accept`), scheitert an ihrer Zeile mit „Dein Browser kann diese Datei nicht abspielen.“, ohne Request, und die übrigen laufen weiter. → Task 8.

---

### Task 1: Schema, Datensatz und Repository

**Files:**
- Create: `core/src/main/resources/db/migration/audiopool/V1__create_clips.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioClip.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioClipProjections.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioClipRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/audiopool/AudioClipRepositoryTest.kt`

**Interfaces:**
- Produces:
  - `class AudioClip(id: UUID? = null, communityId: UUID?, uploadedBy: UUID, fileName: String, channels: Int, sampleRate: Int, frames: Int, byteSize: Int, sha256: ByteArray, bytes: ByteArray, @CreatedDate createdAt: Instant? = null)` — normale Klasse wie `Image` (ByteArray-Gleichheit ist Identität).
  - `data class AudioClipSummary(id: UUID, communityId: UUID?, uploadedBy: UUID, fileName: String, channels: Int, sampleRate: Int, frames: Int, byteSize: Int, createdAt: Instant)`
  - `class WavBytes(val bytes: ByteArray)` — Träger für eine Spalte, aus demselben Grund wie `ThumbBytes`.
  - `const val AUDIO_LOCK_CLASS: Int = 0x41554449` (oberste Ebene in `AudioClipRepository.kt`)
  - `AudioClipRepository : CrudRepository<AudioClip, UUID>` mit `listForCommunity(communityId: UUID)`, `listForUploader(communityId: UUID, uploadedBy: UUID)`, `listGlobal()`, `findSummary(id: UUID): AudioClipSummary?`, `findWavBytes(id: UUID): WavBytes?`, `findWav(id: UUID): ByteArray?` (Default-Methode), `countInPool(communityId: UUID?): Long`, `existsInPool(communityId: UUID?, sha256: ByteArray): Boolean`, `lockPool(classId: Int, key: Int): Long`, `deleteClip(id: UUID): Int`. Listen `ORDER BY id DESC`, Pool-Abfragen mit `IS NOT DISTINCT FROM`.

- [ ] **Step 1: Write the failing tests** — Bauform von `ImageRepositoryTest`: `@SpringBootTest` mit Testcontainers, **nicht** `@Transactional`, Aufräumen der angelegten Communities und `DELETE FROM audiopool.clips WHERE community_id IS NULL` nach jedem Test. Fälle:
  - `lists a community's clips newest first, and never another pool's`
  - `a member sees only their own uploads`
  - `the same file twice is refused within a pool, but allowed across pools` (`DuplicateKeyException`)
  - `NULLS NOT DISTINCT -- the rule bites in the global pool too`
  - `no summary query reads the bytes column` — wie das Bild-Pendant über die `@Query`-Annotationen von `listForCommunity`, `listForUploader`, `listGlobal`, `findSummary`; zwischen `SELECT` und `FROM` weder `bytes` noch `*`.
  - `the pool lock is SQL Postgres accepts` — `clips.lockPool(classId = AUDIO_LOCK_CLASS, key = 7) shouldBe 1L`
  - `the audio lock leaves the image pool's key space free` — in einem `TransactionTemplate` `clips.lockPool(classId = AUDIO_LOCK_CLASS, key = k)`; auf einer zweiten Verbindung aus der `DataSource`: `SELECT pg_try_advisory_xact_lock(?::bigint)` mit `k.toLong()` ist `true`, `SELECT pg_try_advisory_xact_lock(?, ?)` mit `(AUDIO_LOCK_CLASS, k)` ist `false`.
  - `counts, wav reads and deletion` — dazu `findSummary(id)!!.channels shouldBe 2` (SMALLINT ↔ `Int`).
  - `deleting the community takes its clips with it`

- [ ] **Step 2: Run to verify it fails**
  Run: `cd core && ./mvnw test -Dtest=AudioClipRepositoryTest`
  Expected: Kompilierfehler (`AudioClip` unbekannt).

- [ ] **Step 3: Implement** — Migration wörtlich aus der Spec (*Datenmodell*), den Kommentar zur `NULL`-Spalte und zum Index wie in `imagepool/V1__create_images.sql`. Entity, Projektion, Repository wie oben; `lockPool` als `SELECT count(*) FROM (SELECT pg_advisory_xact_lock(:classId, :key)) AS locked`.

- [ ] **Step 4: Run to verify it passes**
  Run: `cd core && ./mvnw test -Dtest=AudioClipRepositoryTest`
  Expected: PASS. Die Tests laufen nur, wenn Flyway das Schema `audiopool` angelegt hat — das ist zugleich die Prüfung, dass Modulith das Modul erkennt.

- [ ] **Step 5: Commit** — `Add the audio pool's table and repository`

### Task 2: Den WAV-Kopf prüfen

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolExceptions.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/WavIntake.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/audiopool/WavIntakeTest.kt`

**Interfaces:**
- Produces:
  - `sealed class AudioPoolException(val code: String, message: String) : RuntimeException(message)` mit `AudioPoolAccessDeniedException` (`NO_ACCESS`), `AudioClipNotFoundException` (`NOT_FOUND`), `AudioPoolFullException(limit: Int)` (`POOL_FULL`), `DuplicateAudioException` (`DUPLICATE`), `UnsupportedAudioFormatException` (`UNSUPPORTED_FORMAT`), `AudioTooLargeException(maxBytes: Int)` (`TOO_LARGE`), `BrokenAudioException` (`BROKEN_AUDIO`). Englische Server-Meldungen; der Kopf-Kommentar wie bei `ImagePoolException`.
  - `data class WavFormat(val channels: Int, val sampleRate: Int, val frames: Int)`
  - `object WavIntake { fun isWav(bytes: ByteArray): Boolean; fun inspect(bytes: ByteArray): WavFormat }` — `isWav`: `RIFF` an 0 und `WAVE` an 8, kürzere Eingabe `false`. `inspect` wirft `BrokenAudioException`, wenn `AudioSystem.getAudioFileFormat` scheitert oder null Frames meldet, `UnsupportedAudioFormatException` bei allem außerhalb der Global Constraints.

- [ ] **Step 1: Write the failing tests** — die WAVs baut der Test mit `AudioSystem.write(AudioInputStream(…, AudioFormat(…), frames), AudioFileFormat.Type.WAVE, out)`, keine Dateien im Repo:
  - `recognises RIFF WAVE by its magic bytes` — `isWav(wav())` true; `"RIFF\u0000\u0000\u0000\u0000AVI "` false; `ByteArray(4)` false.
  - `accepts 16-bit mono and stereo` — `inspect(wav(channels = 1, rate = 48000f, frames = 480)) shouldBe WavFormat(1, 48000, 480)`; ebenso Stereo bei 44 100.
  - `refuses 8-bit, 24-bit, float and three channels as unsupported`
  - `refuses sample rates outside 8 to 96 kHz` — 4 000 und 192 000.
  - `a header without frames is broken`
  - `a truncated header is broken` — `wav().copyOf(20)`: `isWav` true, `inspect` wirft `BrokenAudioException`.

- [ ] **Step 2: Run to verify it fails**
  Run: `cd core && ./mvnw test -Dtest=WavIntakeTest` — Expected: Kompilierfehler.

- [ ] **Step 3: Implement** Exceptions und `WavIntake` wie oben.

- [ ] **Step 4: Run to verify it passes** — `cd core && ./mvnw test -Dtest=WavIntakeTest` — PASS.

- [ ] **Step 5: Commit** — `Check uploaded WAV headers for the audio pool`

### Task 3: Der Service

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolProperties.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolContext.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolService.kt`
- Create: `core/src/test/kotlin/org/unividuell/countdown/core/RecordingTransactionManager.kt` (aus `ImagePoolServiceTest` herausgezogen, `internal class`)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolServiceTest.kt` (private Klasse entfernen, importieren)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/audiopool/AudioPoolServiceTest.kt`
- Modify (Test): `AudioClipRepositoryTest.kt`

**Interfaces:**
- Consumes: Task 1 (`AudioClipRepository`, `AUDIO_LOCK_CLASS`), Task 2 (`WavIntake`, Exceptions).
- Produces:
  - `@ConfigurationProperties(prefix = "audiopool") data class AudioPoolProperties(val perCommunityLimit: Int = 200, val globalLimit: Int = 50, val maxBytes: Int = 5 * 1024 * 1024)` — KDoc wie bei `ImagePoolProperties` (Multipart-Grenze, reine Bytes als Override).
  - `data class AudioPoolContext(val communityId: UUID?, val viewerIsAdmin: Boolean)`
  - `AudioPoolService(clips: AudioClipRepository, limits: AudioPoolProperties, transactions: TransactionTemplate)` mit `upload(pool: AudioPoolContext, uploaderId: UUID, fileName: String?, bytes: ByteArray): AudioClipSummary`, `list(pool, viewerId): List<AudioClipSummary>`, `count(pool): Long`, `limitOf(pool): Int`, `maxBytes(): Int`, `wav(pool, id, viewerId): ByteArray`, `@Transactional delete(pool, id, viewerId)`.
  - `fun cleanFileName(raw: String?): String` (oberste Ebene in `AudioPoolService.kt`).

- [ ] **Step 1: Write the failing tests** — Bauform von `ImagePoolServiceTest` (gemocktes Repository, echter `TransactionTemplate` über `RecordingTransactionManager`):
  - `stores the WAV untouched with its header facts` — gespeicherter `AudioClip`: `bytes` identisch, `channels`/`sampleRate`/`frames` aus dem Kopf, `sha256.size shouldBe 32`, `byteSize`, `fileName`.
  - `refuses a non-WAV before anything else` — MP3-Anfang `ID3…` → `UnsupportedAudioFormatException`; `lockPool` nie aufgerufen.
  - `refuses an oversized file before reading its header` — `maxBytes = 100`, WAV größer → `AudioTooLargeException`.
  - `a broken header is BROKEN_AUDIO`
  - `refuses a duplicate` und `refuses when the pool is full` — die globale Grenze greift bei `communityId = null`.
  - `takes the audio lock inside the transaction` — `lockPool(classId = AUDIO_LOCK_CLASS, key = communityId.toString().hashCode())`, während `RecordingTransactionManager.active`.
  - `a member cannot read or delete someone else's clip, nor one from another pool` — `AudioClipNotFoundException` in beiden Fällen.
  - `cleans the file name` — `"C:\\fakepath\\spruch.wav"` → `"spruch.wav"`, `"a/b/c.wav"` → `"c.wav"`, 300 × `x` → 200 Zeichen, `"  "` und `null` → `"audio.wav"`.
  - In `AudioClipRepositoryTest`: `the real upload path takes the lock and commits the row`.

- [ ] **Step 2: Run to verify it fails** — `cd core && ./mvnw test -Dtest='AudioPoolServiceTest,AudioClipRepositoryTest,ImagePoolServiceTest'` — Kompilierfehler.

- [ ] **Step 3: Implement** — Reihenfolge aus der Spec (*Aufnahme*): `isWav` → Größe → `inspect` → sha256, alles vor der Transaktion; in der Transaktion Sperre, Quote, Duplikat, Speichern, `findSummary`. Den Kommentar zum `TransactionTemplate` aus `ImagePoolService` sinngemäß übernehmen.

- [ ] **Step 4: Run to verify it passes** — derselbe Befehl, PASS; `ImagePoolServiceTest` bleibt grün.

- [ ] **Step 5: Commit** — `Store audio clips with quota and duplicate checks`

### Task 4: Tor, Endpunkte, Fehlerbilder

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolGate.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolDtos.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolController.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/SuperAdminAudioController.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/audiopool/internal/AudioPoolExceptionHandler.kt`
- Modify: `core/src/main/resources/application.yaml:34-35` (Kommentar: die Multipart-Grenze muss über **beiden** `maxBytes` liegen)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/audiopool/AudioPoolGateTest.kt`, `AudioPoolControllerTest.kt`, `SuperAdminAudioControllerTest.kt`

**Interfaces:**
- Consumes: Task 3.
- Produces (JSON, das Task 8 liest):
  - `AudioClipResponse(id: UUID, fileName: String, durationMs: Long, channels: Int, byteSize: Int, createdAt: Instant, uploadedBy: String)` — `uploadedBy` ist der Anzeigename, fehlt der Nutzer: `"?"`.
  - `AudioListResponse(clips: List<AudioClipResponse>, used: Long, limit: Int, viewerIsAdmin: Boolean, maxBytes: Int)`
  - `AudioPoolGate.forCommunity(slug: String, userId: UUID, isSuperAdmin: Boolean): AudioPoolContext`, `AudioPoolGate.global(isSuperAdmin: Boolean): AudioPoolContext` — wörtlich `ImagePoolGate` mit den Audio-Ausnahmen, samt dem Kommentar zur Flyway-Reihenfolge.
  - Routen: `GET|POST /api/communities/{slug}/audio`, `GET|DELETE /api/communities/{slug}/audio/{id}`, gespiegelt unter `/api/super-admin/audio`. Upload: Multipart-Feld `file`, `file.originalFilename` geht als `fileName` an den Service. `DELETE` → 204.
  - Status: 404 `NO_ACCESS`/`NOT_FOUND`, 409 `POOL_FULL`/`DUPLICATE`, 415 `UNSUPPORTED_FORMAT`, 413 `TOO_LARGE` (auch `MaxUploadSizeExceededException`), 422 `BROKEN_AUDIO`; Body `ProblemDetail` mit Eigenschaft `code`.

- [ ] **Step 1: Write the failing tests** — Bauform der Bild-Gegenstücke:
  - Gate: `an unknown slug and a non-member are both refused with the same exception`, `a member sees only their own, an admin all`, `a super-admin passes without a membership`, `the global pool admits a super-admin and nobody else`.
  - Controller (`@MockkBean` für Gate, Service, `UserQuery`):
    - `a non-member gets 404, never 403`
    - `the listing carries quota, maxBytes and the uploader's name, never bytes` — Summary mit `frames = 72000`, `sampleRate = 48000` → `$.clips[0].durationMs` = 1500; `$.maxBytes` = 5242880; `$.clips[0].bytes` existiert nicht.
    - `an upload passes the original file name on` — `MockMultipartFile("file", "spruch.wav", "audio/wav", …)`; `verify { service.upload(pool = …, uploaderId = …, fileName = "spruch.wav", bytes = …) }`.
    - `the WAV is served as audio/wav and cached privately for a year` — `Content-Type` `audio/wav`, `Cache-Control` genau wie oben, kein `ETag`.
    - `refusals carry their code and status` — je ein Fall für 409 `DUPLICATE`, 413 `TOO_LARGE`, 415 `UNSUPPORTED_FORMAT`, 422 `BROKEN_AUDIO`.
    - `delete answers 204`
  - Super-Admin: `a non-super-admin gets 404 on every route`, `a super-admin lists the global pool`.

- [ ] **Step 2: Run to verify it fails** — `cd core && ./mvnw test -Dtest='AudioPool*Test,SuperAdminAudioControllerTest'` — Kompilierfehler.

- [ ] **Step 3: Implement** wie oben. `namesFor` und die Antwort-Abbildung wie in den Bild-Controllern, `durationMs` nach Entscheidung 5.

- [ ] **Step 4: Run the whole backend suite** — `cd core && ./mvnw clean test` — alles grün, auch `ModularityTests` (`audiopool` hängt nur an `community` und `iam`).

- [ ] **Step 5: Boot once** (`configuration.md`: `application.yaml` berührt) — `cd core && ./mvnw spring-boot:run`, warten auf „Started“, im Log steht die Migration `audiopool` auf V1; beenden.

- [ ] **Step 6: Commit** — `Serve the audio pool to members and the super-admin`

### Task 5: `usePlayback` nach `ui/`

**Files:**
- Move: `webapp-vue/src/games/songsnippet/usePlayback.ts` → `webapp-vue/src/ui/usePlayback.ts` (`git mv`)
- Move: `webapp-vue/src/games/songsnippet/__tests__/usePlayback.spec.ts` → `webapp-vue/src/ui/__tests__/usePlayback.spec.ts`
- Modify: `games/songsnippet/SongSnippetBoard.vue`, `SongPlayerReveal.vue`, `SongSnippetScoreboard.vue` (Import `@/ui/usePlayback`); `vi.mock('@/games/songsnippet/usePlayback', …)` in `SongPlayerReveal.spec.ts`, `SongSnippetScoreboard.spec.ts`, `SongSnippetBoard.spec.ts`; Pfade im verschobenen Spec

**Interfaces:**
- Produces: `usePlayback()` aus `@/ui/usePlayback`, Signatur unverändert (`positionSeconds`, `playing`, `setSource`, `restart`, `pause`, `dispose`).

- [ ] **Step 1: Move and repoint** — Umzug, alle Importe und `vi.mock`-Pfade; im `console.warn` das Präfix `[song-snippet]` → `[playback]`. Nichts sonst.
- [ ] **Step 2: Verify** — `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint` — alles grün, `grep -rn "songsnippet/usePlayback" src` leer.
- [ ] **Step 3: Commit** — `Move usePlayback to ui for a second user`

### Task 6: Upload-Beistand und Warteschlange teilen

**Files:**
- Create: `webapp-vue/src/api/upload.ts`
- Modify: `webapp-vue/src/api/images.ts` (`UploadError`, `uploadImage`, `UPLOAD_TIMEOUT_MS` ziehen um)
- Move: `webapp-vue/src/api/__tests__/images.spec.ts` → Block `describe('uploadImage')` nach `webapp-vue/src/api/__tests__/upload.spec.ts`
- Create: `webapp-vue/src/ui/useUploadQueue.ts`, `webapp-vue/src/ui/UploadQueueRows.vue`
- Modify: `webapp-vue/src/images/ImagePool.vue`, `webapp-vue/src/images/__tests__/ImagePool.spec.ts`
- Test: `webapp-vue/src/ui/__tests__/useUploadQueue.spec.ts`
- Modify: `.claude/guidelines/frontend.md` (eine Zeile: Binär-Uploads laufen über `uploadFile(base, blob, fileName, onProgress)` aus `api/upload.ts`, XHR wegen Fortschritt, 4 min Zeitlimit)

**Interfaces:**
- Produces:
  - `export class UploadError extends Error { readonly code: string; readonly status: number }` (unverändert, neuer Ort)
  - `export function uploadFile<T>(base: string, blob: Blob, fileName: string, onProgress: (fraction: number) => void): Promise<T>` — Körper von `uploadImage`, aber `form.append('file', blob, fileName)`.
  - `export interface QueueRow { name: string; progress: number; state: 'queued' | 'running' | 'done' | 'failed'; message?: string }`
  - `export function useUploadQueue(options: { upload: (file: File, onProgress: (fraction: number) => void) => Promise<unknown>; reasonFor: (code: string) => string | undefined; afterAll: () => Promise<void> }): { queue: Ref<QueueRow[]>; enqueue: (files: File[]) => Promise<void> }` — Körper von `ImagePool.enqueue` samt seinen Kommentaren; Rückfall „Upload fehlgeschlagen.“.
  - `UploadQueueRows.vue`, Prop `rows: QueueRow[]` — das `<ul v-if="queue.length">`-Markup aus `ImagePool.vue` wörtlich, `data-test="queue-row"`.

- [ ] **Step 1: Write the failing tests**
  - `upload.spec.ts`: die bisherigen `uploadImage`-Fälle, auf `uploadFile` umgestellt, plus `sends the blob under the given file name` — das gesendete `FormData`-Feld `file` ist eine `File` mit `name === 'spruch.wav'`.
  - `useUploadQueue.spec.ts` (aus `ImagePool.spec.ts` herübergezogen): `uploads one after another, not in parallel`; `names the reason on the failing file and carries on with the rest`; `an unknown code and a non-UploadError both fall back to „Upload fehlgeschlagen.“`; `calls afterAll once, after the last file`.
  - `ImagePool.spec.ts`: die beiden Warteschlangen-Fälle ersetzt durch `uploads through uploadFile under the file's own name` (`vi.spyOn(upload, 'uploadFile')`, erwartet `(base, file, 'a.jpg', expect.any(Function))`); übrige Fälle unverändert.

- [ ] **Step 2: Run to verify it fails** — `cd webapp-vue && pnpm test src/api src/ui src/images` — rot (Module fehlen).

- [ ] **Step 3: Implement** wie oben; `ImagePool.vue` nutzt `useUploadQueue({ upload: (file, p) => uploadFile<ImageResponse>(props.base, file, file.name, p), reasonFor: (code) => REASONS[code], afterAll: load })` und `<UploadQueueRows :rows="queue" />`; `defineExpose({ enqueue })` bleibt.

- [ ] **Step 4: Verify** — `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint` — grün.

- [ ] **Step 5: Commit** — `Share the upload helper and queue between pools`

### Task 7: Im Browser zu WAV

**Files:**
- Create: `webapp-vue/src/audio/toWav.ts`, `webapp-vue/src/audio/intake.ts`
- Test: `webapp-vue/src/audio/__tests__/toWav.spec.ts`, `webapp-vue/src/audio/__tests__/intake.spec.ts`

**Interfaces:**
- Consumes: `UploadError` (Task 6), `audioGraph()` aus `@/ui/audio`.
- Produces:
  - `export type PcmSource = Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate' | 'length' | 'getChannelData'>`
  - `export function toWav(source: PcmSource): Uint8Array<ArrayBuffer>` — 44 Byte Kopf (`RIFF`, `36 + data`, `WAVE`, `fmt `, 16, Format 1, Kanäle, Rate, `rate × kanäle × 2`, `kanäle × 2`, 16, `data`, `length × kanäle × 2`), dann verschränkte Int16 LE nach Entscheidung 6.
  - `export const MAX_SECONDS = 60`, `export const UNKNOWN_DURATION_MAX_BYTES = 2 * 1024 * 1024`
  - `export function probeDuration(file: File): Promise<number>` — `<audio preload="metadata">` über eine Object-URL; `loadedmetadata` → `duration`, `error` → `NaN`; URL immer freigeben.
  - `export async function prepareWav(file: File, maxBytes: number, deps?: { probe?: (file: File) => Promise<number>; decode?: (data: ArrayBuffer) => Promise<PcmSource> }): Promise<Blob>` — Codes nach Entscheidung 7; Ergebnis `new Blob([wav], { type: 'audio/wav' })`. `decode` per Default über `audioGraph()?.decodeAudioData`, ohne Graph `UNDECODABLE`.

- [ ] **Step 1: Write the failing tests** (ein `PcmSource`-Double aus Arrays; happy-dom hat kein `AudioBuffer`):
  - `toWav`: `writes a 44-byte canonical header` (Mono, 48 000, 3 Frames: Länge 50, Felder wie oben über `DataView`); `interleaves stereo frames` (L `[0.5, -0.5]`, R `[1, -1]` → `[16384, 32767, -16384, -32768]`); `clamps and rounds to 16 bit` (`[1.5, -2, 0.25]` → `[32767, -32768, 8192]`); `never throws on samples that are not finite` (`[NaN, Infinity, -Infinity]` → `[0, 32767, -32768]`).
  - `prepareWav`: `refuses a file longer than a minute without decoding it` (`probe` → 61, `decode` nie gerufen, Code `TOO_LONG`); `an unknown duration only lets small files through` (`Infinity` mit 3 MB → `TOO_LONG` ohne Dekodieren; `NaN` mit 1 KB → `decode` gerufen); `a file the browser cannot decode fails as UNDECODABLE`; `a WAV over the pool's limit fails as TOO_LARGE`; `returns an audio/wav blob of header plus samples` (Größe `44 + frames × kanäle × 2`).

- [ ] **Step 2: Run to verify it fails** — `cd webapp-vue && pnpm test src/audio` — rot.
- [ ] **Step 3: Implement** wie oben.
- [ ] **Step 4: Verify** — `pnpm test src/audio && pnpm typecheck && pnpm lint` — grün.
- [ ] **Step 5: Commit** — `Turn picked audio files into 16-bit WAV in the browser`

### Task 8: Die Seite „Audio“

**Files:**
- Create: `webapp-vue/src/api/audio.ts`, `webapp-vue/src/audio/AudioPool.vue`
- Create: `webapp-vue/src/pages/c/[slug]/audio.vue`, `webapp-vue/src/pages/super-admin/audio.vue` (dünn wie die `images.vue`-Gegenstücke)
- Modify: `webapp-vue/src/nav/NavDrawer.vue:344-351`, `webapp-vue/src/pages/super-admin/index.vue:59-68`
- Test: `webapp-vue/src/audio/__tests__/AudioPool.spec.ts`; Modify `nav/__tests__/NavDrawer.spec.ts`, `pages/super-admin/__tests__/index.spec.ts:55,75`

**Interfaces:**
- Consumes: Task 4 (JSON), Task 5 (`usePlayback`), Task 6 (`uploadFile`, `useUploadQueue`, `UploadQueueRows`), Task 7 (`prepareWav`).
- Produces:
  - `api/audio.ts`: `AudioClipResponse`, `AudioListResponse` (Felder wie Task 4), `communityAudioBase(slug)`, `globalAudioBase()`, `clipUrl(base, id)`, `listClips(base)`, `deleteClip(base, id)`.
  - `AudioPool.vue`, Prop `base: string`, `defineExpose({ enqueue })`.

- [ ] **Step 1: Write the failing tests** — `AudioPool.spec.ts` mit `vi.mock('@/ui/usePlayback', …)` wie in den Anspielung-Specs:
  - `shows the quota, file names and durations` — „12 von 200“, „spruch.wav“, „1,5 s“ (`toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })`).
  - `hides the quota and the uploader from someone who only sees their own`
  - `loads nothing until a play button is tapped` — nach dem Mount kein `setSource`; Tipp auf Zeile 1 → `setSource('/api/communities/alpha/audio/c1')`, dann `restart`.
  - `a second tap on the same row stops it` — `pause`.
  - `tapping another row switches to it` — `setSource` mit `c2`.
  - `deleting the clip that is playing stops it` — Rückfrage bejaht → `pause` vor `deleteClip`.
  - `asks before deleting`
  - `keeps the picker disabled until the pool's limit is known`
  - `a picked file goes through prepareWav and uploads under its own name` — `prepareWav(file, 5242880)`, dann `uploadFile(base, blob, 'a.m4a', fn)`.
  - `a browser-side refusal names its reason and sends nothing` — `prepareWav` wirft `UploadError('UNDECODABLE', 0)` → Zeile „Dein Browser kann diese Datei nicht abspielen.“, `uploadFile` nie gerufen; die zweite Datei läuft weiter.
  - `the size refusal names the pool's own limit` — `TOO_LARGE` → „Zu lang (höchstens 5 MB als WAV, etwa 27 s Stereo).“
  - `shows a message when the initial listing fails to load`
  - `NavDrawer.spec.ts`: `shows the audio entry beside the images entry to a plain member` — `href` = `communityPath('team', 'audio')`, `aria-label` „Audio“.
  - `index.spec.ts`: erwartete Einträge `['Nutzer', 'Spielgemeinschaften', 'Bilder', 'Audio']`, Länge 4.

- [ ] **Step 2: Run to verify it fails** — `cd webapp-vue && pnpm test src/audio src/nav src/pages` — rot.

- [ ] **Step 3: Implement** — Zeile: Abspielknopf `size-11` (`IconPlay`/`IconSquare` aus lucide), Dateiname `truncate`, Dauer `shrink-0 text-neutral-500`, für die Leitung der Name `text-xs`, Löschknopf `size-11` mit `IconX`. Wähler wie im Bild-Pool als `<label>` um `<input type="file" accept="audio/*" multiple class="sr-only">`. Gründe aus der Texttabelle; `TOO_LARGE` aus `maxBytes` gebaut. Navigation und Super-Admin-Eintrag nach Entscheidung 12.

- [ ] **Step 4: Verify** — `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint` — grün.

- [ ] **Step 5: Im Browser prüfen** — Backend und `pnpm dev` starten, als Mitglied `/c/<slug>/audio`: eine m4a- oder mp3-Datei hochladen, abspielen, löschen; als Super-Admin `/super-admin/audio`. Am Handy über die LAN-Adresse einmal hochladen (kein Secure Context nötig).

- [ ] **Step 6: Commit** — `Add the audio page with upload and playback`

### Task 9: Sicherung

**Files:**
- Modify: `deploy/compose.yaml:17-75` (Dienst `db-backup`)
- Modify: `deploy/.env.prod.example`, `deploy/.env.staging.example` (neben `IMAGE_BACKUP_KEEP`)
- Modify: `deploy/README.md` (*Backups & restore*), `.claude/guidelines/deployment-server.md` (Absatz zum geteilten Dump: „heute `imagepool.images` und `audiopool.clips`“)

**Interfaces:** keine.

- [ ] **Step 1: Change the loop** — `AUDIO_BACKUP_KEEP=${AUDIO_BACKUP_KEEP:-8}` in `environment`; der Tagesdump bekommt zusätzlich `--exclude-table-data=audiopool.clips`; die Aufräumzeile für Waisen wird `find /backups -name '*.sql.gz.part' -mtime +1 -delete`; der Fingerabdruck-Block wird `dump_on_change() { table=$$1; prefix=$$2; keep=$$3; … }` mit Datei `/backups/$$prefix.fingerprint` und Dumps `/backups/$$prefix-<stamp>.sql.gz`, alle bisherigen Kommentare und Wächter (`to_regclass`, `.part` + `mv`, `keep -ge 1`) mitgenommen; Aufrufe `dump_on_change imagepool.images images "$$IMAGE_BACKUP_KEEP"` und `dump_on_change audiopool.clips audio "$$AUDIO_BACKUP_KEEP"`. Der Bild-Dump behält Dateinamen und Fingerabdruck-Datei, damit vorhandene Sicherungen weiter zählen.

- [ ] **Step 2: Verify the rendering** — `B=$(mktemp -d) && docker compose -f deploy/compose.yaml config --format json | jq -r '.services["db-backup"].command[0]' > $B/backup.sh && bash -n $B/backup.sh` — keine Ausgabe; in `backup.sh` steht `$1`, nicht `$$1`, und der Tagesdump nennt beide Tabellen.

- [ ] **Step 3: Verify against a database** — ein Wegwerf-Netz mit einer Datenbank namens `postgres`, wie der Beiwagen sie erwartet:
  ```bash
  docker network create bk
  docker run -d --rm --network bk --name postgres -e POSTGRES_PASSWORD=x -e POSTGRES_USER=admin -e POSTGRES_DB=app postgres:18
  # warten, dann je Schema eine Tabelle mit einer Zeile:
  docker exec postgres psql -U admin -d app -c "CREATE SCHEMA imagepool; CREATE TABLE imagepool.images(id uuid primary key); CREATE SCHEMA audiopool; CREATE TABLE audiopool.clips(id uuid primary key); INSERT INTO audiopool.clips VALUES (gen_random_uuid());"
  docker run --rm --network bk -v $B:/backups -e PGPASSWORD=x postgres:18 timeout 20 bash /backups/backup.sh
  ```
  Erwartet: in `$B` liegen `app-…`, `images-…`, `audio-…` und `images.fingerprint`, `audio.fingerprint`. Ein zweiter Lauf ohne Änderung schreibt nur ein neues `app-…`. Danach `docker stop postgres && docker network rm bk`.

- [ ] **Step 4: Docs** — `.env`-Beispiele: Kommentar wie bei `IMAGE_BACKUP_KEEP` („Counts CHANGES, not days“). `deploy/README.md`: drei Dumps aufgezählt, Wiederherstellung „erst `app-…`, dann `images-…` und `audio-…`“ für prod und staging; Satz zur Plattenschätzung um Audio ergänzt (voll 1 GB pro Community, erwartet unter 100 MB).

- [ ] **Step 5: Commit** — `Back up the audio pool on change, like images`
