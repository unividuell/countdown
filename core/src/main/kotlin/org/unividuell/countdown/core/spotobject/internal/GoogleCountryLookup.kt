package org.unividuell.countdown.core.spotobject.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.spotobject.CountryLookup

/** Property names mirror Google's JSON verbatim so binding needs no annotations. */
internal data class StreetViewLocationJson(val lat: Double = 0.0, val lng: Double = 0.0)
internal data class StreetViewMetadataJson(
    val status: String = "",
    val location: StreetViewLocationJson? = null,
)
internal data class AddressComponentJson(
    val short_name: String = "",
    val types: List<String> = emptyList(),
)
internal data class GeocodeResultJson(val address_components: List<AddressComponentJson> = emptyList())
internal data class GeocodeResponseJson(
    val status: String = "",
    val results: List<GeocodeResultJson> = emptyList(),
)

/**
 * Panorama id → location → country, in two calls.
 *
 * The first is the Street View **metadata** endpoint, which is free and unmetered — it exists
 * precisely so an application can ask about a panorama without fetching an image. The second is
 * Geocoding. Point-in-polygon offline was considered and rejected: the answer should come *from*
 * Google rather than be derived by us from Google's data.
 */
@Component
class GoogleCountryLookup(
    @Qualifier("googleMapsRestClient") private val client: RestClient,
    private val properties: SpotObjectProperties,
) : CountryLookup {

    private val logger = KotlinLogging.logger {}

    override fun countryOf(panoId: String): String? {
        val location = locationOf(panoId) ?: return null
        return countryAt(lat = location.lat, lng = location.lng)
    }

    private fun locationOf(panoId: String): StreetViewLocationJson? = runCatching {
        client.get()
            .uri {
                it.path("/maps/api/streetview/metadata")
                    .queryParam("pano", panoId)
                    .queryParam("key", properties.mapsApiKey)
                    .build()
            }
            .retrieve()
            .body(StreetViewMetadataJson::class.java)
            ?.takeIf { it.status == "OK" }
            ?.location
    }.getOrElse {
        // The one place behaviour degrades silently: the tip is accepted with no flag, and without
        // this line nobody would ever learn why the flags stopped appearing.
        logger.warn(it) { "street view metadata lookup failed for pano $panoId" }
        null
    }

    private fun countryAt(lat: Double, lng: Double): String? = runCatching {
        client.get()
            .uri {
                it.path("/maps/api/geocode/json")
                    .queryParam("latlng", "$lat,$lng")
                    .queryParam("result_type", "country")
                    .queryParam("key", properties.mapsApiKey)
                    .build()
            }
            .retrieve()
            .body(GeocodeResponseJson::class.java)
            ?.results
            ?.flatMap { it.address_components }
            ?.firstOrNull { COUNTRY in it.types }
            ?.short_name
            ?.takeIf { it.isNotBlank() }
    }.getOrElse {
        logger.warn(it) { "reverse geocoding failed for $lat,$lng" }
        null
    }

    private companion object {
        const val COUNTRY = "country"
    }
}
