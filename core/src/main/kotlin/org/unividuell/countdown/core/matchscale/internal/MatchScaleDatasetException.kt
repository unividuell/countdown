package org.unividuell.countdown.core.matchscale.internal

/** The dataset is missing, unreadable, or mechanically wrong — a boot failure, never a runtime one. */
class MatchScaleDatasetException(message: String) : RuntimeException(message)
