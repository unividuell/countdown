package org.unividuell.countdown.core.community.internal

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

    @Transactional
    open fun generateInvite(communityId: UUID): InviteInfo {
        val community = communities.findById(communityId).orElseThrow()
        val token = freshCode()
        val expiresAt = Instant.now().plus(inviteTtl)
        communities.save(community.copy(inviteToken = token, inviteTokenExpiresAt = expiresAt, updatedAt = Instant.now()))
        return InviteInfo(token = token, expiresAt = expiresAt)
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
        if (community.inviteTokenExpiresAt?.isBefore(Instant.now()) != false) throw InviteExpiredException()
        return community
    }

    @Transactional(readOnly = true)
    override fun communityOfValidInvite(code: String): Community? {
        val community = findByCode(code) ?: return null
        return community.takeIf { it.inviteTokenExpiresAt?.isAfter(Instant.now()) == true }
    }

    /**
     * Only codes of the current length get the reading repair; tokens handed out before this
     * change are 43 Base64 characters and must keep matching exactly as they were stored.
     */
    private fun findByCode(code: String): Community? =
        if (code.length == InviteCodes.LENGTH) communities.findByInviteToken(InviteCodes.normalize(code))
        else communities.findByInviteToken(code)

    /** The column is UNIQUE, so a clash must not reach the caller — with 32^6 it is rare. */
    private fun freshCode(): String {
        repeat(CODE_ATTEMPTS) {
            val candidate = InviteCodes.generate(random)
            if (communities.findByInviteToken(candidate) == null) return candidate
        }
        throw IllegalStateException("no free invite code after $CODE_ATTEMPTS attempts")
    }

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
