package org.unividuell.countdown.core

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.unividuell.auth.test.TEST_CSRF_TOKEN
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

/**
 * A body above the servlet container's multipart limit, over a real socket.
 *
 * MockMvc cannot show this: its multipart files are already parsed, so no limit is ever applied.
 * And a size error raised before the handler is known skips every `@RestControllerAdvice` scoped
 * by `basePackages` -- the pools' advice would then never name it TOO_LARGE, and the browser would
 * get a bare framework 413 with no code. Hence the container's own limit is shrunk here and a
 * real request is sent.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["spring.servlet.multipart.max-file-size=1KB", "spring.servlet.multipart.max-request-size=2KB"],
)
class MultipartLimitTest(@LocalServerPort val port: Int) {

    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()

    @Test
    fun `an audio upload above the container's limit is named TOO_LARGE`() {
        val session = signInAsSuperAdmin()

        listOf("/api/super-admin/audio", "/api/communities/alpha/audio").forEach { path ->
            val response = upload(path = path, session = session, fileName = "big.wav")

            response.statusCode() shouldBe 413
            response.body() shouldContain """"code":"TOO_LARGE""""
        }
    }

    @Test
    fun `an image upload above the container's limit is named TOO_LARGE`() {
        val session = signInAsSuperAdmin()

        val response = upload(path = "/api/super-admin/images", session = session, fileName = "big.jpg")

        response.statusCode() shouldBe 413
        response.body() shouldContain """"code":"TOO_LARGE""""
    }

    /** The auth lib's test door, as the localhost picker uses it; `prof` is a super-admin here. */
    private fun signInAsSuperAdmin(): String {
        val response = http.send(
            HttpRequest.newBuilder(URI("http://localhost:$port/login/test/as"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Cookie", "XSRF-TOKEN=$TEST_CSRF_TOKEN")
                .header("X-XSRF-TOKEN", TEST_CSRF_TOKEN)
                .POST(HttpRequest.BodyPublishers.ofString("login=prof"))
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )
        return response.headers().allValues("Set-Cookie")
            .single { it.startsWith("SESSION=") }
            .substringBefore(";")
    }

    private fun upload(path: String, session: String, fileName: String): HttpResponse<String> {
        val boundary = "limit-test-boundary"
        val head = "--$boundary\r\n" +
            "Content-Disposition: form-data; name=\"file\"; filename=\"$fileName\"\r\n" +
            "Content-Type: application/octet-stream\r\n\r\n"
        val tail = "\r\n--$boundary--\r\n"
        // 4 KB against a 1 KB limit.
        val body = head.toByteArray() + ByteArray(4096) + tail.toByteArray()

        return http.send(
            HttpRequest.newBuilder(URI("http://localhost:$port$path"))
                .header("Content-Type", "multipart/form-data; boundary=$boundary")
                .header("Accept", "application/json")
                .header("Cookie", "$session; XSRF-TOKEN=$TEST_CSRF_TOKEN")
                .header("X-XSRF-TOKEN", TEST_CSRF_TOKEN)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
    }
}
