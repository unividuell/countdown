package org.unividuell.countdown.core.imagepool.internal

import org.unividuell.countdown.core.community.CommunityQuery

/**
 * No runtime purpose. Referencing [CommunityQuery] makes `imagepool` depend on `community` (and
 * transitively `iam`) in Spring Modulith's module graph, so `imagepool`'s Flyway migration --
 * which adds foreign keys to `community.communities` and `iam.users` -- runs after both modules'
 * migrations instead of racing them on a fresh database.
 *
 * Delete this file in the commit that adds `ImagePoolGate`: its own `import CommunityQuery`
 * draws the same edge for real.
 */
interface MigrationOrderEdge {
    val communities: CommunityQuery
}
