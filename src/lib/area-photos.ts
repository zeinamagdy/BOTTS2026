/**
 * Hand-picked photos per PLZ. An entry wins over the Wikimedia photo in `kiez_enrichment`,
 * so the areas shown in the pitch can look aspirational (nature, family life) without touching
 * the database. Drop the file in `public/areas/` and add a line, e.g.
 *
 *   "13125": { src: "/areas/13125.jpg", alt: "Family cycling in Buch", author: "Name", license: "CC BY 4.0", page: "https://…" },
 *
 * Landscape, at least 1200 px wide. Credit fields are shown under the photo when set.
 */
export type AreaPhoto = {
  src: string
  alt: string
  author?: string
  license?: string
  page?: string
}

export const AREA_PHOTOS: Record<string, AreaPhoto> = {}

type DbPhoto = {
  url: string
  title?: string | null
  author: string | null
  license: string | null
  page: string | null
}

/** The curated photo for a PLZ if there is one, else the one from the database. */
export function withPhotoOverride<T extends DbPhoto>(
  plz: string | number | null,
  fallback: T | null,
): T | DbPhoto | null {
  const o = plz != null ? AREA_PHOTOS[String(plz)] : undefined
  if (!o) return fallback
  return {
    url: o.src,
    title: o.alt,
    author: o.author ?? null,
    license: o.license ?? null,
    page: o.page ?? null,
  }
}
