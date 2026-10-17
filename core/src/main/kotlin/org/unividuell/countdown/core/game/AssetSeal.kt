package org.unividuell.countdown.core.game

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * ChaCha20-Poly1305 (RFC 8439) over one asset. The browser opens the same bytes with
 * `@noble/ciphers/chacha.js`; `shared/round-assets/seal-vectors.json` pins both sides.
 *
 * ```
 * sealed = nonce ‖ ciphertext ‖ tag
 *          12 B    n B          16 B      → plaintext + 28 bytes
 * ```
 */
object AssetSeal {

    const val KEY_BYTES = 32
    const val NONCE_BYTES = 12
    const val TAG_BYTES = 16

    private val random = SecureRandom()

    /** Seals with a caller-chosen [nonce], which must never repeat under the same [key]. [sealFresh] picks both. */
    fun seal(plaintext: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray {
        val cipher = cipher(mode = Cipher.ENCRYPT_MODE, key = key, nonce = IvParameterSpec(nonce))

        return nonce + cipher.doFinal(plaintext)
    }

    /** @throws javax.crypto.AEADBadTagException if [sealed] was altered or [key] is not its key. */
    fun open(sealed: ByteArray, key: ByteArray): ByteArray {
        val cipher = cipher(mode = Cipher.DECRYPT_MODE, key = key, nonce = IvParameterSpec(sealed, 0, NONCE_BYTES))

        return cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
    }

    /** Seals under a random key and nonce: one key per asset. */
    fun sealFresh(plaintext: ByteArray): Sealed {
        val key = ByteArray(KEY_BYTES).also(random::nextBytes)
        val nonce = ByteArray(NONCE_BYTES).also(random::nextBytes)

        return Sealed(key = key, bytes = seal(plaintext = plaintext, key = key, nonce = nonce))
    }

    // A new Cipher per call: the JDK refuses to encrypt twice with the same key and nonce on one instance.
    private fun cipher(mode: Int, key: ByteArray, nonce: IvParameterSpec): Cipher =
        Cipher.getInstance("ChaCha20-Poly1305").apply { init(mode, SecretKeySpec(key, "ChaCha20"), nonce) }
}

/** A sealed asset and the [key] that opens it. A class, not a data class: [ByteArray] equality is identity. */
class Sealed(val key: ByteArray, val bytes: ByteArray)
