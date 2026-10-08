package org.unividuell.countdown.core.deduster.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(DedusterProperties::class)
class DedusterConfiguration
