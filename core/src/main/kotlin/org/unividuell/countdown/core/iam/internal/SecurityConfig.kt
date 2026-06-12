package org.unividuell.countdown.core.iam.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.savedrequest.NullRequestCache

/**
 * App-wide HTTP security. Lives in the `iam` module because authentication is the
 * only security concern today; revisit if other modules gain protected resources.
 *
 * SPA contract: unauthenticated API calls get a 401 (not a redirect to GitHub).
 * The frontend triggers login by navigating to `/oauth2/authorization/github`.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SuperAdminProperties::class)
class SecurityConfig {

    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        gitHubOAuth2UserService: GitHubOAuth2UserService,
    ): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/oauth2/**", permitAll)
                authorize("/login/**", permitAll)
                authorize("/actuator/health", permitAll)
                authorize("/api/super-admin/**", hasRole("SUPER_ADMIN"))
                authorize(anyRequest, authenticated)
            }
            oauth2Login {
                userInfoEndpoint {
                    userService = gitHubOAuth2UserService
                }
            }
            exceptionHandling {
                // Deliberate: return 401 for ALL unauthenticated requests (SPA navigates to login itself),
                // overriding oauth2Login's default browser redirect entry point.
                authenticationEntryPoint = HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
            }
            // SPA: do NOT replay a server-side "saved request" after login. On a 401 the
            // ExceptionTranslationFilter would otherwise cache the intercepted request — here the
            // SPA's bootstrap `GET /api/me` — and the OAuth2 success handler would replay it,
            // landing the user on raw /api/me JSON. With no request cache, login success goes to
            // the app root "/" and the SPA owns navigation from there.
            requestCache {
                requestCache = NullRequestCache()
            }
            csrf {
                csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse()
                csrfTokenRequestHandler = CsrfTokenRequestAttributeHandler()
            }
            // Materialise the deferred CSRF token on every request so the XSRF-TOKEN cookie is
            // actually written (a plain GET /api/me otherwise never sets it → POST /logout 403).
            addFilterAfter<CsrfFilter>(CsrfCookieFilter())
            logout {
                // POST; the SPA must send the CSRF token (X-XSRF-TOKEN header) or logout returns 403
                logoutUrl = "/logout"
                logoutSuccessHandler = HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)
            }
        }
        return http.build()
    }
}
