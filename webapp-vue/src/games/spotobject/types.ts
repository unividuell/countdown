/**
 * Weltanschauung's wire shapes. There is no round secret — the term is the whole payload, and a
 * guess is judged by its shape alone (see the backend's `SpotObjectGameType.judge`). What is here
 * is narrowed by hand for the same reason every other game's types are: `payload`, `outcome` and
 * every stored guess arrive as `unknown` by contract.
 */

/** The object to find. There is nothing else the player needs. */
export interface SpotObjectPayload {
  term: string
}

export function isSpotObjectPayload(value: unknown): value is SpotObjectPayload {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Partial<SpotObjectPayload>).term === 'string'
}

/**
 * A submitted guess: the panorama the player stood in, and the view they were looking at. This is
 * the whole of the guess sent to the server, and the whole of a tip shown back to reviewers later.
 */
export interface SpotObjectTip {
  panoId: string
  heading: number
  pitch: number
  zoom: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function asSpotObjectTip(value: unknown): SpotObjectTip | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<SpotObjectTip>
  if (typeof candidate.panoId !== 'string' || candidate.panoId === '') return null
  if (!isFiniteNumber(candidate.heading)) return null
  if (!isFiniteNumber(candidate.pitch)) return null
  if (!isFiniteNumber(candidate.zoom)) return null
  return {
    panoId: candidate.panoId,
    heading: candidate.heading,
    pitch: candidate.pitch,
    zoom: candidate.zoom,
  }
}

/** What the server worked out about a tip: which country it stands in, or `null` when it could not tell. */
export interface SpotObjectOutcome {
  country: string | null
}

export function asSpotObjectOutcome(value: unknown): SpotObjectOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const country = (value as Partial<SpotObjectOutcome>).country
  if (country !== null && typeof country !== 'string') return null
  return { country }
}

/** Street View's zoom is a scale; the Static API wants the field of view it corresponds to. */
const fovOf = (zoom: number): number => Math.min(Math.max(180 / 2 ** zoom, 10), 100)

/**
 * Our own endpoint, not Google's. The signature is built server-side — the signing secret must
 * never be in a bundle — so the browser asks us and follows the redirect.
 */
export function shotUrl(tip: SpotObjectTip, width: number, height: number): string {
  const query = new URLSearchParams({
    pano: tip.panoId,
    heading: String(tip.heading),
    pitch: String(tip.pitch),
    fov: String(fovOf(tip.zoom)),
    w: String(width),
    h: String(height),
  })
  return `/api/spot-object/shot?${query}`
}

/**
 * Maps URLs: free, keyless, no SKU. Moving and zooming happens on Google's side, which is both the
 * cheaper and the more correct place for it — our own view stays the frame that was submitted.
 */
export function googleUrl(tip: SpotObjectTip): string {
  const query = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    pano: tip.panoId,
    heading: String(tip.heading),
    pitch: String(tip.pitch),
    fov: String(fovOf(tip.zoom)),
  })
  return `https://www.google.com/maps/@?${query}`
}

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0)

/** ISO-3166-1 alpha-2 to its regional-indicator flag emoji. `null` (lookup failed) draws nothing. */
export function flagOf(country: string | null): string {
  if (country === null || country.length !== 2) return ''
  return [...country.toUpperCase()]
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join('')
}
