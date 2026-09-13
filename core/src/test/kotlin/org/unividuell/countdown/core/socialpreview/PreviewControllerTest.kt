package org.unividuell.countdown.core.socialpreview

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.socialpreview.internal.PreviewPage
import org.unividuell.countdown.core.socialpreview.internal.PreviewService

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
class PreviewControllerTest(@Autowired val mockMvc: MockMvc) {

    @MockkBean lateinit var preview: PreviewService

    @Test
    fun `the root answers generically, without a session`() {
        mockMvc.get("/api/preview/").andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith(MediaType.TEXT_HTML) }
            header { string(name = "Cache-Control", value = "max-age=600, public") }
            content { string(containsString("<title>Countdown</title>")) }
            content { string(containsString("Spiel jeden Tag ein Mini-Game")) }
        }
    }

    @Test
    fun `a community path carries the name and the round`() {
        every { preview.forCommunity("huettehuette") } returns
            PreviewPage(title = "Hütte Hütte", description = "T-58: Spiel mit!", path = "/c/huettehuette")

        mockMvc.get("/api/preview/c/huettehuette").andExpect {
            status { isOk() }
            content { string(containsString("""<meta property="og:title" content="Hütte Hütte">""")) }
            content { string(containsString("T-58: Spiel mit!")) }
            content { string(containsString("""content="http://localhost/c/huettehuette"""")) }
        }
    }

    @Test
    fun `a path below the community resolves to the same community`() {
        every { preview.forCommunity("huettehuette") } returns
            PreviewPage(title = "Hütte Hütte", description = "Spiel mit!", path = "/c/huettehuette")

        mockMvc.get("/api/preview/c/huettehuette/members").andExpect {
            status { isOk() }
            content { string(containsString("Hütte Hütte")) }
        }
    }

    @Test
    fun `an invite path names the inviting community`() {
        every { preview.forInvite("A7K2MP") } returns
            PreviewPage(title = "Hütte Hütte", description = "Du bist eingeladen — T-58: Spiel mit!", path = "/join/A7K2MP")

        mockMvc.get("/api/preview/join/A7K2MP").andExpect {
            status { isOk() }
            content { string(containsString("Du bist eingeladen")) }
        }
    }

    @Test
    fun `the document carries nothing but the preview`() {
        // path "/" on purpose: og:url would otherwise echo the code the crawler just asked for,
        // which is harmless but would make the assertion below measure the wrong thing
        every { preview.forInvite("A7K2MP") } returns
            PreviewPage(title = "Hütte Hütte", description = "Du bist eingeladen — T-58: Spiel mit!", path = "/")

        mockMvc.get("/api/preview/join/A7K2MP").andExpect {
            status { isOk() }
            // payload hygiene: a crawler is an outsider — it gets a name and a round, nothing else
            content { string(not(containsString("A7K2MP"))) }
            content { string(not(containsString("huettehuette"))) }
            content { string(not(containsString("<script"))) }
            content { string(not(containsString("member"))) }
        }
    }

    @Test
    fun `an unmapped path falls back to the generic page`() {
        mockMvc.get("/api/preview/nonsense").andExpect {
            status { isOk() }
            content { string(containsString("<title>Countdown</title>")) }
        }
    }
}
