package org.unividuell.countdown.core.game.internal

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/** Switches `@Scheduled` on for the whole application — today only [MaterialisationSchedule] uses it. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfiguration
