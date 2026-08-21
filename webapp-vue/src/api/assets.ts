/**
 * Binary sidecar to `apiFetch`, which is JSON-only by contract: same credentials, no CSRF needed
 * (GET), errors as plain exceptions the caller turns into UI state.
 */
export async function fetchAssetBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`)
  return res.blob()
}
