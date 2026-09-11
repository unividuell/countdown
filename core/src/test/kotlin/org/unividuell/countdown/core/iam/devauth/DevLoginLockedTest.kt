package org.unividuell.countdown.core.iam.devauth

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.string.shouldContain
import io.kotest.matchers.string.shouldNotContain
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.iam.internal.devauth.FakeSignInGate

/**
 * The locked half of the picker. Every other `devauth` test runs with no key configured — the
 * localhost default — so this class is the only place the lock is actually shut.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.test-auth.key=open-sesame"])
@Transactional
class DevLoginLockedTest(@Autowired val mockMvc: MockMvc) {

    /**
     * Unlocks once and hands back the cookie the gate issued, for reuse in a later request.
     * Parsed out of the raw header rather than read via `response.getCookie(...)`: the gate writes
     * a `Set-Cookie` header (ResponseCookie), and whether MockHttpServletResponse also
     * materialises that as a Cookie object is framework behaviour this test should not depend on.
     */
    private fun unlockedCookie(): Cookie {
        val header = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
        }.andReturn().response.getHeader("Set-Cookie").shouldNotBeNull()

        val value = header.substringBefore(";").substringAfter("${FakeSignInGate.COOKIE_NAME}=")
        return Cookie(FakeSignInGate.COOKIE_NAME, value)
    }

    @Test
    fun `without the cookie the picker is replaced by the locked screen`() {
        val html = mockMvc.get("/login/github").andExpect {
            status { isOk() }
            content { contentType("text/html;charset=UTF-8") }
        }.andReturn().response.contentAsString

        html shouldContain "Gesperrt"
        // A locked door that lists the names behind it shows what there is to take.
        html shouldNotContain "leela"
        html shouldNotContain "Turanga"
        html shouldNotContain """name="login""""
    }

    @Test
    fun `the locked screen declares a mobile viewport`() {
        // Same expectation as the picker: without it phones lay out at ~980px and scale down.
        mockMvc.get("/login/github").andExpect {
            content { string(containsString("""<meta name="viewport" content="width=device-width,initial-scale=1">""")) }
        }
    }

    @Test
    fun `a wrong key changes nothing`() {
        val response = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "guessing")
        }.andExpect {
            status { isOk() }
        }.andReturn().response

        response.getHeader("Set-Cookie").shouldBeNull()
        response.contentAsString shouldContain "Falscher Schlüssel"
        // No hint about what the right one looks like.
        response.contentAsString shouldNotContain "open-sesame"
    }

    @Test
    fun `the right key issues the cookie and returns to the picker`() {
        val response = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login/github")
        }.andReturn().response

        val header = response.getHeader("Set-Cookie").shouldNotBeNull()
        header shouldContain "${FakeSignInGate.COOKIE_NAME}="
        header shouldNotContain "open-sesame"
    }

    @Test
    fun `with the cookie the picker renders as usual`() {
        val html = mockMvc.get("/login/github") {
            cookie(unlockedCookie())
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        html shouldContain """name="login" value="leela""""
    }

    @Test
    fun `unlocking carries the redirect through to the picker`() {
        // Post/Redirect/Get: the destination must survive the round-trip, or a deep link is lost
        // at exactly the moment the key is entered.
        mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "open-sesame")
            param("redirect", "/c/team/lab/sample?seed=42")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login/github?redirect=%2Fc%2Fteam%2Flab%2Fsample%3Fseed%3D42")
        }
    }

    @Test
    fun `the locked screen escapes a redirect containing markup`() {
        // The value is echoed into a hidden field; unescaped it is an XSS hole on the one page
        // that is reachable without any credential at all.
        mockMvc.get("""/login/github?redirect=/x"><script>alert(1)</script>""").andExpect {
            status { isOk() }
            content { string(containsString("&lt;script&gt;")) }
        }
    }

    @Test
    fun `a wrong key keeps the redirect for the next attempt`() {
        val html = mockMvc.post("/login/github/unlock") {
            with(csrf())
            param("key", "guessing")
            param("redirect", "/c/team/lab/sample?seed=42")
        }.andReturn().response.contentAsString

        html shouldContain """name="redirect" value="/c/team/lab/sample?seed=42""""
    }

    @Test
    fun `the sign-in POST is locked too, not just the page that shows it`() {
        // TestUserSeeder is committed, so the seed logins are public. An unguarded POST is the
        // picker without the picker.
        mockMvc.post("/login/github/as") {
            with(csrf())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            // Back to the keyhole, not into a dead end.
            redirectedUrl("/login/github")
            match(unauthenticated())
        }
    }

    @Test
    fun `with the cookie the sign-in POST works as before`() {
        // Positive control: without it the rejection above would also pass on a POST that is
        // broken for everyone.
        mockMvc.post("/login/github/as") {
            with(csrf())
            cookie(unlockedCookie())
            param("login", "leela")
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }
    }
}
