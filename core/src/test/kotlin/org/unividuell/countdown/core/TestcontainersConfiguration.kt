package org.unividuell.countdown.core

import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.sql.DriverManager
import java.util.concurrent.atomic.AtomicInteger

/**
 * One Postgres server per JVM, one database per application context.
 *
 * The container is static, so it lives outside any context lifecycle: Spring never starts or stops
 * it and Ryuk reaps it when the JVM exits. It has to be, because this configuration is imported
 * into every `@SpringBootTest` and the suite resolves to twenty distinct context configurations —
 * as an ordinary `@Bean` that meant twenty simultaneous containers.
 *
 * Isolation is unchanged: `jdbcConnectionDetails` is a per-context bean, so each context creates
 * and migrates its own empty database. Sharing one database instead would not be safe —
 * `TestUserSeeder` commits its users at context startup, and the tests that switch it off do so
 * precisely to observe an empty table.
 */
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

	@Bean
	fun jdbcConnectionDetails(): JdbcConnectionDetails {
		val database = "countdown_test_${databaseCounter.incrementAndGet()}"
		createDatabase(database)
		return object : JdbcConnectionDetails {
			override fun getUsername() = postgres.username
			override fun getPassword() = postgres.password
			override fun getJdbcUrl() =
				"jdbc:postgresql://${postgres.host}:${postgres.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)}/$database"
		}
	}

	private fun createDatabase(database: String) {
		DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
			connection.createStatement().use { it.executeUpdate("create database \"$database\"") }
		}
	}

	companion object {
		/**
		 * Consolidating twenty servers into one consolidates their connection budget too: every
		 * context keeps its pool open for the whole run, and the default `max_connections` of 100
		 * is gone after twenty of them. The test classpath caps each pool at five, so this leaves
		 * room for far more contexts than the suite has.
		 */
		private val postgres = PostgreSQLContainer(DockerImageName.parse("postgres:18"))
			.withCommand("postgres", "-c", "max_connections=400")
			.apply { start() }
		private val databaseCounter = AtomicInteger()
	}

}
