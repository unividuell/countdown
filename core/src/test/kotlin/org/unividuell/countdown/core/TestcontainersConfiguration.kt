package org.unividuell.countdown.core

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.core.io.ClassPathResource
import org.springframework.test.context.DynamicPropertyRegistrar
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	fun postgresContainer(): PostgreSQLContainer {
		return PostgreSQLContainer(DockerImageName.parse("postgres:18"))
	}

	/**
	 * A test that activates a deployed profile ("production"/"staging") still boots the real
	 * `GuessHueDatasetConfiguration`, which fail-fasts on the bundled sample under those profiles —
	 * see `GuessHueDatasetFailFastTest`. Activating a deployed profile is not a deployment, but the
	 * guard can't tell the difference, so the test context must satisfy it the same way a real
	 * deployment would: point `app.guess-hue.dataset-path` at a real, complete (if invented) file.
	 * `GuessHueDatasetLoader` reads via `File(path)`, so a classpath reference alone won't do — the
	 * resource is resolved to its absolute filesystem path here.
	 */
	@Bean
	fun guessHueTestDatasetPropertyRegistrar() = DynamicPropertyRegistrar { registry ->
		val path = ClassPathResource("guess-hue-dataset.test.yaml").file.absolutePath
		registry.add("app.guess-hue.dataset-path") { path }
	}

}
