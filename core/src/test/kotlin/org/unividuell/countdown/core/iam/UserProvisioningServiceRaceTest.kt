package org.unividuell.countdown.core.iam

import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.unividuell.countdown.core.iam.internal.SuperAdminProperties
import org.unividuell.countdown.core.iam.internal.UserProvisioningService
import org.unividuell.countdown.core.iam.internal.UserRepository
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals

class UserProvisioningServiceRaceTest {

    // Simulates a concurrent insert: findByGithubId misses first (insert path),
    // the INSERT (id == null) raises DuplicateKeyException once, then the row is
    // found on re-fetch.
    private class RacingRepo(private val existing: User) : UserRepository {
        var findCalls = 0
        var insertAttempts = 0
        override fun findByGithubId(githubId: Long): User? {
            findCalls++
            return if (findCalls == 1) null else existing
        }
        override fun <S : User> save(entity: S): S {
            if (entity.id == null) {
                insertAttempts++
                throw DuplicateKeyException("duplicate github_id")
            }
            return entity
        }
        override fun <S : User> saveAll(entities: Iterable<S>): Iterable<S> = entities
        override fun findById(id: UUID): Optional<User> = Optional.of(existing)
        override fun existsById(id: UUID): Boolean = true
        override fun findAll(): Iterable<User> = listOf(existing)
        override fun findAllById(ids: Iterable<UUID>): Iterable<User> = emptyList()
        override fun count(): Long = 1
        override fun deleteById(id: UUID) {}
        override fun delete(entity: User) {}
        override fun deleteAllById(ids: Iterable<UUID>) {}
        override fun deleteAll(entities: Iterable<User>) {}
        override fun deleteAll() {}
    }

    @Test
    fun `recovers from a concurrent insert by re-fetching and syncing`() {
        val existing = User(
            id = UUID.fromString("018f0000-0000-7000-8000-000000000000"),
            githubId = 42L, githubLogin = "old", githubName = "Old", displayName = "Keep me",
        )
        val repo = RacingRepo(existing)
        val service = UserProvisioningService(repo, SuperAdminProperties(emptyList()))

        val result = service.provision(42L, "new-login", "New Name", "new@example.com")

        assertEquals(1, repo.insertAttempts, "should attempt the insert exactly once before recovering")
        assertEquals(2, repo.findCalls, "miss on first lookup, hit on re-fetch")
        assertEquals("new-login", result.githubLogin)
        assertEquals("New Name", result.githubName)
        assertEquals("Keep me", result.displayName, "user-owned field preserved on race recovery")
    }
}
