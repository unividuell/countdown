package org.unividuell.countdown.core.deduster

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
class RoundImageStoreTest(@Autowired val store: RoundImageStore) {

    @Test
    fun `bytes go in and come out`() {
        val round = UUID.randomUUID()
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(1, 2))

        val found = store.find(round).shouldNotBeNull()
        found.mediaType shouldBe "image/jpeg"
        found.bytes shouldBe byteArrayOf(1, 2)
    }

    @Test
    fun `the first writer wins - the announce race runs the hook twice`() {
        val round = UUID.randomUUID()
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(1))
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(2))

        store.find(round).shouldNotBeNull().bytes shouldBe byteArrayOf(1)
    }

    @Test
    fun `release deletes the given rounds and nothing else`() {
        val gone = UUID.randomUUID(); val kept = UUID.randomUUID()
        listOf(gone, kept).forEach { store.store(roundGameId = it, mediaType = "image/jpeg", bytes = byteArrayOf(0)) }

        store.release(listOf(gone)) shouldBe 1
        store.find(gone).shouldBeNull()
        store.find(kept).shouldNotBeNull()
    }
}
