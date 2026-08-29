package org.unividuell.countdown.core.spotobject

import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class SpotObjectControllerTest(@Autowired val mockMvc: MockMvc) {

    @Test
    fun `the config endpoint hands out the browser key`() {
        mockMvc.get("/api/spot-object/config") { with(principalFor()) }.andExpect {
            status { isOk() }
            jsonPath("$.mapsApiKey") { exists() }
        }
    }

    @Test
    fun `the shot endpoint redirects and never leaks the signing secret`() {
        mockMvc.get("/api/spot-object/shot") {
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
            content { string("") }
        }
    }

    @Test
    fun `both endpoints need a session`() {
        mockMvc.get("/api/spot-object/config").andExpect { status { isUnauthorized() } }
        mockMvc.get("/api/spot-object/shot") { param("pano", "abc") }
            .andExpect { status { isUnauthorized() } }
    }
}
