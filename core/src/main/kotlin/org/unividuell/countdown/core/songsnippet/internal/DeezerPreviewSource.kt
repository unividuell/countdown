package org.unividuell.countdown.core.songsnippet.internal

import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.unividuell.countdown.core.songsnippet.PreviewSource
import java.net.URI

@Component
class DeezerPreviewSource(
    /** No base URL — absolute, signed CDN URLs — but the same timeouts as the Deezer API client. */
    @Qualifier("previewRestClient") private val client: RestClient,
) : PreviewSource {

    override fun download(previewUrl: String): ByteArray =
        requireNotNull(client.get().uri(URI.create(previewUrl)).retrieve().body(ByteArray::class.java)) {
            "empty preview download from $previewUrl"
        }
}
