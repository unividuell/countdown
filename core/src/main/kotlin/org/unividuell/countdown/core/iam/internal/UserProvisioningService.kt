package org.unividuell.countdown.core.iam.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.auth.AccountProvisioner
import org.unividuell.auth.ExternalIdentity
import java.util.UUID

/**
 * The auth lib's one hook: a real provider and the test login both end here. One account per
 * (provider, subject), never linked — not even by e-mail, which GitHub hands over unverified.
 */
@Service
class UserProvisioningService(private val repository: UserRepository) : AccountProvisioner {

    /** [roles] are what the allowlist grants right now; the stored flag follows them at every sign-in. */
    @Transactional
    override fun provision(identity: ExternalIdentity, roles: Set<String>): UUID =
        repository.upsertIdentity(
            provider = identity.provider,
            subject = identity.subject,
            login = identity.login,
            name = identity.name,
            email = identity.email,
            isSuperAdmin = "SUPER_ADMIN" in roles,
        )
}
