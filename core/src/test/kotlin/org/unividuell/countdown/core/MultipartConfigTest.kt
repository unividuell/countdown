package org.unividuell.countdown.core

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.FileSystemResource

/**
 * The shipped `application.yaml`, read as the file it is: the test classpath's own copy replaces
 * it, so [MultipartLimitTest] runs on a mirrored key and cannot see this one go missing.
 */
class MultipartConfigTest {

    @Test
    fun `the shipped config resolves multipart lazily`() {
        val source = YamlPropertySourceLoader()
            .load("application", FileSystemResource("src/main/resources/application.yaml"))
            .single()

        source.getProperty("spring.servlet.multipart.resolve-lazily") shouldBe true
    }
}
