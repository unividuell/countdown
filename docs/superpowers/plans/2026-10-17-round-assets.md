# Runden-Assets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Asset-Modell für alle Spiele: Spiele erzeugen benannte Assets mit Sichtbarkeit, das Framework speichert sie in `game.round_assets`, prüft einmal für Runde und Labor, und liefert „ab Stufe n“ vorab verschlüsselt (ChaCha20-Poly1305) aus — der Schlüssel kommt mit der Stufe.

**Architecture:** Zuerst drei reine bzw. isolierte Bausteine im Modul `game`: Sichtbarkeitsregel, Versiegeln (mit Golden-Vektor in `shared/`), Speicher. Dann ein Umstellungs-Task, der Spielvertrag, Materialisierung, Tor, Runden-Antwort, Labor und die drei Asset-Spiele auf einmal umzieht (der Vertrag lässt sich nicht halb ändern) und die drei Spieltabellen löscht. Danach Platzierungs unkomprimiertes Stück, die Frontend-Grundlage (`@noble/ciphers`, Helfer, Composable), das Durchreichen von `assets`, Platzierung unter der Hülle, eine Messung auf dem Handy, Musterungs Umzug, Leitlinien.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Spring Data JDBC / PostgreSQL 18 · JCA `ChaCha20-Poly1305` · JUnit 5 + kotest-Matcher + mockk + Testcontainers · Vue 3 + TypeScript strict + Vitest + `@vue/test-utils` (happy-dom) · `@noble/ciphers`.

**Spec:** [`docs/superpowers/specs/2026-10-17-round-assets-design.md`](../specs/2026-10-17-round-assets-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Entscheidungen, die die Spec offen ließ:**

1. **Die Runden-ID** steht als `roundGameId` in `RoundResponse` und in der Asset-URL als Query-Parameter `?round=<uuid>`.
2. **Das Frontend reicht `assets: RoundAssets` (URL *und* Schlüssel je Name) statt nur `assetUrl(name)` durch.** Ein Spiel braucht beides an derselben Stelle; zwei Props liefen auseinander.
3. **Die lokale Datenbank teilen sich alle Worktrees** (`core/README.md`, „Two worktrees share one container“). Task 4 bootet gegen sie und setzt sie nur nach Rückfrage zurück — andere Sitzungen könnten gerade darauf laufen.

## Global Constraints

- **Branch:** `feature/countdown-issue-101-3d3d2f`. **Niemals `git commit --amend`**, immer ein neuer Commit.
- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`: Betreff imperativ, groß, ohne Punkt, ≤ 50 Zeichen; Leerzeile; Body umbrochen bei 72, erklärt *was* und *warum*. **Kein** `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen laut `.claude/guidelines/kotlin.md`).
- **Testing:** kotest-Matcher, mockk, Spring-Kontext-Tests mit `@Import(TestcontainersConfiguration::class)`. Frontend: Vitest + `vi`. **TDD:** erst der fallende Test.
- **Kommentare:** nur, wo sie beim Lesen *dieser* Zeile einen Fehler verhindern; kein Grabstein-Kommentar für Entferntes.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` in der Klasse, Lambda-Nachrichten.
- **Feste Werte aus der Spec:**
  - Asset-Name: `[a-z0-9-]+`, pro Runde eindeutig.
  - Sichtbarkeit in der DB: `SCENE` | `STAGE` (mit `stage`) | `AFTER_GUESS`.
  - Verfahren: ChaCha20-Poly1305, Schlüssel 32 Bytes, Nonce 12 Bytes zufällig, Tag 16 Bytes; Format `nonce ‖ ciphertext ‖ tag` (Klartext + 28 Bytes). Ein Schlüssel **je Asset**.
  - Chiffrat: `Content-Type: application/octet-stream`; Klartext: Medientyp des Assets. `Cache-Control: private, max-age=86400, immutable` unverändert.
  - Namen: Anspielung `clip-0` … `clip-4` (ab Stufe 0…4), `solution` (nach dem Tipp); Entstauber `photo` (Szene); Platzierung `board`, `patch` (ab Stufe 0); Musterung `board`, `pattern` (ab Stufe 0).
  - Frontend-Abhängigkeit `"@noble/ciphers": "^2.4.0"`, Import `@noble/ciphers/chacha.js`. **Kein** `crypto.subtle` — die App muss auf dem Handy über LAN-IP per HTTP laufen.
- **Zwischenstand:** Ab Task 4 passt das Backend nicht mehr zum Frontend; erst nach Task 8 laufen Anspielung, Entstauber und Platzierung wieder im Browser, nach Task 10 Musterung. Jeder Task hält seine Testsuite grün.

## Review Focus

1. **Announce-Rennen:** Zwei Materialisierungen derselben Runde dürfen die Schlüssel des Gewinners nie ersetzen — sonst passt ein schon geladenes Chiffrat nicht mehr. → Test in Task 3 (`a second storeAll keeps the first writer's key and bytes`) und Task 4 (`a second materialise keeps the first keys`).
2. **Neuer Lauf, alte Nummer:** Rundennummern beginnen pro Lauf neu; ein 24 h gecachtes Chiffrat darf eine neue Runde nicht blockieren. → Task 4 (`a wrong round id is not found, even under the right number`), Task 6 (URL trägt die ID; `loadSealed` lädt einmal am Cache vorbei neu).
3. **Schlüssel und Payload im Gleichschritt:** Der Stufe-0-Schlüssel kommt genau mit dem Payload, nie vorher; höhere Stufen erst mit ihrer Stufe. → Task 4 (`no key before the reveal, the stage-0 key with it`, `a skip brings the next stage's key along`), Labor ebenso.
4. **Historie:** Eine abgeschlossene Runde gibt alle Schlüssel und das „nach dem Tipp“-Asset frei, auch ohne Play-Row. → Task 4 (`a closed round hands out every key and its after-guess bytes`), Task 7 (`RoundHistory` baut `assets` je Runde).
5. **Handy über LAN-HTTP:** Entschlüsseln darf `crypto.subtle` nicht brauchen. → Task 6 (`opens without crypto.subtle, as on a phone over LAN HTTP`).

## Dateien

```
core/src/main/kotlin/org/unividuell/countdown/core/
  game/RoundAssets.kt                 NEU  Sichtbarkeit, Betrachter, Header, Schlüssel, Regel; ab Task 4 RoundAsset
  game/AssetSeal.kt                   NEU  ChaCha20-Poly1305 seal/open, frische Schlüssel
  game/GameType.kt                    ÄND  produceAssets(params): List<RoundAsset>; alte Haken/Konstanten raus
  game/GameCatalog.kt                 ÄND  Weiterleitungen
  game/internal/RoundAssetRow.kt      NEU  Entity + Projektionen
  game/internal/RoundAssetRepository.kt NEU
  game/internal/RoundAssetStore.kt    NEU  storeAll / exists / headers / find
  game/internal/RoundMaterialiser.kt  ÄND  versiegeln + speichern; release* raus
  game/internal/PlayService.kt        ÄND  asset(…, roundGameId, name)
  game/internal/RoundController.kt    ÄND  /{roundNumber}/assets/{name}?round=
  game/internal/RoundResponses.kt, RoundDtos.kt  ÄND  roundGameId, assetKeys
  game/internal/AnnouncementService.kt, MaterialisationSchedule.kt  ÄND  release-Aufrufe raus
  game/internal/{SongSnippet,Deduster,PlacePatch,FindPattern}GameType.kt  ÄND
  gamelab/internal/{LabRoundStore,LabService,LabController,LabDtos}.kt  ÄND
  songsnippet/{SnippetCutter,SongSnippetStages}.kt  ÄND; SongSnippetAudioStore.kt, internal/RoundAudio*.kt  WEG
  deduster/RoundImageStore.kt, internal/RoundImage*.kt  WEG
  placepatch/PlacePatchImageStore.kt, internal/  WEG; PlacePatchImages.kt  ÄND
  imagepool/ImageFit.kt               ÄND  pngUncompressed
  findpattern/FindPatternImages.kt    ÄND  PNG-Bytes statt data:-URI
core/src/main/resources/db/migration/
  game/V5__create_round_assets.sql    NEU
  songsnippet/, deduster/, placepatch/  WEG
shared/round-assets/seal-vectors.json NEU;  shared/README.md ÄND
webapp-vue/src/
  api/assets.ts                       ÄND  AssetKey, RoundAssets, fetchSealed, openSealed, loadSealed
  api/types.ts, gamelab/types.ts      ÄND  roundGameId, assetKeys
  api/rounds.ts, gamelab/api.ts       ÄND  URLs nach Name, roundAssets/labAssets
  ui/useSealedAsset.ts                NEU
  rounds/RoundCard.vue, RoundHistory.vue, pages/c/[slug]/index.vue, pages/c/[slug]/lab/[game]/index.vue  ÄND
  games/{deduster,songsnippet,placepatch,findpattern,copyblocks,spotobject}/…  ÄND
```

---

### Task 1: Sichtbarkeitsregel (rein)

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/RoundAssets.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AssetAccessTest.kt`

**Interfaces:**
- Produces (Paket `org.unividuell.countdown.core.game`, exponiert — das Labor braucht es):
  ```kotlin
  val ASSET_NAME: Regex                                     // [a-z0-9-]+
  sealed interface AssetVisibility {
      data object Scene : AssetVisibility
      data class FromStage(val stage: Int) : AssetVisibility  // require(stage >= 0)
      data object AfterGuess : AssetVisibility
  }
  data class AssetViewer(val closed: Boolean, val revealed: Boolean, val stage: Int, val guessed: Boolean)
  fun AssetVisibility.mayFetch(viewer: AssetViewer): Boolean
  fun AssetVisibility.opensKey(viewer: AssetViewer): Boolean
  class AssetHeader(val name: String, val visibility: AssetVisibility, val mediaType: String, val key: ByteArray?)
  class StoredAsset(val header: AssetHeader, val bytes: ByteArray)
  data class AssetKey(val key: String, val mediaType: String)   // key: Base64 (Standard-Alphabet, mit Padding)
  fun keysFor(headers: List<AssetHeader>, viewer: AssetViewer): Map<String, AssetKey>
  ```
  `AssetHeader` prüft im `init`: Schlüssel genau dann vorhanden, wenn `visibility is FromStage`. `AssetHeader`/`StoredAsset` sind Klassen, keine Data-Classes (ByteArray-Gleichheit ist Identität).

- [ ] **Step 1: Write the failing test**

```kotlin
class AssetAccessTest {
    private val fresh = AssetViewer(closed = false, revealed = false, stage = 0, guessed = false)

    @Test
    fun `the scene is open to every member and carries no key`() {
        AssetVisibility.Scene.mayFetch(fresh) shouldBe true
        AssetVisibility.Scene.opensKey(fresh.copy(revealed = true)) shouldBe false
    }

    @Test
    fun `stage bytes are open before the reveal, the key only from that stage on`() {
        AssetVisibility.FromStage(2).mayFetch(fresh) shouldBe true
        AssetVisibility.FromStage(0).opensKey(fresh) shouldBe false
        AssetVisibility.FromStage(0).opensKey(fresh.copy(revealed = true)) shouldBe true
        AssetVisibility.FromStage(2).opensKey(fresh.copy(revealed = true, stage = 1)) shouldBe false
        AssetVisibility.FromStage(2).opensKey(fresh.copy(revealed = true, stage = 2)) shouldBe true
    }

    @Test
    fun `a guess does not open stages the player never reached`() {
        AssetVisibility.FromStage(3).opensKey(fresh.copy(revealed = true, stage = 1, guessed = true)) shouldBe false
    }

    @Test
    fun `the after-guess asset opens with the spent guess and never carries a key`() {
        AssetVisibility.AfterGuess.mayFetch(fresh.copy(revealed = true, stage = 4)) shouldBe false
        AssetVisibility.AfterGuess.mayFetch(fresh.copy(revealed = true, guessed = true)) shouldBe true
        AssetVisibility.AfterGuess.opensKey(fresh.copy(guessed = true)) shouldBe false
    }

    @Test
    fun `a closed round opens every byte and every key`() {
        val closed = fresh.copy(closed = true)
        AssetVisibility.AfterGuess.mayFetch(closed) shouldBe true
        AssetVisibility.FromStage(4).opensKey(closed) shouldBe true
    }

    @Test
    fun `keysFor hands out exactly the opened stage keys, Base64, with the real media type`() {
        val headers = listOf(
            AssetHeader(name = "scene", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", key = null),
            AssetHeader(name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav", key = ByteArray(32) { 1 }),
            AssetHeader(name = "clip-1", visibility = AssetVisibility.FromStage(1), mediaType = "audio/wav", key = ByteArray(32) { 2 }),
        )
        keysFor(headers = headers, viewer = fresh.copy(revealed = true)) shouldBe mapOf(
            "clip-0" to AssetKey(key = Base64.getEncoder().encodeToString(ByteArray(32) { 1 }), mediaType = "audio/wav"),
        )
        keysFor(headers = headers, viewer = fresh) shouldBe emptyMap()
    }

    @Test
    fun `a stage header without a key, or any other with one, is refused`() {
        shouldThrow<IllegalArgumentException> {
            AssetHeader(name = "board", visibility = AssetVisibility.FromStage(0), mediaType = "image/jpeg", key = null)
        }
        shouldThrow<IllegalArgumentException> {
            AssetHeader(name = "photo", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", key = ByteArray(32))
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=AssetAccessTest`
Expected: FAIL — Kompilierfehler, `AssetVisibility` unbekannt.

- [ ] **Step 3: Implement `RoundAssets.kt`** mit den Signaturen oben. Die Regel ist die Tabelle aus der Spec, *Sichtbarkeit — eine Regel, zwei Aufrufer*; `closed` öffnet alles.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd core && ./mvnw test -Dtest=AssetAccessTest`
Expected: PASS

- [ ] **Step 5: Commit** (`Add the round-asset visibility rule`)

---

### Task 2: Versiegeln mit ChaCha20-Poly1305, Golden-Vektor

**Files:**
- Create: `shared/round-assets/seal-vectors.json`
- Modify: `shared/README.md` (Abschnitt `round-assets/`: was drin ist, wie erzeugt — der Befehl aus Step 1)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/AssetSeal.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/AssetSealTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  object AssetSeal {
      const val KEY_BYTES = 32
      const val NONCE_BYTES = 12
      const val TAG_BYTES = 16
      fun seal(plaintext: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray   // nonce ‖ ciphertext ‖ tag
      fun open(sealed: ByteArray, key: ByteArray): ByteArray                         // wirft AEADBadTagException
      fun sealFresh(plaintext: ByteArray): Sealed                                    // Schlüssel + Nonce aus SecureRandom
  }
  class Sealed(val key: ByteArray, val bytes: ByteArray)
  ```

- [ ] **Step 1: Golden-Vektor erzeugen — mit Nodes eingebautem Krypto, einer dritten, unabhängigen Implementierung**

```bash
node -e '
const c = require("crypto");
const key = Buffer.from([...Array(32).keys()]);
const nonce = Buffer.from([...Array(12).keys()].map(i => 0xa0 + i));
const plaintexts = [Buffer.alloc(0), Buffer.from([...Array(300).keys()].map(i => i % 251))];
const vectors = plaintexts.map(p => {
  const e = c.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
  const ct = Buffer.concat([e.update(p), e.final()]);
  return { keyHex: key.toString("hex"), nonceHex: nonce.toString("hex"),
           plaintextHex: p.toString("hex"), sealedHex: Buffer.concat([nonce, ct, e.getAuthTag()]).toString("hex") };
});
console.log(JSON.stringify({ vectors }, null, 2));' > shared/round-assets/seal-vectors.json
```

Expected: zwei Vektoren; der erste `sealedHex` ist 56 Hex-Zeichen lang (leerer Klartext: Nonce + Tag).

- [ ] **Step 2: Write the failing test** — den Vektor so lesen wie `copyblocks/FitGoldenVectorTest` (`File("../shared/…")`).

```kotlin
@Test
fun `seals every golden vector byte for byte`() {
    vectors.forEach {
        AssetSeal.seal(plaintext = it.plaintextHex.hexToByteArray(), key = it.keyHex.hexToByteArray(), nonce = it.nonceHex.hexToByteArray()) shouldBe
            it.sealedHex.hexToByteArray()
    }
}

@Test
fun `opens every golden vector`() {
    vectors.forEach {
        AssetSeal.open(sealed = it.sealedHex.hexToByteArray(), key = it.keyHex.hexToByteArray()) shouldBe it.plaintextHex.hexToByteArray()
    }
}

@Test
fun `a flipped byte does not open`() {
    val vector = vectors.last()
    val tampered = vector.sealedHex.hexToByteArray().also { it[20] = (it[20].toInt() xor 1).toByte() }
    shouldThrow<AEADBadTagException> { AssetSeal.open(sealed = tampered, key = vector.keyHex.hexToByteArray()) }
}

@Test
fun `a fresh seal is 28 bytes longer and opens with its own key`() {
    val sealed = AssetSeal.sealFresh(byteArrayOf(1, 2, 3))
    sealed.key.size shouldBe 32
    sealed.bytes.size shouldBe 3 + 28
    AssetSeal.open(sealed = sealed.bytes, key = sealed.key) shouldBe byteArrayOf(1, 2, 3)
}

@Test
fun `two fresh seals of the same bytes share neither key nor nonce`() {
    val a = AssetSeal.sealFresh(byteArrayOf(7))
    val b = AssetSeal.sealFresh(byteArrayOf(7))
    a.key shouldNotBe b.key
    a.bytes.copyOfRange(0, 12) shouldNotBe b.bytes.copyOfRange(0, 12)
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd core && ./mvnw test -Dtest=AssetSealTest`
Expected: FAIL — `AssetSeal` unbekannt.

- [ ] **Step 4: Implement `AssetSeal.kt`** — JCA, kein Zusatz-Paket: `Cipher.getInstance("ChaCha20-Poly1305")`, `SecretKeySpec(key, "ChaCha20")`, `IvParameterSpec(nonce)`; je Aufruf ein neues `Cipher`-Objekt (JCA verweigert die Wiederverwendung von Schlüssel+Nonce beim Verschlüsseln). Ein `SecureRandom` im Objekt.

- [ ] **Step 5: Run test to verify it passes** — Run wie Step 3, Expected: PASS

- [ ] **Step 6: Commit** (`Seal round assets with ChaCha20-Poly1305`) — Vektor, README, Code, Test.

---

### Task 3: Tabelle `game.round_assets` und `RoundAssetStore`

**Files:**
- Create: `core/src/main/resources/db/migration/game/V5__create_round_assets.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundAssetRow.kt`, `RoundAssetRepository.kt`, `RoundAssetStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetStoreTest.kt`

**Interfaces:**
- Consumes: `AssetHeader`, `StoredAsset`, `AssetVisibility` (Task 1).
- Produces:
  ```kotlin
  @Component
  class RoundAssetStore(private val repository: RoundAssetRepository) {
      @Transactional fun storeAll(roundGameId: UUID, assets: List<StoredAsset>)   // INSERT … ON CONFLICT (round_game_id, name) DO NOTHING
      @Transactional(readOnly = true) fun exists(roundGameId: UUID): Boolean
      @Transactional(readOnly = true) fun headers(roundGameId: UUID): List<AssetHeader>   // liest keine Bytes
      @Transactional(readOnly = true) fun find(roundGameId: UUID, name: String): StoredAsset?
  }
  ```

Schema (Spalten exakt aus der Spec, *Speicher*):

```sql
CREATE TABLE game.round_assets (
    id             UUID        PRIMARY KEY DEFAULT uuidv7(),
    round_game_id  UUID        NOT NULL REFERENCES game.round_games(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    visibility     TEXT        NOT NULL CHECK (visibility IN ('SCENE', 'STAGE', 'AFTER_GUESS')),
    stage          INT         NULL,
    media_type     TEXT        NOT NULL,
    encryption_key BYTEA       NULL,
    bytes          BYTEA       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((visibility = 'STAGE') = (stage IS NOT NULL AND encryption_key IS NOT NULL)),
    UNIQUE (round_game_id, name)
);
```

Kommentare in der SQL-Datei nach dem Muster von `V2__create_round_plays.sql`: warum `ON CONFLICT … DO NOTHING` (Announce-Rennen), warum der Schlüssel neben dem Chiffrat liegt (schützt die Leitung vor der Stufe, nicht die DB). Repository nach dem Muster des heutigen `deduster/internal/RoundImageRepository.kt` (`@Modifying @Query` fürs Einfügen, Projektionsklassen ohne `id`).

- [ ] **Step 1: Write the failing test** — Spring-Kontext + Testcontainers, `@Transactional`; die Rundenzeile entsteht wie in `RoundAssetGateTest.announceGated` (Community über `CommunityService.create`, Zeile über `RoundGameStore.announce`).

```kotlin
@Test
fun `stores every asset and reads each back by name`() {
    val id = aRound()
    store.storeAll(roundGameId = id, assets = listOf(scene, clip0))
    store.find(roundGameId = id, name = "clip-0")!!.bytes shouldBe clip0.bytes
    store.find(roundGameId = id, name = "clip-0")!!.header.key shouldBe clip0.header.key
    store.find(roundGameId = id, name = "scene")!!.header.visibility shouldBe AssetVisibility.Scene
}

@Test
fun `a second storeAll keeps the first writer's key and bytes`() {
    val id = aRound()
    store.storeAll(roundGameId = id, assets = listOf(clip0))
    store.storeAll(roundGameId = id, assets = listOf(clip0WithOtherKey))
    store.find(roundGameId = id, name = "clip-0")!!.header.key shouldBe clip0.header.key
}

@Test
fun `headers carry name, visibility, stage, media type and key`() {
    val id = aRound()
    store.storeAll(roundGameId = id, assets = listOf(scene, clip0))
    store.headers(id).associate { it.name to (it.visibility to it.mediaType) } shouldBe mapOf(
        "scene" to (AssetVisibility.Scene to "image/jpeg"),
        "clip-0" to (AssetVisibility.FromStage(0) to "audio/wav"),
    )
}

@Test
fun `an unknown name or round is null and exists is false`() {
    val id = aRound()
    store.exists(id) shouldBe false
    store.find(roundGameId = id, name = "nope").shouldBeNull()
    store.storeAll(roundGameId = id, assets = listOf(scene))
    store.exists(id) shouldBe true
}

@Test
fun `the table refuses a stage row without a key`() {
    val id = aRound()
    shouldThrow<DataIntegrityViolationException> {
        jdbc.update(
            "INSERT INTO game.round_assets (round_game_id, name, visibility, stage, media_type, bytes) VALUES (?, 'x', 'STAGE', 0, 'a/b', '\\x00')",
            id,
        )
    }
}
```

`scene`, `clip0`, `clip0WithOtherKey` sind Fixtures: `StoredAsset(header = AssetHeader(…), bytes = …)`; `clip0` mit `key = ByteArray(32) { 1 }`, `clip0WithOtherKey` mit `ByteArray(32) { 2 }`.

- [ ] **Step 2: Run test to verify it fails** — `cd core && ./mvnw test -Dtest=RoundAssetStoreTest`, Expected: FAIL (Kompilierfehler).

- [ ] **Step 3: Implement** Migration, `RoundAssetRow` (Entity `@Table(schema = "game", name = "round_assets")`, Klasse, keine Data-Class), Repository, Store mit den Signaturen oben. Die Abbildung `SCENE`/`STAGE`+`stage`/`AFTER_GUESS` ↔ `AssetVisibility` lebt im Store.

- [ ] **Step 4: Run test to verify it passes** — wie Step 2, Expected: PASS. Dazu `cd core && ./mvnw test -Dtest=ModularityTests`, Expected: PASS.

- [ ] **Step 5: Commit** (`Store round assets in one game table`)

---

### Task 4: Backend auf benannte, versiegelte Assets umstellen

Der Vertrag lässt sich nicht halb ändern: `GameType`, Materialisierung, Tor, Runden-Antwort, Labor und die drei Asset-Spiele ziehen in einem Task um. Musterung bleibt hier unberührt (Task 10).

**Files:**
- Modify: `game/RoundAssets.kt` (+ `RoundAsset`, `RoundAsset.sealed()`), `game/GameType.kt`, `game/GameCatalog.kt`
- Modify: `game/internal/RoundMaterialiser.kt`, `AnnouncementService.kt:102-103`, `MaterialisationSchedule.kt:85`
- Modify: `game/internal/PlayService.kt` (`asset`), `RoundController.kt` (`asset`), `RoundResponses.kt`, `RoundDtos.kt` (`RoundResponse`)
- Modify: `gamelab/internal/LabRoundStore.kt` (`assets`, `assetsOf`), `LabService.kt` (`asset`, `respond`), `LabController.kt` (`asset`), `LabDtos.kt` (`LabRoundResponse`)
- Modify: `game/internal/SongSnippetGameType.kt`, `DedusterGameType.kt`, `PlacePatchGameType.kt`; `songsnippet/SnippetCutter.kt`, `songsnippet/SongSnippetStages.kt`
- Delete: `songsnippet/SongSnippetAudioStore.kt`, `songsnippet/internal/RoundAudio.kt`, `songsnippet/internal/RoundAudioRepository.kt`, `resources/db/migration/songsnippet/`; `deduster/RoundImageStore.kt`, `deduster/internal/RoundImage.kt`, `deduster/internal/RoundImageRepository.kt`, `resources/db/migration/deduster/`; `placepatch/PlacePatchImageStore.kt`, `placepatch/internal/`, `resources/db/migration/placepatch/`
- Delete tests: `deduster/RoundImageStoreTest.kt`, `placepatch/PlacePatchImageStoreTest.kt`, `songsnippet/SongSnippetAudioStoreTest.kt`
- Rewrite tests: `game/RoundAssetGateTest.kt`, `gamelab/LabAssetStageTest.kt`, `game/AnnouncementMaterialisedHookTest.kt` (Fälle zu `materialised`/`releaseStageAssets` → Fälle unten)
- Adapt tests: `game/RoundControllerTest.kt`, `game/SongSnippetGameTypeTest.kt`, `DedusterGameTypeTest.kt`, `PlacePatchGameTypeTest.kt`, `songsnippet/SnippetCutterTest.kt`, sowie was nach dem Umbau nicht mehr kompiliert (`AnnouncementServiceTest`, `MaterialisationSchedule*Test`, `PlayServiceDedusterTest`, `PlayServicePlacePatchTest`, `PlayServiceStrictRevealTest`, `RoundMaterialiserRollbackTest`, `LabServiceTest`)

**Interfaces:**
- Consumes: Task 1, `AssetSeal.sealFresh` (Task 2), `RoundAssetStore` (Task 3).
- Produces:
  ```kotlin
  // game/RoundAssets.kt
  class RoundAsset(val name: String, val visibility: AssetVisibility, val mediaType: String, val bytes: ByteArray)  // require(ASSET_NAME.matches(name))
  fun RoundAsset.sealed(): StoredAsset          // FromStage → sealFresh, sonst Klartext ohne Schlüssel
  // game/GameType.kt — einzige Asset-Methode
  fun produceAssets(params: P): List<RoundAsset> = emptyList()
  // game/GameCatalog.kt (GameTypeHandle)
  fun produceAssets(params: JsonNode): List<RoundAsset>
  // game/internal/PlayService.kt
  fun asset(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int, roundGameId: UUID, name: String): StoredAsset
  // game/internal/RoundDtos.kt — RoundResponse, neue Felder am Ende
  val roundGameId: UUID? = null
  val assetKeys: Map<String, AssetKey> = emptyMap()
  // gamelab/internal/LabService.kt
  fun asset(slug: String, gameId: String, seed: Int, phase: Phase, userId: UUID, isSuperAdmin: Boolean, name: String): StoredAsset
  // gamelab/internal/LabDtos.kt — LabRoundResponse
  val assetKeys: Map<String, AssetKey> = emptyMap()
  // songsnippet/SnippetCutter.kt
  fun ladder(mp3: ByteArray): List<AudioClip>   // fünf WAV-Clips, Index = Stufe; kein MP3 mehr darin
  ```
- HTTP: `GET /api/communities/{slug}/rounds/{roundNumber}/assets/{name}?round={roundGameId}`; Labor `GET …/lab/{game}/assets/{name}?seed=…&phase=…`. Chiffrat → `application/octet-stream`, sonst der Medientyp.

**Regeln, die der Code trägt:**
- `RoundMaterialiser.materialise`: nach `store.announce` für den *persistierten* Typ (`materialisedHandle`) — `if (!assets.exists(id)) assets.storeAll(roundGameId = id, assets = handle.produceAssets(params).map { it.sealed() })`. Die Rollback-Regel (`rollbackFor = [Exception::class]`) bleibt. `releaseStagesOlderThan` und beide Aufrufe entfallen.
- `PlayService.asset`: Runde auflösen wie heute (größere Nummer → Historie, `closed`; kleinere → `RoundNotFoundException`). Passt `roundGameId` nicht zur aufgelösten Zeile oder fehlt der Name → `AssetNotFoundException`. Betrachter: `AssetViewer(closed = <Historie>, revealed = play != null, stage = play?.stage ?: 0, guessed = play?.guessedAt != null)`. `AfterGuess` ohne Play-Row → `NotRevealedException`, mit Play-Row ohne Tipp → `AssetForbiddenException`. Szene und Stufen-Chiffrat ohne Play-Row.
- `RoundResponses.announced`: `roundGameId = current.roundGame.id`, `assetKeys = keysFor(headers = assets.headers(id), viewer = AssetViewer(closed = current.closed, revealed = mine != null, stage = mine?.stage ?: 0, guessed = hasGuessed))`.
- Labor: `LabRoundStore.assets` wird `List<StoredAsset>?`, `assetsOf(…, produce: () -> List<StoredAsset>)`. `LabService.respond` erzeugt nur, wenn der Tester aufgedeckt hat (`revealed`), sonst `emptyMap()` — vor dem Öffnen kein Deezer-Download. Betrachter: `AssetViewer(closed = false, revealed = revealed, stage = myStage, guessed = mine != null)`. `AfterGuess` ohne Eintrag → `LabAssetForbiddenException`; unbekannter Name → `LabAssetNotFoundException`.
- Adapter: Anspielung `clip-$i` → `FromStage(i)`, `audio/wav`; `solution` → `AfterGuess`, `audio/mpeg` (das heruntergeladene MP3). Entstauber `photo` → `Scene`, `image/jpeg`. Platzierung `board` (`PlacePatchImages.board(frozen)`, `image/jpeg`) und `patch` (`PlacePatchImages.patch(…)`, `image/png`) → `FromStage(0)`. Ist das Pool-Bild weg: Warnung loggen wie heute, `emptyList()`.

- [ ] **Step 1: Write the failing tests — echte Runde** (`RoundAssetGateTest`, neu geschrieben). Fake `gated-fake`: drei Stufen, `requiresReveal = false`, `produceAssets` = `scene` (Szene, `image/jpeg`, `[98]`), `clip-0` (`FromStage(0)`, `audio/wav`, `[0]`), `clip-1` (`FromStage(1)`, `[1]`), `solution` (`AfterGuess`, `audio/mpeg`, `[99]`). Ankündigen wie heute mit `store.announce`, dann `assets.storeAll(roundGameId = id, assets = gatedGame.produceAssets(params).map { it.sealed() })`. Den Hinweis „laufende Runde zuerst ankündigen, sonst materialisiert `play.asset` sie“ aus dem alten Test behalten.

```kotlin
@Test
fun `stage bytes are sealed and fetchable before the reveal`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Sealed")
    val asset = play.asset(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number, roundGameId = round.id, name = "clip-1")
    asset.bytes.size shouldBe 1 + 28
    AssetSeal.open(sealed = asset.bytes, key = asset.header.key!!) shouldBe byteArrayOf(1)
}

@Test
fun `no key before the reveal, the stage-0 key with it`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Keys")
    announcements.currentRound(slug = community.slug, userId = viewer, isSuperAdmin = false).assetKeys shouldBe emptyMap()
    val revealed = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
    revealed.assetKeys.keys shouldBe setOf("clip-0")
    revealed.assetKeys.getValue("clip-0").mediaType shouldBe "audio/wav"
    revealed.roundGameId shouldBe round.id
}

@Test
fun `a skip brings the next stage's key along`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Skip")
    play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
    play.skip(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number, fromStage = 0)
        .assetKeys.keys shouldBe setOf("clip-0", "clip-1")
}

@Test
fun `the scene asset opens before the reveal, without a play row`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Scene")
    val scene = play.asset(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number, roundGameId = round.id, name = "scene")
    scene.bytes shouldBe byteArrayOf(98)
    scene.header.key.shouldBeNull()
}

@Test
fun `the after-guess asset needs a play row, then the spent guess`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Solution")
    val fetch = { play.asset(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number, roundGameId = round.id, name = "solution") }
    shouldThrow<NotRevealedException> { fetch() }
    play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
    shouldThrow<AssetForbiddenException> { fetch() }
    play.giveUp(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number)
    fetch().bytes shouldBe byteArrayOf(99)
}

@Test
fun `a wrong round id is not found, even under the right number`() {
    val (community, viewer, round) = aGatedRound("Asset Gate Wrong Id")
    shouldThrow<AssetNotFoundException> {
        play.asset(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = round.number, roundGameId = UUID.randomUUID(), name = "scene")
    }
}

@Test
fun `an unknown name is not found`() { /* name = "clip-9" → AssetNotFoundException */ }

@Test
fun `a closed round hands out every key and its after-guess bytes`() {
    // Aufbau wie der alte Fall „a closed round's assets are open…“: laufende Runde ankündigen, dann
    // eine ältere Runde (+1) mit gestorten Assets. Nie aufgedeckt, nie getippt.
    history.pastRound(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past.number)
        .assetKeys.keys shouldBe setOf("clip-0", "clip-1")
    play.asset(slug = community.slug, userId = viewer, isSuperAdmin = false, roundNumber = past.number, roundGameId = past.id, name = "solution")
        .bytes shouldBe byteArrayOf(99)
}
```

`aGatedRound(name)` ist ein Test-Helfer: Community anlegen, laufende Runde als `gated-fake` ankündigen, Assets storen; liefert `Triple(community, viewerId, GatedRound(number, id))`. Den Fall „assets survive the window closing over them“ mit `name = "solution"` übernehmen.

- [ ] **Step 2: Write the failing tests — Materialisierung, Controller, Labor, Adapter**

`AnnouncementMaterialisedHookTest` (der `RecordingGame`-Fake liefert jetzt `produceAssets` = `scene` + `clip-0` und zählt Aufrufe):
```kotlin
@Test fun `materialising a round stores its produced assets, stage assets sealed`()
    // headers(id).map { it.name } shouldBe listOf("scene", "clip-0"); clip-0.key shouldNotBe null; scene.key.shouldBeNull()
@Test fun `a second materialise keeps the first keys`()
    // Schlüssel von clip-0 vor und nach einem zweiten materialise(edition, roundNumber) gleich
@Test fun `a game without assets stores nothing`()
    // exists(id) shouldBe false
```
Den Fall `the fallback leaves a round announced ahead alone` und `previousParams …` unverändert lassen; `releases the stage assets …` entfällt.

`RoundControllerTest` (MockMvc Kotlin DSL, Aufbau wie die vorhandenen Fälle):
```kotlin
@Test fun `a sealed asset is served as octet-stream, a plain one with its media type`()
    // GET /api/communities/{slug}/rounds/{n}/assets/clip-0?round={id} → 200, Content-Type application/octet-stream
    // GET …/assets/scene?round={id} → 200, Content-Type image/jpeg; Cache-Control "private, max-age=86400, immutable"
```

`LabAssetStageTest` (Fake mit `requiresReveal = true` und Produktionszähler):
```kotlin
@Test fun `a lab stage key needs the open, like the real round`()        // open(...).assetKeys shouldBe emptyMap(); reveal(...).assetKeys.keys shouldBe setOf("clip-0")
@Test fun `lab stage bytes are fetchable before the open, sealed`()      // asset(name = "clip-0").header.key shouldNotBe null
@Test fun `lab assets are produced once per round`()                     // zwei asset()-Aufrufe → Zähler 1, gleiche Bytes
@Test fun `the lab's after-guess asset waits for an entry of one's own`() // LabAssetForbiddenException, nach giveUp → Klartext
```

Adapter:
```kotlin
// SongSnippetGameTypeTest
@Test fun `produceAssets names five clips by stage and the solution after the guess`()
    // names == ["clip-0","clip-1","clip-2","clip-3","clip-4","solution"]
    // visibilities == FromStage(0..4) + AfterGuess; media types 5× "audio/wav", "audio/mpeg"
// DedusterGameTypeTest
@Test fun `the photo is the round's only asset, a scene`()
@Test fun `a gone pool image produces no assets`()
// PlacePatchGameTypeTest
@Test fun `board and patch open with the reveal`()      // names ["board","patch"], beide FromStage(0), "image/jpeg"/"image/png"
@Test fun `a gone pool image produces no assets`()
// SnippetCutterTest
@Test fun `the ladder is five clips, without the solution`()  // ladder(mp3).size shouldBe 5
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd core && ./mvnw test -Dtest='RoundAssetGateTest,AnnouncementMaterialisedHookTest,RoundControllerTest,LabAssetStageTest,SongSnippetGameTypeTest,DedusterGameTypeTest,PlacePatchGameTypeTest,SnippetCutterTest'`
Expected: FAIL — Kompilierfehler (`roundGameId`, `name`, `assetKeys` unbekannt).

- [ ] **Step 4: Implement** nach *Interfaces* und *Regeln* oben; alte Haken, Konstanten, Stores, Entities, Repositories, Migrationsordner und die drei Store-Tests löschen. Kommentare im Code, die 98/99/`assetStage`/`releaseStageAssets` erklären, entfallen mit ihrem Code.

- [ ] **Step 5: Run the full backend suite**

Run: `cd core && ./mvnw clean test`
Expected: PASS (`clean`, weil gelöschte Quellen sonst als alte `.class` im Worktree-`target` liegen bleiben).

- [ ] **Step 6: Boot gegen die geteilte lokale DB**

Run: Backend über `.claude/launch.json` (`backend`) starten, Log lesen.
Expected: Start ohne Fehler. **Lehnt Flyway ab**, weil die angewandten Migrationen von `songsnippet`, `deduster` oder `placepatch` lokal fehlen: **den Nutzer fragen**, bevor die lokale DB zurückgesetzt wird (`docker compose -p countdown down -v` — trifft alle Worktrees). Das Ergebnis (bootet / brauchte Reset) für den PR-Text notieren.

- [ ] **Step 7: Commit** (`Serve named, sealed round assets from one store`) — Body: drei Spieltabellen weg, DB-Reset auf Staging/Prod nötig.

---

### Task 5: Platzierungs Stück unkomprimiert

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImageFit.kt` (+ `pngUncompressed`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImages.kt` (`patch` nutzt es)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageFitTest.kt` (anlegen, falls nicht vorhanden), `core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImagesTest.kt`

**Interfaces:**
- Produces: `fun pngUncompressed(image: BufferedImage): ByteArray` in `ImageFit` — PNG, Deflate-Stufe 0 (ImageIO-PNG-Writer, `MODE_EXPLICIT`, `compressionQuality = 1.0f`). Die Länge hängt nur von Maßen und Bildtyp ab.

- [ ] **Step 1: Write the failing tests**

```kotlin
// ImageFitTest
@Test
fun `an uncompressed PNG's length depends only on the image's size`() {
    val flat = BufferedImage(120, 120, BufferedImage.TYPE_INT_ARGB)
    val noise = BufferedImage(120, 120, BufferedImage.TYPE_INT_ARGB).also { img ->
        val random = Random(7)
        for (y in 0 until 120) for (x in 0 until 120) img.setRGB(x, y, random.nextInt())
    }
    ImageFit.pngUncompressed(flat).size shouldBe ImageFit.pngUncompressed(noise).size
    ImageIO.read(ByteArrayInputStream(ImageFit.pngUncompressed(noise))).getRGB(5, 9) shouldBe noise.getRGB(5, 9)
}

// PlacePatchImagesTest
@Test
fun `the patch's size does not depend on where it was cut or how it frays`() {
    val frozen = /* texturiertes Testfoto, z. B. Rauschen, im Raster von layout */
    val sizes = listOf(Triple(0, 0, 1), Triple(13, 7, 2), Triple(30, 20, 3)).map { (x, y, seed) ->
        PlacePatchImages.patch(frozen = frozen, layout = layout, x = x, y = y, fraySeed = seed).size
    }
    sizes.toSet().size shouldBe 1
}
```

- [ ] **Step 2: Run tests to verify they fail** — `cd core && ./mvnw test -Dtest='ImageFitTest,PlacePatchImagesTest'`, Expected: FAIL (`pngUncompressed` unbekannt).

- [ ] **Step 3: Implement** `pngUncompressed`; `PlacePatchImages.patch` ruft es statt `ImageFit.png`. Kommentar an `patch`: die Größe darf die Position nicht verraten (das Chiffrat liegt vor dem Aufdecken beim Client).

- [ ] **Step 4: Run tests to verify they pass** — wie Step 2, Expected: PASS

- [ ] **Step 5: Commit** (`Encode Platzierung's patch uncompressed`) — Body: warum (Größe → Position, Spec *Integrität*).

---

### Task 6: Frontend-Grundlage — Entschlüsseln, URLs, Composable

**Files:**
- Modify: `webapp-vue/package.json`, `webapp-vue/pnpm-lock.yaml` (`pnpm add @noble/ciphers@^2.4.0`)
- Modify: `webapp-vue/src/api/assets.ts`
- Modify: `webapp-vue/src/api/types.ts` (`RoundResponse`), `webapp-vue/src/gamelab/types.ts` (`LabRoundResponse`)
- Modify: `webapp-vue/src/api/rounds.ts` (`roundAssetUrl`, + `roundAssets`), `webapp-vue/src/gamelab/api.ts` (`labAssetUrl`, + `labAssets`)
- Create: `webapp-vue/src/ui/useSealedAsset.ts`
- Test: `webapp-vue/src/api/__tests__/assets.spec.ts` (neu), `webapp-vue/src/api/__tests__/rounds.spec.ts`, `webapp-vue/src/ui/__tests__/useSealedAsset.spec.ts` (neu)

**Interfaces:**
- Consumes: HTTP und Felder aus Task 4; `shared/round-assets/seal-vectors.json` (Task 2).
- Produces:
  ```ts
  // api/assets.ts
  export interface AssetKey { key: string; mediaType: string }         // key: Base64
  export interface RoundAssets {
    url: (name: string) => string
    key: (name: string) => AssetKey | null
  }
  export async function fetchAssetBlob(url: string): Promise<Blob>    // unverändert, für Klartext
  export async function fetchSealed(url: string, reload?: boolean): Promise<Uint8Array>   // reload → cache: 'reload'
  export function openSealed(sealed: Uint8Array, key: AssetKey): Blob  // chacha20poly1305; wirft, wenn es nicht passt
  export async function loadSealed(assets: RoundAssets, name: string): Promise<Blob>      // laden, öffnen; bei Fehlschlag einmal reload
  // api/types.ts — RoundResponse
  roundGameId: string | null
  assetKeys: Record<string, AssetKey>
  // gamelab/types.ts — LabRoundResponse
  assetKeys: Record<string, AssetKey>
  // api/rounds.ts
  export const roundAssetUrl = (slug: string, roundNumber: number, roundGameId: string, name: string): string
  export const roundAssets = (slug: string, round: RoundResponse): RoundAssets | undefined   // undefined ohne roundGameId/round
  // gamelab/api.ts
  export const labAssetUrl = (slug: string, game: string, seed: number, phase: LabPhase, name: string): string
  export const labAssets = (slug: string, game: string, phase: LabPhase, round: LabRoundResponse): RoundAssets
  // ui/useSealedAsset.ts
  export function useSealedAsset(
    assets: () => RoundAssets | undefined,
    name: string,
  ): { state: Readonly<Ref<SceneState>>; src: Readonly<Ref<string | null>> }
  ```
- `roundAssetUrl` → `/api/communities/${encodeURIComponent(slug)}/rounds/${roundNumber}/assets/${encodeURIComponent(name)}?round=${roundGameId}`.
- `useSealedAsset`: lädt das Chiffrat, sobald `assets()` eine URL liefert (`state`: `preparing` → `ready`, bei Fehler `failed`); öffnet es, sobald `key(name)` da ist, als Object-URL in `src`; passt der Schlüssel nicht, einmal `fetchSealed(url, true)` und erneut öffnen, sonst `failed`. Vorherige Object-URL beim Ersetzen und in `onScopeDispose` freigeben. Base64 → Bytes per `atob`.

- [ ] **Step 1: Write the failing tests**

```ts
// assets.spec.ts — Vektor lesen wie lib/rng/__tests__/seededRandom.spec.ts (Pfad relativ zu webapp-vue)
it('opens every golden vector into a blob of the key\'s media type', async () => {
  for (const v of vectors) {
    const blob = openSealed(hex(v.sealedHex), { key: base64(hex(v.keyHex)), mediaType: 'application/x-test' })
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(hex(v.plaintextHex))
    expect(blob.type).toBe('application/x-test')
  }
})

it('opens without crypto.subtle, as on a phone over LAN HTTP', () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  expect(() => openSealed(hex(vectors[1].sealedHex), keyOf(vectors[1]))).not.toThrow()
})

it('throws on bytes that do not belong to the key', () => {
  const tampered = hex(vectors[1].sealedHex); tampered[20] ^= 1
  expect(() => openSealed(tampered, keyOf(vectors[1]))).toThrow()
})

it('loadSealed fetches once more past the cache when the first bytes do not open', async () => {
  // fetch: 1. Antwort fremde Bytes, 2. Antwort der Vektor
  await expect(loadSealed(assetsFor(vectors[1]), 'board')).resolves.toBeInstanceOf(Blob)
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/x/board', expect.objectContaining({ cache: 'reload' }))
})

it('loadSealed gives up after the second miss', async () => { /* beide fremd → rejects */ })
it('loadSealed refuses a name without a key', async () => { /* key(name) === null → rejects, kein fetch */ })

// rounds.spec.ts
it('puts the round id into the asset URL so a new run never meets an old cache entry', () => {
  expect(roundAssetUrl('hütte', 7, '0191a2b3-0000-7000-8000-000000000000', 'board'))
    .toBe('/api/communities/h%C3%BCtte/rounds/7/assets/board?round=0191a2b3-0000-7000-8000-000000000000')
})
it('roundAssets is undefined for a round without a game row', () => { /* roundGameId: null */ })
it('roundAssets reads keys from the response and answers null for a missing one', () => { /* … */ })

// useSealedAsset.spec.ts — in einem effectScope, fetch und URL.createObjectURL/revokeObjectURL gestubbt
it('is preparing until the sealed bytes arrive, then ready without a src')
it('opens into an object URL once the key arrives')
it('fails when the bytes cannot be fetched')          // fetch → 404
it('revokes its object URL when the scope ends')
```

- [ ] **Step 2: Run tests to verify they fail** — `cd webapp-vue && pnpm test -- src/api src/ui/__tests__/useSealedAsset.spec.ts`, Expected: FAIL (Exporte fehlen).

- [ ] **Step 3: Implement** — `pnpm add @noble/ciphers@^2.4.0`; Funktionen und Typen nach *Interfaces*. `openSealed`: erste 12 Bytes Nonce, Rest an `chacha20poly1305(key, nonce).decrypt(…)` aus `@noble/ciphers/chacha.js`. Bestehende Aufrufer von `roundAssetUrl`/`labAssetUrl` kompilieren erst nach Task 7 — bis dahin `vue-tsc` hier **nicht** als Gate nehmen, nur die Tests dieses Tasks.

- [ ] **Step 4: Run tests to verify they pass** — wie Step 2, Expected: PASS

- [ ] **Step 5: Commit** (`Open sealed round assets in the browser`)

---

### Task 7: `assets` statt `assetUrl` durch alle Hüllen; Entstauber und Anspielung

**Files:**
- Modify: `webapp-vue/src/rounds/RoundCard.vue` (Prop `assets?: RoundAssets` statt `assetUrl`), `rounds/RoundHistory.vue` (`roundAssets(props.slug, item)` je Eintrag), `pages/c/[slug]/index.vue` (`computed(() => roundAssets(slug, round))`), `pages/c/[slug]/lab/[game]/index.vue` (`computed(() => labAssets(…))`)
- Modify: Spiel-Props `assetUrl?` → `assets?: RoundAssets` in `games/copyblocks/CopyBlocksGame.vue`, `games/spotobject/SpotObjectGame.vue`, `games/deduster/DedusterGame.vue`, `games/songsnippet/SongSnippetGame.vue`, `SongSnippetBoard.vue` (`assets: RoundAssets | null`), `SongSnippetReveal.vue`, `SongPlayerReveal.vue`
- Modify: `games/deduster/types.ts` (`SCENE_ASSET_KEY` → `PHOTO_ASSET = 'photo'`), `games/songsnippet/types.ts` (`clipAsset(stage: number): string` → `` `clip-${stage}` ``, `SOLUTION_ASSET = 'solution'`; die lokale Konstante in `SongPlayerReveal.vue` entfällt)
- Test: `rounds/__tests__/RoundCard.spec.ts`, `RoundHistory.spec.ts`, `games/deduster/__tests__/DedusterGame.spec.ts`, `games/songsnippet/__tests__/SongSnippetBoard.spec.ts`, `SongPlayerReveal.spec.ts`, `SongSnippetGame.spec.ts`

Platzierung und Musterung bleiben in diesem Task unberührt (Task 8, Task 10).

**Interfaces:**
- Consumes: `RoundAssets`, `roundAssets`, `labAssets`, `loadSealed`, `fetchAssetBlob` (Task 6).
- Produces: jedes Spiel bekommt `assets?: RoundAssets` (`<component :is>` prüft Props nicht — jede Spielkomponente einzeln anfassen, `frontend-testing.md`).

- [ ] **Step 1: Write the failing tests** (bestehende Fälle umschreiben, Namen beibehalten, wo sie passen)

```ts
// RoundCard.spec.ts
it('hands the round\'s assets to the game', () => { /* game-Stub erhält props.assets === die übergebenen */ })
// RoundHistory.spec.ts
it('builds assets per past round from that round\'s own id', () => {
  /* zwei Einträge → assets.url('solution') enthält jeweils ?round=<eigene id>; key() liest deren assetKeys */
})
// DedusterGame.spec.ts
it('loads the photo from the round\'s photo asset', () => { /* photoUrl === assets.url('photo') */ })
// SongSnippetBoard.spec.ts
it('a skip loads the next clip sealed and opens it with the key that came with it', async () => {
  /* stage 0 → 1 mit assetKeys {clip-0, clip-1}; fetch von url('clip-1'); playback.setSource mit blob: URL */
})
it('a clip that does not open shows the load error', async () => { /* falscher Schlüssel, beide Versuche → LOAD_FAILED-Text */ })
// SongPlayerReveal.spec.ts
it('plays the solution from the plain solution asset', async () => { /* fetch(url('solution')) */ })
```

- [ ] **Step 2: Run tests to verify they fail** — `cd webapp-vue && pnpm test -- src/rounds src/games/deduster src/games/songsnippet`, Expected: FAIL

- [ ] **Step 3: Implement** — Props umbenennen, Container bauen `assets`; `SongSnippetBoard.loadStage` nutzt `loadSealed(assets, clipAsset(stage))`; `SongPlayerReveal` `fetchAssetBlob(assets.url(SOLUTION_ASSET))`; `DedusterGame` `assets?.url(PHOTO_ASSET)`.

- [ ] **Step 4: Run the full frontend gate**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS (Platzierung/Musterung deklarieren noch `assetUrl` — bis Task 8/10 bekommen sie zur Laufzeit nichts, ihre Unit-Tests montieren direkt).

- [ ] **Step 5: Commit** (`Pass named round assets to every game`)

---

### Task 8: Platzierung lädt unter der Hülle

**Files:**
- Modify: `webapp-vue/src/games/placepatch/types.ts` (`BOARD_ASSET_KEY`/`PATCH_ASSET_KEY` → `BOARD_ASSET = 'board'`, `PATCH_ASSET = 'patch'`)
- Modify: `games/placepatch/PlacePatchGame.vue` (Prop `assets?: RoundAssets`; zwei `useSealedAsset`; reicht `boardSrc`, `patchSrc` und `sceneState` weiter)
- Modify: `games/placepatch/PlacePatchBoard.vue` (Prop `sceneState: SceneState`; `RevealCover :state="props.sceneState"` statt `"ready"`)
- Test: `games/placepatch/__tests__/PlacePatchGame.spec.ts`, `PlacePatchBoard.spec.ts`

**Interfaces:**
- Consumes: `useSealedAsset` (Task 6).
- `sceneState`: `failed`, wenn eines der beiden `failed` ist; sonst `preparing`, wenn eines `preparing` ist; sonst `ready`. `boardSrc`/`patchSrc` sind die `src` der beiden Composables (vorher `null`).

- [ ] **Step 1: Write the failing tests**

```ts
// PlacePatchGame.spec.ts
it('keeps the cover preparing until both sealed pictures are loaded', async () => {
  /* sealed, fetch für 'patch' hängt → RevealCover state 'preparing'; auflösen → 'ready' */
})
it('shows board and patch from the opened pictures once the reveal brings the keys', async () => {
  /* payload + assetKeys {board, patch} → <img> src beginnen mit 'blob:' */
})
it('fails the cover when a picture cannot be fetched', async () => { /* 404 → 'failed' */ })
it('says the round cannot be shown without assets', () => { /* bestehender Text, assets undefined */ })
// PlacePatchBoard.spec.ts
it('lays the cover in the scene state it is given', () => { /* sceneState 'preparing' → data-test reveal-cover-preparing */ })
```

- [ ] **Step 2: Run tests to verify they fail** — `cd webapp-vue && pnpm test -- src/games/placepatch`, Expected: FAIL

- [ ] **Step 3: Implement** nach *Interfaces*.

- [ ] **Step 4: Run the full frontend gate** — `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`, Expected: PASS

- [ ] **Step 5: Im Browser prüfen** — Dev-Server (`.claude/launch.json`), Labor, Platzierung Phase zwei: im Netzwerk-Log laufen `…/assets/board` und `…/assets/patch` **vor** dem `POST …/reveal`, danach kein Asset-Request mehr; das Bild erscheint. Dasselbe für Entstauber (Foto vor dem Aufdecken) und Anspielung (Stufe 0, Skip auf Stufe 1, Lösung nach Aufgeben). Belege über `read_network_requests`, nicht per `fetch`-Sonde.

- [ ] **Step 6: Commit** (`Preload Platzierung's pictures under the cover`)

---

### Task 9: Messen auf dem Handy — Stoppstelle

Kein Commit. Die Spec verlangt die Zahl, bevor weitergebaut wird.

- [ ] **Step 1: Vorübergehend messen** — in `openSealed` die Dauer mit `performance.now()` messen und im Labor sichtbar ausgeben (eine Zeile unter der Platzierung-Karte). **Nicht committen.**
- [ ] **Step 2: Den Nutzer bitten**, über die LAN-IP auf dem Handy das Labor zu öffnen: Platzierung, Phase zwei, aufdecken; die angezeigten Millisekunden für `board` + `patch` nennen. Dazu einmal Anspielung, Stufe 4 (`clip-4`).
- [ ] **Step 3: Entscheiden** — Platzierungs Stufe 0 zusammen ≤ 16 ms: weiter mit Task 10. Darüber: **anhalten**, Zahlen dem Nutzer vorlegen (Ausweg aus der Spec-Diskussion: Entschlüsseln im Web Worker). Messcode zurücknehmen (`git checkout -- webapp-vue/src`), `git status` sauber.

---

### Task 10: Musterung zieht um

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImages.kt` (`board`/`pattern` liefern PNG-`ByteArray`; der Klassen-Kommentar zu `data:`-URIs wird durch den Grund für Assets ersetzt)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/FindPatternGameType.kt` (`FindPatternPayload` ohne `boardImage`/`patternImage`; `produceAssets`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImagesTest.kt`, `game/FindPatternGameTypeTest.kt`
- Modify: `webapp-vue/src/games/findpattern/types.ts` (Felder raus, `BOARD_ASSET = 'board'`, `PATTERN_ASSET = 'pattern'`), `FindPatternGame.vue` (`assets?: RoundAssets`, zwei `useSealedAsset`, reicht `boardSrc`, `patternSrc`, `sceneState` weiter), `FindPatternBoard.vue` (Bild-Quellen aus Props, `RevealCover :state`), `FindPatternReveal.vue` (Brett aus `boardSrc`)
- Test: `games/findpattern/__tests__/types.spec.ts`, `FindPatternGame.spec.ts`, `FindPatternBoard.spec.ts`, `FindPatternReveal.spec.ts`

**Interfaces:**
- Produces: `FindPatternImages.board(blocks: List<Int>, palette: List<String>): ByteArray`, `FindPatternImages.pattern(pattern: List<Int>, palette: List<String>): ByteArray`; `produceAssets` = `board` (`FromStage(0)`, `image/png`), `pattern` (`FromStage(0)`, `image/png`).

- [ ] **Step 1: Write the failing tests**

```kotlin
// FindPatternGameTypeTest
@Test fun `the payload carries no picture`()   // JSON von present(params) hat weder "boardImage" noch "patternImage"
@Test fun `board and pattern open with the reveal`()  // names ["board","pattern"], FromStage(0), "image/png"
// FindPatternImagesTest — bestehende Fälle auf Bytes umstellen
@Test fun `the board decodes to the grid at its block size`()  // ImageIO.read(...).width == COLS * BOARD_BLOCK_PX
```
```ts
// types.spec.ts
it('accepts a payload without pictures', () => { /* asFindPatternPayload({cols, rows, patternLength}) !== null */ })
// FindPatternGame.spec.ts
it('keeps the cover preparing until both sealed pictures are loaded', async () => { /* wie Platzierung */ })
it('draws board and pattern from the opened pictures', async () => { /* src beginnen mit 'blob:' */ })
// FindPatternReveal.spec.ts — Brett-Bild aus boardSrc
```

- [ ] **Step 2: Run tests to verify they fail** — `cd core && ./mvnw test -Dtest='FindPatternImagesTest,FindPatternGameTypeTest'` und `cd webapp-vue && pnpm test -- src/games/findpattern`, Expected: FAIL

- [ ] **Step 3: Implement** nach *Interfaces*.

- [ ] **Step 4: Run tests to verify they pass** — beide Befehle aus Step 2, Expected: PASS. Dann `cd webapp-vue && pnpm lint && pnpm typecheck`, Expected: PASS.

- [ ] **Step 5: Im Browser prüfen** — Labor, Musterung Phase eins und zwei: Bilder erscheinen; in Phase zwei laufen beide Asset-Requests vor dem `POST …/reveal`.

- [ ] **Step 6: Commit** (`Move Musterung's pictures to sealed assets`)

---

### Task 11: Leitlinien und Gesamtprüfung

**Files:**
- Modify: `.claude/guidelines/game-rounds.md` — Abschnitt „Assets before the reveal“ und die Absätze zu Asset-Tor und Aufräumen (heute ab „Binary round assets follow the same stage-gating“ bis „the reason the clip is worth storing“) beschreiben das neue Modell: drei Sichtbarkeiten, eine Regel, `game.round_assets`, Stufen-Assets vorab versiegelt mit Schlüssel je Asset, Runden-ID in der URL, nichts wird freigegeben bis zur Archivierung. Neu die Größenregel: *die Größe eines „ab Stufe n“-Assets ist vor der Stufe öffentlich und darf die Lösung nicht eingrenzen* (Beispiel: Platzierungs unkomprimiertes Stück).
- Modify: `.claude/guidelines/cross-runtime-parity.md` — `shared/round-assets/seal-vectors.json` als weiteres Golden-Vektor-Paar nennen.
- Modify: `.claude/guidelines/frontend.md` oder `frontend-state.md` (wo Browser-APIs stehen) — keine Secure-Context-APIs ohne Ausweichweg (LAN-HTTP aufs Handy); Krypto über `@noble/ciphers`.
- Modify: `.claude/guidelines/game-lab.md`, falls es das Asset-Tor des Labors beschreibt — Stufe 0 erst nach dem Öffnen.

- [ ] **Step 1: Leitlinien schreiben** nach `feeding-knowledge-back.md` (übertragbare Regeln, keine Messprotokolle).
- [ ] **Step 2: Volle Suiten**

Run: `cd core && ./mvnw clean test` und `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: beide PASS.

- [ ] **Step 3: Restsuche** — `grep -rnE "SCENE_ASSET_KEY|SOLUTION_ASSET_KEY|assetStage|releaseStageAssets|releaseAssets|ASSET_KEY|boardImage|patternImage|assetUrl" core/src webapp-vue/src .claude/guidelines`, Expected: keine Treffer.
- [ ] **Step 4: Commit** (`Describe the round-asset model in the guidelines`)
- [ ] **Step 5: PR-Text vormerken** (PR erst auf Nachfrage): Basis `develop`; **Staging- und Prod-Datenbank müssen beim Ausrollen neu aufgesetzt werden** (Migrationsordner `songsnippet`, `deduster`, `placepatch` gelöscht); Ergebnis aus Task 4 Step 6 und die Messung aus Task 9.
