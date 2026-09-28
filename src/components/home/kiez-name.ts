/** "Köpenick (Ort)" → "Köpenick"; falls back to the PLZ. */
export const kiezName = (g: { ortsteil: string | null; plz: number }) =>
  g.ortsteil?.replace(/\s*\((Ort|Ortsteil)\)$/, "") ?? String(g.plz)
