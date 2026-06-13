package org.unividuell.countdown.core.community

import org.unividuell.countdown.core.iam.UserQuery

/**
 * Declares the community→iam module dependency so Spring Modulith runs iam
 * migrations before community migrations (the FK community.* → iam.users requires it).
 * The actual UserQuery usage lives in CommunityQueryService (added in Task 10).
 *
 * The interface reference creates a bytecode-level dependency that ArchUnit can detect,
 * which drives Spring Modulith's topological migration ordering.
 */
internal interface CommunityQueryAccess : UserQuery
