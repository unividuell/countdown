/**
 * The fallback's message cards, as `MessageCard` props. One source for the community page and the
 * card lab, so the lab reviews the words that ship.
 */
export const NO_DATE_MESSAGE = {
  title: 'Noch kein Termin',
  text: 'Diese Spielgemeinschaft entsteht gerade. Komm später wieder.',
}

export const winnerMessage = (names: string) => ({
  title: `Herzlichen Glückwunsch, ${names}!`,
  text: 'Und jetzt viel Spaß zusammen!',
})

export const RUNNING_MESSAGE = { title: 'Und jetzt viel Spaß zusammen!' }
