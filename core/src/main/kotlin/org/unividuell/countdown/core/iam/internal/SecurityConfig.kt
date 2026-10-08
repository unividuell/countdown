package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.web.SecurityFilterChain

/**
 * countdown's own access rules. Sign-in, the SPA contract (401 instead of a redirect, the CSRF
 * cookie, `POST /logout` answering 204), the paths below `/login/` and `/oauth2/`, and error
 * dispatches come from the auth lib, which Spring Security applies to this chain before these
 * rules. Lives in the `iam` module because authentication is the only security concern today;
 * revisit if other modules gain protected resources.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PublicRateLimitProperties::class)
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/actuator/health", permitAll)
                authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))
                // GET only: reading who invites you needs no session, accepting the invite does.
                authorize(method = HttpMethod.GET, pattern = "/api/communities/join/*", access = permitAll)
                // Open by design, not crawler-restricted here: the edge only forwards crawlers to
                // this path from the SPA routes, but the API path itself is reachable by anyone.
                // PublicRateLimitFilter brakes it, and every unresolvable code/slug answers with
                // the same generic page, so an open endpoint reveals nothing.
                authorize(method = HttpMethod.GET, pattern = "/api/preview/**", access = permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }
}
