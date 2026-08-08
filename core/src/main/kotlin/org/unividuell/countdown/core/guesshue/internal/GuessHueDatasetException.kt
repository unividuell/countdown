package org.unividuell.countdown.core.guesshue.internal

/**
 * Jeder Lade- und Regelverstoß. Bewusst eine einzige Ausnahme: sie fliegt ausschließlich beim
 * Anwendungsstart, und dort ist die Meldung das Produkt — nicht der Typ, auf den jemand fängt.
 */
class GuessHueDatasetException(message: String) : IllegalStateException(message)
