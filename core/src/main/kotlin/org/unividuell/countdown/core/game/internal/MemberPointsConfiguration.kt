package org.unividuell.countdown.core.game.internal

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.core.env.Profiles
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberPointsQuery
import org.unividuell.countdown.core.countdown.CountdownEngine
import java.time.Clock

/**
 * Exactly one `MemberPointsQuery` bean by construction. The decision cannot be expressed
 * declaratively because the required condition is a complement: return stub points only when the
 * property is true AND the profile is not production. `@ConditionalOnProperty` alone cannot express
 * negation, and chaining `@Profile` with a property condition left a gap where production with a stray
 * `enabled=true` env var would create zero beans.
 *
 * It lives in `game` rather than in `community` because that is where the two candidates live, and
 * `community` must not depend on `game`. The seam itself — `MemberPointsQuery`, `MemberPoints` — stays
 * with its consumer. `ZeroMemberPoints` is gone: [RoundPlayPoints] answers `0` for a community without
 * played rounds all by itself.
 */
@Configuration
class MemberPointsConfiguration {
    @Bean
    fun memberPointsQuery(
        environment: Environment,
        plays: RoundPlayRepository,
        communities: CommunityQuery,
        engine: CountdownEngine,
        clock: Clock,
    ): MemberPointsQuery {
        val stubEnabled = environment.getProperty("app.stub-points.enabled", Boolean::class.java, false)
        val isProduction = environment.acceptsProfiles(Profiles.of("production"))
        return if (stubEnabled && !isProduction) {
            StubMemberPoints()
        } else {
            RoundPlayPoints(plays = plays, communities = communities, engine = engine, clock = clock)
        }
    }
}
