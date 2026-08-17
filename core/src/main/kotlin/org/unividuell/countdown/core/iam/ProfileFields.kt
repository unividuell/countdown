package org.unividuell.countdown.core.iam

/**
 * What a user-chosen profile field may contain.
 *
 * Public API of this module because BOTH write paths need the same answer: `PATCH /api/me` here,
 * and the per-community override in `community`. A second copy of the hex pattern is precisely how
 * the two would drift apart.
 */
object ProfileFields {
    const val MAX_NAME_LENGTH = 32

    private val HEX = Regex("^#[0-9a-fA-F]{6}$")

    /** Trimmed; blank is no name at all, which is the same thing as none. */
    fun normalizeName(raw: String?): String? {
        val name = raw?.trim()?.ifEmpty { null } ?: return null
        require(name.length <= MAX_NAME_LENGTH) {
            "displayName must be at most $MAX_NAME_LENGTH characters, got ${name.length}"
        }
        return name
    }

    /** `#rrggbb`, stored lowercased so two spellings of one colour cannot be told apart. */
    fun normalizeColor(raw: String?): String? {
        val color = raw?.trim()?.ifEmpty { null } ?: return null
        require(HEX.matches(color)) {
            "bgColorHex must be a valid hex colour in the form #rrggbb, got: $color"
        }
        return color.lowercase()
    }
}
