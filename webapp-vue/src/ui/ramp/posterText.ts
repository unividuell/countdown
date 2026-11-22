export interface RampScene {
  game: string
  roundNumber: number
  phaseTwo: boolean
  points: number | null
}

/** `ß` to `ẞ`: CSS uppercase would turn it into „SS“. */
export function posterName(game: string): string {
  return game.replaceAll('ß', 'ẞ')
}

/** True minus sign: a hyphen allows a line break after it. */
export function roundLabel(roundNumber: number): string {
  return roundNumber < 0 ? `−${-roundNumber}` : String(roundNumber)
}

/** Absent without a positive stake: no promise of unwinnable points. */
export function stakeLine(points: number | null): string | null {
  if (points === null || points <= 0) return null

  return `${points} ${points === 1 ? 'Punkt' : 'Punkte'} zum Abstauben`
}

/** Button name. The stake joins only in phase two. */
export function rampLabel(scene: RampScene): string {
  const stake = scene.phaseTwo ? stakeLine(scene.points) : null
  const parts = [`Aktuelle Runde ${roundLabel(scene.roundNumber)}: ${scene.game}.`]

  if (stake !== null) parts.push(`${stake}.`)
  parts.push('Öffnen.')

  return parts.join(' ')
}
