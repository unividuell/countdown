package org.unividuell.countdown.core

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import org.springframework.data.jdbc.repository.config.EnableJdbcAuditing
import java.time.Clock

@SpringBootApplication
@EnableJdbcAuditing
@ConfigurationPropertiesScan
class CoreApplication {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}

fun main(args: Array<String>) {
	runApplication<CoreApplication>(*args)
}
