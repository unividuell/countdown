package org.unividuell.countdown.core

import org.postgresql.util.PGobject
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.data.convert.ReadingConverter
import org.springframework.data.convert.WritingConverter
import org.springframework.data.jdbc.repository.config.AbstractJdbcConfiguration
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/**
 * Makes `jsonb` columns map to [JsonNode].
 *
 * `userConverters()` is the hook the Spring Data JDBC reference names, and deliberately not
 * `jdbcCustomConversions()`: that method assembles the store's own conversions plus the ones the
 * `Dialect` registers, and overriding it drops them.
 *
 * Spring Boot's `SpringBootJdbcConfiguration` extends the same base class and carries
 * `@ConditionalOnMissingBean(AbstractJdbcConfiguration)`, so this class replaces it rather than
 * colliding with it. Two things Boot's version added are therefore ours to cover: entity scanning
 * (handled by living in the root package — `getMappingBasePackages()` defaults to this package) and
 * the `spring.data.jdbc.dialect` property, which this project does not set; the dialect is detected
 * from the connection.
 */
@Configuration
class JdbcConversionsConfiguration(private val mapper: ObjectMapper) : AbstractJdbcConfiguration() {

    override fun userConverters(): List<*> = listOf(
        JsonNodeToPGobjectConverter(),
        PGobjectToJsonNodeConverter(mapper = mapper),
    )
}

/** `jsonb` is a typed parameter for Postgres — a plain String would arrive as `varchar` and be rejected. */
@WritingConverter
class JsonNodeToPGobjectConverter : Converter<JsonNode, PGobject> {
    override fun convert(source: JsonNode): PGobject = PGobject().apply {
        type = "jsonb"
        value = source.toString()
    }
}

@ReadingConverter
class PGobjectToJsonNodeConverter(private val mapper: ObjectMapper) : Converter<PGobject, JsonNode> {
    override fun convert(source: PGobject): JsonNode = mapper.readTree(source.value ?: "null")
}
