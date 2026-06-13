// Mirror of backend Slugs.slugify (Kotlin is the source of truth). Keep in parity — see SlugsTest.
export function slugify(name: string): string {
  const umlauts = name
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
  const noDiacritics = umlauts.normalize('NFKD').replace(/\p{M}+/gu, '')
  return noDiacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}
