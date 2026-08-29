package org.unividuell.countdown.core.spotobject

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withServerError
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.spotobject.internal.GoogleCountryLookup
import org.unividuell.countdown.core.spotobject.internal.SpotObjectProperties

class GoogleCountryLookupTest {

    private fun fixture(name: String): String =
        requireNotNull(javaClass.getResource("/spotobject/$name")).readText()

    private fun lookupAgainst(setup: (MockRestServiceServer) -> Unit): GoogleCountryLookup {
        val builder = RestClient.builder().baseUrl("https://maps.googleapis.com")
        val server = MockRestServiceServer.bindTo(builder).build()
        setup(server)
        return GoogleCountryLookup(client = builder.build(), properties = SpotObjectProperties(mapsApiKey = "test-key"))
    }

    @Test
    fun `it resolves a panorama to an ISO country code`() {
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withSuccess(fixture("streetview-metadata.json"), MediaType.APPLICATION_JSON))
            server.expect(requestTo("https://maps.googleapis.com/maps/api/geocode/json?latlng=41.38505,2.1734&result_type=country&key=test-key"))
                .andRespond(withSuccess(fixture("geocode-barcelona.json"), MediaType.APPLICATION_JSON))
        }
        lookup.countryOf("abc") shouldBe "ES"
    }

    @Test
    fun `a failing metadata call yields no country and no exception`() {
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withServerError())
        }
        lookup.countryOf("abc").shouldBeNull()
    }

    @Test
    fun `a failing geocode call yields no country and no exception`() {
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withSuccess(fixture("streetview-metadata.json"), MediaType.APPLICATION_JSON))
            server.expect(requestTo("https://maps.googleapis.com/maps/api/geocode/json?latlng=41.38505,2.1734&result_type=country&key=test-key"))
                .andRespond(withServerError())
        }
        lookup.countryOf("abc").shouldBeNull()
    }

    @Test
    fun `a response without a country component yields null`() {
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withSuccess(fixture("streetview-metadata.json"), MediaType.APPLICATION_JSON))
            server.expect(requestTo("https://maps.googleapis.com/maps/api/geocode/json?latlng=41.38505,2.1734&result_type=country&key=test-key"))
                .andRespond(withSuccess("""{"results":[],"status":"ZERO_RESULTS"}""", MediaType.APPLICATION_JSON))
        }
        lookup.countryOf("abc").shouldBeNull()
    }

    @Test
    fun `a 200 metadata response with a non-OK status yields no country`() {
        // What an unknown panorama or an exhausted quota looks like on the wire: HTTP 200, no error.
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withSuccess("""{"status":"ZERO_RESULTS"}""", MediaType.APPLICATION_JSON))
        }
        lookup.countryOf("abc").shouldBeNull()
    }

    @Test
    fun `a malformed geocode body yields no country`() {
        val lookup = lookupAgainst { server ->
            server.expect(requestTo("https://maps.googleapis.com/maps/api/streetview/metadata?pano=abc&key=test-key"))
                .andRespond(withSuccess(fixture("streetview-metadata.json"), MediaType.APPLICATION_JSON))
            server.expect(requestTo("https://maps.googleapis.com/maps/api/geocode/json?latlng=41.38505,2.1734&result_type=country&key=test-key"))
                .andRespond(withSuccess("not json at all", MediaType.APPLICATION_JSON))
        }
        lookup.countryOf("abc").shouldBeNull()
    }
}
