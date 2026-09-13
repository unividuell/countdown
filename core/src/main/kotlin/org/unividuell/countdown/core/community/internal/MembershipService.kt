package org.unividuell.countdown.core.community.internal

import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.InviteQuery
import org.unividuell.countdown.core.community.MemberStatus
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

data class InviteInfo(val token: String, val expiresAt: Instant)

sealed interface AcceptResult {
    val community: Community
    data class JoinedPending(override val community: Community) : AcceptResult
    data class AlreadyPending(override val community: Community) : AcceptResult
    data class AlreadyActive(override val community: Community) : AcceptResult
}

@Service
open class MembershipService(
    private val communities: CommunityRepository,
    private val members: CommunityMemberRepository,
) : InviteQuery {
    private val random = SecureRandom()
    private val inviteTtl = java.time.Duration.ofDays(7)

    /** The column is UNIQUE; a clash retries with a fresh candidate instead of failing the caller. */
    @Transactional
    open fun generateInvite(communityId: UUID): InviteInfo {
        val community = communities.findById(communityId).orElseThrow()
        val expiresAt = Instant.now().plus(inviteTtl)
        repeat(CODE_ATTEMPTS) {
            val token = InviteCodes.generate(random)
            try {
                communities.save(community.copy(inviteToken = token, inviteTokenExpiresAt = expiresAt, updatedAt = Instant.now()))
                return InviteInfo(token = token, expiresAt = expiresAt)
            } catch (e: DuplicateKeyException) {
                // another draw already claimed this code: retry with a fresh one
            }
        }
        throw IllegalStateException("no free invite code after $CODE_ATTEMPTS attempts")
    }

    @Transactional
    open fun revokeInvite(communityId: UUID) {
        val community = communities.findById(communityId).orElseThrow()
        communities.save(community.copy(inviteToken = null, inviteTokenExpiresAt = null, updatedAt = Instant.now()))
    }

    @Transactional
    open fun accept(token: String, userId: UUID): AcceptResult {
        val community = peek(token)
        val communityId = community.id!!
        val existing = members.findByCommunityIdAndUserId(communityId, userId)
        return when (existing?.status) {
            MemberStatus.ACTIVE -> AcceptResult.AlreadyActive(community)
            MemberStatus.PENDING -> AcceptResult.AlreadyPending(community)
            null -> {
                members.save(CommunityMember(communityId = communityId, userId = userId, status = MemberStatus.PENDING))
                AcceptResult.JoinedPending(community)
            }
        }
    }

    /** The lookup that says *why* it failed — the join page shows 404 and 410 differently. */
    @Transactional(readOnly = true)
    open fun peek(code: String): Community {
        val community = findByCode(code) ?: throw InviteNotFoundException()
        if (!isLive(community.inviteTokenExpiresAt)) throw InviteExpiredException()
        return community
    }

    @Transactional(readOnly = true)
    override fun communityOfValidInvite(code: String): Community? {
        val community = findByCode(code) ?: return null
        return community.takeIf { isLive(it.inviteTokenExpiresAt) }
    }

    /**
     * Only codes of the current length get the reading repair; tokens handed out before this
     * change are 43 Base64 characters and must keep matching exactly as they were stored.
     */
    private fun findByCode(code: String): Community? =
        if (code.length == InviteCodes.LENGTH) communities.findByInviteToken(InviteCodes.normalize(code))
        else communities.findByInviteToken(code)

    /** Null, or in the past, is dead; exactly `now` is still live — inherited from the original check. */
    private fun isLive(expiresAt: Instant?): Boolean = expiresAt != null && !expiresAt.isBefore(Instant.now())

    @Transactional
    open fun approve(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        members.save(m.copy(status = MemberStatus.ACTIVE, updatedAt = Instant.now()))
    }

    @Transactional
    open fun promote(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        members.save(m.copy(isAdmin = true, updatedAt = Instant.now()))
    }

    @Transactional
    open fun demote(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        guardLastAdmin(communityId, m)
        members.save(m.copy(isAdmin = false, updatedAt = Instant.now()))
    }

    @Transactional
    open fun remove(communityId: UUID, userId: UUID) {
        val m = require(communityId, userId)
        guardLastAdmin(communityId, m)
        members.delete(m)
    }

    /** Self-leave — same invariant as remove. */
    @Transactional
    open fun leave(communityId: UUID, userId: UUID) = remove(communityId, userId)

    private fun require(communityId: UUID, userId: UUID): CommunityMember =
        members.findByCommunityIdAndUserId(communityId, userId)
            ?: throw IllegalArgumentException("membership not found")

    private fun guardLastAdmin(communityId: UUID, target: CommunityMember) {
        if (target.status == MemberStatus.ACTIVE && target.isAdmin && members.countActiveAdmins(communityId) <= 1) {
            throw LastAdminException()
        }
    }

    companion object {
        private const val CODE_ATTEMPTS = 10
    }
}
