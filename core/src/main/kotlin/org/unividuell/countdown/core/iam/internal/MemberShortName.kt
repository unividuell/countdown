package org.unividuell.countdown.core.iam.internal

/**
 * The 4-character avatar label, ported from the origin app's `viewSafeDisplayName`.
 *
 * Each reduction is applied ONLY while the name is still too long — that is what lets a short,
 * punctuation-only name such as ":-|" survive intact, and it is the reason the two length checks
 * are separate statements rather than one chain.
 */
object MemberShortName {
    private const val MAX = 4
    private val VOWELS = Regex("[AEIOU]")
    private val NON_ALPHANUMERIC = Regex("[^A-Z0-9]")
    private val REPEATS = Regex("(.)\\1+")

    fun of(username: String): String {
        var name = username.uppercase()
        if (name.length > MAX) name = name.replace(VOWELS, "").replace(NON_ALPHANUMERIC, "")
        if (name.length > MAX) name = name.replace(REPEATS, "$1")
        return name.take(MAX).ifEmpty { ":/" }
    }
}
