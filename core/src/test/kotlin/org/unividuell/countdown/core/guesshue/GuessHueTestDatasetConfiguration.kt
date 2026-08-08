package org.unividuell.countdown.core.guesshue

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.core.io.ClassPathResource
import org.springframework.test.context.DynamicPropertyRegistrar

/**
 * A test that activates a deployed profile ("production"/"staging") still boots the real
 * `GuessHueDatasetConfiguration`, which fail-fasts on the bundled sample under those profiles —
 * see `GuessHueDatasetFailFastTest`. Activating a deployed profile is not a deployment, but the
 * guard can't tell the difference, so the test context must satisfy it the same way a real
 * deployment would: point `app.guess-hue.dataset-path` at a real, complete (if invented) file.
 * `GuessHueDatasetLoader` reads via `File(path)`, so a classpath reference alone won't do — the
 * resource is resolved to its absolute filesystem path here.
 *
 * Deliberately its own `@TestConfiguration`, imported only by the test(s) that actually activate a
 * deployed profile — **not** folded into the shared `TestcontainersConfiguration` that all
 * `@SpringBootTest` classes import. Wiring it in globally would silently switch every context test
 * from the bundled 6-entry sample to this 60-entry fixture, including tests that mean to exercise
 * the sample itself. A future deployment-profile test that forgets to import this configuration
 * should fail loudly with the guard's own message telling it what to do — not run silently on a
 * fixture nobody asked for.
 */
@TestConfiguration(proxyBeanMethods = false)
class GuessHueTestDatasetConfiguration {

    @Bean
    fun guessHueTestDatasetPropertyRegistrar() = DynamicPropertyRegistrar { registry ->
        val path = ClassPathResource("guess-hue-dataset.test.yaml").file.absolutePath
        registry.add("app.guess-hue.dataset-path") { path }
    }
}
