package org.unividuell.countdown.core

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.data.jdbc.repository.config.EnableJdbcAuditing

@SpringBootApplication
@EnableJdbcAuditing
class CoreApplication

fun main(args: Array<String>) {
	runApplication<CoreApplication>(*args)
}
