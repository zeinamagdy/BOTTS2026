/** Plain-English labels for the synthetic listings' German / coded fields (client-safe) */

const CONDITION: Record<string, string> = {
  modernisiert: "Modernised",
  kernsaniert: "Fully refurbished",
  renoviert: "Renovated",
  saniert: "Refurbished",
  renovierungsbedürftig: "Needs renovation",
}

const ERA: Record<string, string> = {
  altbau_pre_1949: "Altbau (before 1949)",
  post_war_1949_1990: "Built 1949–1990",
  modern_1990_2010: "Built 1990–2010",
  new_post_2010: "Built after 2010",
}

export const conditionLabel = (c: string) => CONDITION[c] ?? c
export const eraLabel = (e: string) => ERA[e] ?? e

export function floorLabel(floor: number, total: number) {
  if (floor === 0) return "Ground floor"
  return total > 0 ? `Floor ${floor} of ${total}` : `Floor ${floor}`
}

/** "Pankow (Ort)" → "Pankow" */
export const cleanOrtsteil = (o: string) => o.replace(/\s*\(Ort\)$/, "")

export type ListingSummary = {
  rooms: number
  areaM2: number
  floor: number
  totalFloors: number
  hasBalcony: boolean
  hasLift: boolean
  condition: string
  buildingEra: string
}

/** "3 rooms · 79 m² · Floor 2 of 5 · Balcony · Lift" and "Altbau (before 1949) · Renovated" */
export function listingLines(l: ListingSummary) {
  return [
    [
      `${l.rooms} ${l.rooms === 1 ? "room" : "rooms"}`,
      `${Math.round(l.areaM2)} m²`,
      floorLabel(l.floor, l.totalFloors),
      l.hasBalcony && "Balcony",
      l.hasLift && "Lift",
    ]
      .filter(Boolean)
      .join(" · "),
    `${eraLabel(l.buildingEra)} · ${conditionLabel(l.condition)}`,
  ]
}
