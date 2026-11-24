package org.unividuell.countdown.core.mixcolor

/** The five pigments the player mixes with. Declaration order is the mixing order. */
enum class Pigment(val key: String, val displayName: String, val hex: String) {
    CYAN(key = "c", displayName = "Cyan", hex = "#00A0E9"),
    MAGENTA(key = "m", displayName = "Magenta", hex = "#E4007C"),
    YELLOW(key = "y", displayName = "Gelb", hex = "#FFE600"),
    WHITE(key = "w", displayName = "Weiß", hex = "#FFFFFF"),
    BLACK(key = "k", displayName = "Schwarz", hex = "#1A1A1A");

    companion object {
        fun ofKey(key: String): Pigment? = entries.firstOrNull { it.key == key }
    }
}
