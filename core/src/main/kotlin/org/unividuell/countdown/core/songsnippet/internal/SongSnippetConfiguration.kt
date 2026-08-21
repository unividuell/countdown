package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder
import org.springframework.boot.http.client.HttpClientSettings
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.ClientHttpRequestFactory
import org.springframework.web.client.RestClient
import java.time.Duration

@Configuration
@EnableConfigurationProperties(SongSnippetProperties::class)
class SongSnippetConfiguration {

    /**
     * Shared by both clients below: a bare [RestClient.Builder] is a fresh, unconfigured prototype
     * per injection point, so the timeouts have to be built once and handed to each client explicitly.
     */
    @Bean
    fun songSnippetRequestFactory(): ClientHttpRequestFactory {
        val settings = HttpClientSettings.defaults()
            .withConnectTimeout(Duration.ofSeconds(5))
            .withReadTimeout(Duration.ofSeconds(5))
        return ClientHttpRequestFactoryBuilder.detect().build(settings)
    }

    /** One client for the Deezer API; timeouts are the announce path's protection. */
    @Bean
    fun deezerRestClient(builder: RestClient.Builder, requestFactory: ClientHttpRequestFactory): RestClient =
        builder.baseUrl("https://api.deezer.com").requestFactory(requestFactory).build()

    /**
     * No base URL — the preview download follows Deezer's absolute, signed CDN URLs — but the same
     * connect/read timeouts as the API client: this is the call most exposed to a stalled connection.
     */
    @Bean
    fun previewRestClient(builder: RestClient.Builder, requestFactory: ClientHttpRequestFactory): RestClient =
        builder.requestFactory(requestFactory).build()
}
