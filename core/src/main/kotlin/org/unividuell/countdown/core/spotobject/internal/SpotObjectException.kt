package org.unividuell.countdown.core.spotobject.internal

/** The term list is missing, unreadable, or mechanically wrong — a boot failure, never a runtime one. */
class SpotObjectException(message: String) : RuntimeException(message)
