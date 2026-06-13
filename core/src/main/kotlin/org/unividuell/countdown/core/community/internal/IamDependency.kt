package org.unividuell.countdown.core.community.internal

import org.unividuell.countdown.core.iam.UserQuery

/**
 * TEMPORARY SCAFFOLD: declares the community→iam module dependency so Spring Modulith runs
 * iam migrations before community migrations (the FK community.* → iam.users needs that
 * topological order, derived from a code-level reference to the iam module).
 *
 * REMOVE in Phase 3 once `MemberController` uses `iam.UserQuery` for real (enriching members
 * with usernames) — that becomes the genuine dependency and this scaffold is redundant.
 */
internal interface CommunityQueryAccess : UserQuery
