package org.unividuell.countdown.core.spotobject

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.core.io.ClassPathResource
import org.springframework.test.context.DynamicPropertyRegistrar

/**
 * A test that activates a deployed profile ("production"/"staging") still boots the real
 * `SpotObjectConfiguration`, which fail-fasts on the bundled sample under those profiles — see
 * `SpotObjectTermsFailFastTest`. Activating a deployed profile is not a deployment, but the guard
 * can't tell the difference, so the test context must satisfy it the same way a real deployment
 * would: point `app.spot-object.terms-path` at a real, complete (if invented) file. Same for the
 * signing secret, whose own guard those profiles reach; see the registrar below.
 * `SpotObjectTermsLoader` reads via `File(path)`, so a classpath reference alone won't do — the
 * resource is resolved to its absolute filesystem path here.
 *
 * Deliberately its own `@TestConfiguration`, imported only by the test(s) that actually activate a
 * deployed profile — mirrors `GuessHueTestDatasetConfiguration`.
 */
@TestConfiguration(proxyBeanMethods = false)
class SpotObjectTestTermsConfiguration {

    @Bean
    fun spotObjectTestTermsPropertyRegistrar() = DynamicPropertyRegistrar { registry ->
        val path = ClassPathResource("spot-object-terms.test.yaml").file.absolutePath
        registry.add("app.spot-object.terms-path") { path }
        // The deployed profiles read the signing secret from an environment variable that no test
        // sets, so the unresolved `${SPOT_OBJECT_SIGNING_SECRET}` reaches the binder verbatim — and
        // `SpotObjectProperties` refuses that, correctly, as not URL-safe base64. Same reasoning as
        // the term list above: satisfy the guard the way a real deployment would. Made-up value.
        registry.add("app.spot-object.signing-secret") { "c2VrcmV0bWFya2Vy" }
    }
}
