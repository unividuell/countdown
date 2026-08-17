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
        fun of(user: User): Avatar =
            of(user = user, nameOverride = null, bgColorHexOverride = null)

        /**
         * The same avatar, drawn for a scope that may override either half. `null` and blank both
         * mean "this scope says nothing" — a stored empty string must not blank out a name.
         *
         * This module still knows nothing about what a scope is; it is handed two values that win
         * if they are there.
         */
        fun of(user: User, nameOverride: String?, bgColorHexOverride: String?): Avatar = Avatar(
            shortName = MemberShortName.of(
                nameOverride?.takeIf { it.isNotBlank() } ?: user.username,
            ),
            bgColorHex = AvatarColor.resolve(
                bgColorHexOverride?.takeIf { it.isNotBlank() } ?: user.bgColorHex,
                requireNotNull(user.id) { "an unsaved user has no id to derive a colour from" },
            ),
        )
    }
}
