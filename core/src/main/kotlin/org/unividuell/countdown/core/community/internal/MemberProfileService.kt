package org.unividuell.countdown.core.community.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.iam.ProfileFields
import org.unividuell.countdown.core.iam.UserQuery
import java.util.UUID

/**
 * The caller's own appearance inside one community.
 *
 * Every path targets the caller's OWN membership row and refuses when there is none. A super-admin
 * passes the access gate without belonging, and an UPDATE that matches no row would otherwise
 * answer 200 while changing nothing.
 */
@Service
class MemberProfileService(
    private val members: CommunityMemberRepository,
    private val users: UserQuery,
) {

    @Transactional(readOnly = true)
    fun get(communityId: UUID, userId: UUID): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        return response(displayName = row.displayName, bgColorHex = row.bgColorHex, userId = userId)
    }

    @Transactional
    fun put(
        communityId: UUID,
        userId: UUID,
        displayName: String?,
        bgColorHex: String?,
    ): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        val name = ProfileFields.normalizeName(displayName)
        val color = ProfileFields.normalizeColor(bgColorHex)
        members.save(row.copy(displayName = name, bgColorHex = color))
        return response(displayName = name, bgColorHex = color, userId = userId)
    }

    @Transactional
    fun clear(communityId: UUID, userId: UUID): MemberProfileResponse {
        val row = requireRow(communityId = communityId, userId = userId)
        members.save(row.copy(displayName = null, bgColorHex = null))
        return response(displayName = null, bgColorHex = null, userId = userId)
    }

    /** The production resolver run against an unsaved row — nothing is read but the user. */
    @Transactional(readOnly = true)
    fun preview(userId: UUID, displayName: String?, bgColorHex: String?): MemberIdentity =
        MemberIdentityResolver.resolve(
            user = users.findById(userId) ?: throw CommunityAccessDeniedException(),
            displayName = ProfileFields.normalizeName(displayName),
            bgColorHex = ProfileFields.normalizeColor(bgColorHex),
        )

    private fun requireRow(communityId: UUID, userId: UUID) =
        members.findByCommunityIdAndUserId(communityId = communityId, userId = userId)
            ?: throw CommunityAccessDeniedException()

    private fun response(displayName: String?, bgColorHex: String?, userId: UUID) =
        MemberProfileResponse(
            displayName = displayName,
            bgColorHex = bgColorHex,
            identity = MemberIdentityResolver.resolve(
                user = users.findById(userId) ?: throw CommunityAccessDeniedException(),
                displayName = displayName,
                bgColorHex = bgColorHex,
            ),
        )
}
