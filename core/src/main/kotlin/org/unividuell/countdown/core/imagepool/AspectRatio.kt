package org.unividuell.countdown.core.imagepool

/**
 * The three shapes a pool photo is played in. The pool is fed by phone cameras, so a photo is
 * cropped to the nearest shape rather than shown however it came.
 */
enum class AspectRatio(val width: Int, val height: Int) {
    LANDSCAPE(width = 4, height = 3),
    PORTRAIT(width = 3, height = 4),
    SQUARE(width = 1, height = 1),
    ;

    companion object {
        /** √(4/3) and √(3/4): the geometric means of neighbouring shapes — every photo gets the crop that cuts least. */
        private const val LANDSCAPE_FROM = 1.1547
        private const val PORTRAIT_UP_TO = 0.8660

        fun of(width: Int, height: Int): AspectRatio {
            val ratio = width.toDouble() / height
            return when {
                ratio >= LANDSCAPE_FROM -> LANDSCAPE
                ratio <= PORTRAIT_UP_TO -> PORTRAIT
                else -> SQUARE
            }
        }
    }
}
