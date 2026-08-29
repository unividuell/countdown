package org.unividuell.countdown.core.spotobject

/**
 * Which country a panorama stands in, as an ISO-3166-1 alpha-2 code — or `null` when the answer
 * cannot be had.
 *
 * **`null` is a normal answer, not an error.** A tip must never fail because a foreign service is
 * having a bad minute: the guess goes through and its tile simply shows no flag.
 *
 * Takes the panorama id rather than a coordinate on purpose. The framework persists a guess
 * verbatim, so a coordinate in the request would be a coordinate in the database; resolving from
 * the id means it is never submitted at all.
 */
interface CountryLookup {
    fun countryOf(panoId: String): String?
}
