package org.unividuell.countdown.core.mixcolor

import org.unividuell.countdown.core.mixcolor.internal.Spectral

/**
 * The colour of a recipe (drops per pigment) as `#RRGGBB`; null without a positive count.
 * Pigments mix in declaration order, so the same recipe always sums in the same order.
 */
fun mixHex(recipe: Map<Pigment, Int>): String? {
    val parts = Pigment.entries.mapNotNull { pigment ->
        val count = recipe[pigment] ?: 0
        if (count > 0) pigment.hex to count else null
    }
    if (parts.isEmpty()) return null

    return Spectral.mix(parts)
}

/** 100 × the Euclidean OKLab distance of two `#RRGGBB`; ~1 is just noticeable. */
fun deltaE(a: String, b: String): Double {
    val (l1, a1, b1) = Spectral.oklabOf(a)
    val (l2, a2, b2) = Spectral.oklabOf(b)

    return 100 * Math.hypot(Math.hypot(l1 - l2, a1 - a2), b1 - b2)
}
