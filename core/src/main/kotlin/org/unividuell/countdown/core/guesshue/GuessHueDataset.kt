package org.unividuell.countdown.core.guesshue

/**
 * Die geladene, geprüfte Liste. Die öffentliche Fläche des Moduls: der spätere Spielrahmen
 * bekommt diesen Bean und zieht daraus die Runde.
 *
 * Unveränderlich und ohne Zustand — der Zufall lebt im übergebenen `SeededRandom`, nie hier.
 */
class GuessHueDataset(val entries: List<GuessHueEntry>)
