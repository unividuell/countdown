package org.unividuell.countdown.core.iam

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.TestcontainersConfiguration
import java.sql.DriverManager
import java.sql.SQLException

/**
 * The migrations that move countdown onto the auth lib, run against rows that exist before them —
 * which no Spring test sees, because a context migrates its database while it is still empty.
 * Flyway runs per module the way Spring Modulith runs it (one history table each); every test gets
 * a database of its own on the shared server.
 */
class IdentityMigrationTest {

    private val database = TestcontainersConfiguration().jdbcConnectionDetails()

    /** [module]'s migrations up to [version], or all of them. */
    private fun migrate(module: String, version: String? = null) {
        val configuration = Flyway.configure()
            .dataSource(database.jdbcUrl, database.username, database.password)
            .locations("classpath:db/migration/$module")
            .table(if (module == "__root") "flyway_schema_history" else "flyway_schema_history_$module")
            .baselineVersion("0")
            .baselineOnMigrate(true)
        if (version != null) configuration.target(version)
        configuration.load().migrate()
    }

    private fun execute(sql: String) {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.createStatement().use { it.execute(sql) }
        }
    }

    private fun rows(sql: String): List<List<String?>> =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(sql).use { result ->
                    buildList {
                        while (result.next()) add((1..result.metaData.columnCount).map { result.getString(it) })
                    }
                }
            }
        }

    @Test
    fun `iam V3 keys real rows as github by id and seeded rows as test by login`() {
        migrate(module = "iam", version = "2")
        execute("INSERT INTO iam.users (github_id, github_login) VALUES (123, 'octocat'), (-4, 'prof')")

        migrate(module = "iam")

        rows("SELECT github_login, provider, subject FROM iam.users ORDER BY github_login") shouldBe listOf(
            listOf("octocat", "github", "123"),
            listOf("prof", "test", "prof"),
        )
    }

    @Test
    fun `iam V3 drops github_id and makes provider plus subject the unique key`() {
        migrate(module = "iam")

        rows(
            "SELECT column_name FROM information_schema.columns " +
                "WHERE table_schema = 'iam' AND table_name = 'users' AND column_name = 'github_id'",
        ).shouldBeEmpty()
        execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('github', '7', 'a')")
        // The same subject at another provider is another account.
        execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('test', '7', 'b')")
        shouldThrow<SQLException> {
            execute("INSERT INTO iam.users (provider, subject, github_login) VALUES ('github', '7', 'c')")
        }
        shouldThrow<SQLException> {
            execute("INSERT INTO iam.users (subject, github_login) VALUES ('8', 'd')")
        }
    }

    @Test
    fun `root V2 empties the session store, attributes included`() {
        migrate(module = "__root", version = "1")
        execute(
            "INSERT INTO spring_session (primary_id, session_id, creation_time, last_access_time, " +
                "max_inactive_interval, expiry_time, principal_name) VALUES ('p1', 's1', 0, 0, 1800, 0, 'someone')",
        )
        execute(
            "INSERT INTO spring_session_attributes (session_primary_id, attribute_name, attribute_bytes) " +
                "VALUES ('p1', 'SPRING_SECURITY_CONTEXT', decode('aced', 'hex'))",
        )

        migrate(module = "__root")

        rows("SELECT count(*) FROM spring_session") shouldBe listOf(listOf("0"))
        rows("SELECT count(*) FROM spring_session_attributes") shouldBe listOf(listOf("0"))
    }
}
