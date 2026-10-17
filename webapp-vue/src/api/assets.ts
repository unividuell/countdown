import { chacha20poly1305 } from '@noble/ciphers/chacha.js'

/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract: same credentials, no CSRF needed
 * (GET), errors as plain exceptions the caller turns into UI state.
 */
export async function fetchAssetBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`)
  return res.blob()
}

/** What opens one sealed asset: the Base64 key (standard, padded) and the media type of the plaintext. */
export interface AssetKey {
  key: string
  mediaType: string
}

/** One round's assets, by name — the same shape for a real round and a lab round. */
export interface RoundAssets {
  url: (name: string) => string
  /** `null` while the viewer may not open that asset yet. */
  key: (name: string) => AssetKey | null
}

const NONCE_BYTES = 12

const WARM_UP_BYTES = 256 * 1024
const WARM_UP_OPENINGS = 3

/**
 * The sealed bytes, still closed. [reload] goes past the HTTP cache: the URL is cached `immutable`,
 * so bytes that no longer match their key would otherwise be served again and again.
 */
export async function fetchSealed(url: string, reload = false): Promise<Uint8Array> {
  const res = await fetch(url, { credentials: 'include', cache: reload ? 'reload' : 'default' })
  if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * `nonce(12) ‖ ciphertext ‖ tag(16)`, the layout the server seals into. Throws when the bytes do not
 * belong to the key — Poly1305 authenticates, so a wrong key never yields garbage.
 *
 * Pure JS (`@noble/ciphers`), not `crypto.subtle`: the latter does not exist outside a secure
 * context, and the app is also opened on a phone over plain HTTP on the LAN.
 */
export function openSealed(sealed: Uint8Array, { key, mediaType }: AssetKey): Blob {
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0))
  const nonce = sealed.subarray(0, NONCE_BYTES)
  const plaintext = chacha20poly1305(keyBytes, nonce).decrypt(sealed.subarray(NONCE_BYTES))
  return new Blob([plaintext as BlobPart], { type: mediaType })
}

let warmedUp = false

/**
 * Runs the opening path once per page on a dummy buffer, so the first real opening is not the cold
 * one: on a phone that first run costs about twice as much, and an opening on the scored clock
 * (a reveal) is where it hurts. Call it where the time is free, under the cover.
 *
 * ```
 * seal 256 KiB ─▶ open ─▶ open ─▶ open    (dummy key and nonce: zeros)
 * ```
 */
export function warmUpOpening(): void {
  if (warmedUp) return
  warmedUp = true

  const key = new Uint8Array(32)
  const nonce = new Uint8Array(NONCE_BYTES)
  const sealed = chacha20poly1305(key, nonce).encrypt(new Uint8Array(WARM_UP_BYTES))

  // One run is not enough to be warm: the first real opening still came out slower.
  for (let i = 0; i < WARM_UP_OPENINGS; i++) chacha20poly1305(key, nonce).decrypt(sealed)
}

/**
 * Fetch and open one asset. Bytes that do not open are fetched once more past the cache — a cached
 * copy from before the round was sealed anew is the one benign cause — and a second miss is final.
 */
export async function loadSealed(assets: RoundAssets, name: string): Promise<Blob> {
  const key = assets.key(name)
  if (!key) throw new Error(`no key for asset ${name}`)

  const url = assets.url(name)
  const sealed = await fetchSealed(url)

  try {
    return openSealed(sealed, key)
  } catch {
    return openSealed(await fetchSealed(url, true), key)
  }
}
