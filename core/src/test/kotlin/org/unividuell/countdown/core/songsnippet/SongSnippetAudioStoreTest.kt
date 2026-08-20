package org.unividuell.countdown.core.songsnippet

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class SongSnippetAudioStoreTest(
    @Autowired val store: SongSnippetAudioStore,
) {

    @Test
    fun `store is idempotent - the announce race may run the hook twice`() {
        val roundGameId = UUID.randomUUID()
        store.store(roundGameId = roundGameId, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(1))
        store.store(roundGameId = roundGameId, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(2))
        store.find(roundGameId = roundGameId, key = 0)!!.bytes shouldBe byteArrayOf(1)
    }

    @Test
    fun `find answers null for a key never stored`() {
        store.find(roundGameId = UUID.randomUUID(), key = 3).shouldBeNull()
    }

    @Test
    fun `release deletes every row of the given rounds`() {
        val a = UUID.randomUUID(); val b = UUID.randomUUID(); val keep = UUID.randomUUID()
        listOf(a, b, keep).forEach {
            store.store(roundGameId = it, key = 0, mediaType = "audio/wav", bytes = byteArrayOf(0))
        }
        store.release(roundGameIds = listOf(a, b)) shouldBe 2
        store.find(roundGameId = a, key = 0).shouldBeNull()
        store.find(roundGameId = keep, key = 0).shouldNotBeNull()
    }
}
