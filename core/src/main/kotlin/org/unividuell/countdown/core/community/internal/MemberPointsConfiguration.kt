package org.unividuell.countdown.core.community.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.core.env.Profiles
import org.unividuell.countdown.core.community.MemberPointsQuery

/**
 * Exactly one `MemberPointsQuery` bean by construction. The decision cannot be expressed
 * declaratively because the required condition is a complement: return stub points only when
 * the property is true AND the profile is not production. `@ConditionalOnProperty` alone cannot
 * express negation, and chaining `@Profile` with a property condition left a gap where production
 * with a stray `enabled=true` env var would create zero beans (neither stub nor zero would qualify).
 */
@Configuration
class MemberPointsConfiguration {
    @Bean
    fun memberPointsQuery(environment: Environment): MemberPointsQuery {
        val stubEnabled = environment.getProperty("app.stub-points.enabled", Boolean::class.java, false)
        val isProduction = environment.acceptsProfiles(Profiles.of("production"))
        return if (stubEnabled && !isProduction) {
            StubMemberPoints()
        } else {
            ZeroMemberPoints()
        }
    }
}
