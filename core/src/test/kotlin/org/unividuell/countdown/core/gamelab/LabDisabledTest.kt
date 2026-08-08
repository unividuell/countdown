package org.unividuell.countdown.core.gamelab

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Import
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.gamelab.internal.LabController
import org.unividuell.countdown.core.gamelab.internal.LabRoundStore
import org.unividuell.countdown.core.gamelab.internal.LabService
import org.unividuell.countdown.core.principalFor

/**
 * The gate is the feature. With the switch off nothing lab-shaped may exist — and the endpoint
 * must answer 404, not 403: a 403 would tell an unauthorised visitor that the lab is there.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.game-lab.enabled=false"])
class LabDisabledTest(
    @Autowired val mockMvc: MockMvc,
    @Autowired val context: ApplicationContext,
) {

    @Test
    fun `no lab bean is wired`() {
        context.getBeanNamesForType(LabController::class.java).size shouldBe 0
        context.getBeanNamesForType(LabService::class.java).size shouldBe 0
        context.getBeanNamesForType(LabRoundStore::class.java).size shouldBe 0
    }

    @Test
    fun `the lab endpoint is not found`() {
        mockMvc.get("/api/lab/team/sample?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }
}
