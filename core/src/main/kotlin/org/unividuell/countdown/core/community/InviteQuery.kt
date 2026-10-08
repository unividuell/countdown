package org.unividuell.countdown.core.community

/**
 * Read-only invite lookup for other modules. `null` covers both "unknown" and "expired": a
 * consumer outside this module has no business telling the two apart — see the social preview,
 * which must not become an oracle for which codes exist.
 */
interface InviteQuery {
    fun communityOfValidInvite(code: String): Community?
}
