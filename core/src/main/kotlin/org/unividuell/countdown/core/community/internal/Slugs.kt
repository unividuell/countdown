package org.unividuell.countdown.core.community.internal

import java.text.Normalizer

object Slugs {
    fun slugify(name: String): String {
        val umlauts = name.lowercase()
            .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        val noDiacritics = Normalizer.normalize(umlauts, Normalizer.Form.NFKD)
            .replace("\\p{M}+".toRegex(), "")
        return noDiacritics
            .replace("[^a-z0-9]+".toRegex(), "-")
            .trim('-')
            .replace("-+".toRegex(), "-")
    }
}
