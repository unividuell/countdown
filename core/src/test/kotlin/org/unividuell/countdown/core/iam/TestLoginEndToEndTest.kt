package org.unividuell.countdown.core.iam

import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.containsString
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
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * The auth lib's test door against countdown's own provisioning, database and session store — the
 * way localhost and staging sign in. `prof` is a super-admin by the test classpath's
 * `unividuell.auth.roles.super-admin`. Not `@Transactional`: a sign-in commits like the real one.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class TestLoginEndToEndTest(@Autowired val mockMvc: MockMvc) {

    /**
     * Signs in and hands back the session cookie. Not `request.session`: Spring Session wraps the
     * request, and the MvcResult only knows the unwrapped one.
     */
    private fun signInAs(login: String): Cookie {
        val header = mockMvc.post("/login/test/as") {
            with(csrf())
            param("login", login)
        }.andExpect {
            status { is3xxRedirection() }
        }.andReturn().response.getHeaders("Set-Cookie").single { it.startsWith("SESSION=") }

        return Cookie("SESSION", header.substringBefore(";").substringAfter("SESSION="))
    }

    @Test
    fun `GET login start renders the lib's picker`() {
        mockMvc.get("/login/start").andExpect {
            status { isOk() }
            content { string(containsString("""name="login" value="prof"""")) }
        }
    }

    @Test
    fun `prof signs in through the picker and is a super-admin`() {
        val session = signInAs(login = "prof")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.githubLogin") { value("prof") }
            jsonPath("$.username") { value("Prof Farnsworth") }
            jsonPath("$.isSuperAdmin") { value(true) }
        }
        mockMvc.get("/api/super-admin/super-admins") { cookie(session) }.andExpect { status { isOk() } }
    }

    @Test
    fun `a test user outside the allowlist is no super-admin`() {
        val session = signInAs(login = "Fry")

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.isSuperAdmin") { value(false) }
        }
        mockMvc.get("/api/super-admin/super-admins") { cookie(session) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `switching players returns to the exact lab URL`() {
        // The lab's player switch: its URL carries `?` and `&`, and `{` once broke a redirect.
        val labUrl = "/c/team/lab/stub?seed=42&phase=TWO&note={x}"

        // get(URI) sends the escapes as they are; get(String) would encode them a second time.
        mockMvc.get(URI("/login/start?redirect=" + URLEncoder.encode(labUrl, StandardCharsets.UTF_8))).andExpect {
            status { isOk() }
            content { string(containsString("""name="redirect" value="/c/team/lab/stub?seed=42&amp;phase=TWO&amp;note={x}"""")) }
        }
        mockMvc.post("/login/test/as") {
            with(csrf())
            param("login", "Bender")
            param("redirect", labUrl)
        }.andExpect {
            redirectedUrl(labUrl)
        }
    }
}
