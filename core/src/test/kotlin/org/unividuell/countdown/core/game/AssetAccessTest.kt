package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.util.Base64

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

    @Test
    fun `an asset name outside lowercase letters, digits and dashes is refused`() {
        shouldThrow<IllegalArgumentException> {
            RoundAsset(name = "Clip 0", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", bytes = byteArrayOf())
        }
    }

    @Test
    fun `sealing keys a stage asset and leaves every other one plain`() {
        val clip = RoundAsset(
            name = "clip-0", visibility = AssetVisibility.FromStage(0), mediaType = "audio/wav", bytes = byteArrayOf(1),
        ).sealed()
        val photo = RoundAsset(
            name = "photo", visibility = AssetVisibility.Scene, mediaType = "image/jpeg", bytes = byteArrayOf(2),
        ).sealed()

        AssetSeal.open(sealed = clip.bytes, key = requireNotNull(clip.header.key)) shouldBe byteArrayOf(1)
        photo.header.key shouldBe null
        photo.bytes shouldBe byteArrayOf(2)
    }
}
