package org.unividuell.countdown.core.community

import org.unividuell.countdown.core.iam.Avatar

/**
 * How a member appears inside ONE community: the name that wins there, drawn the way it wins there.
 *
 * Public, because the roster is not the only place that draws people — the round payload and the
 * game lab do too, and all three must not be able to disagree.
 */
data class MemberIdentity(val username: String, val avatar: Avatar)
