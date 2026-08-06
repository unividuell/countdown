package org.unividuell.countdown.core.iam

import org.unividuell.countdown.core.iam.internal.AvatarColor
import org.unividuell.countdown.core.iam.internal.MemberShortName

/**
 * How a user is drawn, wherever they appear: a four-character label on a colour.
 *
 * The one place that answers the question — the roster and the header must not be able to
 * disagree about what the same person looks like.
 */
data class Avatar(val shortName: String, val bgColorHex: String) {
    companion object {
        fun of(user: User): Avatar = Avatar(
            shortName = MemberShortName.of(user.username),
            bgColorHex = AvatarColor.resolve(user.bgColorHex, requireNotNull(user.id) {
                "an unsaved user has no id to derive a colour from"
            }),
        )
    }
}
