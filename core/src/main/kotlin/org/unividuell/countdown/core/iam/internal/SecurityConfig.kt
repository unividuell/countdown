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
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler

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
                // Return 401 (not a redirect to GitHub) for unauthenticated API requests.
                // oauth2Login registers its own LoginUrlAuthenticationEntryPoint; overriding
                // authenticationEntryPoint here replaces it as the default for all matchers.
                authenticationEntryPoint = HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
            }
            csrf {
                csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse()
                csrfTokenRequestHandler = CsrfTokenRequestAttributeHandler()
            }
            logout {
                logoutUrl = "/logout"
                logoutSuccessHandler = HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)
            }
        }
        return http.build()
    }
}
