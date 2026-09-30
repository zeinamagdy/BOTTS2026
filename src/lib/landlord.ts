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
  moveInDate: "2026-12-01",
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

/**
 * Net household income ≥ this × cold rent is one way to show financial security.
 * 3× is the usual Berlin rule of thumb and the cap: a stricter multiple mostly
 * shuts out freelancers, students and newcomers (Portland's FAIR ordinance caps it
 * at 2–2.5×).
 */
export const INCOME_MULTIPLES = [2, 2.5, 3] as const
export const DEFAULT_INCOME_MULTIPLE = 3

/** Savings covering this many months of warm rent count as financial security too */
export const SAVINGS_MONTHS = 3

/** The routes to financial security. Any one is enough and none outranks another */
export const FINANCIAL_ROUTES = [
  "income",
  "guarantor",
  "depositInsurance",
  "savings",
] as const
export type FinancialRoute = (typeof FINANCIAL_ROUTES)[number]

/** Who the ad says is welcome: shown to applicants, never filters or ranks anyone */
export const WELCOME = [
  { key: "families", label: "Families with children" },
  { key: "students", label: "Students" },
  { key: "selfEmployed", label: "Self-employed" },
  { key: "retirees", label: "Retirees" },
  { key: "newcomers", label: "Newcomers to Germany" },
] as const
export type WelcomeKey = (typeof WELCOME)[number]["key"]

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
  /** One of `INCOME_MULTIPLES` */
  incomeMultiple: number
  welcome: WelcomeKey[]
  /** The revealed Fair Pick seed (64 hex characters), once the landlord has drawn */
  seed?: string
}

export const DEMO_SETTINGS: FlatSettings = {
  address: DEMO_FLAT.address,
  type: "flat",
  areaM2: DEMO_FLAT.areaM2,
  warmRent: DEMO_FLAT.warmRent,
  rooms: DEMO_FLAT.rooms,
  docs: DEFAULT_DOCUMENTS,
  incomeMultiple: DEFAULT_INCOME_MULTIPLE,
  welcome: [],
}

export function flatSettingsToParams(s: FlatSettings) {
  const p = new URLSearchParams({
    address: s.address,
    type: s.type,
    area: String(s.areaM2),
    rent: String(s.warmRent),
    rooms: String(s.rooms),
    docs: s.docs.join(","),
    mult: String(s.incomeMultiple),
  })
  if (s.welcome.length) p.set("welcome", s.welcome.join(","))
  if (s.seed) p.set("seed", s.seed)
  return p.toString()
}

export const SEED_PATTERN = /^[0-9a-f]{64}$/

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
  const mult = Number(one("mult"))
  const welcomeParam = one("welcome")?.split(",") ?? []
  const seed = one("seed")
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
    incomeMultiple:
      INCOME_MULTIPLES.find((m) => m === mult) ?? DEFAULT_INCOME_MULTIPLE,
    welcome: WELCOME.map((w) => w.key).filter((k) => welcomeParam.includes(k)),
    ...(seed && SEED_PATTERN.test(seed) ? { seed } : {}),
  }
}
