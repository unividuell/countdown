package org.unividuell.countdown.core.gamelab

import io.kotest.matchers.collections.shouldBeEmpty
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
    fun `no bean from the gamelab package is wired`() {
        // Package-wide rather than per-type: a per-type list falls behind the moment a new bean
        // (or one with a mis-spelled gate) is added to the module without also being added here.
        // Entries carry "beanName (type)" rather than just the package, so a failure names the
        // exact offending bean instead of a bare "expected empty list".
        context.beanDefinitionNames
            .mapNotNull { name -> context.getType(name)?.let { name to it } }
            .filter { (_, type) -> type.packageName.startsWith("org.unividuell.countdown.core.gamelab") }
            .map { (name, type) -> "$name (${type.name})" }
            .shouldBeEmpty()
    }

    @Test
    fun `the lab endpoint is not found`() {
        mockMvc.get("/api/lab/team/guess-hue?seed=42") { with(principalFor()) }
            .andExpect { status { isNotFound() } }
    }
}
