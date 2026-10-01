/**
 * Resolves once the round's photo is decoded and paintable — the cover's `ready`. Decoded, not
 * merely loaded: the first tile must not wait on the decoder while its beat is already running.
 */
export async function loadPhoto(url: string): Promise<void> {
  const image = new Image()
  image.src = url
  await image.decode()
}
