package org.unividuell.countdown.core

import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules

class ModularityTests {

    private val modules = ApplicationModules.of(CoreApplication::class.java)

    @Test
    fun `verifies module boundaries`() {
        modules.verify()
    }
}
