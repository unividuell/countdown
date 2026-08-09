package org.unividuell.countdown.core

import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails
import java.net.URI
import java.sql.DriverManager

/**
 * Guards the arrangement that keeps the suite to a single Postgres container: the container is a
 * JVM singleton, while every application context that imports this configuration is handed its own
 * freshly created database on that one server.
 */
class TestcontainersConfigurationTest {

    @Test
    fun `hands every context its own database on the one shared server`() {
        val first = TestcontainersConfiguration().jdbcConnectionDetails()
        val second = TestcontainersConfiguration().jdbcConnectionDetails()

        serverOf(second) shouldBe serverOf(first)
        databaseOf(second) shouldNotBe databaseOf(first)
    }

    @Test
    fun `creates each database for real and leaves it empty`() {
        val details = TestcontainersConfiguration().jdbcConnectionDetails()

        DriverManager.getConnection(details.jdbcUrl, details.username, details.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("select current_database()").use { rows ->
                    rows.next() shouldBe true
                    rows.getString(1) shouldBe databaseOf(details)
                }
                statement.executeQuery(
                    "select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')"
                ).use { rows ->
                    rows.next() shouldBe true
                    rows.getInt(1) shouldBe 0
                }
            }
        }
    }

    /**
     * One server now carries every context's pool, so the connection budget has to carry them too.
     * At the capped pool size of 5 (`spring.datasource.hikari.maximum-pool-size` on the test
     * classpath) the default `max_connections` of 100 is exhausted after twenty contexts, and the
     * suite already resolves to more than that.
     */
    @Test
    fun `allows far more connections than the suite's contexts can pool`() {
        val details = TestcontainersConfiguration().jdbcConnectionDetails()

        DriverManager.getConnection(details.jdbcUrl, details.username, details.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("show max_connections").use { rows ->
                    rows.next() shouldBe true
                    rows.getInt(1) shouldBeGreaterThanOrEqual 400
                }
            }
        }
    }

    private fun serverOf(details: JdbcConnectionDetails) = uriOf(details).authority

    private fun databaseOf(details: JdbcConnectionDetails) = uriOf(details).path.removePrefix("/")

    private fun uriOf(details: JdbcConnectionDetails) = URI(details.jdbcUrl.removePrefix("jdbc:"))
}
