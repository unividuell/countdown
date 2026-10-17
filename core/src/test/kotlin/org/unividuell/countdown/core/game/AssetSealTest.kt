package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File
import javax.crypto.AEADBadTagException

class AssetSealTest {

    data class Vector(val keyHex: String, val nonceHex: String, val plaintextHex: String, val sealedHex: String)
    data class Vectors(val vectors: List<Vector>)

    /** Relative to the module directory, Maven's working directory — the file Vitest reads too. */
    private val vectors =
        jacksonObjectMapper().readValue(File("../shared/round-assets/seal-vectors.json"), Vectors::class.java).vectors

    @Test
    fun `seals every golden vector byte for byte`() {
        vectors.forEach {
            AssetSeal.seal(
                plaintext = it.plaintextHex.hexToByteArray(),
                key = it.keyHex.hexToByteArray(),
                nonce = it.nonceHex.hexToByteArray(),
            ) shouldBe it.sealedHex.hexToByteArray()
        }
    }

    @Test
    fun `opens every golden vector`() {
        vectors.forEach {
            AssetSeal.open(sealed = it.sealedHex.hexToByteArray(), key = it.keyHex.hexToByteArray()) shouldBe
                it.plaintextHex.hexToByteArray()
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
}
