package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
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
) {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val inviteTtl = java.time.Duration.ofDays(7)

    @Transactional
    open fun generateInvite(communityId: UUID): InviteInfo {
        val community = communities.findById(communityId).orElseThrow()
        val token = encoder.encodeToString(ByteArray(32).also { random.nextBytes(it) })
        val expiresAt = Instant.now().plus(inviteTtl)
        communities.save(community.copy(inviteToken = token, inviteTokenExpiresAt = expiresAt, updatedAt = Instant.now()))
        return InviteInfo(token, expiresAt)
    }

    @Transactional
    open fun revokeInvite(communityId: UUID) {
        val community = communities.findById(communityId).orElseThrow()
        communities.save(community.copy(inviteToken = null, inviteTokenExpiresAt = null, updatedAt = Instant.now()))
    }

    @Transactional
    open fun accept(token: String, userId: UUID): AcceptResult {
        val community = communities.findByInviteToken(token) ?: throw InviteNotFoundException()
        if (community.inviteTokenExpiresAt?.isBefore(Instant.now()) != false) throw InviteExpiredException()
        val existing = members.findByCommunityIdAndUserId(community.id!!, userId)
        return when (existing?.status) {
            MemberStatus.ACTIVE -> AcceptResult.AlreadyActive(community)
            MemberStatus.PENDING -> AcceptResult.AlreadyPending(community)
            null -> {
                members.save(CommunityMember(communityId = community.id!!, userId = userId, status = MemberStatus.PENDING))
                AcceptResult.JoinedPending(community)
            }
        }
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
}
