package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.community.MemberIdentity
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.User

/**
 * The one rule for "who looks like what, here", applied per field: the membership's value if it has
 * one, else the user's global one, else what iam derives.
 *
 * Takes the two values rather than a membership row on purpose. The preview endpoint feeds it the
 * candidate values from an unsaved form, which is what makes a preview provably the same answer a
 * save would give — not merely a similar one.
 */
object MemberIdentityResolver {
    fun resolve(user: User, displayName: String?, bgColorHex: String?): MemberIdentity =
        MemberIdentity(
            username = displayName?.takeIf { it.isNotBlank() } ?: user.username,
            avatar = Avatar.of(
                user = user,
                nameOverride = displayName,
                bgColorHexOverride = bgColorHex,
            ),
        )
}
