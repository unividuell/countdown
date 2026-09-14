package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.principalFor

@Import(TestcontainersConfiguration::class)
@SpringBootTest(properties = ["countdown.public-rate-limit.permits-per-minute=2"])
@AutoConfigureMockMvc
class PublicRateLimitFilterTest(@Autowired val mockMvc: MockMvc) {

    // one IP per test case: the counter is process-wide, and sharing it would couple the cases
    private fun preview(ip: String, forwardedFor: String? = null) =
        mockMvc.get("/api/preview/") {
            header("X-Client-IP", ip)
            forwardedFor?.let { header("X-Forwarded-For", it) }
        }

    @Test
    fun `the request over the limit is refused`() {
        repeat(2) { preview(ip = "203.0.113.1").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.1").andExpect { status { isTooManyRequests() } }
    }

    @Test
    fun `a client-set X-Forwarded-For does not reset the counter`() {
        repeat(2) { preview(ip = "203.0.113.2", forwardedFor = "1.2.3.4").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.2", forwardedFor = "5.6.7.8").andExpect { status { isTooManyRequests() } }
    }

    @Test
    fun `another client is unaffected`() {
        repeat(2) { preview(ip = "203.0.113.3").andExpect { status { isOk() } } }
        preview(ip = "203.0.113.4").andExpect { status { isOk() } }
    }

    @Test
    fun `a path outside the open ones is not counted`() {
        repeat(5) {
            mockMvc.get("/api/me") { header("X-Client-IP", "203.0.113.5") }
                .andExpect { status { isUnauthorized() } }
        }
    }

    @Test
    fun `an authenticated POST to a guarded path is not counted`() {
        repeat(5) {
            mockMvc.post("/api/communities/join/ZZZZZZ") {
                header("X-Client-IP", "203.0.113.6")
                with(principalFor())
                with(csrf())
            }.andExpect { status { isNotFound() } }
        }
    }
}
