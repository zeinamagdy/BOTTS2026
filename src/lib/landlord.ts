/**
 * Landlord flow (client-safe). The flat is a fixed demo listing until listing
 * creation exists; its Wohnlage and comparables are real (see `getLandlordFlatContext`).
 */
export const DEMO_FLAT = {
  address: "Baumschulenstraße 84, 12437 Berlin",
  areaM2: 79,
  warmRent: 1480,
  rooms: 3,
  moveIn: "1 Dec 2026",
  /** Demo inbox size at this rent, the anchor of `inboxSize` (not real applications) */
  applications: 527,
} as const

export const PROPERTY_TYPES = [
  { value: "flat", label: "Flat" },
  { value: "house", label: "House" },
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"]

export const ROOM_OPTIONS = [1, 2, 3, 4, 5, 6] as const

export const DOCUMENTS = [
  { key: "id", label: "Proof of identity" },
  { key: "payslips", label: "Last three scanned payslips" },
  { key: "schufa", label: "SCHUFA credit report" },
  { key: "contract", label: "Employment contract" },
  {
    key: "rentDebt",
    label: "Mietschuldenfreiheitsbescheinigung (no rent arrears)",
  },
] as const
export type DocumentKey = (typeof DOCUMENTS)[number]["key"]
export const DEFAULT_DOCUMENTS: DocumentKey[] = ["id", "payslips", "schufa"]

/** Living space the rent comparison accepts (the comparables use ±25% of it) */
export const MIN_AREA_M2 = 10
export const MAX_AREA_M2 = 1000

/** The usual Berlin rule of thumb: net household income ≥ 3 × cold rent */
export const INCOME_FACTOR = 3

export type FlatContext = Awaited<
  ReturnType<typeof import("@/lib/queries").getLandlordFlatContext>
>

/** Typical service charge per m² when the PLZ has no synthetic listings */
export const FALLBACK_SERVICE_CHARGE_M2 = 3.4

/** Warm rent minus the PLZ's median service charge per m² */
export function coldRent(
  warmRent: number,
  areaM2: number,
  serviceChargePerM2: number | null | undefined,
) {
  return Math.max(
    0,
    warmRent - (serviceChargePerM2 ?? FALLBACK_SERVICE_CHARGE_M2) * areaM2,
  )
}

/** What step 1 hands to the applications screen, through the URL */
export type FlatSettings = {
  address: string
  type: PropertyType
  areaM2: number
  warmRent: number
  rooms: number
  docs: DocumentKey[]
}

export const DEMO_SETTINGS: FlatSettings = {
  address: DEMO_FLAT.address,
  type: "flat",
  areaM2: DEMO_FLAT.areaM2,
  warmRent: DEMO_FLAT.warmRent,
  rooms: DEMO_FLAT.rooms,
  docs: DEFAULT_DOCUMENTS,
}

export function flatSettingsToParams(s: FlatSettings) {
  return new URLSearchParams({
    address: s.address,
    type: s.type,
    area: String(s.areaM2),
    rent: String(s.warmRent),
    rooms: String(s.rooms),
    docs: s.docs.join(","),
  }).toString()
}

type Params = Record<string, string | string[] | undefined>

/** Lenient: anything missing or invalid falls back to the demo flat */
export function flatSettingsFromParams(p: Params): FlatSettings {
  const one = (k: string) => (Array.isArray(p[k]) ? p[k][0] : p[k])
  const num = (k: string, min: number, max: number, fallback: number) => {
    const n = Number(one(k))
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
  }
  const address = one("address")?.trim().slice(0, 200)
  const type = PROPERTY_TYPES.find((t) => t.value === one("type"))?.value
  const docsParam = one("docs")
  const docs =
    docsParam == null
      ? DEMO_SETTINGS.docs
      : DOCUMENTS.map((d) => d.key).filter((k) =>
          docsParam.split(",").includes(k),
        )
  return {
    address: address && address.length >= 3 ? address : DEMO_SETTINGS.address,
    type: type ?? DEMO_SETTINGS.type,
    areaM2: num("area", MIN_AREA_M2, MAX_AREA_M2, DEMO_SETTINGS.areaM2),
    warmRent: num("rent", 1, 100_000, DEMO_SETTINGS.warmRent),
    rooms: num("rooms", 1, ROOM_OPTIONS.at(-1)!, DEMO_SETTINGS.rooms),
    docs,
  }
}
