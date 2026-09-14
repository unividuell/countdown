package org.unividuell.countdown.core.community.internal

import java.security.SecureRandom

/**
 * Invite codes in Crockford Base32: six characters out of 32, so 32^6 = 1.07e9 combinations.
 *
 * The alphabet leaves out I, L, O and U — there is nothing a reader can mistake for 1 or 0, and
 * no code accidentally spells a word. [normalize] undoes the two mistakes a typist still makes:
 * lower case, and writing back I, L or O where 1 or 0 was meant. U has no substitute — Crockford
 * excludes it to avoid accidental words, not confusability — so a U stays invalid.
 */
object InviteCodes {

    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    const val LENGTH = 6

    fun generate(random: SecureRandom): String =
        (1..LENGTH).map { ALPHABET[random.nextInt(ALPHABET.length)] }.joinToString(separator = "")

    fun normalize(raw: String): String =
        raw.uppercase()
            .map {
                when (it) {
                    'I', 'L' -> '1'
                    'O' -> '0'
                    else -> it
                }
            }
            .joinToString(separator = "")
}
