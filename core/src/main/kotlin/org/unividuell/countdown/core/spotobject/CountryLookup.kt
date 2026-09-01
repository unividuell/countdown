package org.unividuell.countdown.core.spotobject

/**
 * Which country a panorama stands in, as an ISO-3166-1 alpha-2 code — or `null` when the answer
 * cannot be had.
 *
 * **`null` is a normal answer, not an error.** A tip must never fail because a foreign service is
 * having a bad minute: the guess goes through and its tile simply shows no flag.
 *
 * Takes the panorama id rather than a coordinate on purpose: resolving from the id means a
 * coordinate is never submitted at all. That is the first half of the guarantee; the second is
 * `SpotObjectGameType.judge` rebuilding the stored tip from the fields it validated, so one pasted
 * in alongside the tip does not reach the column either.
 */
interface CountryLookup {
    fun countryOf(panoId: String): String?
}
