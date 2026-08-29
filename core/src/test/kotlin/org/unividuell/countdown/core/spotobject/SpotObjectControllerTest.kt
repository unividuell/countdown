package org.unividuell.countdown.core.spotobject

import io.kotest.matchers.string.shouldNotContain
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
// Three distinct, non-blank values so the assertions below can tell which credential the endpoint
// used — a plain "exists()" would still pass if someone later collapsed the two keys into one, and
// a blank signing secret would take `StreetViewShot`'s unsigned branch, leaving the leak assertion
// with no signature to look at. The secret is a made-up but well-formed URL-safe base64 value:
// "sekretmarker".
@TestPropertySource(
    properties = [
        "app.spot-object.maps-api-key=browser-key-marker",
        "app.spot-object.server-maps-api-key=server-key-marker",
        "app.spot-object.signing-secret=c2VrcmV0bWFya2Vy",
    ],
)
class SpotObjectControllerTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `the config endpoint hands out the browser key, never the server one`() {
        mockMvc.get("/api/spot-object/config") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.mapsApiKey") { value("browser-key-marker") }
        }
    }

    /**
     * The whole response, not only the `Location` prefix: a leak would show up in any header or in
     * the body, and the two server-side credentials are what must never be in either. The signature
     * assertion is what proves the secret was actually *used* — without it the endpoint could take
     * the unsigned branch and pass this test by doing nothing.
     */
    @Test
    fun `the shot endpoint redirects and never leaks the signing secret`() {
        val response = mockMvc.get("/api/spot-object/shot") {
            with(principalFor())
            param("pano", "abc")
            param("heading", "12")
            param("pitch", "0")
            param("fov", "90")
            param("w", "400")
            param("h", "300")
        }.andExpect {
            status { isFound() }
            header { string("Location", startsWith("https://maps.googleapis.com/maps/api/streetview")) }
            header { string("Location", containsString("key=browser-key-marker")) }
            header { string("Location", containsString("signature=")) }
            content { string("") }
        }.andReturn().response

        val whole = response.headerNames.joinToString("\n") { "$it: ${response.getHeaders(it)}" } +
            "\n" + response.contentAsString
        whole shouldNotContain "server-key-marker"
        whole shouldNotContain "c2VrcmV0bWFya2Vy"
    }

    @Test
    fun `both endpoints need a session`() {
        mockMvc.get("/api/spot-object/config").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/spot-object/shot") { param("pano", "abc") }
            .andExpect { status { isUnauthorized() } }
    }
}
