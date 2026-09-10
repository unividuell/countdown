# Bild-Pool — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Modul `imagepool`, in das Mitglieder Bilder hochladen, die ihre Spielgemeinschaft
nicht verlassen — plus ein globaler Bestand, den nur Super-Admins füllen.

**Architecture:** Ein Modulith-Modul mit einem Postgres-Schema und **einer** Tabelle. Das Original
liegt unverändert als `BYTEA`, daneben ein beim Upload erzeugtes Thumbnail. Zwei Controller-
Namensräume entscheiden über das Ziel eines Uploads (Community bzw. global), nicht die Rolle des
Hochladenden. Der Pool liefert an **kein** Spiel aus und exportiert nichts nach außen.

**Tech Stack:** Kotlin 2.4 · Spring Boot 4.1 · Spring Modulith 2.1 · Spring Data JDBC · Flyway ·
PostgreSQL 18 · `javax.imageio` + `metadata-extractor` + `twelvemonkeys imageio-webp` ·
Vue 3 / Vite 8 / TypeScript · Vitest · MockMvc + Testcontainers + kotest + mockk

**Spec:** [`docs/superpowers/specs/2026-09-07-community-image-pool-design.md`](../specs/2026-09-07-community-image-pool-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Nachrichten **englisch**; Oberflächentext **deutsch**
  mit `„…“` (nie gerades `"`). Serverseitige Fehlermeldungen bleiben englisch — der deutsche Satz
  entsteht im Frontend aus dem `code`-Feld der Antwort.
- **Modulgrenze:** alles außer der leeren Basis liegt in `…core.imagepool.internal`. Das Modul
  exportiert **nichts**. `CommunityAccess` ist tabu (`community.internal`) — der Mandant wird über
  die öffentliche `CommunityQuery`/`MembershipQuery` aufgelöst.
- **Grenzen (Konfiguration, kein Literal im Code):** `per-community-limit: 150`,
  `global-limit: 40`, `max-bytes: 15MB`, `max-pixels: 40MP`, Thumbnail 400 px lange Kante.
- **Formate:** JPEG, PNG, GIF, WebP. Erkennung über Magic Bytes, nie über den `Content-Type` des
  Clients. HEIC wird eigens erkannt, um sich benennen zu lassen.
- **Persistenz:** `id UUID PRIMARY KEY DEFAULT uuidv7()`, `@Id val id: UUID? = null`, kein
  `@Column`, benannte Argumente ab zwei Parametern.
- **TDD:** jeder Task beginnt mit einem fehlschlagenden Test.
- **Backend-Suite:** `cd core && ./mvnw test` (braucht Docker). **Frontend:**
  `cd webapp-vue && pnpm test`, `pnpm lint`, `pnpm typecheck`.

## Dateien

| Datei | Verantwortung |
|---|---|
| `core/src/main/resources/db/migration/imagepool/V1__create_images.sql` | Schema + Tabelle + Eindeutigkeitsindex |
| `…/core/imagepool/internal/Image.kt` | die Zeile (Original + Thumbnail) |
| `…/core/imagepool/internal/ImageProjections.kt` | `ImageSummary`, `ImageBytes` — die byte-freien bzw. byte-genauen Sichten |
| `…/core/imagepool/internal/ImageRepository.kt` | alle Abfragen, inkl. Pool-Sperre |
| `…/core/imagepool/internal/ImageIntake.kt` | Magic Bytes, Maße, Orientierung, Thumbnail — ohne Spring |
| `…/core/imagepool/internal/ImagePoolProperties.kt` | die Grenzen |
| `…/core/imagepool/internal/ImagePoolExceptions.kt` | Ausnahmen mit ihren Codes |
| `…/core/imagepool/internal/ImagePoolExceptionHandler.kt` | Ausnahme → Status + `code` |
| `…/core/imagepool/internal/ImagePoolGate.kt` | Mandantenauflösung und Rollenprüfung |
| `…/core/imagepool/internal/ImagePoolService.kt` | Quote, Duplikat, Aufnahme, Löschen |
| `…/core/imagepool/internal/ImagePoolController.kt` | `/api/communities/{slug}/images` |
| `…/core/imagepool/internal/SuperAdminImageController.kt` | `/api/super-admin/images` |
| `webapp-vue/src/api/images.ts` | Liste, Löschen, und der XHR-Upload-Beistand |
| `webapp-vue/src/images/ImagePool.vue` | die gemeinsame Oberfläche beider Pools |
| `webapp-vue/src/pages/c/[slug]/images.vue` · `…/pages/super-admin/images.vue` | zwei dünne Seiten |
| `deploy/compose.yaml` | geteilter Dump im `db-backup`-Beiwagen |

---

### Task 1: Modul, Schema, Zeile, Abfragen

**Files:**
- Create: `core/src/main/resources/db/migration/imagepool/V1__create_images.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/Image.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageProjections.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageRepositoryTest.kt`

**Interfaces:**
- Consumes: `community.communities`, `iam.users` (nur als Fremdschlüsselziele).
- Produces: `Image`, `ImageSummary(id, communityId, uploadedBy, mediaType, width, height, byteSize, createdAt)`,
  `ImageBytes(mediaType, bytes)`, `ImageRepository` mit
  `listForCommunity(UUID): List<ImageSummary>`,
  `listForUploader(UUID, UUID): List<ImageSummary>`,
  `listGlobal(): List<ImageSummary>`,
  `findSummary(UUID): ImageSummary?`, `findOriginal(UUID): ImageBytes?`, `findThumb(UUID): ByteArray?`,
  `countInPool(UUID?): Long`, `existsInPool(UUID?, ByteArray): Boolean`, `lockPool(Long): Long`,
  `deleteImage(UUID): Int`.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageRepositoryTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DuplicateKeyException
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.internal.Image
import org.unividuell.countdown.core.imagepool.internal.ImageRepository
import java.util.UUID
import kotlin.test.assertFailsWith

/**
 * Deliberately NOT @Transactional, unlike most repository tests here: one case provokes a unique
 * violation, and inside a shared transaction Postgres would abort it and fail every later
 * statement with "current transaction is aborted". Isolation comes from per-test names instead.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class ImageRepositoryTest(
    @Autowired val images: ImageRepository,
    @Autowired val communityRepo: CommunityRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun user(login: String): UUID =
        users.save(User(githubId = System.nanoTime(), githubLogin = login)).id!!

    /** create() derives the slug and fills createdBy -- the constructor demands both. */
    private fun community(name: String, owner: UUID): UUID =
        communities.create(creatorUserId = owner, rawName = name).id!!

    private fun image(communityId: UUID?, uploader: UUID, seed: Byte) = Image(
        communityId = communityId,
        uploadedBy = uploader,
        mediaType = "image/jpeg",
        width = 400, height = 300, byteSize = 3,
        sha256 = ByteArray(32) { seed },
        bytes = byteArrayOf(seed, seed, seed),
        thumbBytes = byteArrayOf(seed),
    )

    @Test
    fun `lists a community's images newest first, and never another pool's`() {
        val alice = user("alice")
        val alpha = community("Alpha", alice)
        val beta = community("Beta", alice)

        val first = images.save(image(communityId = alpha, uploader = alice, seed = 1)).id!!
        val second = images.save(image(communityId = alpha, uploader = alice, seed = 2)).id!!
        images.save(image(communityId = beta, uploader = alice, seed = 3))
        val global = images.save(image(communityId = null, uploader = alice, seed = 4)).id!!

        // uuidv7 is time-ordered, so "newest first" and "highest id first" agree.
        images.listForCommunity(alpha).map { it.id } shouldContainExactly listOf(second, first)
        // The global pool is shared across tests, so this asks whether the row is there --
        // not whether it is alone.
        images.listGlobal().map { it.id } shouldContain global
        images.listGlobal().map { it.communityId }.toSet() shouldBe setOf(null)
    }

    @Test
    fun `a member sees only their own uploads`() {
        val alice = user("alice2")
        val bob = user("bob2")
        val alpha = community("Gamma", alice)
        val mine = images.save(image(communityId = alpha, uploader = alice, seed = 5)).id!!
        images.save(image(communityId = alpha, uploader = bob, seed = 6))

        images.listForUploader(alpha, alice).map { it.id } shouldContainExactly listOf(mine)
    }

    @Test
    fun `the same file twice is refused within a pool, but allowed across pools`() {
        val alice = user("alice3")
        val alpha = community("Delta", alice)
        val beta = community("Epsilon", alice)

        images.save(image(communityId = alpha, uploader = alice, seed = 7))
        // same bytes, different pool: allowed
        images.save(image(communityId = beta, uploader = alice, seed = 7))

        assertFailsWith<DuplicateKeyException> {
            images.save(image(communityId = alpha, uploader = alice, seed = 7))
        }
    }

    @Test
    fun `NULLS NOT DISTINCT -- the rule bites in the global pool too`() {
        val alice = user("alice6")
        images.save(image(communityId = null, uploader = alice, seed = 8))

        assertFailsWith<DuplicateKeyException> {
            images.save(image(communityId = null, uploader = alice, seed = 8))
        }
    }

    @Test
    fun `counts, byte reads and deletion`() {
        val alice = user("alice4")
        val alpha = community("Zeta", alice)
        val id = images.save(image(communityId = alpha, uploader = alice, seed = 9)).id!!

        images.countInPool(alpha) shouldBe 1L
        images.existsInPool(alpha, ByteArray(32) { 9 }) shouldBe true
        images.existsInPool(alpha, ByteArray(32) { 99 }) shouldBe false

        val original = images.findOriginal(id).shouldNotBeNull()
        original.mediaType shouldBe "image/jpeg"
        original.bytes.size shouldBe 3
        images.findThumb(id).shouldNotBeNull().size shouldBe 1

        images.deleteImage(id) shouldBe 1
        images.findSummary(id) shouldBe null
    }

    @Test
    fun `deleting the community takes its images with it`() {
        val alice = user("alice5")
        val alpha = community("Eta", alice)
        images.save(image(communityId = alpha, uploader = alice, seed = 10))

        communityRepo.deleteById(alpha)

        images.listForCommunity(alpha) shouldContainExactly emptyList()
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && ./mvnw test -Dtest=ImageRepositoryTest`
Expected: compile failure — `Image`, `ImageRepository` do not exist.

- [ ] **Step 3: Write the migration**

`core/src/main/resources/db/migration/imagepool/V1__create_images.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS imagepool;

CREATE TABLE imagepool.images (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    -- NULL = the global pool. Deliberate exception to the NOT NULL rule in multi-tenancy.md:
    -- a game's read is "community_id = ? OR community_id IS NULL", so forgetting the IS NULL
    -- returns too little rather than another tenant's rows. Two tables would double every path
    -- (upload, thumbnail, delivery) and secure nothing.
    community_id UUID REFERENCES community.communities(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES iam.users(id),
    media_type   TEXT        NOT NULL,
    width        INT         NOT NULL,
    height       INT         NOT NULL,
    byte_size    INT         NOT NULL,
    sha256       BYTEA       NOT NULL,
    bytes        BYTEA       NOT NULL,
    thumb_bytes  BYTEA       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same file twice in one pool is an accident. NULLS NOT DISTINCT so the rule also bites
-- in the global pool, where community_id is NULL for every row.
CREATE UNIQUE INDEX images_pool_sha256
    ON imagepool.images (community_id, sha256) NULLS NOT DISTINCT;
```

- [ ] **Step 4: Write the row and the projections**

`Image.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/**
 * Plain class, like songsnippet's RoundAudio: ByteArray equality is identity, and nothing ever
 * compares two images. [communityId] null means the global pool.
 */
@Table(schema = "imagepool", name = "images")
class Image(
    @Id
    val id: UUID? = null,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val mediaType: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val sha256: ByteArray,
    val bytes: ByteArray,
    val thumbBytes: ByteArray,
    val createdAt: Instant? = null,
)
```

`ImageProjections.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import java.time.Instant
import java.util.UUID

/**
 * The listing view, and the reason it is a type of its own: it CANNOT carry bytes. A repository
 * method returning [Image] would load all columns -- 150 rows of originals is 750 MB of heap for
 * a screen that shows thumbnails.
 */
data class ImageSummary(
    val id: UUID,
    val communityId: UUID?,
    val uploadedBy: UUID,
    val mediaType: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val createdAt: Instant,
)

/** One image's bytes with the type needed to serve them. Plain class: see [Image]. */
class ImageBytes(val mediaType: String, val bytes: ByteArray)
```

- [ ] **Step 5: Write the repository**

`ImageRepository.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

private const val SUMMARY_COLUMNS =
    "id, community_id, uploaded_by, media_type, width, height, byte_size, created_at"

interface ImageRepository : CrudRepository<Image, UUID> {

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE community_id = :communityId ORDER BY id DESC")
    fun listForCommunity(communityId: UUID): List<ImageSummary>

    @Query(
        """
        SELECT $SUMMARY_COLUMNS FROM imagepool.images
        WHERE community_id = :communityId AND uploaded_by = :uploadedBy
        ORDER BY id DESC
        """,
    )
    fun listForUploader(communityId: UUID, uploadedBy: UUID): List<ImageSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE community_id IS NULL ORDER BY id DESC")
    fun listGlobal(): List<ImageSummary>

    @Query("SELECT $SUMMARY_COLUMNS FROM imagepool.images WHERE id = :id")
    fun findSummary(id: UUID): ImageSummary?

    @Query("SELECT media_type, bytes FROM imagepool.images WHERE id = :id")
    fun findOriginal(id: UUID): ImageBytes?

    @Query("SELECT thumb_bytes FROM imagepool.images WHERE id = :id")
    fun findThumb(id: UUID): ByteArray?

    /** IS NOT DISTINCT FROM so a null [communityId] addresses the global pool instead of matching nothing. */
    @Query("SELECT count(*) FROM imagepool.images WHERE community_id IS NOT DISTINCT FROM :communityId")
    fun countInPool(communityId: UUID?): Long

    @Query(
        """
        SELECT count(*) > 0 FROM imagepool.images
        WHERE community_id IS NOT DISTINCT FROM :communityId AND sha256 = :sha256
        """,
    )
    fun existsInPool(communityId: UUID?, sha256: ByteArray): Boolean

    /**
     * Serialises the quota check against concurrent uploads into the same pool; released when the
     * transaction ends, so the caller must be @Transactional. The lock function returns void, which
     * neither Spring Data JDBC nor JDBC's executeUpdate can map -- wrapping it in a count() gives it
     * a shape (always 1) without changing what it does.
     */
    @Query("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(:key)) AS locked")
    fun lockPool(key: Long): Long

    @Modifying
    @Query("DELETE FROM imagepool.images WHERE id = :id")
    fun deleteImage(id: UUID): Int
}
```

- [ ] **Step 6: Run the test — green**

Run: `cd core && ./mvnw test -Dtest=ImageRepositoryTest`
Expected: PASS (6 tests).

- [ ] **Step 7: Keep the modularity test green**

Run: `cd core && ./mvnw test -Dtest=ModularityTests`
Expected: PASS. `imagepool` has no exported package yet and depends on nothing — that is correct at
this point.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/resources/db/migration/imagepool core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/test/kotlin/org/unividuell/countdown/core/imagepool
git commit -m "Add the image pool's schema and queries"
```

---

### Task 2: Aufnahme — erkennen, vermessen, Thumbnail

Reine Bildverarbeitung, ohne Spring. Hier stecken die Fallen: Formate, Orientierung, Speicher.

**Files:**
- Modify: `core/pom.xml` (zwei Abhängigkeiten)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageIntake.kt`
- Create: `core/src/test/resources/imagepool/exif-orientation-6.jpg` (erzeugt, siehe Step 1)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageIntakeTest.kt`

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `ImageIntake.detect(ByteArray): DetectedFormat`, `ImageIntake.probe(ByteArray, String): Dimensions`,
  `ImageIntake.thumbnail(ByteArray, String, Int): ByteArray`,
  `DetectedFormat` = `Supported(mediaType)` | `Heic` | `Unknown`, `Dimensions(width, height)`.

- [ ] **Step 1: Produce the EXIF fixture**

Ein 40×20-Bild, links rot, rechts blau, mit `Orientation = 6` (90° im Uhrzeigersinn). Richtig
gedreht wird daraus 20×40 mit **Rot oben** — eine Behauptung, die jede Skalierung überlebt.

```bash
mkdir -p core/src/test/resources/imagepool
cat > /tmp/make-fixture.jsh <<'JSH'
import javax.imageio.ImageIO;
import java.awt.*; import java.awt.image.BufferedImage; import java.io.File;
var img = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
var g = img.createGraphics();
g.setColor(Color.RED);  g.fillRect(0, 0, 20, 20);
g.setColor(Color.BLUE); g.fillRect(20, 0, 20, 20);
g.dispose();
ImageIO.write(img, "jpeg", new File("/tmp/plain.jpg"));
/exit
JSH
jshell -q --execution local /tmp/make-fixture.jsh

python3 - <<'PY'
import struct
# Minimal EXIF APP1: TIFF header + one IFD entry (Orientation, SHORT, count 1, value 6).
tiff = b"MM\x00\x2a" + struct.pack(">I", 8)
ifd = struct.pack(">H", 1) + struct.pack(">HHI", 0x0112, 3, 1) \
    + struct.pack(">H", 6) + b"\x00\x00" + struct.pack(">I", 0)
payload = b"Exif\x00\x00" + tiff + ifd
app1 = b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload
data = open("/tmp/plain.jpg", "rb").read()
assert data[:2] == b"\xff\xd8"
open("core/src/test/resources/imagepool/exif-orientation-6.jpg", "wb").write(data[:2] + app1 + data[2:])
print("fixture written")
PY
```

Die Datei ist ~780 Bytes. Kein Spielinhalt, kein Geheimnis — sie darf ins Repo.

- [ ] **Step 2: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageIntakeTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.internal.DetectedFormat
import org.unividuell.countdown.core.imagepool.internal.ImageIntake
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

class ImageIntakeTest {

    private fun encoded(format: String, width: Int, height: Int): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.color = Color.GREEN
        g.fillRect(0, 0, width, height)
        g.dispose()
        val out = ByteArrayOutputStream()
        ImageIO.write(img, format, out)
        return out.toByteArray()
    }

    private fun fixture(name: String): ByteArray =
        javaClass.getResourceAsStream("/imagepool/$name")!!.readBytes()

    @Test
    fun `recognises the four accepted formats by their magic bytes`() {
        ImageIntake.detect(encoded("jpeg", 8, 8)) shouldBe DetectedFormat.Supported("image/jpeg")
        ImageIntake.detect(encoded("png", 8, 8)) shouldBe DetectedFormat.Supported("image/png")
        ImageIntake.detect(encoded("gif", 8, 8)) shouldBe DetectedFormat.Supported("image/gif")
        // RIFF....WEBP -- the header is all detect() looks at
        val webp = "RIFF".toByteArray() + ByteArray(4) + "WEBP".toByteArray() + ByteArray(8)
        ImageIntake.detect(webp) shouldBe DetectedFormat.Supported("image/webp")
    }

    @Test
    fun `names HEIC instead of calling it unknown`() {
        // ....ftypheic -- the box header an iPhone photo starts with
        val heic = ByteArray(4) + "ftypheic".toByteArray() + ByteArray(8)
        ImageIntake.detect(heic) shouldBe DetectedFormat.Heic
    }

    @Test
    fun `refuses anything else`() {
        ImageIntake.detect("not an image at all".toByteArray()) shouldBe DetectedFormat.Unknown
        ImageIntake.detect(ByteArray(2)) shouldBe DetectedFormat.Unknown
    }

    @Test
    fun `reads dimensions from the header`() {
        ImageIntake.probe(encoded("jpeg", 64, 32), "image/jpeg").width shouldBe 64
        ImageIntake.probe(encoded("jpeg", 64, 32), "image/jpeg").height shouldBe 32
        ImageIntake.probe(encoded("png", 7, 130), "image/png").height shouldBe 130
    }

    @Test
    fun `a WebP reader is actually registered`() {
        // The twelvemonkeys plugin arrives through ServiceLoader. If the nested-jar layout ever
        // hides META-INF/services, this fails here instead of on a user's upload.
        ImageIO.getImageReadersByMIMEType("image/webp").hasNext() shouldBe true
    }

    @Test
    fun `the thumbnail keeps the aspect ratio and fits the long edge`() {
        val thumb = ImageIntake.thumbnail(encoded("jpeg", 1000, 500), "image/jpeg", maxEdge = 400)
        val img = ImageIO.read(ByteArrayInputStream(thumb))
        img.width shouldBe 400
        img.height shouldBe 200
        ImageIntake.detect(thumb) shouldBe DetectedFormat.Supported("image/jpeg")
    }

    @Test
    fun `an image smaller than the target is not blown up`() {
        val thumb = ImageIntake.thumbnail(encoded("png", 40, 20), "image/png", maxEdge = 400)
        val img = ImageIO.read(ByteArrayInputStream(thumb))
        img.width shouldBe 40
        img.height shouldBe 20
    }

    @Test
    fun `EXIF orientation is applied -- a portrait photo does not lie on its side`() {
        val thumb = ImageIntake.thumbnail(fixture("exif-orientation-6.jpg"), "image/jpeg", maxEdge = 400)
        val img = ImageIO.read(ByteArrayInputStream(thumb))

        // orientation 6 = rotate 90° clockwise: 40x20 landscape becomes 20x40 portrait...
        img.width shouldBe 20
        img.height shouldBe 40
        // ...and the red half, on the LEFT before, is on TOP after. Asserted as a comparison
        // between channels, not against an exact value: JPEG is lossy and 255 never survives.
        val top = Color(img.getRGB(10, 5))
        val bottom = Color(img.getRGB(10, 35))
        (top.red > top.blue) shouldBe true
        (bottom.blue > bottom.red) shouldBe true
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd core && ./mvnw test -Dtest=ImageIntakeTest`
Expected: compile failure — `ImageIntake` does not exist.

- [ ] **Step 4: Add the two dependencies**

In `core/pom.xml`, in `<properties>` (neither is in the Boot BOM, so ours to track — see
`.claude/guidelines/dependency-updates.md`):

```xml
		<metadata-extractor.version>2.19.0</metadata-extractor.version>
		<twelvemonkeys.version>3.12.0</twelvemonkeys.version>
```

and in `<dependencies>`, next to the `jlayer` block:

```xml
		<dependency>
			<!-- The JDK applies no EXIF orientation, and phone photos almost always carry one -
			     without this every portrait shot lies on its side in the listing. Reading the tag
			     is all we use it for. -->
			<groupId>com.drewnoakes</groupId>
			<artifactId>metadata-extractor</artifactId>
			<version>${metadata-extractor.version}</version>
		</dependency>
		<dependency>
			<!-- ImageIO has no WebP reader in any JDK (measured on 25: BMP/GIF/JPEG/PNG/TIFF/WBMP
			     only), and WebP is what modern phones increasingly hand over. -->
			<groupId>com.twelvemonkeys.imageio</groupId>
			<artifactId>imageio-webp</artifactId>
			<version>${twelvemonkeys.version}</version>
		</dependency>
```

- [ ] **Step 5: Write ImageIntake**

`core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageIntake.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import javax.imageio.ImageReader
import kotlin.math.max

sealed interface DetectedFormat {
    data class Supported(val mediaType: String) : DetectedFormat
    /** Recognised on purpose, so the refusal can name it instead of saying "invalid format". */
    data object Heic : DetectedFormat
    data object Unknown : DetectedFormat
}

data class Dimensions(val width: Int, val height: Int) {
    val pixels: Long get() = width.toLong() * height.toLong()
}

/**
 * Everything that happens to an uploaded file before it becomes a row. No Spring, no database --
 * so it can be tested with images the test writes itself.
 */
object ImageIntake {

    /** The client's Content-Type is a claim; these bytes are evidence. */
    fun detect(bytes: ByteArray): DetectedFormat {
        fun at(offset: Int, vararg expected: Int): Boolean =
            bytes.size >= offset + expected.size &&
                expected.withIndex().all { (i, b) -> bytes[offset + i].toInt() and 0xFF == b }

        return when {
            at(0, 0xFF, 0xD8, 0xFF) -> DetectedFormat.Supported("image/jpeg")
            at(0, 0x89, 0x50, 0x4E, 0x47) -> DetectedFormat.Supported("image/png")
            at(0, 0x47, 0x49, 0x46, 0x38) -> DetectedFormat.Supported("image/gif")
            // RIFF container: "RIFF" then four length bytes then "WEBP"
            at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50) ->
                DetectedFormat.Supported("image/webp")
            // ISO-BMFF box: 4 length bytes, then "ftyp", then a brand starting with heic/heix/mif1
            at(4, 0x66, 0x74, 0x79, 0x70) && isHeicBrand(bytes) -> DetectedFormat.Heic
            else -> DetectedFormat.Unknown
        }
    }

    private fun isHeicBrand(bytes: ByteArray): Boolean {
        if (bytes.size < 12) return false
        val brand = String(bytes, 8, 4, Charsets.US_ASCII)
        return brand in setOf("heic", "heix", "hevc", "mif1", "msf1", "heim", "heis")
    }

    /** Header only -- a 40 MP file must be measurable without ever becoming a BufferedImage. */
    fun probe(bytes: ByteArray, mediaType: String): Dimensions = withReader(bytes, mediaType) {
        Dimensions(width = it.getWidth(0), height = it.getHeight(0))
    }

    /**
     * A JPEG whose long edge is at most [maxEdge], aspect ratio kept, EXIF orientation applied and
     * every other EXIF field dropped (re-encoding writes none).
     *
     * Decoding is subsampled to roughly twice the target first: a 40 MP source would otherwise be
     * ~160 MB of heap for a 400 px result -- 11 % of the container's heap for one upload, and none
     * of it needed. The second, smooth step then does the quality work on a small image.
     */
    fun thumbnail(bytes: ByteArray, mediaType: String, maxEdge: Int): ByteArray {
        val decoded = withReader(bytes, mediaType) { reader ->
            val longEdge = max(reader.getWidth(0), reader.getHeight(0))
            val step = max(1, longEdge / (maxEdge * 2))
            val param = reader.defaultReadParam.apply { setSourceSubsampling(step, step, 0, 0) }
            reader.read(0, param)
        }

        val oriented = applyOrientation(decoded, orientationOf(bytes))
        val scale = minOf(1.0, maxEdge.toDouble() / max(oriented.width, oriented.height))
        val target = if (scale == 1.0) oriented else scaled(
            source = oriented,
            width = max(1, Math.round(oriented.width * scale).toInt()),
            height = max(1, Math.round(oriented.height * scale).toInt()),
        )

        val out = ByteArrayOutputStream()
        // Flattened onto white: JPEG has no alpha, and a photo pool's PNGs are the exception.
        val opaque = BufferedImage(target.width, target.height, BufferedImage.TYPE_INT_RGB)
        opaque.createGraphics().apply {
            color = java.awt.Color.WHITE
            fillRect(0, 0, target.width, target.height)
            drawImage(target, 0, 0, null)
            dispose()
        }
        ImageIO.write(opaque, "jpeg", out)
        return out.toByteArray()
    }

    private fun <T> withReader(bytes: ByteArray, mediaType: String, block: (ImageReader) -> T): T {
        val readers = ImageIO.getImageReadersByMIMEType(mediaType)
        require(readers.hasNext()) { "no reader for $mediaType" }
        val reader = readers.next()
        return ImageIO.createImageInputStream(ByteArrayInputStream(bytes)).use { input ->
            reader.input = input
            try {
                block(reader)
            } finally {
                reader.dispose()
            }
        }
    }

    /** 1 when absent or unreadable -- a missing tag means "as stored", not an error. */
    private fun orientationOf(bytes: ByteArray): Int = runCatching {
        ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
            .getFirstDirectoryOfType(ExifIFD0Directory::class.java)
            ?.getInt(ExifIFD0Directory.TAG_ORIENTATION)
            ?: 1
    }.getOrDefault(1)

    private fun applyOrientation(image: BufferedImage, orientation: Int): BufferedImage {
        if (orientation == 1) return image
        val w = image.width
        val h = image.height
        val swaps = orientation in setOf(5, 6, 7, 8)
        val transform = AffineTransform().apply {
            when (orientation) {
                2 -> { translate(w.toDouble(), 0.0); scale(-1.0, 1.0) }
                3 -> { translate(w.toDouble(), h.toDouble()); rotate(Math.PI) }
                4 -> { translate(0.0, h.toDouble()); scale(1.0, -1.0) }
                5 -> { rotate(-Math.PI / 2); scale(-1.0, 1.0) }
                6 -> { translate(h.toDouble(), 0.0); rotate(Math.PI / 2) }
                7 -> { scale(-1.0, 1.0); translate(-h.toDouble(), 0.0); rotate(-Math.PI / 2) }
                8 -> { translate(0.0, w.toDouble()); rotate(-Math.PI / 2) }
                else -> return image
            }
        }
        val out = BufferedImage(if (swaps) h else w, if (swaps) w else h, BufferedImage.TYPE_INT_RGB)
        out.createGraphics().apply {
            setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            drawImage(image, transform, null)
            dispose()
        }
        return out
    }

    private fun scaled(source: BufferedImage, width: Int, height: Int): BufferedImage {
        val out = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        out.createGraphics().apply {
            setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
            drawImage(source, 0, 0, width, height, null)
            dispose()
        }
        return out
    }
}
```

- [ ] **Step 6: Run the test — green**

Run: `cd core && ./mvnw test -Dtest=ImageIntakeTest`
Expected: PASS (8 tests).

Wenn `a WebP reader is actually registered` fehlschlägt, findet der `ServiceLoader` das Plugin
nicht — dann einmalig `ImageIO.scanForPlugins()` in einer `@PostConstruct`-Methode aufrufen und den
Grund als Kommentar festhalten. Nicht vorbeugend einbauen.

- [ ] **Step 7: Commit**

```bash
git add core/pom.xml core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/test/kotlin/org/unividuell/countdown/core/imagepool core/src/test/resources/imagepool
git commit -m "Turn an uploaded file into a measured image and a thumbnail"
```

---

### Task 3: Tor, Grenzen, Dienst

**Files:**
- Create: `…/imagepool/internal/ImagePoolProperties.kt`, `ImagePoolExceptions.kt`,
  `ImagePoolExceptionHandler.kt`, `ImagePoolGate.kt`, `ImagePoolService.kt`
- Delete: `…/imagepool/internal/MigrationOrderEdge.kt`
- Modify: `core/src/main/resources/application.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolServiceTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolGateTest.kt`

**Interfaces:**
- Consumes: `ImageRepository`, `ImageSummary` (Task 1); `ImageIntake`, `DetectedFormat` (Task 2);
  `CommunityQuery`, `MembershipQuery` (öffentlich, aus `community`).
- Produces: `ImagePoolService.upload(pool, uploaderId, bytes): ImageSummary`,
  `.list(pool, viewerId): List<ImageSummary>`, `.count(pool): Long`, `.limitOf(pool): Int`,
  `.original(pool, id, viewerId): ImageBytes`, `.thumb(pool, id, viewerId): ByteArray`,
  `.delete(pool, id, viewerId)`;
  `ImagePoolGate.forCommunity(slug, userId, isSuperAdmin): PoolContext`,
  `ImagePoolGate.global(isSuperAdmin): PoolContext`;
  `PoolContext(communityId: UUID?, viewerIsAdmin: Boolean)`.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolServiceTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.internal.*
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.test.assertFailsWith

class ImagePoolServiceTest {

    private val images: ImageRepository = mockk(relaxed = true)
    private val limits = ImagePoolProperties(
        perCommunityLimit = 2, globalLimit = 1,
        // Long, not Int -- Kotlin does not widen a literal for you.
        maxBytes = 15 * 1024 * 1024, maxPixels = 40_000_000L, thumbEdge = 400,
    )
    private val service = ImagePoolService(images = images, limits = limits)

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val uploader = UUID.fromString("018f0000-0000-7000-8000-0000000000a1")
    private val pool = PoolContext(communityId = communityId, viewerIsAdmin = false)

    private fun jpeg(width: Int = 64, height: Int = 32): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, width, height); dispose() }
        val out = ByteArrayOutputStream()
        ImageIO.write(img, "jpeg", out)
        return out.toByteArray()
    }

    @Test
    fun `stores the original untouched and a thumbnail beside it`() {
        every { images.countInPool(communityId) } returns 0
        every { images.existsInPool(communityId, any()) } returns false
        val bytes = jpeg()
        // save() must hand back a row WITH an id -- the service reads saved.id!! straight after.
        every { images.save(any<Image>()) } answers {
            val incoming = firstArg<Image>()
            incoming.bytes.contentEquals(bytes) shouldBe true
            Image(
                id = UUID.randomUUID(),
                communityId = incoming.communityId,
                uploadedBy = incoming.uploadedBy,
                mediaType = incoming.mediaType,
                width = incoming.width,
                height = incoming.height,
                byteSize = incoming.byteSize,
                sha256 = incoming.sha256,
                bytes = incoming.bytes,
                thumbBytes = incoming.thumbBytes,
            )
        }
        every { images.findSummary(any()) } returns summary()

        service.upload(pool = pool, uploaderId = uploader, bytes = bytes)

        verify { images.lockPool(any()) }
        verify {
            images.save(match<Image> { it.mediaType == "image/jpeg" && it.width == 64 && it.thumbBytes.isNotEmpty() })
        }
    }

    @Test
    fun `refuses a full pool`() {
        every { images.countInPool(communityId) } returns 2
        assertFailsWith<PoolFullException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())
        }
    }

    @Test
    fun `refuses the same file twice in one pool`() {
        every { images.countInPool(communityId) } returns 0
        every { images.existsInPool(communityId, any()) } returns true
        assertFailsWith<DuplicateImageException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = jpeg())
        }
    }

    @Test
    fun `names HEIC rather than calling it unknown`() {
        every { images.countInPool(communityId) } returns 0
        val heic = ByteArray(4) + "ftypheic".toByteArray() + ByteArray(8)
        assertFailsWith<HeicNotSupportedException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = heic)
        }
    }

    @Test
    fun `refuses a file that is not an image, and one that is too large`() {
        every { images.countInPool(communityId) } returns 0
        assertFailsWith<UnsupportedFormatException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = "nope".toByteArray())
        }
        assertFailsWith<ImageTooLargeException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = ByteArray(limits.maxBytes + 1))
        }
    }

    /**
     * A JPEG's magic bytes with nothing decodable behind them. This is the only place BROKEN_IMAGE
     * is reachable: detect() is happy, and the decoder is the one that refuses.
     */
    @Test
    fun `a file that only looks like an image is named broken, not unknown`() {
        every { images.countInPool(communityId) } returns 0
        val truncated = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()) + ByteArray(64)

        assertFailsWith<BrokenImageException> {
            service.upload(pool = pool, uploaderId = uploader, bytes = truncated)
        }
    }

    @Test
    fun `an admin sees the whole pool, a member only their own`() {
        service.list(pool = pool.copy(viewerIsAdmin = true), viewerId = uploader)
        verify { images.listForCommunity(communityId) }

        service.list(pool = pool, viewerId = uploader)
        verify { images.listForUploader(communityId, uploader) }
    }

    @Test
    fun `deleting someone else's image is a 404, not a 403`() {
        every { images.findSummary(any()) } returns summary(uploadedBy = UUID.randomUUID())
        assertFailsWith<ImageNotFoundException> {
            service.delete(pool = pool, id = UUID.randomUUID(), viewerId = uploader)
        }
    }

    @Test
    fun `an image from another pool is invisible even with the right id`() {
        every { images.findSummary(any()) } returns summary(communityId = UUID.randomUUID())
        assertFailsWith<ImageNotFoundException> {
            service.original(pool = pool.copy(viewerIsAdmin = true), id = UUID.randomUUID(), viewerId = uploader)
        }
    }

    private fun summary(
        communityId: UUID? = this.communityId,
        uploadedBy: UUID = uploader,
    ) = ImageSummary(
        id = UUID.randomUUID(), communityId = communityId, uploadedBy = uploadedBy,
        mediaType = "image/jpeg", width = 64, height = 32, byteSize = 10,
        createdAt = Instant.parse("2026-09-01T00:00:00Z"),
    )
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && ./mvnw test -Dtest=ImagePoolServiceTest`
Expected: compile failure — none of the types exist.

- [ ] **Step 3: Write the properties and wire them**

`ImagePoolProperties.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * The quota promises `perCommunityLimit * maxBytes`, not `perCommunityLimit * 5 MB` -- raising
 * either shifts the backup's disk budget with it.
 */
@ConfigurationProperties(prefix = "imagepool")
data class ImagePoolProperties(
    val perCommunityLimit: Int = 150,
    val globalLimit: Int = 40,
    val maxBytes: Int = 15 * 1024 * 1024,
    val maxPixels: Long = 40_000_000,
    val thumbEdge: Int = 400,
)
```

In `core/src/main/resources/application.yaml`, unter `spring:`, den Multipart-Block ergänzen (die
Vorgabe ist 1 MB und würde jeden echten Upload ablehnen), und die Pool-Grenzen als eigenen Block:

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 15MB
      max-request-size: 16MB

imagepool:
  per-community-limit: 150
  global-limit: 40
  max-bytes: 15MB
  max-pixels: 40000000
  thumb-edge: 400
```

Und `@ConfigurationPropertiesScan` prüfen: liegt es schon auf `CoreApplication`, ist nichts zu tun;
sonst `@EnableConfigurationProperties(ImagePoolProperties::class)` an eine
`@Configuration`-Klasse im Modul hängen.

- [ ] **Step 4: Write the exceptions and their handler**

`ImagePoolExceptions.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

/**
 * Every refusal carries a [code]. The server's own message stays English; the German sentence a
 * member reads is built in the frontend from this code, so one upload's failure can be named
 * precisely ("HEIC" vs. "pool full") without shipping copy through the API.
 */
sealed class ImagePoolException(val code: String, message: String) : RuntimeException(message)

/** Not an active member (or the pool does not exist) -> 404, the same non-answer as elsewhere. */
class ImagePoolAccessDeniedException : ImagePoolException("NO_ACCESS", "No access")

/** An active member where an admin is required -> 403. */
class NotPoolAdminException : ImagePoolException("NOT_ADMIN", "Admin required")

/** Wrong pool, wrong uploader, or simply absent -- all indistinguishable from outside -> 404. */
class ImageNotFoundException : ImagePoolException("NOT_FOUND", "No such image")

class PoolFullException(limit: Int) : ImagePoolException("POOL_FULL", "Pool holds at most $limit images")
class DuplicateImageException : ImagePoolException("DUPLICATE", "This image is already in the pool")
class UnsupportedFormatException : ImagePoolException("UNSUPPORTED_FORMAT", "Only JPEG, PNG, GIF and WebP")
class HeicNotSupportedException : ImagePoolException("HEIC_UNSUPPORTED", "HEIC cannot be read")
class ImageTooLargeException(maxBytes: Int) : ImagePoolException("TOO_LARGE", "At most $maxBytes bytes")
class TooManyPixelsException(maxPixels: Long) : ImagePoolException("TOO_MANY_PIXELS", "At most $maxPixels pixels")
class BrokenImageException : ImagePoolException("BROKEN_IMAGE", "The file could not be decoded")
```

`ImagePoolExceptionHandler.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

@RestControllerAdvice(basePackages = ["org.unividuell.countdown.core.imagepool.internal"])
class ImagePoolExceptionHandler {

    @ExceptionHandler(ImagePoolException::class)
    fun handle(e: ImagePoolException): ProblemDetail {
        val status = when (e) {
            is ImagePoolAccessDeniedException, is ImageNotFoundException -> HttpStatus.NOT_FOUND
            is NotPoolAdminException -> HttpStatus.FORBIDDEN
            is PoolFullException, is DuplicateImageException -> HttpStatus.CONFLICT
            is UnsupportedFormatException, is HeicNotSupportedException -> HttpStatus.UNSUPPORTED_MEDIA_TYPE
            is ImageTooLargeException -> HttpStatus.PAYLOAD_TOO_LARGE
            is TooManyPixelsException, is BrokenImageException -> HttpStatus.UNPROCESSABLE_ENTITY
        }
        return ProblemDetail.forStatusAndDetail(status, e.message ?: e.code)
            .apply { setProperty("code", e.code) }
    }

    /** The container rejects an oversized body before the service ever sees it -- same code. */
    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun tooLarge(e: MaxUploadSizeExceededException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE, "Upload exceeds the configured limit")
            .apply { setProperty("code", "TOO_LARGE") }
}
```

- [ ] **Step 5: Write the gate**

`ImagePoolGate.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import java.util.UUID

/** Which pool a request addresses, and whether the caller may see all of it. */
data class PoolContext(val communityId: UUID?, val viewerIsAdmin: Boolean)

/**
 * The tenant gate, owned by this module. CommunityAccess would be shorter but lives in
 * community.internal and is closed to us -- so the resolution goes through the public
 * CommunityQuery/MembershipQuery, exactly as game's AnnouncementService.resolve does.
 */
@Service
class ImagePoolGate(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
) {
    fun forCommunity(slug: String, userId: UUID, isSuperAdmin: Boolean): PoolContext {
        val community = communities.findBySlug(slug) ?: throw ImagePoolAccessDeniedException()
        val communityId = requireNotNull(community.id)
        if (isSuperAdmin) return PoolContext(communityId = communityId, viewerIsAdmin = true)
        if (!memberships.isActiveMember(communityId = communityId, userId = userId)) {
            throw ImagePoolAccessDeniedException()
        }
        return PoolContext(
            communityId = communityId,
            viewerIsAdmin = memberships.isAdmin(communityId = communityId, userId = userId),
        )
    }

    /** The global pool has no members: only a super-admin reaches it at all. */
    fun global(isSuperAdmin: Boolean): PoolContext {
        if (!isSuperAdmin) throw ImagePoolAccessDeniedException()
        return PoolContext(communityId = null, viewerIsAdmin = true)
    }
}
```

- [ ] **Step 6: Write the service**

`ImagePoolService.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.util.UUID

@Service
class ImagePoolService(
    private val images: ImageRepository,
    private val limits: ImagePoolProperties,
) {
    /**
     * The whole intake in one transaction, because the quota check and the insert must not be
     * separable: the advisory lock taken first is released when this transaction ends.
     */
    @Transactional
    fun upload(pool: PoolContext, uploaderId: UUID, bytes: ByteArray): ImageSummary {
        if (bytes.size > limits.maxBytes) throw ImageTooLargeException(limits.maxBytes)

        val mediaType = when (val detected = ImageIntake.detect(bytes)) {
            is DetectedFormat.Supported -> detected.mediaType
            DetectedFormat.Heic -> throw HeicNotSupportedException()
            DetectedFormat.Unknown -> throw UnsupportedFormatException()
        }

        val dimensions = runCatching { ImageIntake.probe(bytes, mediaType) }
            .getOrElse { throw BrokenImageException() }
        if (dimensions.pixels > limits.maxPixels) throw TooManyPixelsException(limits.maxPixels)

        images.lockPool(lockKey(pool.communityId))
        val limit = if (pool.communityId == null) limits.globalLimit else limits.perCommunityLimit
        if (images.countInPool(pool.communityId) >= limit) throw PoolFullException(limit)

        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes)
        if (images.existsInPool(pool.communityId, sha256)) throw DuplicateImageException()

        val thumb = runCatching { ImageIntake.thumbnail(bytes, mediaType, limits.thumbEdge) }
            .getOrElse { throw BrokenImageException() }

        val saved = images.save(
            Image(
                communityId = pool.communityId,
                uploadedBy = uploaderId,
                mediaType = mediaType,
                width = dimensions.width,
                height = dimensions.height,
                byteSize = bytes.size,
                sha256 = sha256,
                bytes = bytes,
                thumbBytes = thumb,
            ),
        )
        return images.findSummary(saved.id!!) ?: throw ImageNotFoundException()
    }

    fun list(pool: PoolContext, viewerId: UUID): List<ImageSummary> = when {
        pool.communityId == null -> images.listGlobal()
        pool.viewerIsAdmin -> images.listForCommunity(pool.communityId)
        else -> images.listForUploader(pool.communityId, viewerId)
    }

    fun count(pool: PoolContext): Long = images.countInPool(pool.communityId)

    fun limitOf(pool: PoolContext): Int =
        if (pool.communityId == null) limits.globalLimit else limits.perCommunityLimit

    fun original(pool: PoolContext, id: UUID, viewerId: UUID): ImageBytes {
        visible(pool = pool, id = id, viewerId = viewerId)
        return images.findOriginal(id) ?: throw ImageNotFoundException()
    }

    fun thumb(pool: PoolContext, id: UUID, viewerId: UUID): ByteArray {
        visible(pool = pool, id = id, viewerId = viewerId)
        return images.findThumb(id) ?: throw ImageNotFoundException()
    }

    @Transactional
    fun delete(pool: PoolContext, id: UUID, viewerId: UUID) {
        visible(pool = pool, id = id, viewerId = viewerId)
        images.deleteImage(id)
    }

    /**
     * Wrong pool, someone else's upload, or gone -- all one answer. A member who guesses an id
     * must not be able to tell "not yours" from "does not exist".
     */
    private fun visible(pool: PoolContext, id: UUID, viewerId: UUID): ImageSummary {
        val summary = images.findSummary(id) ?: throw ImageNotFoundException()
        if (summary.communityId != pool.communityId) throw ImageNotFoundException()
        if (!pool.viewerIsAdmin && summary.uploadedBy != viewerId) throw ImageNotFoundException()
        return summary
    }

    /**
     * String.hashCode is specified, so the key is stable across JVMs and restarts -- unlike a
     * value derived from the UUID's bits, it also gives the global pool (no id) a key of its own.
     */
    private fun lockKey(communityId: UUID?): Long =
        (communityId?.toString() ?: "imagepool:global").hashCode().toLong()
}
```

- [ ] **Step 7: Run the test — green**

Run: `cd core && ./mvnw test -Dtest=ImagePoolServiceTest`
Expected: PASS (9 tests).

- [ ] **Step 8: Test the gate itself**

`ImagePoolServiceTest` builds its `PoolContext` by hand, so it never runs the gate — and the gate
is the access control. It gets its own test, with `CommunityQuery` and `MembershipQuery` as mocks:
an unknown slug and a non-member both refused with `ImagePoolAccessDeniedException`, so neither
answer betrays whether the community exists; a super-admin admitted without a membership; `isAdmin`
arriving as `viewerIsAdmin`; and `global()` refusing anyone who is not a super-admin.

- [ ] **Step 9: Remove the placeholder edge**

`ImagePoolGate` above imports `CommunityQuery`, so `imagepool` now depends on `community` for a
real reason. The placeholder that carried that edge since Task 1 has done its job:

```bash
rm core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/MigrationOrderEdge.kt
```

Then run the whole suite: `cd core && ./mvnw test`. It must stay green — in particular
`ImageRepositoryTest`, whose foreign keys only exist because that edge puts `imagepool`'s
migration behind `community`'s and `iam`'s. A failure with `schema "community" does not exist`
means the edge is gone and nothing replaced it; check that `ImagePoolGate` really is in
`src/main` and really imports `CommunityQuery`. Carry the rationale into `ImagePoolGate`'s own
KDoc — the placeholder was the only place it was written down.

- [ ] **Step 10: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/main/resources/application.yaml core/src/test/kotlin/org/unividuell/countdown/core/imagepool
git commit -m "Gate the image pool and enforce its limits"
```

---

### Task 4: Endpunkte der Community

**Files:**
- Create: `…/imagepool/internal/ImagePoolController.kt`, `…/imagepool/internal/ImagePoolDtos.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolControllerTest.kt`

**Interfaces:**
- Consumes: `ImagePoolGate`, `ImagePoolService`, `PoolContext`, `ImageSummary`, `ImageBytes`.
- Produces: `ImageListResponse(images: List<ImageResponse>, used: Long, limit: Int)`,
  `ImageResponse(id, width, height, byteSize, createdAt, uploadedBy)` — `uploadedBy` ist der
  **Anzeigename**, nicht die ID.

- [ ] **Step 1: Write the failing test**

`core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolControllerTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.imagepool.internal.*
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor
import java.time.Instant
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class ImagePoolControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: ImagePoolGate
    @MockkBean lateinit var service: ImagePoolService
    @MockkBean lateinit var users: UserQuery

    private val communityId = UUID.fromString("018f0000-0000-7000-8000-0000000000c1")
    private val imageId = UUID.fromString("018f0000-0000-7000-8000-0000000000e1")
    private val memberPool = PoolContext(communityId = communityId, viewerIsAdmin = false)

    private val summary = ImageSummary(
        id = imageId, communityId = communityId, uploadedBy = TEST_USER_ID,
        mediaType = "image/jpeg", width = 800, height = 600, byteSize = 4_500_000,
        createdAt = Instant.parse("2026-09-01T10:00:00Z"),
    )

    @Test
    fun `a non-member gets 404, never 403`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } throws ImagePoolAccessDeniedException()
        mockMvc.get("/api/communities/alpha/images") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `the listing carries the quota and the uploader's name, never bytes`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.list(memberPool, TEST_USER_ID) } returns listOf(summary)
        every { service.count(memberPool) } returns 12L
        every { service.limitOf(memberPool) } returns 150
        every { users.findAllById(listOf(TEST_USER_ID)) } returns
            listOf(User(id = TEST_USER_ID, githubId = 1L, githubLogin = "alice"))

        mockMvc.get("/api/communities/alpha/images") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(12) }
                jsonPath("$.limit") { value(150) }
                jsonPath("$.images[0].id") { value(imageId.toString()) }
                jsonPath("$.images[0].uploadedBy") { value("alice") }
                jsonPath("$.images[0].byteSize") { value(4500000) }
                jsonPath("$.images[0].bytes") { doesNotExist() }
                jsonPath("$.images[0].thumbBytes") { doesNotExist() }
            }
    }

    @Test
    fun `a full pool answers 409 with a code the frontend can read`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.upload(memberPool, TEST_USER_ID, any()) } throws PoolFullException(150)

        mockMvc.multipart("/api/communities/alpha/images") {
            file(MockMultipartFile("file", "a.jpg", "image/jpeg", byteArrayOf(1, 2, 3)))
            with(principalFor())
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("POOL_FULL") }
        }
    }

    @Test
    fun `HEIC is refused by name`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.upload(memberPool, TEST_USER_ID, any()) } throws HeicNotSupportedException()

        mockMvc.multipart("/api/communities/alpha/images") {
            file(MockMultipartFile("file", "a.heic", "image/heic", byteArrayOf(1, 2, 3)))
            with(principalFor())
        }.andExpect {
            status { isUnsupportedMediaType() }
            jsonPath("$.code") { value("HEIC_UNSUPPORTED") }
        }
    }

    @Test
    fun `the thumbnail is a cacheable, private JPEG`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.thumb(memberPool, imageId, TEST_USER_ID) } returns byteArrayOf(9, 9)

        mockMvc.get("/api/communities/alpha/images/$imageId/thumb") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.IMAGE_JPEG) }
                header { string("Cache-Control", "private, max-age=31536000, immutable") }
            }
    }

    @Test
    fun `the original is served for viewing, not for downloading`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.original(memberPool, imageId, TEST_USER_ID) } returns
            ImageBytes(mediaType = "image/png", bytes = byteArrayOf(1))

        mockMvc.get("/api/communities/alpha/images/$imageId") { with(principalFor()) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.IMAGE_PNG) }
                // A new tab must display it; Content-Disposition would make the browser save it.
                header { doesNotExist("Content-Disposition") }
            }
    }

    @Test
    fun `deleting answers 204`() {
        every { gate.forCommunity("alpha", TEST_USER_ID, false) } returns memberPool
        every { service.delete(memberPool, imageId, TEST_USER_ID) } returns Unit

        mockMvc.delete("/api/communities/alpha/images/$imageId") { with(principalFor()) }
            .andExpect { status { isNoContent() } }
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && ./mvnw test -Dtest=ImagePoolControllerTest`
Expected: compile failure — the controller does not exist.

- [ ] **Step 3: Write the DTOs**

`ImagePoolDtos.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import java.time.Instant
import java.util.UUID

/**
 * [uploadedBy] is the display name, not the id: an id would be useless on screen and would force a
 * second request. A membership whose user row is gone shows "?" rather than vanishing.
 */
data class ImageResponse(
    val id: UUID,
    val width: Int,
    val height: Int,
    val byteSize: Int,
    val createdAt: Instant,
    val uploadedBy: String,
)

/** [used] and [limit] travel with the list so the page can say "12 von 150" before a pick. */
data class ImageListResponse(val images: List<ImageResponse>, val used: Long, val limit: Int)
```

- [ ] **Step 4: Write the controller**

`ImagePoolController.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/** Immutable per id, and never shared: a year of caching, in this browser only. */
private const val IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable"

@RestController
@RequestMapping("/api/communities/{slug}/images")
class ImagePoolController(
    private val gate: ImagePoolGate,
    private val service: ImagePoolService,
    private val users: UserQuery,
) {
    @GetMapping
    fun list(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable slug: String): ImageListResponse {
        val pool = gate.forCommunity(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)
        return listing(pool = pool, viewerId = me.id)
    }

    /** One file per request: the queue lives in the browser, so each file fails on its own. */
    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @RequestPart("file") file: MultipartFile,
    ): ImageResponse {
        val pool = gate.forCommunity(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)
        val saved = service.upload(pool = pool, uploaderId = me.id, bytes = file.bytes)
        return response(summary = saved, names = namesFor(listOf(saved)))
    }

    @GetMapping("/{id}/thumb")
    fun thumb(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable id: UUID,
    ): ResponseEntity<ByteArray> {
        val pool = gate.forCommunity(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)
        return bytes(
            body = service.thumb(pool = pool, id = id, viewerId = me.id),
            mediaType = MediaType.IMAGE_JPEG_VALUE,
            id = id,
        )
    }

    @GetMapping("/{id}")
    fun original(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable id: UUID,
    ): ResponseEntity<ByteArray> {
        val pool = gate.forCommunity(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)
        val original = service.original(pool = pool, id = id, viewerId = me.id)
        return bytes(body = original.bytes, mediaType = original.mediaType, id = id)
    }

    @DeleteMapping("/{id}")
    fun delete(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable id: UUID,
    ): ResponseEntity<Void> {
        val pool = gate.forCommunity(slug = slug, userId = me.id, isSuperAdmin = me.isSuperAdmin)
        service.delete(pool = pool, id = id, viewerId = me.id)
        return ResponseEntity.noContent().build()
    }

    private fun listing(pool: PoolContext, viewerId: UUID): ImageListResponse {
        val summaries = service.list(pool = pool, viewerId = viewerId)
        val names = namesFor(summaries)
        return ImageListResponse(
            images = summaries.map { response(summary = it, names = names) },
            used = service.count(pool),
            limit = service.limitOf(pool),
        )
    }

    private fun namesFor(summaries: List<ImageSummary>): Map<UUID, String> =
        users.findAllById(summaries.map { it.uploadedBy }.distinct()).associate { it.id!! to it.username }

    private fun response(summary: ImageSummary, names: Map<UUID, String>) = ImageResponse(
        id = summary.id,
        width = summary.width,
        height = summary.height,
        byteSize = summary.byteSize,
        createdAt = summary.createdAt,
        // An image whose uploader's row is gone stays listed rather than disappearing.
        uploadedBy = names[summary.uploadedBy] ?: "?",
    )

    /**
     * No Content-Disposition on purpose: the listing opens the original in a new tab, and
     * `attachment` would make the browser save the file instead of showing it.
     */
    private fun bytes(body: ByteArray, mediaType: String, id: UUID): ResponseEntity<ByteArray> =
        ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, mediaType)
            .header(HttpHeaders.CACHE_CONTROL, IMAGE_CACHE_CONTROL)
            .eTag("\"$id\"")
            .body(body)
}
```

Prüfen, ob `UserQuery` eine `username`-Eigenschaft und `findAllById` hat (`MemberController` nutzt
beides genau so); falls die Signatur abweicht, dort abschauen statt raten.

- [ ] **Step 5: Run the test — green**

Run: `cd core && ./mvnw test -Dtest=ImagePoolControllerTest`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/test/kotlin/org/unividuell/countdown/core/imagepool
git commit -m "Serve a community's image pool"
```

---

### Task 5: Der globale Bestand

**Files:**
- Create: `…/imagepool/internal/SuperAdminImageController.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/SuperAdminImageControllerTest.kt`

**Interfaces:**
- Consumes: alles aus Task 3 und 4 (`ImagePoolGate.global`, `ImagePoolService`, `ImageListResponse`).
- Produces: nichts Neues.

- [ ] **Step 1: Write the failing test**

```kotlin
package org.unividuell.countdown.core.imagepool

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TEST_USER_ID
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.imagepool.internal.*
import org.unividuell.countdown.core.iam.UserQuery
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SuperAdminImageControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var gate: ImagePoolGate
    @MockkBean lateinit var service: ImagePoolService
    @MockkBean lateinit var users: UserQuery

    private val globalPool = PoolContext(communityId = null, viewerIsAdmin = true)

    @Test
    fun `a plain member cannot reach the global pool`() {
        every { gate.global(false) } throws ImagePoolAccessDeniedException()
        mockMvc.get("/api/super-admin/images") { with(principalFor(superAdmin = false)) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `a super-admin sees the global pool with its own limit`() {
        every { gate.global(true) } returns globalPool
        every { service.list(globalPool, TEST_USER_ID) } returns emptyList()
        every { service.count(globalPool) } returns 3L
        every { service.limitOf(globalPool) } returns 40
        every { users.findAllById(emptyList()) } returns emptyList()

        mockMvc.get("/api/super-admin/images") { with(principalFor(superAdmin = true)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.used") { value(3) }
                jsonPath("$.limit") { value(40) }
            }
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd core && ./mvnw test -Dtest=SuperAdminImageControllerTest`
Expected: 404 vs. missing mapping — the controller does not exist.

- [ ] **Step 3: Write the controller**

Dieselben Endpunkte, nur ohne `slug` und mit `gate.global(...)` als Torwächter. Die privaten Helfer
werden bewusst **nicht** geteilt: zwei Controller mit je fünf kurzen Methoden liest man leichter als
eine Vererbung über zwei Aufrufer. `IMAGE_CACHE_CONTROL` liegt bereits auf Dateiebene im selben
Paket und wird wiederverwendet.

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.unividuell.countdown.core.iam.AuthenticatedUser
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/** The global pool has no slug and no members: the gate admits super-admins and nobody else. */
@RestController
@RequestMapping("/api/super-admin/images")
class SuperAdminImageController(
    private val gate: ImagePoolGate,
    private val service: ImagePoolService,
    private val users: UserQuery,
) {
    @GetMapping
    fun list(@AuthenticationPrincipal me: AuthenticatedUser): ImageListResponse {
        val pool = gate.global(me.isSuperAdmin)
        val summaries = service.list(pool = pool, viewerId = me.id)
        val names = namesFor(summaries)
        return ImageListResponse(
            images = summaries.map { response(summary = it, names = names) },
            used = service.count(pool),
            limit = service.limitOf(pool),
        )
    }

    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @RequestPart("file") file: MultipartFile,
    ): ImageResponse {
        val pool = gate.global(me.isSuperAdmin)
        val saved = service.upload(pool = pool, uploaderId = me.id, bytes = file.bytes)
        return response(summary = saved, names = namesFor(listOf(saved)))
    }

    @GetMapping("/{id}/thumb")
    fun thumb(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<ByteArray> {
        val pool = gate.global(me.isSuperAdmin)
        return bytes(
            body = service.thumb(pool = pool, id = id, viewerId = me.id),
            mediaType = MediaType.IMAGE_JPEG_VALUE,
            id = id,
        )
    }

    @GetMapping("/{id}")
    fun original(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<ByteArray> {
        val pool = gate.global(me.isSuperAdmin)
        val original = service.original(pool = pool, id = id, viewerId = me.id)
        return bytes(body = original.bytes, mediaType = original.mediaType, id = id)
    }

    @DeleteMapping("/{id}")
    fun delete(@AuthenticationPrincipal me: AuthenticatedUser, @PathVariable id: UUID): ResponseEntity<Void> {
        val pool = gate.global(me.isSuperAdmin)
        service.delete(pool = pool, id = id, viewerId = me.id)
        return ResponseEntity.noContent().build()
    }

    private fun namesFor(summaries: List<ImageSummary>): Map<UUID, String> =
        users.findAllById(summaries.map { it.uploadedBy }.distinct()).associate { it.id!! to it.username }

    private fun response(summary: ImageSummary, names: Map<UUID, String>) = ImageResponse(
        id = summary.id,
        width = summary.width,
        height = summary.height,
        byteSize = summary.byteSize,
        createdAt = summary.createdAt,
        uploadedBy = names[summary.uploadedBy] ?: "?",
    )

    /** No Content-Disposition: the listing opens the original in a new tab, to be shown. */
    private fun bytes(body: ByteArray, mediaType: String, id: UUID): ResponseEntity<ByteArray> =
        ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, mediaType)
            .header(HttpHeaders.CACHE_CONTROL, IMAGE_CACHE_CONTROL)
            .eTag("\"$id\"")
            .body(body)
}
```

- [ ] **Step 4: Run the test — green**

Run: `cd core && ./mvnw test -Dtest=SuperAdminImageControllerTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole backend suite**

Run: `cd core && ./mvnw test`
Expected: PASS, `ModularityTests` inklusive — `imagepool` darf nur auf `community` und `iam` zeigen.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/test/kotlin/org/unividuell/countdown/core/imagepool
git commit -m "Serve the global image pool to super-admins"
```

---

### Task 6: Frontend — der Upload-Beistand

**Files:**
- Modify: `webapp-vue/src/api/client.ts` (zwei Exporte)
- Create: `webapp-vue/src/api/images.ts`
- Test: `webapp-vue/src/api/__tests__/images.spec.ts`

**Interfaces:**
- Consumes: nichts aus dem Backend zur Übersetzungszeit; die Formen der Antworten aus Task 4.
- Produces: `ImageResponse`, `ImageListResponse`, `UploadError { code }`,
  `listImages(base)`, `deleteImage(base, id)`, `uploadImage(base, file, onProgress, signal?)`,
  `communityImagesBase(slug)`, `globalImagesBase()`, `thumbUrl(base, id)`, `originalUrl(base, id)`.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/api/__tests__/images.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadError, uploadImage } from '@/api/images'

/** happy-dom has no usable XMLHttpRequest, so the test drives one it owns. */
class FakeXhr {
  static last: FakeXhr
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 0
  responseText = ''
  withCredentials = false
  headers: Record<string, string> = {}
  opened: [string, string] | null = null
  sent: unknown = null

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.opened = [method, url]
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.sent = body
  }
  abort() {}
}

describe('uploadImage', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    document.cookie = 'XSRF-TOKEN=tok123'
  })
  afterEach(() => vi.unstubAllGlobals())

  const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })

  it('posts multipart with the CSRF header and reports progress', async () => {
    const seen: number[] = []
    const promise = uploadImage('/api/communities/alpha/images', file, (f) => seen.push(f))

    const xhr = FakeXhr.last
    expect(xhr.opened).toEqual(['POST', '/api/communities/alpha/images'])
    expect(xhr.headers['X-XSRF-TOKEN']).toBe('tok123')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.sent).toBeInstanceOf(FormData)

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 } as ProgressEvent)
    xhr.status = 200
    xhr.responseText = JSON.stringify({ id: 'x', width: 4, height: 3, byteSize: 9, createdAt: 'now', uploadedBy: 'alice' })
    xhr.onload?.()

    await expect(promise).resolves.toMatchObject({ id: 'x', uploadedBy: 'alice' })
    expect(seen).toEqual([0.25])
  })

  it('turns the problem+json code into an UploadError', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    const xhr = FakeXhr.last
    xhr.status = 409
    xhr.responseText = JSON.stringify({ status: 409, detail: 'Pool holds at most 150 images', code: 'POOL_FULL' })
    xhr.onload?.()

    await expect(promise).rejects.toBeInstanceOf(UploadError)
    await promise.catch((e: UploadError) => expect(e.code).toBe('POOL_FULL'))
  })

  it('reports a network failure as an UploadError without a code', async () => {
    const promise = uploadImage('/api/communities/alpha/images', file, () => {})
    FakeXhr.last.onerror?.()
    await promise.catch((e: UploadError) => expect(e.code).toBe('NETWORK'))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/images.spec.ts`
Expected: FAIL — `@/api/images` does not exist.

- [ ] **Step 3: Export the two pieces the sidecar needs from `client.ts`**

In `webapp-vue/src/api/client.ts` `readCookie` **nicht** exportieren (es ist ein Detail), sondern:

```ts
/**
 * The CSRF token as a header, for the binary sidecars that cannot use `apiFetch` -- copying the
 * cookie name into a second file is how the two drift apart.
 */
export function csrfHeader(): Record<string, string> {
  const token = readCookie('XSRF-TOKEN')
  return token ? { 'X-XSRF-TOKEN': token } : {}
}

/** Same 401 reaction as `apiFetch`, for those sidecars. */
export function notifyUnauthorized(): void {
  try {
    onUnauthorized()
  } catch {
    // never let a throwing handler mask the caller's own error
  }
}
```

- [ ] **Step 4: Write `images.ts`**

```ts
import { apiFetch, csrfHeader, notifyUnauthorized } from '@/api/client'

export interface ImageResponse {
  id: string
  width: number
  height: number
  byteSize: number
  createdAt: string
  uploadedBy: string
}

export interface ImageListResponse {
  images: ImageResponse[]
  used: number
  limit: number
}

/** The refusal's `code` from the server's problem+json, or NETWORK when nothing answered. */
export class UploadError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`upload failed: ${code}`)
    this.name = 'UploadError'
  }
}

export const communityImagesBase = (slug: string): string =>
  `/api/communities/${encodeURIComponent(slug)}/images`
export const globalImagesBase = (): string => '/api/super-admin/images'

export const thumbUrl = (base: string, id: string): string => `${base}/${id}/thumb`
export const originalUrl = (base: string, id: string): string => `${base}/${id}`

export const listImages = (base: string) => apiFetch<ImageListResponse>(base)
export const deleteImage = (base: string, id: string) =>
  apiFetch<void>(`${base}/${id}`, { method: 'DELETE' })

/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract AND bounded by a 10s timeout that a
 * 5 MB upload over mobile data blows through. XMLHttpRequest rather than fetch because fetch has no
 * upload progress, and 5 MB without a bar looks like a crash on a phone.
 */
export function uploadImage(
  base: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', base)
    xhr.withCredentials = true
    for (const [name, value] of Object.entries(csrfHeader())) xhr.setRequestHeader(name, value)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as ImageResponse)
        return
      }
      if (xhr.status === 401) notifyUnauthorized()
      let code = 'UNKNOWN'
      try {
        code = (JSON.parse(xhr.responseText) as { code?: string }).code ?? 'UNKNOWN'
      } catch {
        // a body that is not problem+json leaves the status as the only information
      }
      reject(new UploadError(code, xhr.status))
    }

    xhr.onerror = () => reject(new UploadError('NETWORK', 0))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
```

- [ ] **Step 5: Run the test — green**

Run: `cd webapp-vue && pnpm vitest run src/api/__tests__/images.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/api
git commit -m "Add a binary upload sidecar with progress"
```

---

### Task 7: Frontend — Oberfläche und Navigation

**Files:**
- Create: `webapp-vue/src/images/ImagePool.vue`
- Create: `webapp-vue/src/pages/c/[slug]/images.vue`, `webapp-vue/src/pages/super-admin/images.vue`
- Modify: `webapp-vue/src/communities/routes.ts`, `webapp-vue/src/nav/NavDrawer.vue`
- Test: `webapp-vue/src/images/__tests__/ImagePool.spec.ts`
- Modify: `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 6.
- Produces: `ImagePool.vue` mit einer Prop `base: string`.

- [ ] **Step 1: Write the failing test**

`webapp-vue/src/images/__tests__/ImagePool.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImagePool from '@/images/ImagePool.vue'
import * as api from '@/api/images'
import type { VueWrapper } from '@vue/test-utils'

/** `defineExpose` is invisible to the wrapper's type, so reach for it once, here. */
const exposed = (w: VueWrapper) => w.vm as unknown as { enqueue: (files: File[]) => Promise<void> }

const listResponse = {
  images: [
    { id: 'i1', width: 800, height: 600, byteSize: 4_500_000, createdAt: '2026-09-01T10:00:00Z', uploadedBy: 'alice' },
  ],
  used: 12,
  limit: 150,
}

const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/jpeg' })

describe('ImagePool', () => {
  it('shows the quota and links the original to a new tab', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue(listResponse)
    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()

    expect(w.get('[data-test="quota"]').text()).toContain('12 von 150')
    const link = w.get('[data-test="original-link"]')
    expect(link.attributes('href')).toBe('/api/communities/alpha/images/i1')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('uploads the picked files one after another, not in parallel', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    let inFlight = 0
    let maxInFlight = 0
    const upload = vi.spyOn(api, 'uploadImage').mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return listResponse.images[0]
    })

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await exposed(w).enqueue([file('a.jpg'), file('b.jpg'), file('c.jpg')])
    await flushPromises()

    expect(upload).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
  })

  it('names the reason on the failing file and carries on with the rest', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue({ ...listResponse, images: [] })
    vi.spyOn(api, 'uploadImage')
      .mockRejectedValueOnce(new api.UploadError('HEIC_UNSUPPORTED', 415))
      .mockResolvedValueOnce(listResponse.images[0])

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await exposed(w).enqueue([file('a.heic'), file('b.jpg')])
    await flushPromises()

    const rows = w.findAll('[data-test="queue-row"]')
    expect(rows[0].text()).toContain('HEIC')
    expect(rows[1].text()).toContain('Fertig')
  })

  it('asks before deleting, because it is final', async () => {
    vi.spyOn(api, 'listImages').mockResolvedValue(listResponse)
    const remove = vi.spyOn(api, 'deleteImage').mockResolvedValue(undefined as never)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const w = mount(ImagePool, { props: { base: '/api/communities/alpha/images' } })
    await flushPromises()
    await w.get('[data-test="delete"]').trigger('click')

    expect(remove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd webapp-vue && pnpm vitest run src/images/__tests__/ImagePool.spec.ts`
Expected: FAIL — `@/images/ImagePool.vue` does not exist.

- [ ] **Step 3: Write `ImagePool.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  deleteImage,
  listImages,
  originalUrl,
  thumbUrl,
  uploadImage,
  UploadError,
  type ImageResponse,
} from '@/api/images'

const props = defineProps<{ base: string }>()

interface QueueRow {
  name: string
  progress: number
  state: 'queued' | 'running' | 'done' | 'failed'
  message?: string
}

const images = ref<ImageResponse[]>([])
const used = ref(0)
const limit = ref(0)
const queue = ref<QueueRow[]>([])
const error = ref<string | null>(null)

/** Server codes carry no copy; the German sentence is built here. */
const REASONS: Record<string, string> = {
  HEIC_UNSUPPORTED: 'HEIC wird nicht unterstützt — als JPEG exportieren.',
  UNSUPPORTED_FORMAT: 'Nur JPEG, PNG, GIF und WebP.',
  TOO_LARGE: 'Zu groß (höchstens 15 MB).',
  TOO_MANY_PIXELS: 'Zu viele Bildpunkte (höchstens 40 MP).',
  POOL_FULL: 'Der Pool ist voll.',
  DUPLICATE: 'Dieses Bild ist schon im Pool.',
  BROKEN_IMAGE: 'Die Datei ließ sich nicht lesen.',
  NETWORK: 'Verbindung unterbrochen.',
}

async function load(): Promise<void> {
  const response = await listImages(props.base)
  images.value = response.images
  used.value = response.used
  limit.value = response.limit
}

/**
 * One after another, on purpose: parallel uploads share the same mobile connection, so everything
 * takes just as long and five bars move at once without saying anything.
 */
async function enqueue(files: File[]): Promise<void> {
  const rows: QueueRow[] = files.map((f) => ({ name: f.name, progress: 0, state: 'queued' }))
  queue.value = [...queue.value, ...rows]

  for (const [index, file] of files.entries()) {
    const row = rows[index]
    row.state = 'running'
    try {
      await uploadImage(props.base, file, (fraction) => (row.progress = fraction))
      row.state = 'done'
    } catch (e) {
      row.state = 'failed'
      row.message = e instanceof UploadError ? (REASONS[e.code] ?? 'Upload fehlgeschlagen.') : 'Upload fehlgeschlagen.'
    }
  }
  await load()
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void enqueue(Array.from(input.files))
  input.value = ''
}

async function remove(id: string): Promise<void> {
  if (!window.confirm('Dieses Bild endgültig löschen?')) return
  error.value = null
  try {
    await deleteImage(props.base, id)
    await load()
  } catch {
    error.value = 'Löschen fehlgeschlagen.'
  }
}

onMounted(load)
defineExpose({ enqueue })
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">Bilder</h1>
      <span data-test="quota" class="text-sm text-neutral-500">{{ used }} von {{ limit }}</span>
    </div>

    <!--
      The system's own picker, like a date picker: on iOS this opens the sheet (library, camera,
      files), on Android the system chooser, and the library allows multi-selection. `accept` is
      more than a filter there -- Safari converts HEIC to JPEG when HEIC is not in the list, which
      is why image/jpeg comes first.
    -->
    <label class="mb-4 block rounded border border-dashed px-4 py-6 text-center text-sm">
      <input
        type="file"
        class="sr-only"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        data-test="picker"
        @change="onPick"
      />
      Bilder auswählen
    </label>

    <ul v-if="queue.length" class="mb-4 space-y-1 text-sm">
      <li v-for="(row, i) in queue" :key="i" data-test="queue-row" class="flex justify-between gap-2">
        <span class="truncate">{{ row.name }}</span>
        <span v-if="row.state === 'running'">{{ Math.round(row.progress * 100) }} %</span>
        <span v-else-if="row.state === 'done'" class="text-neutral-500">Fertig</span>
        <span v-else-if="row.state === 'failed'" class="text-red-600">{{ row.message }}</span>
        <span v-else class="text-neutral-400">Wartet</span>
      </li>
    </ul>

    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>

    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <li v-for="image in images" :key="image.id" class="space-y-1">
        <!-- A new tab, not an overlay: the browser's own image view brings pinch-zoom and saving. -->
        <a
          :href="originalUrl(props.base, image.id)"
          target="_blank"
          rel="noopener"
          data-test="original-link"
        >
          <img
            :src="thumbUrl(props.base, image.id)"
            loading="lazy"
            alt=""
            class="aspect-[4/3] w-full rounded object-cover"
          />
        </a>
        <div class="flex items-center justify-between text-xs text-neutral-500">
          <span>{{ image.uploadedBy }}</span>
          <button data-test="delete" class="rounded border px-2 py-0.5" @click="remove(image.id)">
            Löschen
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 4: Write the two pages and extend the route helper**

`webapp-vue/src/pages/c/[slug]/images.vue`:

```vue
<script setup lang="ts">
import ImagePool from '@/images/ImagePool.vue'
import { communityImagesBase } from '@/api/images'
import { useCommunityContext } from '@/communities/context'

const { community } = useCommunityContext()
</script>

<template>
  <ImagePool :base="communityImagesBase(community.slug)" />
</template>
```

`webapp-vue/src/pages/super-admin/images.vue`:

```vue
<script setup lang="ts">
import ImagePool from '@/images/ImagePool.vue'
import { globalImagesBase } from '@/api/images'
</script>

<template>
  <ImagePool :base="globalImagesBase()" />
</template>
```

In `webapp-vue/src/communities/routes.ts` die Untertypen erweitern:

```ts
export type CommunitySubPage = 'members' | 'requests' | 'settings' | 'profile' | 'images'
```

- [ ] **Step 5: Add the drawer entry**

In `webapp-vue/src/nav/NavDrawer.vue` **im Community-Block**, direkt hinter dem
`create-community`-Link und **vor** dem `v-if="admin"`-Block:

```html
            <RouterLink
              v-if="activeCommunity"
              :to="communityPath(activeCommunity.slug, 'images')"
              data-test="community-images"
              :class="LINK"
            >
              Bilder
            </RouterLink>
```

Der Eintrag gehört hierher und nicht in den Admin-Block: „Bilder“ sieht jedes Mitglied, anders als
„Mitglieder“ und „Einstellungen“. Vorher die Datei lesen — `activeCommunity` und `LINK` existieren
bereits (Zeile ~84 bzw. als Konstante); die genaue Einfügestelle bestätigen statt raten.

In `webapp-vue/src/nav/__tests__/NavDrawer.spec.ts` die bestehende Erwartung über die Reihenfolge der
Links um den neuen Eintrag ergänzen — der Test listet `communityPath('team', …)`-Aufrufe auf und
schlägt sonst fehl.

- [ ] **Step 6: Run everything green**

```bash
cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test
```

Expected: PASS. `vue-tsc` ist nicht redundant: auf einem Pull Request laufen die Image-Schritte nicht,
also wäre dies sonst der einzige Ort, an dem die Typen geprüft werden.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src
git commit -m "Add the image pool pages and their drawer entry"
```

---

### Task 8: Backup

**Files:**
- Modify: `deploy/compose.yaml` (`db-backup`-Dienst)
- Modify: `deploy/README.md` (Abschnitt „Backups & restore“)
- Modify: `deploy/.env.prod.example`, `deploy/.env.staging.example`
- Modify: `.claude/guidelines/deployment-server.md`

**Interfaces:**
- Consumes: `imagepool.images` aus Task 1.
- Produces: nichts für den Code.

- [ ] **Step 1: Split the dump**

Im `db-backup`-Dienst in `deploy/compose.yaml` die `environment:`-Liste um die Vorhaltung ergänzen:

```yaml
      - IMAGE_BACKUP_KEEP=${IMAGE_BACKUP_KEEP:-8}
```

und den `command:`-Block ersetzen:

```yaml
    command:
      - |
        set -eo pipefail
        while true; do
          until pg_isready -h postgres -U admin -d app; do sleep 2; done

          # The daily dump keeps the images' table DEFINITION but not its rows: a restore from
          # this file alone yields a running app with an empty pool, rather than one that trips
          # over a missing schema on every image request.
          pg_dump -h postgres -U admin -d app --exclude-table-data=imagepool.images \
            | gzip > "/backups/app-$$(date +%Y%m%d-%H%M%S).sql.gz"
          find /backups -name 'app-*.sql.gz' -mtime +7 -delete

          # Images are ~800 MB per stack and change a few times a year, so the trigger is a
          # fingerprint rather than a schedule -- an unchanged pool costs one query over ~490 rows.
          # to_regclass is empty before the app has migrated, which is the state right after this
          # compose file is deployed.
          if [ -n "$$(psql -h postgres -U admin -d app -tAc "SELECT to_regclass('imagepool.images')")" ]; then
            fingerprint=$$(psql -h postgres -U admin -d app -tAc \
              "SELECT count(*) || '-' || coalesce(md5(string_agg(id::text, ',' ORDER BY id)), '0') FROM imagepool.images")
            if [ "$$fingerprint" != "$$(cat /backups/images.fingerprint 2>/dev/null)" ]; then
              pg_dump -h postgres -U admin -d app --data-only --table=imagepool.images \
                | gzip > "/backups/images-$$(date +%Y%m%d-%H%M%S).sql.gz"
              printf '%s' "$$fingerprint" > /backups/images.fingerprint
              # Retention counts CHANGES, not days: keep the newest IMAGE_BACKUP_KEEP states.
              ls -1t /backups/images-*.sql.gz | tail -n +$$((IMAGE_BACKUP_KEEP + 1)) | xargs -r rm -f
            fi
          fi

          sleep 86400
        done
```

`$$` ist die Compose-Maskierung für `$` — ohne sie interpoliert Compose die Ausdrücke weg.

- [ ] **Step 2: Verify the compose file still renders**

```bash
GUESS_HUE_DATASET_FILE=/tmp/a.yaml SPOT_OBJECT_TERMS_FILE=/tmp/b.yaml PGADMIN_EMAIL=x@y.z \
  docker compose -f deploy/compose.yaml config | grep -A3 IMAGE_BACKUP_KEEP
```

Expected: `IMAGE_BACKUP_KEEP: "8"`, und im `command` stehen einfache `$`, keine `$$`.

- [ ] **Step 3: Verify the dump flags against a real Postgres**

Der Beiwagen lässt sich nicht ohne Weiteres lokal starten; die beiden Aufrufe schon:

```bash
docker run --rm -d --name pgcheck -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app -e POSTGRES_USER=admin postgres:18
docker exec pgcheck bash -c 'until pg_isready -U admin -d app; do sleep 1; done'
docker exec pgcheck psql -U admin -d app -c "CREATE SCHEMA imagepool; CREATE TABLE imagepool.images (id uuid primary key default gen_random_uuid(), bytes bytea); INSERT INTO imagepool.images (bytes) VALUES ('\\x0102');"
# the daily dump must contain the CREATE TABLE but not the row
docker exec pgcheck pg_dump -U admin -d app --exclude-table-data=imagepool.images | grep -c "CREATE TABLE imagepool.images"
docker exec pgcheck pg_dump -U admin -d app --exclude-table-data=imagepool.images | grep -c "COPY imagepool.images" || echo "no rows -- correct"
# and the image dump must contain only the row
docker exec pgcheck pg_dump -U admin -d app --data-only --table=imagepool.images | grep -c "COPY imagepool.images"
docker rm -f pgcheck
```

Expected: `1`, dann `no rows -- correct`, dann `1`.

- [ ] **Step 4: Document the retention and the restore order**

In `deploy/README.md`, Abschnitt „Backups & restore“:

```markdown
Two files, restored in this order -- the image rows reference `community.communities` and
`iam.users`, so the daily dump has to land first:

```bash
gunzip -c app-<ts>.sql.gz    | docker compose exec -T postgres psql -U admin -d app
gunzip -c images-<ts>.sql.gz | docker compose exec -T postgres psql -U admin -d app
```

The image dump is written only when the pool actually changed, so `IMAGE_BACKUP_KEEP` (default 8)
counts **changes, not days**: a mass deletion followed by seven uploads consumes every state. At
full pools eight states are ~20 GB; the host had 181 GB free when this was measured.
```

In beiden `.env.*.example` neben `CORE_MEM_LIMIT`:

```
# How many image-pool dumps to keep. Optional -- compose defaults it to 8. Counts CHANGES, not
# days: the dump is only written when the pool's fingerprint moved.
# IMAGE_BACKUP_KEEP=8
```

- [ ] **Step 5: Capture the rule**

In `.claude/guidelines/deployment-server.md`, im Backup-Punkt ergänzen:

```markdown
- **Split a dump on table data, not on schemas, when one table dwarfs the rest.**
  `--exclude-table-data=<table>` keeps the DDL and drops the rows, so a restore from the daily dump
  alone still boots the app -- with that table empty rather than missing. The heavy table gets its
  own `--data-only --table=<table>` dump, triggered by a fingerprint
  (`count(*) || md5(string_agg(id))`) instead of a schedule, so an unchanged table costs one query
  a day instead of its own size. Retention then counts **changes, not days**: say so where the
  number is configured, or someone will read "keep 8" as "eight days of safety".
```

- [ ] **Step 6: Commit**

```bash
git add deploy .claude/guidelines/deployment-server.md
git commit -m "Back up the image pool apart from the daily dump"
```

---

## Nach dem letzten Task

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test
```

Beide grün, dann greift `superpowers:finishing-a-development-branch`.
