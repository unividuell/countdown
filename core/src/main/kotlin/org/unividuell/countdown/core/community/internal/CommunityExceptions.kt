package org.unividuell.countdown.core.community.internal

/** Derived slug is already taken or reserved → 409. */
class SlugUnavailableException(message: String) : RuntimeException(message)

/** Would leave a community with zero admins → 409. */
class LastAdminException(message: String = "A community must keep at least one admin") : RuntimeException(message)

/** Caller is not an ACTIVE member of the community → 404 (no info leak). */
class CommunityAccessDeniedException(message: String = "No access") : RuntimeException(message)

/** Caller is an ACTIVE member but not an admin where admin is required → 403. */
class NotAdminException(message: String = "Admin required") : RuntimeException(message)

/** Invite token does not exist → 404. */
class InviteNotFoundException(message: String = "Invalid invite") : RuntimeException(message)

/** Invite token exists but has expired → 410. */
class InviteExpiredException(message: String = "Invite expired") : RuntimeException(message)
